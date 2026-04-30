import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import Budget from "@/models/budget"
import Transaction from "@/models/transaction"
import { getBudgetAdvice } from "@/lib/ai/budget-advisor"
import { getAIAvailability } from "@/lib/ai/provider"
import { z } from "zod"

const chatRequestSchema = z.object({
  message: z.string().min(1).max(1000),
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
  const { available } = getAIAvailability()
  if (!available) {
    return NextResponse.json(
      { error: "AI features require AI_DEFAULT_PROVIDER to include gemini with GEMINI_API_KEY or ollama with a local Ollama server." },
      { status: 503 }
    )
  }

  const body: unknown = await req.json()
  const parsed = chatRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  await connectDB()

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const budgets = await Budget.find({ userId }).lean()

  // Enrich with current-month spending
  const budgetContexts = await Promise.all(
    budgets.map(async (b) => {
      const agg = await Transaction.aggregate([
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
        id: b._id.toString(),
        category: b.category,
        limitPaise: b.limitPaise,
        spentPaise: agg[0]?.total ?? 0,
        period: b.period,
      }
    })
  )

  // Estimate monthly income from transaction history (last 3 months)
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1)
  const incomeAgg = await Transaction.aggregate([
    {
      $match: {
        userId: budgets[0]?.userId ?? userId,
        type: "credit",
        category: { $in: ["Salary", "Income", "Freelance", "Business Income"] },
        occurredAt: { $gte: threeMonthsAgo },
      },
    },
    { $group: { _id: null, total: { $sum: "$amountPaise" } } },
  ])
  const estimatedMonthlyIncomePaise = Math.round((incomeAgg[0]?.total ?? 0) / 3)

  try {
    const suggestion = await getBudgetAdvice(
      parsed.data.message,
      budgetContexts,
      estimatedMonthlyIncomePaise,
      parsed.data.history
    )
    return NextResponse.json({ suggestion })
  } catch (err) {
    console.error("Budget advisor error:", err)
    return NextResponse.json(
      { error: "The AI advisor is temporarily unavailable. Please try again." },
      { status: 500 }
    )
  }
})
