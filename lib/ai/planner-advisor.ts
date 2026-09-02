import { z } from "zod"
import { aiGenerate, type AIProviderName } from "@/lib/ai/provider"
import { paiseToRupees } from "@/lib/money"

// ── Action Schemas ─────────────────────────────────────────────────────────────

export const actionableChangeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("set_budget"),
    budgetId: z.string(),
    category: z.string(),
    currentLimitPaise: z.number().int(),
    suggestedLimitPaise: z.number().int(),
    changeRupees: z.number(),
    reasoning: z.string(),
  }),
  z.object({
    type: z.literal("create_budget"),
    name: z.string(),
    category: z.string(),
    limitPaise: z.number().int(),
    period: z.enum(["monthly", "weekly"]).default("monthly"),
    reasoning: z.string(),
  }),
  z.object({
    type: z.literal("create_goal"),
    name: z.string(),
    kind: z.enum(["savings", "emergency_fund", "debt_payoff"]),
    targetPaise: z.number().int(),
    monthlyContributionPaise: z.number().int(),
    targetDate: z.string().optional(),
    reasoning: z.string(),
  }),
  z.object({
    type: z.literal("update_goal"),
    goalId: z.string(),
    name: z.string(),
    currentMonthlyContributionPaise: z.number().int().optional(),
    suggestedMonthlyContributionPaise: z.number().int().optional(),
    currentTargetPaise: z.number().int().optional(),
    suggestedTargetPaise: z.number().int().optional(),
    reasoning: z.string(),
  }),
])

export type ActionableChange = z.infer<typeof actionableChangeSchema>

export const plannerAdviceResponseSchema = z.object({
  message: z.string(),
  analysis: z.string().optional(),
  actionableChanges: z.array(actionableChangeSchema).default([]),
  warnings: z.array(z.string()).default([]),
  quickReplies: z.array(z.string()).default([]),
})

export type PlannerAdviceResponse = z.infer<typeof plannerAdviceResponseSchema>

// ── Context Types ──────────────────────────────────────────────────────────────

export interface UserFinancialContext {
  totalLiquidBalancePaise: number
  estimatedMonthlyIncomePaise: number
  monthlyExpensesPaise: number
  budgets: Array<{
    id: string
    name: string
    category: string
    limitPaise: number
    spentPaise: number
    period: string
  }>
  goals: Array<{
    id: string
    name: string
    kind: string
    targetPaise: number
    currentPaise: number
    monthlyContributionPaise: number
    targetDate?: Date
  }>
  investments: Array<{
    name: string
    instrument: string
    currentValuePaise: number
  }>
  topExpenseCategories: Array<{
    category: string
    averageMonthlyDebitPaise: number
  }>
  activePlanSummary?: string
}

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

// ── Advisor Function ───────────────────────────────────────────────────────────

