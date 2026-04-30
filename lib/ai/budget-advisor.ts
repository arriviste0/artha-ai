import { z } from "zod"
import { aiGenerate } from "@/lib/ai/provider"

export const budgetSuggestionSchema = z.object({
  message: z.string(),
  analysis: z.string(),
  suggestions: z.array(
    z.object({
      budgetId: z.string(),
      category: z.string(),
      currentLimitPaise: z.number(),
      suggestedLimitPaise: z.number(),
      changeRupees: z.number(),
      reasoning: z.string(),
    })
  ),
  warnings: z.array(z.string()),
  totalImpactRupees: z.number(),
})

export type BudgetSuggestion = z.infer<typeof budgetSuggestionSchema>

interface BudgetContext {
  id: string
  category: string
  limitPaise: number
  spentPaise: number
  period: string
}

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

export async function getBudgetAdvice(
  userMessage: string,
  budgets: BudgetContext[],
  monthlyIncomePaise: number,
  history: ChatMessage[]
): Promise<BudgetSuggestion> {
  const budgetSummary = budgets
    .map(
      (b) =>
        `- ${b.category}: limit ₹${(b.limitPaise / 100).toFixed(0)}, spent so far ₹${(b.spentPaise / 100).toFixed(0)} (${b.period})`
    )
    .join("\n")

  const conversationHistory = history
    .slice(-6)
    .map((m) => `${m.role === "user" ? "User" : "Advisor"}: ${m.content}`)
    .join("\n")

  const systemPrompt = `You are ArthaAI Budget Advisor, a friendly Indian personal finance assistant.
Help the user adjust their monthly budget based on their needs. Be practical and empathetic.

Current Budget Setup:
${budgetSummary}

Monthly Income: ₹${(monthlyIncomePaise / 100).toFixed(0)}
Total Budgeted: ₹${(budgets.reduce((s, b) => s + b.limitPaise, 0) / 100).toFixed(0)}

${history.length > 0 ? `Previous conversation:\n${conversationHistory}\n` : ""}

User's request: "${userMessage}"

Analyse what the user wants to change. If they want to increase spending in one category, suggest which other categories can be reduced to compensate (keeping total within income). Be specific with ₹ amounts.

Respond ONLY with valid JSON matching this exact schema:
{
  "message": "friendly conversational response acknowledging the user's need",
  "analysis": "brief analysis of the current budget and what needs to change",
  "suggestions": [
    {
      "budgetId": "<id from budget list>",
      "category": "<category name>",
      "currentLimitPaise": <integer paise>,
      "suggestedLimitPaise": <integer paise>,
      "changeRupees": <change in rupees, positive=increase, negative=decrease>,
      "reasoning": "why this change makes sense"
    }
  ],
  "warnings": ["any warnings like total exceeding income"],
  "totalImpactRupees": <net change in total budget in rupees>
}

Only include categories where you suggest a change. If no budget changes are needed, return an empty suggestions array and explain why in the message.`

  try {
    const raw = await aiGenerate({ prompt: systemPrompt, json: true })
    const parsed = budgetSuggestionSchema.safeParse(JSON.parse(raw))
    if (parsed.success) return parsed.data
  } catch {
    // fall through to retry
  }

  // Retry with explicit reminder on parse failure
  const retryPrompt = `${systemPrompt}\n\nIMPORTANT: Your previous response could not be parsed as JSON. Respond ONLY with the JSON object, no markdown, no explanation outside the JSON.`
  const retryRaw = await aiGenerate({ prompt: retryPrompt, json: true })
  const retryParsed = budgetSuggestionSchema.safeParse(JSON.parse(retryRaw))
  if (retryParsed.success) return retryParsed.data

  throw new Error("AI response could not be parsed after retry")
}
