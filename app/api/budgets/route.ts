import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import Budget from "@/models/budget"
import Transaction from "@/models/transaction"
import AuditLog from "@/models/audit-log"
import { createBudgetSchema } from "@/lib/validators/budget"

export const GET = withAuth(async (_req: NextRequest, { userId }) => {
  await connectDB()

  const budgets = await Budget.find({ userId }).sort({ createdAt: 1 }).lean()

  // Compute spent-so-far for each budget (current period)
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const enriched = await Promise.all(
    budgets.map(async (b) => {
      const spentPaise = await Transaction.aggregate([
        {
          $match: {
            userId: b.userId,
            category: b.category,
            type: "debit",
            occurredAt: { $gte: monthStart, $lte: now },
          },
        },
        { $group: { _id: null, total: { $sum: "$amountPaise" } } },
      ])
      return {
        ...b,
        spentPaise: spentPaise[0]?.total ?? 0,
      }
    })
  )

  return NextResponse.json({ budgets: enriched })
})

export const POST = withAuth(async (req: NextRequest, { userId }) => {
  const body: unknown = await req.json()
  const parsed = createBudgetSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  await connectDB()
  const budget = await Budget.create({
    ...parsed.data,
    userId,
    startDate: new Date(parsed.data.startDate),
    endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : undefined,
  })

  await AuditLog.create({
    userId,
    entity: "Budget",
    entityId: budget._id,
    action: "create",
    after: parsed.data,
  })

  return NextResponse.json({ budget }, { status: 201 })
})
