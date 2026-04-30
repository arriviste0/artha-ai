import { NextRequest, NextResponse } from "next/server"
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

  await connectDB()
  const [transactions, total] = await Promise.all([
    Transaction.find(filter).sort({ occurredAt: -1 }).skip(skip).limit(limit).lean(),
    Transaction.countDocuments(filter),
  ])

  return NextResponse.json({ transactions, total, page, limit })
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
