import { z } from "zod"
import type { RawRow } from "./csv"
import type { DraftTransaction } from "@/models/statement-upload"
import { aiGenerate } from "@/lib/ai/provider"

// Rule-based category matching — checked before AI
const CATEGORY_RULES: { pattern: RegExp; category: string; merchant?: string }[] = [
  { pattern: /swiggy|zomato|eatsure|dominos|mcdonalds|kfc|pizza/i, category: "Food & Dining" },
  { pattern: /netflix|prime|hotstar|spotify|youtube premium/i, category: "Entertainment" },
  { pattern: /ola|uber|rapido|irctc|makemytrip|goibibo/i, category: "Transport" },
  { pattern: /airtel|jio|vi |vodafone|bsnl/i, category: "Utilities" },
  { pattern: /amazon|flipkart|myntra|meesho|ajio/i, category: "Shopping" },
  { pattern: /hdfc life|lic |icici pru|bajaj allianz/i, category: "Insurance" },
  { pattern: /emi|loan|equit[ay]|home loan|car loan/i, category: "EMI / Loans" },
  { pattern: /salary|sal\/|salaryfor|payroll/i, category: "Salary" },
  { pattern: /mutual fund|mf |sip |zerodha|groww|coin by/i, category: "Investments" },
  { pattern: /rent|pgpayment|housing|makeit/i, category: "Rent / Housing" },
  { pattern: /apollo|fortis|manipal|hospital|clinic|pharmacy|medplus/i, category: "Healthcare" },
  { pattern: /byju|unacademy|coursera|udemy|school fee|college fee/i, category: "Education" },
  { pattern: /transfer|trf|imps|neft|rtgs|upi\/p2p/i, category: "Transfer" },
]

function applyRules(desc: string): { category: string; merchant?: string } | null {
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(desc)) {
      return { category: rule.category, merchant: rule.merchant }
    }
  }
  return null
}

const aiRowSchema = z.object({
  index: z.number(),
  category: z.string(),
  merchant: z.string().optional(),
  confidence: z.number().min(0).max(1),
})

const aiResponseSchema = z.object({
  results: z.array(aiRowSchema),
})

async function categorizeWithAI(
  rows: { index: number; description: string; amountPaise: number; type: string }[]
): Promise<Map<number, { category: string; merchant?: string; confidence: number }>> {
  const CATEGORIES = [
    "Food & Dining", "Rent / Housing", "Transport", "Utilities", "Healthcare",
    "Entertainment", "Shopping", "Education", "Insurance", "Investments",
    "EMI / Loans", "Personal Care", "Salary", "Freelance Income",
    "Business Income", "Transfer", "Other",
  ]

  const rowsText = rows
    .map((r) => `${r.index}. [${r.type.toUpperCase()}] ₹${r.amountPaise / 100} — ${r.description}`)
    .join("\n")

  const prompt = `Categorize these Indian bank transactions. For each, return the index, a category from the allowed list, an optional merchant name, and confidence (0-1).

Allowed categories: ${CATEGORIES.join(", ")}

Transactions:
${rowsText}

Return JSON: { "results": [{ "index": N, "category": "...", "merchant": "...", "confidence": 0.XX }] }`

  let text = await aiGenerate({ prompt, json: true })

  let parsed: z.infer<typeof aiResponseSchema>
  try {
    parsed = aiResponseSchema.parse(JSON.parse(text))
  } catch {
    // retry once
    text = await aiGenerate({ prompt, json: true })
    parsed = aiResponseSchema.parse(JSON.parse(text))
  }

  const map = new Map<number, { category: string; merchant?: string; confidence: number }>()
  for (const r of parsed.results) {
    map.set(r.index, { category: r.category, merchant: r.merchant, confidence: r.confidence })
  }
  return map
}

export async function buildDraftTransactions(rows: RawRow[]): Promise<DraftTransaction[]> {
  const drafts: DraftTransaction[] = []
  const needsAI: { index: number; description: string; amountPaise: number; type: string }[] = []

  for (const [i, row] of rows.entries()) {
    const isCredit = row.credit > 0
    const amountPaise = isCredit ? row.credit : row.debit
    const type: "credit" | "debit" = isCredit ? "credit" : "debit"

    const ruleMatch = applyRules(row.description)

    if (ruleMatch) {
      drafts.push({
        rawLine: row.rawLine,
        occurredAt: row.date + "T00:00:00.000Z",
        description: row.description,
        amountPaise,
        type,
        category: ruleMatch.category,
        merchant: ruleMatch.merchant,
        confidence: 1,
        needsReview: false,
        status: "pending",
      })
    } else {
      drafts.push({
        rawLine: row.rawLine,
        occurredAt: row.date + "T00:00:00.000Z",
        description: row.description,
        amountPaise,
        type,
        category: "Other",
        confidence: 0,
        needsReview: true,
        status: "pending",
      })
      needsAI.push({ index: i, description: row.description, amountPaise, type })
    }
  }

  // Batch AI categorization in chunks of 50
  if (needsAI.length > 0) {
    const CHUNK = 50
    for (let start = 0; start < needsAI.length; start += CHUNK) {
      const chunk = needsAI.slice(start, start + CHUNK)
      try {
        const aiMap = await categorizeWithAI(chunk)
        for (const item of chunk) {
          const ai = aiMap.get(item.index)
          if (ai) {
            drafts[item.index].category = ai.category
            drafts[item.index].merchant = ai.merchant
            drafts[item.index].confidence = ai.confidence
            drafts[item.index].needsReview = ai.confidence < 0.75
          }
        }
      } catch {
        // Leave as "Other" with needsReview: true if AI fails
      }
    }
  }

  return drafts
}
