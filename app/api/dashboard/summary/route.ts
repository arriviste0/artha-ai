import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import Account from "@/models/account"
import Transaction from "@/models/transaction"
import Budget from "@/models/budget"
import Investment from "@/models/investment"

export const GET = withAuth(async (req: NextRequest, { userId }) => {
  await connectDB()

  const userOid = new mongoose.Types.ObjectId(userId)
  const searchParams = req.nextUrl.searchParams
  const period = searchParams.get("period") || "this_month"
  const paramMonth = searchParams.get("month") ? parseInt(searchParams.get("month")!) : undefined
  const paramYear = searchParams.get("year") ? parseInt(searchParams.get("year")!) : undefined
  const fromParam = searchParams.get("from")
  const toParam = searchParams.get("to")

  const now = new Date()
  let startDate: Date
  let endDate: Date = new Date(now)
  let priorStartDate: Date
  let priorEndDate: Date
  let periodLabel = "This Month"

  if (period === "custom_month_year" && paramMonth && paramYear) {
    startDate = new Date(paramYear, paramMonth - 1, 1, 0, 0, 0, 0)
    endDate = new Date(paramYear, paramMonth, 0, 23, 59, 59, 999)
    periodLabel = startDate.toLocaleString("default", { month: "long", year: "numeric" })

    // Prior month for comparison
    priorStartDate = new Date(paramYear, paramMonth - 2, 1, 0, 0, 0, 0)
    priorEndDate = new Date(paramYear, paramMonth - 1, 0, 23, 59, 59, 999)
  } else if (period === "last_month") {
    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0)
    endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
    periodLabel = startDate.toLocaleString("default", { month: "long", year: "numeric" })

    priorStartDate = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0, 0)
    priorEndDate = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59, 999)
  } else if (period === "last_3_months") {
    startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0, 0)
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
    periodLabel = "Last 3 Months"

    priorStartDate = new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0, 0)
    priorEndDate = new Date(now.getFullYear(), now.getMonth() - 2, 0, 23, 59, 59, 999)
  } else if (period === "last_6_months") {
    startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0, 0)
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
    periodLabel = "Last 6 Months"

    priorStartDate = new Date(now.getFullYear(), now.getMonth() - 11, 1, 0, 0, 0, 0)
    priorEndDate = new Date(now.getFullYear(), now.getMonth() - 5, 0, 23, 59, 59, 999)
  } else if (period === "this_year") {
    startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0)
    endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
    periodLabel = `Year ${now.getFullYear()}`

    priorStartDate = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0)
    priorEndDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999)
  } else if (period === "custom_range" && fromParam && toParam) {
    startDate = new Date(fromParam)
    endDate = new Date(toParam)
    endDate.setHours(23, 59, 59, 999)
    periodLabel = `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`

    const durationMs = endDate.getTime() - startDate.getTime()
    priorEndDate = new Date(startDate.getTime() - 1)
    priorStartDate = new Date(priorEndDate.getTime() - durationMs)
  } else if (period === "all_time") {
    startDate = new Date(2000, 0, 1)
    endDate = new Date(now)
    periodLabel = "All Time"

    priorStartDate = new Date(2000, 0, 1)
    priorEndDate = new Date(2000, 0, 1)
  } else {
    // Default: this_month
    startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
    periodLabel = "This Month"

    priorStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0)
    priorEndDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
  }

  // Days in selected period
  const effectiveEndDate = endDate > now ? now : endDate
  const durationDays = Math.max(
    1,
    Math.ceil((effectiveEndDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  )

  const [
    accounts,
    investments,
    currentRangeAgg,
    priorRangeAgg,
    topCategories,
    transactionCountAgg,
    budgets,
  ] = await Promise.all([
    Account.find({ userId, isActive: true }).select("currentBalancePaise name type").lean(),

    Investment.find({ userId }).select("investedPaise currentValuePaise name instrument").lean(),

    // Current period income & expenses
    Transaction.aggregate([
      {
        $match: {
          userId: userOid,
          occurredAt: { $gte: startDate, $lte: endDate },
        },
      },
      { $group: { _id: "$type", total: { $sum: "$amountPaise" } } },
    ]),

    // Prior period income & expenses
    Transaction.aggregate([
      {
        $match: {
          userId: userOid,
          occurredAt: { $gte: priorStartDate, $lte: priorEndDate },
        },
      },
      { $group: { _id: "$type", total: { $sum: "$amountPaise" } } },
    ]),

    // Top categories in current period
    Transaction.aggregate([
      {
        $match: {
          userId: userOid,
          type: "debit",
          occurredAt: { $gte: startDate, $lte: endDate },
        },
      },
      { $group: { _id: "$category", total: { $sum: "$amountPaise" } } },
      { $sort: { total: -1 } },
      { $limit: 6 },
    ]),

    // Total transactions in period
    Transaction.countDocuments({
      userId: userOid,
      occurredAt: { $gte: startDate, $lte: endDate },
    }),

    Budget.find({ userId }).lean(),
  ])

  type AggRow = { _id: string; total: number }
  const toMap = (agg: AggRow[]) => Object.fromEntries(agg.map((a) => [a._id, a.total]))

  const curr = toMap(currentRangeAgg)
  const prior = toMap(priorRangeAgg)

  const currentIncomePaise = curr.credit ?? 0
  const currentExpensesPaise = curr.debit ?? 0
  const priorIncomePaise = prior.credit ?? 0
  const priorExpensesPaise = prior.debit ?? 0

  // Net cashflow & savings rate
  const netCashflowPaise = currentIncomePaise - currentExpensesPaise
  const savingsRate =
    currentIncomePaise > 0
      ? Math.round(((currentIncomePaise - currentExpensesPaise) / currentIncomePaise) * 100)
      : 0

  // Daily burn rate
  const dailyBurnRatePaise = Math.round(currentExpensesPaise / durationDays)

  // Liquid and Total Net Worth
  const liquidNetWorthPaise = accounts.reduce((s, a) => s + a.currentBalancePaise, 0)
  const totalInvestedPaise = investments.reduce((s, i) => s + (i.investedPaise || 0), 0)
  const totalInvestmentsValuationPaise = investments.reduce(
    (s, i) => s + (i.currentValuePaise || 0),
    0
  )
  const investmentsGainPaise = totalInvestmentsValuationPaise - totalInvestedPaise
  const investmentsGainPct =
    totalInvestedPaise > 0
      ? Number(((investmentsGainPaise / totalInvestedPaise) * 100).toFixed(1))
      : 0

  const totalNetWorthPaise = liquidNetWorthPaise + totalInvestmentsValuationPaise

  // Budget Adherence for period
  const budgetStatuses = await Promise.all(
    budgets.map(async (b) => {
      const agg = await Transaction.aggregate([
        {
          $match: {
            userId: userOid,
            category: b.category,
            type: "debit",
            occurredAt: { $gte: startDate, $lte: endDate },
          },
        },
        { $group: { _id: null, total: { $sum: "$amountPaise" } } },
      ])
      const spent = agg[0]?.total ?? 0
      return {
        id: b._id.toString(),
        name: b.name,
        category: b.category,
        limitPaise: b.limitPaise,
        spentPaise: spent,
        isOverBudget: spent > b.limitPaise,
      }
    })
  )

  const onTrackBudgets = budgetStatuses.filter((b) => !b.isOverBudget).length
  const exceededBudgets = budgetStatuses.filter((b) => b.isOverBudget).length
  const budgetAdherencePct =
    budgets.length > 0 ? Math.round((onTrackBudgets / budgets.length) * 100) : 100

  return NextResponse.json({
    period: {
      key: period,
      label: periodLabel,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      durationDays,
    },
    // Core KPIs
    netWorthPaise: liquidNetWorthPaise,
    totalNetWorthPaise,
    liquidNetWorthPaise,
    netCashflowPaise,
    savingsRate,
    dailyBurnRatePaise,
    transactionCount: transactionCountAgg,

    // Current Period
    currentMonth: {
      incomePaise: currentIncomePaise,
      expensesPaise: currentExpensesPaise,
      netSavingsPaise: netCashflowPaise,
    },

    // Prior Period for Comparison
    lastMonth: {
      incomePaise: priorIncomePaise,
      expensesPaise: priorExpensesPaise,
    },

    // Investments KPI
    investments: {
      totalInvestedPaise,
      currentValuePaise: totalInvestmentsValuationPaise,
      gainPaise: investmentsGainPaise,
      gainPct: investmentsGainPct,
      count: investments.length,
    },

    // Budget Adherence KPI
    budgets: {
      total: budgets.length,
      onTrack: onTrackBudgets,
      exceeded: exceededBudgets,
      adherencePct: budgetAdherencePct,
      list: budgetStatuses,
    },

    // Accounts List
    accounts: accounts.map((a) => ({
      name: a.name,
      type: a.type,
      balancePaise: a.currentBalancePaise,
    })),

    // Top Expense Categories in filtered period
    topCategories: topCategories.map((c) => ({
      category: (c._id as string) || "Uncategorized",
      amountPaise: c.total as number,
    })),

    budgetCount: budgets.length,
  })
})
