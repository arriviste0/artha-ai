import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db"
import SyncConnection from "@/models/sync-connection"
import Account from "@/models/account"
import Transaction from "@/models/transaction"
import { parseTransactionAlert } from "@/lib/sync/parser"
import { deduplicateTransactions } from "@/lib/sync/dedupe"
import { linkMatchingCardBillPaymentsInDB } from "@/lib/sync/card-bill-detector"
import mongoose from "mongoose"

interface IncomingSmsItem {
  text: string
  date?: string
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-secret, x-token, Authorization",
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get("token") || req.headers.get("x-secret") || req.headers.get("x-token")

  let authenticated = false
  if (token) {
    try {
      await connectDB()
      const connection = await SyncConnection.findOne({ webhookToken: token })
      if (connection) authenticated = true
    } catch {
      // ignore
    }
  }

  return NextResponse.json(
    {
      status: "ok",
      authenticated,
      message: authenticated
        ? "Webhook is reachable and your token is valid! Send POST requests from iOS Shortcuts to sync SMS."
        : "Webhook is reachable! Send POST requests with your secret token to sync SMS.",
    },
    { headers: corsHeaders }
  )
}

export async function POST(req: NextRequest) {
  await connectDB()

  let userId: string | null = null

  // 1. Authenticate via iOS Shortcut webhook token OR x-secret header OR NextAuth session
  const { searchParams } = new URL(req.url)
  const token = searchParams.get("token") || req.headers.get("x-secret") || req.headers.get("x-token")

  if (token) {
    const connection = await SyncConnection.findOne({ webhookToken: token })
    if (connection) {
      userId = connection.userId.toString()
    }
  }

  if (!userId) {
    const session = await auth()
    if (session?.user?.id) {
      userId = session.user.id
    }
  }

  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized. Missing valid session or token." },
      { status: 401, headers: corsHeaders }
    )
  }

  // 2. Parse request body (JSON with fallback to plain text if Shortcuts sent text)
  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    try {
      const text = await req.text()
      if (text && text.trim()) {
        rawBody = { text: text.trim() }
      }
    } catch {
      // ignore
    }
  }

  if (!rawBody) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400, headers: corsHeaders })
  }

  const items: IncomingSmsItem[] = []

  if (typeof rawBody === "object" && rawBody !== null) {
    const bodyObj = rawBody as Record<string, unknown>

    if (typeof bodyObj.text === "string" && bodyObj.text.trim()) {
      // Single text or multi-line pasted text
      const lines = bodyObj.text
        .split(/\n{2,}|\r\n{2,}/) // Split if multiple SMS messages are separated by blank lines
        .map((l) => l.trim())
        .filter(Boolean)

      const singleDate = lines.length === 1 && typeof bodyObj.date === "string" ? bodyObj.date : undefined

      for (const line of lines) {
        items.push({ text: line, date: singleDate })
      }
    } else if (Array.isArray(bodyObj.messages)) {
      for (const m of bodyObj.messages) {
        if (typeof m?.text === "string" && m.text.trim()) {
          items.push({ text: m.text.trim(), date: m.date })
        }
      }
    }
  }

  if (items.length === 0) {
    return NextResponse.json({ error: "No SMS text provided to parse" }, { status: 400, headers: corsHeaders })
  }

  // 3. Parse each SMS (Regex first, LLM fallback, ignoring OTPs)
  const parsedCandidates = []
  let unparseableCount = 0

  for (const item of items) {
    const itemDate = item.date ? new Date(item.date) : undefined
    const parsed = await parseTransactionAlert(item.text, "sms_sync", itemDate)
    if (parsed) {
      parsedCandidates.push(parsed)
    } else {
      unparseableCount++
    }
  }

  if (parsedCandidates.length === 0) {
    return NextResponse.json(
      {
        syncedCount: 0,
        skippedCount: 0,
        unparseableCount,
        transactions: [],
        message:
          unparseableCount > 0
            ? "SMS messages could not be parsed as financial transactions"
            : "No transactions found",
      },
      { headers: corsHeaders }
    )
  }

  // 4. Deduplicate (by ref number or amount + time + merchant)
  const { newTransactions, duplicateCount } = await deduplicateTransactions(userId, parsedCandidates)

  if (newTransactions.length === 0) {
    return NextResponse.json(
      {
        syncedCount: 0,
        skippedCount: duplicateCount,
        unparseableCount,
        transactions: [],
        message: "All parsed transactions were already recorded (duplicates skipped)",
      },
      { headers: corsHeaders }
    )
  }

  // 5. Account resolution
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

  // 6. Save transactions (Store ONLY parsed fields, never full SMS body)
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
      subtype: item.subtype,
      cardLast4: item.cardLast4,
      referenceNumber: item.referenceNumber,
      accountNumberMasked: item.accountNumberMasked,
      payeeKey: item.payeeKey,
      payeeType: item.payeeType,
      source: "sms_sync",
      needsReview: item.needsReview ?? false,
      rawData: item.rawData,
    })

    // Update account balance
    const delta = item.type === "credit" ? item.amountPaise : -item.amountPaise
    await Account.findByIdAndUpdate(accountId, { $inc: { currentBalancePaise: delta } })

    inserted.push(txn)
  }

  // 7. Best-effort pair matching for credit card bill payments within 5-day window
  await linkMatchingCardBillPaymentsInDB(userOid, inserted, Transaction)

  const needsReviewCount = inserted.filter((t) => t.needsReview).length

  return NextResponse.json(
    {
      syncedCount: inserted.length,
      skippedCount: duplicateCount,
      unparseableCount,
      needsReviewCount,
      transactions: inserted,
      message: `Successfully synced ${inserted.length} transactions from SMS`,
    },
    { headers: corsHeaders }
  )
}
