import { NextResponse, type NextRequest } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import Account from "@/models/account"
import Transaction from "@/models/transaction"
import { parseTransactionAlert } from "@/lib/sync/parser"
import { deduplicateTransactions } from "@/lib/sync/dedupe"
import { linkMatchingCardBillPaymentsInDB } from "@/lib/sync/card-bill-detector"
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
    if (parsed && !parsed.needsReview) {
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
  let unmatchedAccountCount = 0

  if (newTransactions.length === 0) {
    return NextResponse.json({
      syncedCount: 0,
      skippedCount: duplicateCount,
      unparseableCount,
      unmatchedAccountCount,
      transactions: [],
      message: "All parsed transactions were already recorded (duplicates skipped)",
    })
  }

  // Account resolution
  const userOid = new mongoose.Types.ObjectId(userId)
  const userAccounts = await Account.find({ userId: userOid, isActive: true })

  function resolveAccount(accountLast4?: string): mongoose.Types.ObjectId | undefined {
    if (accountLast4 && userAccounts.length > 0) {
      const matched = userAccounts.find(
        (a) => a.accountNumberMasked && a.accountNumberMasked.endsWith(accountLast4)
      )
      if (matched) return matched._id as mongoose.Types.ObjectId
    }
    return undefined
  }

  // Save transactions
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

    const delta = item.type === "credit" ? item.amountPaise : -item.amountPaise
    await Account.findByIdAndUpdate(accountId, { $inc: { currentBalancePaise: delta } })

    inserted.push(txn)
  }

  // Best-effort pair matching for credit card bill payments within 5-day window
  await linkMatchingCardBillPaymentsInDB(userOid, inserted, Transaction)

  const needsReviewCount = inserted.filter((t) => t.needsReview).length

  return NextResponse.json({
    syncedCount: inserted.length,
    skippedCount: duplicateCount + unmatchedAccountCount,
    unparseableCount,
    unmatchedAccountCount,
    needsReviewCount,
    transactions: inserted,
    message: `Successfully synced ${inserted.length} transactions from email`,
  })
})
