import { NextResponse, type NextRequest } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import SyncConnection from "@/models/sync-connection"
import Account from "@/models/account"
import Transaction from "@/models/transaction"
import { getValidAccessToken, fetchBankEmails } from "@/lib/sync/gmail"
import { parseTransactionAlert } from "@/lib/sync/parser"
import { deduplicateTransactions } from "@/lib/sync/dedupe"
import { linkMatchingCardBillPaymentsInDB } from "@/lib/sync/card-bill-detector"
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

  let body: { fromDate?: string; syncFromLatest?: boolean } = {}
  try {
    body = (await req.json()) as { fromDate?: string; syncFromLatest?: boolean }
  } catch {
    // optional body
  }

  // Determine sync date range:
  // "Since latest" uses the newest recorded transaction as an exclusive boundary.
  // User selected date > lastSyncedAt (with 7-day safety buffer) > default 90 days ago.
  let fromDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  let latestTransactionDate: Date | undefined

  if (body.syncFromLatest) {
    const latestTransaction = await Transaction.findOne({ userId })
      .sort({ occurredAt: -1 })
      .select({ occurredAt: 1 })
      .lean()

    if (latestTransaction?.occurredAt) {
      latestTransactionDate = new Date(latestTransaction.occurredAt)
      fromDate = latestTransactionDate
    } else {
      return NextResponse.json({
        error: "No transactions are recorded yet. Choose a date range for your first email sync.",
      }, { status: 400 })
    }
  } else if (body.fromDate) {
    const custom = new Date(body.fromDate)
    if (!isNaN(custom.getTime())) {
      custom.setUTCHours(0, 0, 0, 0)
      fromDate = custom
    }
  } else if (connection.lastSyncedAt) {
    // 7-day safety buffer ensures boundary or delayed bank emails are never missed
    fromDate = new Date(connection.lastSyncedAt.getTime() - 7 * 24 * 60 * 60 * 1000)
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
      unmatchedAccountCount: 0,
      syncedFromLatest: Boolean(latestTransactionDate),
      transactions: [],
    })
  }

  // 2. Parse emails (Regex first, LLM fallback, strictly ignoring OTPs)
  // "Since latest" is exclusive, so its boundary transaction is never re-imported.
  const parsedCandidates = []
  let unparseableCount = 0

  for (const email of emails) {
    if (email.date && email.date.getTime() < fromDate.getTime()) {
      continue // Ignore any email before the requested fromDate
    }

    const parsed = await parseTransactionAlert(email.bodyText, "email_sync", email.date)
    if (parsed && !parsed.needsReview) {
      if (parsed.occurredAt) {
        const isBeforeSelectedDate = parsed.occurredAt.getTime() < fromDate.getTime()
        const isNotNewerThanLatest =
          latestTransactionDate && parsed.occurredAt.getTime() <= latestTransactionDate.getTime()
        if (isBeforeSelectedDate || isNotNewerThanLatest) {
          continue // Ignore transactions outside the requested range
        }
      }
      parsedCandidates.push(parsed)
    } else {
      // Alerts marked uncertain are deliberately not allowed to affect the
      // transaction ledger or account balance.
      unparseableCount++
    }
  }

  // 3. Deduplicate
  const { newTransactions, duplicateCount } = await deduplicateTransactions(userId, parsedCandidates)
  let unmatchedAccountCount = 0

  if (newTransactions.length === 0) {
    // Update lastSyncedAt
    connection.lastSyncedAt = new Date()
    await connection.save()

    return NextResponse.json({
      noEmailsFound: false,
      syncedCount: 0,
      skippedCount: duplicateCount + unmatchedAccountCount,
      unparseableCount,
      unmatchedAccountCount,
      syncedFromLatest: Boolean(latestTransactionDate),
      transactions: [],
    })
  }

  // 4. Resolve user account to link transactions to
  const userOid = new mongoose.Types.ObjectId(userId)
  const userAccounts = await Account.find({ userId: userOid, isActive: true })

  // An alert must identify an existing account. Never assign an ambiguous
  // transaction to the first account or create a guessed account.
  function resolveAccount(accountLast4?: string): mongoose.Types.ObjectId | undefined {
    if (accountLast4 && userAccounts.length > 0) {
      const matched = userAccounts.find(
        (a) => a.accountNumberMasked && a.accountNumberMasked.endsWith(accountLast4)
      )
      if (matched) return matched._id as mongoose.Types.ObjectId
    }
    return undefined
  }

  // 5. Store parsed transactions (Store ONLY parsed fields, never full email bodies!)
  const inserted = []
  for (const item of newTransactions) {
    const accountId = resolveAccount(item.accountNumberMasked?.replace(/\D/g, "").slice(-4))
    if (!accountId) {
      unmatchedAccountCount++
      continue
    }

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
      subtype: item.subtype,
      cardLast4: item.cardLast4,
      referenceNumber: item.referenceNumber,
      accountNumberMasked: item.accountNumberMasked,
      payeeKey: item.payeeKey,
      payeeType: item.payeeType,
      source: "email_sync",
      needsReview: item.needsReview ?? false,
      rawData: item.rawData,
    })

    // Update account balance
    const delta = item.type === "credit" ? item.amountPaise : -item.amountPaise
    await Account.findByIdAndUpdate(accountId, { $inc: { currentBalancePaise: delta } })

    inserted.push(txn)
  }

  // 6. Best-effort pair matching for credit card bill payments within 5-day window
  await linkMatchingCardBillPaymentsInDB(userOid, inserted, Transaction)

  const needsReviewCount = inserted.filter((t) => t.needsReview).length

  // 7. Update lastSyncedAt cursor
  connection.lastSyncedAt = new Date()
  await connection.save()

  return NextResponse.json({
    noEmailsFound: false,
    syncedCount: inserted.length,
    skippedCount: duplicateCount + unmatchedAccountCount,
    unparseableCount,
    unmatchedAccountCount,
    needsReviewCount,
    syncedFromLatest: Boolean(latestTransactionDate),
    transactions: inserted,
  })
})
