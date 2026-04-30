import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import Account from "@/models/account"
import Transaction from "@/models/transaction"
import Budget from "@/models/budget"

export const GET = withAuth(async (_req: NextRequest, { userId }) => {
  await connectDB()

  const userOid = new mongoose.Types.ObjectId(userId)
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)

  const [accounts, currentMonthAgg, lastMonthAgg, topCategories, budgets] = await Promise.all([
    Account.find({ userId, isActive: true }).select("currentBalancePaise name type").lean(),

    Transaction.aggregate([
      { $match: { userId: userOid, occurredAt: { $gte: monthStart } } },
      { $group: { _id: "$type", total: { $sum: "$amountPaise" } } },
    ]),

    Transaction.aggregate([
      {
        $match: {
          userId: userOid,
          occurredAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
        },
      },
      { $group: { _id: "$type", total: { $sum: "$amountPaise" } } },
    ]),

    Transaction.aggregate([
      { $match: { userId: userOid, type: "debit", occurredAt: { $gte: monthStart } } },
      { $group: { _id: "$category", total: { $sum: "$amountPaise" } } },
      { $sort: { total: -1 } },
      { $limit: 5 },
    ]),

    Budget.find({ userId }).lean(),
  ])

  const netWorthPaise = accounts.reduce((s, a) => s + a.currentBalancePaise, 0)

  type AggRow = { _id: string; total: number }
  const toMap = (agg: AggRow[]) => Object.fromEntries(agg.map((a) => [a._id, a.total]))

  const curr = toMap(currentMonthAgg)
  const last = toMap(lastMonthAgg)

  return NextResponse.json({
    netWorthPaise,
    accounts: accounts.map((a) => ({
      name: a.name,
      type: a.type,
      balancePaise: a.currentBalancePaise,
    })),
    currentMonth: {
      incomePaise: curr.credit ?? 0,
      expensesPaise: curr.debit ?? 0,
    },
    lastMonth: {
      incomePaise: last.credit ?? 0,
      expensesPaise: last.debit ?? 0,
    },
    topCategories: topCategories.map((c) => ({ category: c._id as string, amountPaise: c.total as number })),
    budgetCount: budgets.length,
  })
})
