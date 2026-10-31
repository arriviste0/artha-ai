import { NextResponse, type NextRequest } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import Account from "@/models/account"
import Transaction from "@/models/transaction"
import { parseTransactionAlert } from "@/lib/sync/parser"
import { deduplicateTransactions } from "@/lib/sync/dedupe"
import mongoose from "mongoose"

export const POST = withAuth(async (req: NextRequest, { userId }) => {
  await connectDB()

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const bodyObj = (rawBody || {}) as { text?: string }
  if (typeof bodyObj.text !== "string" || !bodyObj.text.trim()) {
    return NextResponse.json({ error: "No email text provided to parse" }, { status: 400 })
  }

  // Split multiple email snippets if separated by blank lines or headers
  const chunks = bodyObj.text
    .split(/\n{2,}|\r\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean)

  const parsedCandidates = []
  let unparseableCount = 0

  for (const chunk of chunks) {
    const parsed = await parseTransactionAlert(chunk, "email_sync")
    if (parsed) {
      parsedCandidates.push(parsed)
    } else {
      unparseableCount++
    }
  }

  if (parsedCandidates.length === 0) {
    return NextResponse.json({
      syncedCount: 0,
      skippedCount: 0,
      unparseableCount,
      transactions: [],
      message: unparseableCount > 0 ? "Email text could not be parsed as a financial transaction" : "No transactions found",
    })
  }

  // Deduplicate
  const { newTransactions, duplicateCount } = await deduplicateTransactions(userId, parsedCandidates)

  if (newTransactions.length === 0) {
    return NextResponse.json({
      syncedCount: 0,
      skippedCount: duplicateCount,
      unparseableCount,
      transactions: [],
      message: "All parsed transactions were already recorded (duplicates skipped)",
    })
  }

  // Account resolution
  const userOid = new mongoose.Types.ObjectId(userId)
  const userAccounts = await Account.find({ userId: userOid, isActive: true })

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

  // Save transactions
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

    const delta = item.type === "credit" ? item.amountPaise : -item.amountPaise
    await Account.findByIdAndUpdate(accountId, { $inc: { currentBalancePaise: delta } })

    inserted.push(txn)
  }

  return NextResponse.json({
    syncedCount: inserted.length,
    skippedCount: duplicateCount,
    unparseableCount,
    transactions: inserted,
    message: `Successfully synced ${inserted.length} transactions from email`,
  })
})
