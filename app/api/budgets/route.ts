import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import Budget from "@/models/budget"
import Transaction from "@/models/transaction"
import AuditLog from "@/models/audit-log"
import { createBudgetSchema } from "@/lib/validators/budget"

export const GET = withAuth(async (_req: NextRequest, { userId }) => {
  await connectDB()

  const userOid = new mongoose.Types.ObjectId(userId)
  const budgets = await Budget.find({ userId: userOid }).sort({ createdAt: 1 }).lean()

  // Compute spent-so-far for each budget (current month / active period)
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

  const enriched = await Promise.all(
    budgets.map(async (b) => {
      const budgetOid = new mongoose.Types.ObjectId(b._id.toString())
      const bStart = b.startDate ? new Date(b.startDate) : monthStart
      const periodStart = bStart < monthStart ? bStart : monthStart
      const periodEnd = b.endDate ? new Date(b.endDate) : monthEnd

      const spentPaise = await Transaction.aggregate([
        {
          $match: {
            userId: userOid,
            type: "debit",
            $or: [
              // 1. Transaction explicitly assigned to this budget
              { budgetId: budgetOid },
              { budgetId: b._id.toString() },
              // 2. Unassigned transaction matching category within period
              {
                category: b.category,
                budgetId: { $in: [null, undefined, ""] },
                occurredAt: { $gte: periodStart, $lte: periodEnd },
              },
            ],
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
