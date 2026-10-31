import { NextResponse, type NextRequest } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import SyncConnection from "@/models/sync-connection"
import Account from "@/models/account"
import Transaction from "@/models/transaction"
import { getValidAccessToken, fetchBankEmails } from "@/lib/sync/gmail"
import { parseTransactionAlert } from "@/lib/sync/parser"
import { deduplicateTransactions } from "@/lib/sync/dedupe"
import mongoose from "mongoose"

export const POST = withAuth(async (req: NextRequest, { userId }) => {
  await connectDB()

  const connection = await SyncConnection.findOne({ userId, provider: "gmail" })
  if (!connection || (!connection.accessToken && !connection.refreshToken) || connection.hasGmailScope === false) {
    return NextResponse.json({
      error: "Gmail read permission missing. Please connect your Gmail account.",
      notConnected: true,
      needsReauth: true,
    }, { status: 400 })
  }

  let body: { fromDate?: string } = {}
  try {
    body = (await req.json()) as { fromDate?: string }
  } catch {
    // optional body
  }

  // Determine sync date range:
  // User selected date > lastSyncedAt > default 90 days ago
  let fromDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  if (body.fromDate) {
    const custom = new Date(body.fromDate)
    if (!isNaN(custom.getTime())) fromDate = custom
  } else if (connection.lastSyncedAt) {
    fromDate = connection.lastSyncedAt
  }

  let accessToken: string
  try {
    accessToken = await getValidAccessToken(connection)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Authentication error"
    return NextResponse.json({ error: msg, notConnected: true }, { status: 401 })
  }

  // 1. Fetch bank emails from Gmail
  let emails
  try {
    emails = await fetchBankEmails(accessToken, fromDate)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch emails"
    if (msg.includes("GMAIL_API_DISABLED")) {
      return NextResponse.json({
        error: "Gmail API is not enabled in your Google Cloud project. Please enable it in Google Cloud Console and retry.",
        apiDisabled: true,
      }, { status: 403 })
    }
    if (msg.includes("INSUFFICIENT_SCOPES")) {
      connection.hasGmailScope = false
      await connection.save()
      return NextResponse.json({
        error: "Gmail read permission not granted. Please connect your Gmail account and allow read access.",
        notConnected: true,
        needsReauth: true,
      }, { status: 403 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  if (emails.length === 0) {
    return NextResponse.json({
      noEmailsFound: true,
      syncedCount: 0,
      skippedCount: 0,
      unparseableCount: 0,
      transactions: [],
    })
  }

  // 2. Parse emails (Regex first, LLM fallback, strictly ignoring OTPs)
  const parsedCandidates = []
  let unparseableCount = 0

  for (const email of emails) {
    const parsed = await parseTransactionAlert(email.bodyText, "email_sync", email.date)
    if (parsed) {
      parsedCandidates.push(parsed)
    } else {
      unparseableCount++
    }
  }

  // 3. Deduplicate
  const { newTransactions, duplicateCount } = await deduplicateTransactions(userId, parsedCandidates)

  if (newTransactions.length === 0) {
    // Update lastSyncedAt
    connection.lastSyncedAt = new Date()
    await connection.save()

    return NextResponse.json({
      noEmailsFound: false,
      syncedCount: 0,
      skippedCount: duplicateCount,
      unparseableCount,
      transactions: [],
    })
  }

  // 4. Resolve user account to link transactions to
  const userOid = new mongoose.Types.ObjectId(userId)
  const userAccounts = await Account.find({ userId: userOid, isActive: true })

  // Helper to find or create an account for a transaction
  async function resolveAccount(accountLast4?: string, bankName?: string): Promise<mongoose.Types.ObjectId> {
    if (accountLast4 && userAccounts.length > 0) {
      const matched = userAccounts.find(
        (a) => a.accountNumberMasked && a.accountNumberMasked.endsWith(accountLast4)
      )
      if (matched) return matched._id as mongoose.Types.ObjectId
    }

    if (userAccounts.length > 0) {
      return userAccounts[0]._id as mongoose.Types.ObjectId
    }

    // If user has no account yet, create one automatically
    const newAcc = await Account.create({
      userId: userOid,
      name: `${bankName || "HDFC Bank"} (••${accountLast4 || "0000"})`,
      type: "savings",
      institution: bankName || "HDFC Bank",
      accountNumberMasked: accountLast4 ? `XX${accountLast4}` : undefined,
      currentBalancePaise: 0,
      currency: "INR",
      linkedVia: "manual",
    })
    userAccounts.push(newAcc)
    return newAcc._id as mongoose.Types.ObjectId
  }

  // 5. Store parsed transactions (Store ONLY parsed fields, never full email bodies!)
  const inserted = []
  for (const item of newTransactions) {
    const accountId = await resolveAccount(
      item.accountNumberMasked?.replace(/\D/g, "").slice(-4),
      item.bank
    )

    const txn = await Transaction.create({
      userId: userOid,
      accountId,
      amountPaise: item.amountPaise,
      currency: "INR",
      type: item.type,
      occurredAt: item.occurredAt,
      description: item.description,
      merchant: item.merchant,
      category: item.category,
      referenceNumber: item.referenceNumber,
      accountNumberMasked: item.accountNumberMasked,
      payeeKey: item.payeeKey,
      payeeType: item.payeeType,
      source: "email_sync",
      needsReview: false,
    })

    // Update account balance
    const delta = item.type === "credit" ? item.amountPaise : -item.amountPaise
    await Account.findByIdAndUpdate(accountId, { $inc: { currentBalancePaise: delta } })

    inserted.push(txn)
  }

  // 6. Update lastSyncedAt cursor
  connection.lastSyncedAt = new Date()
  await connection.save()

  return NextResponse.json({
    noEmailsFound: false,
    syncedCount: inserted.length,
    skippedCount: duplicateCount,
    unparseableCount,
    transactions: inserted,
  })
})
