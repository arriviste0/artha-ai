import { z } from "zod"
import { isOtpMessage } from "./config"
import { TRANSACTION_PATTERNS } from "./patterns"
import { aiGenerate } from "@/lib/ai/provider"
import {
  ALLOWED_CATEGORIES,
  type Category,
  guardCategoryDirection,
} from "@/lib/categorization/categories"
import { runCategorizationPipeline } from "@/lib/categorization/pipeline"

export { ALLOWED_CATEGORIES, type Category }

export interface ParsedSyncTransaction {
  amountPaise: number
  type: "credit" | "debit"
  merchant: string
  description: string
  category: string
  occurredAt: Date
  accountNumberMasked?: string
  referenceNumber?: string
  bank?: string
  source: "email_sync" | "sms_sync"
  payeeKey?: string
  payeeType?: "business" | "person" | "unknown"
}

/**
 * AI-powered transaction categorization using the master pipeline.
 * Runs user rules, learned payee history, brand regex rules, and Groq fallback.
 */
export async function judgeCategoryWithAI(
  merchant: string,
  fullText: string,
  type: "credit" | "debit",
  userId?: string
): Promise<string> {
  const result = await runCategorizationPipeline({
    userId,
    merchant,
    rawText: fullText,
    amountRupees: 0,
    type,
  })
  return result.category
}

function maskAccountNumber(last4?: string): string | undefined {
  if (!last4) return undefined
  const cleaned = last4.replace(/\D/g, "").slice(-4)
  if (!cleaned) return undefined
  return `XX${cleaned}`
}

const llmResponseSchema = z.object({
  isTransaction: z.boolean(),
  amount: z.number().positive().optional(),
  type: z.enum(["credit", "debit"]).optional(),
  merchant: z.string().optional(),
  occurredAt: z.string().optional(),
  accountLast4: z.string().optional(),
  referenceNumber: z.string().optional(),
  bank: z.string().optional(),
})

/**
 * Fallback LLM parser if regex parsing fails.
 * Guarantees strict JSON output and ignores OTP / non-transactions.
 */
async function parseWithLLM(text: string): Promise<ParsedSyncTransaction | null> {
  const prompt = `You are a financial transaction alert parser for Indian banks (HDFC, ICICI, SBI, Axis, etc.).
Extract structured transaction details from the given email snippet or SMS alert.

Rules:
1. If this message is an OTP, verification code, promotional offer, bill reminder, or NOT a completed debit/credit transaction, return strictly:
{ "isTransaction": false }
2. If it is a completed financial transaction:
- amount: number in INR rupees (e.g. 1250.00)
- type: "debit" or "credit"
- merchant: clean merchant name, VPA or payee/payer name (e.g. "Swiggy", "Zomato", "Amazon")
- occurredAt: ISO 8601 date string. If year is missing, assume current year.
- accountLast4: last 4 digits of the bank account or card (e.g. "1234")
- referenceNumber: UPI reference number, UTR, or transaction ID (digits/alphanumeric)
- bank: bank name if mentioned (e.g. "HDFC Bank")

Alert text:
"""
${text.slice(0, 1000)}
"""

Return STRICT JSON only matching this format:
{
  "isTransaction": true,
  "amount": 100.0,
  "type": "debit",
  "merchant": "Swiggy",
  "occurredAt": "2024-10-15T10:00:00Z",
  "accountLast4": "1234",
  "referenceNumber": "428912345678",
  "bank": "HDFC Bank"
}`

  try {
    const raw = await aiGenerate({ prompt, json: true })
    const parsed = llmResponseSchema.parse(JSON.parse(raw))
    if (!parsed.isTransaction || !parsed.amount || !parsed.type) {
      return null
    }

    const merchantName = (parsed.merchant || "Bank Transaction").trim()
    let occurredAt = new Date()
    if (parsed.occurredAt) {
      const parsedDate = new Date(parsed.occurredAt)
      if (!isNaN(parsedDate.getTime())) {
        occurredAt = parsedDate
      }
    }

    const pipelineResult = await runCategorizationPipeline({
      merchant: merchantName,
      rawText: text,
      amountRupees: parsed.amount,
      type: parsed.type,
      occurredAt,
    })

    return {
      amountPaise: Math.round(parsed.amount * 100),
      type: parsed.type,
      merchant: merchantName,
      description: `${parsed.type === "credit" ? "Received from" : "Paid to"} ${pipelineResult.merchantClean || merchantName}`,
      category: pipelineResult.category,
      occurredAt,
      accountNumberMasked: maskAccountNumber(parsed.accountLast4),
      referenceNumber: parsed.referenceNumber?.trim() || undefined,
      bank: parsed.bank?.trim() || undefined,
      source: "email_sync", // caller can override
      payeeKey: pipelineResult.payeeKey,
      payeeType: pipelineResult.payeeType,
    }
  } catch {
    return null
  }
}

/**
 * Main parser function:
 * 1. Checks OTP -> drops immediately (returns null).
 * 2. Runs fast regex patterns.
 * 3. If regex fails -> invokes LLM fallback with strict JSON parsing.
 */
export async function parseTransactionAlert(
  text: string,
  source: "email_sync" | "sms_sync",
  emailDate?: Date
): Promise<ParsedSyncTransaction | null> {
  // CRITICAL: Ignore OTP messages completely. Never store or log them.
  if (isOtpMessage(text)) {
    return null
  }

  // 1. Try regex patterns
  for (const pattern of TRANSACTION_PATTERNS) {
    const match = pattern.regex.exec(text)
    if (match) {
      const extracted = pattern.extract(match)
      if (extracted && extracted.amountRupees && extracted.amountRupees > 0 && extracted.type) {
        const merchant = extracted.merchant || "Bank Transaction"
        let occurredAt = extracted.occurredAt ?? emailDate ?? new Date()
        if (extracted.occurredAt && emailDate) {
          // If the regex extracted a date with midnight UTC (no time of day in text),
          // adopt the hour/minute/second from emailDate so timestamps are accurate and distinct
          if (
            extracted.occurredAt.getUTCHours() === 0 &&
            extracted.occurredAt.getUTCMinutes() === 0 &&
            extracted.occurredAt.getUTCSeconds() === 0
          ) {
            occurredAt = new Date(extracted.occurredAt)
            occurredAt.setUTCHours(
              emailDate.getUTCHours(),
              emailDate.getUTCMinutes(),
              emailDate.getUTCSeconds(),
              emailDate.getUTCMilliseconds()
            )
          }
        }
        const pipelineResult = await runCategorizationPipeline({
          merchant,
          rawText: text,
          amountRupees: extracted.amountRupees,
          type: extracted.type,
          occurredAt,
        })

        return {
          amountPaise: Math.round(extracted.amountRupees * 100),
          type: extracted.type,
          merchant,
          description: `${extracted.type === "credit" ? "Received from" : "Paid to"} ${pipelineResult.merchantClean || merchant}`,
          category: pipelineResult.category,
          occurredAt,
          accountNumberMasked: maskAccountNumber(extracted.accountLast4),
          referenceNumber: extracted.referenceNumber?.trim() || undefined,
          bank: extracted.bank || undefined,
          source,
          payeeKey: pipelineResult.payeeKey,
          payeeType: pipelineResult.payeeType,
        }
      }
    }
  }

  // 2. Fallback to LLM
  const llmResult = await parseWithLLM(text)
  if (llmResult) {
    llmResult.source = source
    if (emailDate && (!llmResult.occurredAt || isNaN(llmResult.occurredAt.getTime()))) {
      llmResult.occurredAt = emailDate
    }
    return llmResult
  }

  return null
}