export async function getPlannerAdvice(
  userMessage: string,
  context: UserFinancialContext,
  history: ChatMessage[],
  provider?: AIProviderName
): Promise<PlannerAdviceResponse> {
  const budgetLines = context.budgets.length
    ? context.budgets
        .map(
          (b) =>
            `- [id: "${b.id}"] ${b.category} ("${b.name}"): Limit ₹${paiseToRupees(b.limitPaise).toLocaleString("en-IN")}, Spent ₹${paiseToRupees(b.spentPaise).toLocaleString("en-IN")} (${b.period})`
        )
        .join("\n")
    : "No active budgets configured yet."

  const goalLines = context.goals.length
    ? context.goals
        .map(
          (g) =>
            `- [id: "${g.id}"] ${g.name} (${g.kind}): Target ₹${paiseToRupees(g.targetPaise).toLocaleString("en-IN")}, Current ₹${paiseToRupees(g.currentPaise).toLocaleString("en-IN")}, Monthly Contribution ₹${paiseToRupees(g.monthlyContributionPaise).toLocaleString("en-IN")}`
        )
        .join("\n")
    : "No financial goals configured yet."

  const expenseLines = context.topExpenseCategories.length
    ? context.topExpenseCategories
        .map(
          (e) =>
            `- ${e.category}: ~₹${paiseToRupees(e.averageMonthlyDebitPaise).toLocaleString("en-IN")}/month`
        )
        .join("\n")
    : "No transaction category history available."

  const investmentLines = context.investments.length
    ? context.investments
        .map(
          (i) =>
            `- ${i.name} (${i.instrument}): Value ₹${paiseToRupees(i.currentValuePaise).toLocaleString("en-IN")}`
        )
        .join("\n")
    : "No investment records found."

  const historyLines = history
    .slice(-8)
    .map((m) => `${m.role === "user" ? "User" : "Artha Copilot"}: ${m.content}`)
    .join("\n")

  const systemPrompt = `You are ArthaAI Financial Copilot, an elite personal wealth strategist and financial planner in India.
You converse directly with the user. You give clear, empathetic, mathematically grounded advice using Indian Rupee (₹).
Most importantly, when you suggest financial changes (such as cutting an expense, setting a budget, or creating/adjusting a goal), you can provide ACTIONABLE CHANGES that the user can apply to their account with a single click.

=== USER FINANCIAL PROFILE ===
- Total Liquid Accounts Balance: ₹${paiseToRupees(context.totalLiquidBalancePaise).toLocaleString("en-IN")}
- Estimated Monthly Income: ₹${paiseToRupees(context.estimatedMonthlyIncomePaise).toLocaleString("en-IN")}
- Average Monthly Outflow: ₹${paiseToRupees(context.monthlyExpensesPaise).toLocaleString("en-IN")}

Current Budgets:
${budgetLines}

Active Financial Goals:
${goalLines}

Top Spending Categories (Average Monthly Outflow):
${expenseLines}

Investments:
${investmentLines}

${context.activePlanSummary ? `Current Plan Summary: ${context.activePlanSummary}` : ""}

=== CONVERSATION HISTORY ===
${historyLines ? historyLines : "First message in this session."}

=== CURRENT USER MESSAGE ===
"${userMessage}"

=== YOUR RESPONSE REQUIREMENTS ===
Respond ONLY in valid JSON matching this schema:
{
  "message": "A helpful, conversational response explaining your thinking, giving advice, calculations, and breaking down suggestions.",
  "analysis": "A concise 1-2 sentence breakdown of key insights.",
  "actionableChanges": [
    // Include one or more actions ONLY if your advice proposes concrete changes to budgets or goals.
    // If no changes are being made or user is just asking a question, keep this array empty [].
    // Action Type 1: Update an existing budget
    {
      "type": "set_budget",
      "budgetId": "<exact id from Current Budgets list, e.g. 64a8...>",
      "category": "<category name>",
      "currentLimitPaise": <integer in paise, 100 paise = 1 INR>,
      "suggestedLimitPaise": <integer in paise, 100 paise = 1 INR>,
      "changeRupees": <integer change in INR, positive for increase, negative for decrease>,
      "reasoning": "<why this budget change is recommended>"
    },
    // Action Type 2: Create a new budget
    {
      "type": "create_budget",
      "name": "<budget name, e.g. Dining Out>",
      "category": "<matching category, e.g. Food & Dining>",
      "limitPaise": <integer in paise>,
      "period": "monthly",
      "reasoning": "<why this new budget is recommended>"
    },
    // Action Type 3: Create a new goal
    {
      "type": "create_goal",
      "name": "<goal name, e.g. Emergency Fund (6 Months)>",
      "kind": "savings" | "emergency_fund" | "debt_payoff",
      "targetPaise": <integer in paise>,
      "monthlyContributionPaise": <integer in paise>,
      "targetDate": "<ISO date string or omit>",
      "reasoning": "<why this goal is recommended>"
    },
    // Action Type 4: Update existing goal
    {
      "type": "update_goal",
      "goalId": "<exact id from Active Goals list>",
      "name": "<goal name>",
      "currentMonthlyContributionPaise": <integer in paise>,
      "suggestedMonthlyContributionPaise": <integer in paise>,
      "currentTargetPaise": <integer in paise>,
      "suggestedTargetPaise": <integer in paise>,
      "reasoning": "<why this goal adjustment is recommended>"
    }
  ],
  "warnings": ["Any warnings such as budget exceeding income, low liquidity, or high risk."],
  "quickReplies": ["2 to 4 suggested quick follow-up prompt questions for the user"]
}

Important Rules:
1. Always convert rupee values to paise for 'limitPaise', 'targetPaise', etc. (multiply rupees by 100).
2. For 'set_budget' or 'update_goal', ALWAYS copy the exact id string from the lists above.
3. Be realistic, encouraging, and clear about the financial trade-offs.`

  try {
    const raw = await aiGenerate({ prompt: systemPrompt, json: true, provider })
    const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim()
    const parsed = plannerAdviceResponseSchema.safeParse(JSON.parse(cleaned))
    if (parsed.success) return parsed.data
  } catch {
    // Retry once on failure
  }

  const retryPrompt = `${systemPrompt}\n\nIMPORTANT: Your previous response was not valid JSON. You must respond ONLY with the raw JSON object and nothing else.`
  const retryRaw = await aiGenerate({ prompt: retryPrompt, json: true, provider })
  const cleanedRetry = retryRaw.replace(/```json/g, "").replace(/```/g, "").trim()
  return plannerAdviceResponseSchema.parse(JSON.parse(cleanedRetry))
}
