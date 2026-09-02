import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import Transaction from "@/models/transaction"
import Account from "@/models/account"
import AuditLog from "@/models/audit-log"
import { createTransactionSchema, transactionFiltersSchema } from "@/lib/validators/transaction"

export const GET = withAuth(async (req: NextRequest, { userId }) => {
  const sp = Object.fromEntries(req.nextUrl.searchParams)
  const parsed = transactionFiltersSchema.safeParse({
    ...sp,
    page: sp.page ? Number(sp.page) : undefined,
    limit: sp.limit ? Number(sp.limit) : undefined,
    needsReview: sp.needsReview === "true" ? true : sp.needsReview === "false" ? false : undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const { from, to, category, accountId, search, needsReview, page, limit } = parsed.data
  const skip = (page - 1) * limit

  const filter: Record<string, unknown> = { userId }
  if (from || to) {
    filter.occurredAt = {
      ...(from ? { $gte: new Date(from) } : {}),
      ...(to ? { $lte: new Date(to) } : {}),
    }
  }
  if (category) filter.category = category
  if (accountId) filter.accountId = accountId
  if (needsReview !== undefined) filter.needsReview = needsReview
  if (search) filter.description = { $regex: search, $options: "i" }

  const aggFilter: Record<string, unknown> = {
    userId: new mongoose.Types.ObjectId(userId),
  }
  if (from || to) {
    aggFilter.occurredAt = filter.occurredAt
  }
  if (category) aggFilter.category = category
  if (accountId && mongoose.Types.ObjectId.isValid(accountId)) {
    aggFilter.accountId = new mongoose.Types.ObjectId(accountId)
  }
  if (needsReview !== undefined) aggFilter.needsReview = needsReview
  if (search) aggFilter.description = filter.description

  await connectDB()
  const [transactions, total, statsAgg] = await Promise.all([
    Transaction.find(filter).sort({ occurredAt: -1 }).skip(skip).limit(limit).lean(),
    Transaction.countDocuments(filter),
    Transaction.aggregate([
      { $match: aggFilter },
      {
        $group: {
          _id: "$type",
          totalPaise: { $sum: "$amountPaise" },
          count: { $sum: 1 },
        },
      },
    ]),
  ])

  type AggRow = { _id: string; totalPaise: number; count: number }
  const statsMap = Object.fromEntries(statsAgg.map((s: AggRow) => [s._id, s.totalPaise]))

  const totalIncomePaise = statsMap.credit ?? 0
  const totalExpensesPaise = statsMap.debit ?? 0
  const netSpendingPaise = totalExpensesPaise - totalIncomePaise
  const netCashflowPaise = totalIncomePaise - totalExpensesPaise

  return NextResponse.json({
    transactions,
    total,
    page,
    limit,
    stats: {
      totalIncomePaise,
      totalExpensesPaise,
      netSpendingPaise,
      netCashflowPaise,
    },
  })
})

export const POST = withAuth(async (req: NextRequest, { userId }) => {
  const body: unknown = await req.json()
  const parsed = createTransactionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  await connectDB()
  const account = await Account.findOne({ _id: parsed.data.accountId, userId })
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 })

  const txn = await Transaction.create({
    ...parsed.data,
    userId,
    occurredAt: new Date(parsed.data.occurredAt),
  })

  // Update account balance
  const delta = parsed.data.type === "credit" ? parsed.data.amountPaise : -parsed.data.amountPaise
  await Account.findByIdAndUpdate(parsed.data.accountId, {
    $inc: { currentBalancePaise: delta },
  })

  await AuditLog.create({
    userId,
    entity: "Transaction",
    entityId: txn._id,
    action: "create",
    after: parsed.data,
  })

  return NextResponse.json({ transaction: txn }, { status: 201 })
})
