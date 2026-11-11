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

import {
  detectCardBillPayment,
  extractAccountLast4,
  extractStatementTokens,
  isIgnoredNonTransaction,
  maskSensitiveData,
  parseGenericAmount,
} from "./card-bill-detector"

export { ALLOWED_CATEGORIES, type Category }

export interface ParsedSyncTransaction {
  amountPaise: number
  type: "credit" | "debit"
  merchant: string
  description: string
  category: string
  subtype?: string
  cardLast4?: string
  occurredAt: Date
  accountNumberMasked?: string
  referenceNumber?: string
  bank?: string
  source: "email_sync" | "sms_sync"
  payeeKey?: string
  payeeType?: "business" | "person" | "unknown"
  needsReview?: boolean
  rawData?: Record<string, unknown>
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
  category: z.string().optional(),
  subtype: z.string().optional(),
  cardLast4: z.string().optional(),
  occurredAt: z.string().optional(),
  accountLast4: z.string().optional(),
  referenceNumber: z.string().optional(),
  bank: z.string().optional(),
})

/**
 * Fallback LLM parser if regex parsing fails.
 * Guarantees strict JSON output and ignores OTP / non-transactions.
 * Masks card numbers and phone numbers to last 4 digits before sending.
 */
async function parseWithLLM(text: string): Promise<ParsedSyncTransaction | null> {
  const maskedText = maskSensitiveData(text)
  const prompt = `You are a financial transaction alert parser for Indian banks (HDFC, ICICI, SBI, Axis, etc.).
Extract structured transaction details from the given email snippet or SMS alert.

Rules:
1. If this message is an OTP, verification code, promotional offer, bill reminder, or NOT a completed debit/credit transaction, return strictly:
{ "isTransaction": false }
2. If the narration contains a masked card number or words such as billpay, bbps, card payment, or autopay, it is a credit card bill payment. Return category 'Transfer' and subtype 'card_bill_payment', and extract cardLast4 and the issuing bank if present.
3. If it is a completed financial transaction:
- amount: number in INR rupees (e.g. 1250.00)
- type: "debit" or "credit"
- merchant: clean merchant name, VPA or payee/payer name (e.g. "Swiggy", "Zomato", "Amazon")
- category: one of [${ALLOWED_CATEGORIES.join(", ")}]
- subtype: "card_bill_payment" if credit card bill payment, else omit
- cardLast4: last 4 digits of card if present
- occurredAt: ISO 8601 date string. If year is missing, assume current year.
- accountLast4: last 4 digits of the bank account or card (e.g. "1234")
- referenceNumber: UPI reference number, UTR, or transaction ID (digits/alphanumeric)
- bank: bank name if mentioned (e.g. "HDFC Bank")

Alert text:
"""
${maskedText.slice(0, 1000)}
"""

Return STRICT JSON only matching this format:
{
  "isTransaction": true,
  "amount": 100.0,
  "type": "debit",
  "merchant": "Swiggy",
  "category": "Food & Dining",
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

    // Determine category
    let finalCategory = "Other"
    let needsReview = false

    if (parsed.subtype === "card_bill_payment" || parsed.category === "Transfer") {
      finalCategory = "Transfer"
    } else if (parsed.category && ALLOWED_CATEGORIES.includes(parsed.category as Category)) {
      finalCategory = guardCategoryDirection(parsed.category as Category, parsed.type)
    } else {
      const pipelineResult = await runCategorizationPipeline({
        merchant: merchantName,
        rawText: text,
        amountRupees: parsed.amount,
        type: parsed.type,
        occurredAt,
      })
      finalCategory = pipelineResult.category
    }

    const cardLast4 = parsed.cardLast4 || (parsed.accountLast4?.length === 4 ? parsed.accountLast4 : undefined)
    const isCardPayment = parsed.subtype === "card_bill_payment"
    const payeeKey = isCardPayment
      ? `${parsed.bank?.toLowerCase().replace(/\s+/g, "") || "card"}_${cardLast4 || "unknown"}`
      : undefined

    return {
      amountPaise: Math.round(parsed.amount * 100),
      type: parsed.type,
      merchant: merchantName,
      description: isCardPayment
        ? `Credit Card Bill Payment (${parsed.bank || "Card"}${cardLast4 ? ` ••${cardLast4}` : ""})`
        : `${parsed.type === "credit" ? "Received from" : "Paid to"} ${merchantName}`,
      category: finalCategory,
      subtype: parsed.subtype,
      cardLast4,
      occurredAt,
      accountNumberMasked: maskAccountNumber(parsed.accountLast4),
      referenceNumber: parsed.referenceNumber?.trim() || undefined,
      bank: parsed.bank?.trim() || undefined,
      source: "email_sync", // caller can override
      payeeKey,
      payeeType: isCardPayment ? "business" : undefined,
      needsReview,
    }
  } catch {
    return null
  }
}

/**
 * Main parser function:
 * 1. Checks ignore list (OTP, promos, balance-only) -> drops immediately (returns null).
 * 2. Runs generic Credit Card Bill Payment detector.
 * 3. Runs fast regex patterns.
 * 4. Invokes LLM fallback with privacy masking.
 * 5. NEVER SKIP: if transaction-like but unparseable, sends to "Needs review" queue.
 */
export async function parseTransactionAlert(
  text: string,
  source: "email_sync" | "sms_sync",
  emailDate?: Date
): Promise<ParsedSyncTransaction | null> {
  // CRITICAL: Ignore non-transactions (OTP, promos, balance inquiries).
  // Never store or log these messages.
  if (isIgnoredNonTransaction(text)) {
    return null
  }

  // 1. Generic Credit Card Bill Payment Detector (Part 2)
  const cardBill = detectCardBillPayment(text)
  if (cardBill.isCardBillPayment) {
    const tokens = extractStatementTokens(text)
    const amount = tokens.amount && tokens.amount > 0 ? tokens.amount : parseGenericAmount(text)
    if (amount > 0) {
      const { bankAcc, cardLast4: extractedCardLast4 } = extractAccountLast4(text)
      const cardLast4 = cardBill.cardLast4 || tokens.cardLast4 || extractedCardLast4
      const issuer = cardBill.issuerGuess || "Card"
      const payeeKey = `${cardBill.issuerGuess?.toLowerCase().replace(/[^a-z0-9]/g, "") || "card"}_${cardLast4 || "unknown"}`
      const direction = cardBill.direction || "debit"
      const accountDigits = bankAcc || (direction === "credit" ? cardLast4 : undefined)

      return {
        amountPaise: Math.round(amount * 100),
        type: direction,
        merchant: issuer !== "unknown" ? `${issuer} Credit Card` : "Credit Card",
        description: `Credit Card Bill Payment (${issuer !== "unknown" ? issuer : "Card"}${cardLast4 ? ` ••${cardLast4}` : ""})`,
        category: "Transfer",
        subtype: "card_bill_payment",
        cardLast4,
        occurredAt: tokens.date || emailDate || new Date(),
        referenceNumber: tokens.refNo,
        accountNumberMasked: maskAccountNumber(accountDigits),
        bank: issuer !== "unknown" ? issuer : undefined,
        source,
        payeeKey,
        payeeType: "business",
        needsReview: cardBill.suggestedTransfer === true,
      }
    }
  }

  // 2. Try fast regex patterns
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

  // 3. Fallback to LLM if financial indicators are present
  if (
    /\b(debited|credited|spent|paid|payment|transferred|withdrawn|received|deposit|debit|credit|billpay|bbps|autopay)\b/i.test(
      text
    )
  ) {
    const llmResult = await parseWithLLM(text)
    if (llmResult) {
      llmResult.source = source
      if (emailDate && (!llmResult.occurredAt || isNaN(llmResult.occurredAt.getTime()))) {
        llmResult.occurredAt = emailDate
      }
      return llmResult
    }
  }

  // 4. PART 1 RULE 1 & 2: NEVER SKIP A TRANSACTION!
  // If this message reached here and is NOT in the ignore list (OTP/promo/balance),
  // it is transaction-like but unparseable or cryptic -> route to "Needs review" queue.
  const extractedTokens = extractStatementTokens(text)
  const fallbackAmount = extractedTokens.amount && extractedTokens.amount > 0 ? extractedTokens.amount : parseGenericAmount(text)
  const isCredit = /\b(credited|credit|received|cr)\b/i.test(text)
  const maskedText = maskSensitiveData(text)

  return {
    amountPaise: Math.round(fallbackAmount * 100),
    type: isCredit ? "credit" : "debit",
    merchant: "Unrecognized Transaction",
    description: maskedText.slice(0, 150),
    category: "Other",
    occurredAt: extractedTokens.date || emailDate || new Date(),
    referenceNumber: extractedTokens.refNo,
    source,
    needsReview: true,
    rawData: { rawText: maskedText, reason: "needs_review" },
  }
}
