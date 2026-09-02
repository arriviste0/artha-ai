import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import Account from "@/models/account"
import Budget from "@/models/budget"
import Goal from "@/models/goal"
import Transaction from "@/models/transaction"
import Investment from "@/models/investment"
import FinancialPlan from "@/models/financial-plan"
import { getPlannerAdvice, type UserFinancialContext } from "@/lib/ai/planner-advisor"
import { getAIAvailability, isAIProviderAvailable } from "@/lib/ai/provider"
import { z } from "zod"

export const maxDuration = 60

const chatRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  provider: z.enum(["groq", "ollama"]).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .default([]),
})

export const POST = withAuth(async (req: NextRequest, { userId }) => {
  const body: unknown = await req.json()
  const parsed = chatRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  if (parsed.data.provider) {
    if (!isAIProviderAvailable(parsed.data.provider)) {
      return NextResponse.json(
        {
          error:
            parsed.data.provider === "groq"
              ? "Groq requires GROQ_API_KEY to be configured in .env"
              : "Local Ollama requires OLLAMA_BASE_URL and OLLAMA_MODEL to be configured.",
        },
        { status: 503 }
      )
    }
  } else {
    const { available } = getAIAvailability()
    if (!available) {
      return NextResponse.json(
        { error: "AI features require GROQ_API_KEY or an active Ollama instance." },
        { status: 503 }
      )
    }
  }

  await connectDB()

  // 1. Accounts & Liquid Balances
  const accounts = await Account.find({ userId }).lean()
  const totalLiquidBalancePaise = accounts.reduce((sum, a) => sum + (a.currentBalancePaise || 0), 0)

  // 2. Transactions for current and historical averages (last 3 months)
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1)

  // Monthly income estimate
  const incomeAgg = await Transaction.aggregate([
    {
      $match: {
        userId,
        type: "credit",
        occurredAt: { $gte: threeMonthsAgo },
      },
    },
    { $group: { _id: null, total: { $sum: "$amountPaise" } } },
  ])
  const estimatedMonthlyIncomePaise = Math.round((incomeAgg[0]?.total ?? 0) / 3)

  // Monthly expenses estimate & top categories
  const expenseCategoriesAgg = await Transaction.aggregate([
    {
      $match: {
        userId,
        type: "debit",
        occurredAt: { $gte: threeMonthsAgo },
      },
    },
    {
      $group: {
        _id: "$category",
        totalDebit: { $sum: "$amountPaise" },
      },
    },
    { $sort: { totalDebit: -1 } },
    { $limit: 10 },
  ])

  const totalDebitPaise = expenseCategoriesAgg.reduce((sum, c) => sum + c.totalDebit, 0)
  const monthlyExpensesPaise = Math.round(totalDebitPaise / 3)

  const topExpenseCategories = expenseCategoriesAgg.map((c) => ({
    category: c._id || "Uncategorized",
    averageMonthlyDebitPaise: Math.round(c.totalDebit / 3),
  }))

  // 3. Budgets & current month spent
  const budgets = await Budget.find({ userId }).lean()
  const budgetContexts = await Promise.all(
    budgets.map(async (b) => {
      const agg = await Transaction.aggregate([
        {
          $match: {
            userId,
            category: b.category,
            type: "debit",
            occurredAt: { $gte: monthStart, $lte: now },
          },
        },
        { $group: { _id: null, total: { $sum: "$amountPaise" } } },
      ])
      return {
        id: b._id.toString(),
        name: b.name,
        category: b.category,
        limitPaise: b.limitPaise,
        spentPaise: agg[0]?.total ?? 0,
        period: b.period,
      }
    })
  )

  // 4. Goals
  const goals = await Goal.find({ userId }).lean()
  const goalContexts = goals.map((g) => ({
    id: g._id.toString(),
    name: g.name,
    kind: g.kind,
    targetPaise: g.targetPaise,
    currentPaise: g.currentPaise,
    monthlyContributionPaise: g.monthlyContributionPaise,
    targetDate: g.targetDate,
  }))

  // 5. Investments
  const investments = await Investment.find({ userId }).lean()
  const investmentContexts = investments.map((i) => ({
    name: i.name,
    instrument: i.instrument,
    currentValuePaise: i.currentValuePaise,
  }))

  // 6. Latest Financial Plan summary
  const latestPlan = await FinancialPlan.findOne({ userId }).sort({ createdAt: -1 }).lean()

  const financialContext: UserFinancialContext = {
    totalLiquidBalancePaise,
    estimatedMonthlyIncomePaise,
    monthlyExpensesPaise,
    budgets: budgetContexts,
    goals: goalContexts,
    investments: investmentContexts,
    topExpenseCategories,
    activePlanSummary: latestPlan?.summary,
  }

  try {
    const advice = await getPlannerAdvice(
      parsed.data.message,
      financialContext,
      parsed.data.history,
      parsed.data.provider
    )

    return NextResponse.json({ advice })
  } catch (err) {
    console.error("Planner Advisor Chat Error:", err)
    return NextResponse.json(
      { error: (err as Error).message || "Failed to generate copilot response." },
      { status: 500 }
    )
  }
})
