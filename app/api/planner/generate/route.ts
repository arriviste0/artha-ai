import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import Account from "@/models/account"
import Transaction from "@/models/transaction"
import Goal from "@/models/goal"
import Investment from "@/models/investment"
import FinancialPlan from "@/models/financial-plan"
import { aiGenerate } from "@/lib/ai/provider"
import { paiseToRupees } from "@/lib/money"
import { z } from "zod"

export const maxDuration = 60; // Allow more time for AI generation

export const POST = withAuth(async (_req: NextRequest, { userId }) => {
  await connectDB()

  // 1. Gather User Financial Data
  const accounts = await Account.find({ userId })
  const totalBalance = accounts.reduce((acc, a) => acc + (a.currentBalancePaise || 0), 0)

  // Last 6 months of transactions
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  
  const transactions = await Transaction.find({
    userId,
    occurredAt: { $gte: sixMonthsAgo },
  }).lean()

  if (transactions.length === 0) {
    return NextResponse.json(
      { error: "Not enough data. Please add at least one month of transactions to generate a plan." },
      { status: 400 }
    )
  }

  const categoryTotals: Record<string, { debit: number; credit: number }> = {}
  for (const t of transactions) {
    const cat = t.category || "Uncategorized"
    if (!categoryTotals[cat]) categoryTotals[cat] = { debit: 0, credit: 0 }
    if (t.type === "debit") {
      categoryTotals[cat].debit += t.amountPaise
    } else {
      categoryTotals[cat].credit += t.amountPaise
    }
  }

  const goals = await Goal.find({ userId })
  const investments = await Investment.find({ userId })

  // 2. Format Data for Prompt
  const formattedData = {
    totalLiquidBalance: paiseToRupees(totalBalance),
    monthlyAveragesLast6Months: Object.entries(categoryTotals).map(([cat, sums]) => ({
      category: cat,
      averageMonthlyDebit: paiseToRupees(sums.debit) / 6,
      averageMonthlyCredit: paiseToRupees(sums.credit) / 6,
    })),
    activeGoals: goals.map((g) => ({
      name: g.name,
      targetAmount: paiseToRupees(g.targetAmountPaise),
      currentAmount: paiseToRupees(g.currentAmountPaise),
      deadline: g.deadline,
    })),
    investments: investments.map((i) => ({
      name: i.name,
      type: i.type,
      currentValue: paiseToRupees(i.currentValuePaise),
    })),
  }

  // 3. Construct AI Prompt
  const prompt = `You are an elite, highly personalized AI Financial Planner.
Analyze the following user financial data (aggregated over the last 6 months) and generate a comprehensive, structured financial plan.
The user is based in India (amounts are in INR).

User Financial Data:
${JSON.stringify(formattedData, null, 2)}

Instructions:
1. Provide a high-level summary paragraph.
2. Create Recommended Allocation Buckets (e.g. Needs, Wants, Savings/Investments, Debt Repayment). Provide the target percentage, target monthly amount in INR, and a brief recommendation for each bucket based on their actual spending patterns.
3. Identify Risk Flags (e.g. low emergency fund, high spending in non-essentials, lack of investments). Rate severity as low, medium, or high.
4. Provide highly prioritized Action Items (priority 1 being the most urgent). Give specific, actionable steps.

Respond strictly in the following JSON format:
{
  "summary": "...",
  "allocationBuckets": [
    { "category": "...", "percentage": 0, "amount": 0, "recommendation": "..." }
  ],
  "riskFlags": [
    { "severity": "low|medium|high", "title": "...", "description": "..." }
  ],
  "actionItems": [
    { "priority": 1, "title": "...", "description": "..." }
  ]
}`

  let textRes = await aiGenerate({ prompt, json: true })
  
  // Clean markdown backticks if AI hallucinates them
  textRes = textRes.replace(/```json/g, "").replace(/```/g, "").trim()

  const schema = z.object({
    summary: z.string(),
    allocationBuckets: z.array(z.object({
      category: z.string(),
      percentage: z.number(),
      amount: z.number(),
      recommendation: z.string(),
    })),
    riskFlags: z.array(z.object({
      severity: z.enum(["low", "medium", "high"]),
      title: z.string(),
      description: z.string(),
    })),
    actionItems: z.array(z.object({
      priority: z.number(),
      title: z.string(),
      description: z.string(),
    })),
  })

  try {
    const parsed = schema.parse(JSON.parse(textRes))

    // 4. Save and return plan
    const newPlan = await FinancialPlan.create({
      userId,
      summary: parsed.summary,
      allocationBuckets: parsed.allocationBuckets,
      riskFlags: parsed.riskFlags,
      actionItems: parsed.actionItems,
    })

    return NextResponse.json({ plan: newPlan })
  } catch (err) {
    console.error("AI Planner Generation Error:", err)
    return NextResponse.json(
      { error: "Failed to generate financial plan. The AI returned an invalid format." },
      { status: 500 }
    )
  }
})
