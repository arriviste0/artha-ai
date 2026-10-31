import { z } from "zod"
import { aiGenerate } from "@/lib/ai/provider"
import {
  type Category,
  ALLOWED_CATEGORIES,
  isValidCategoryForType,
  guardCategoryDirection,
} from "./categories"
import { maskPhoneNumbersInText } from "./payee-detector"

export interface PayeeHistoryItem {
  category: string
  count: number
  last_seen: string
  user_confirmed: boolean
}

export interface GroqCategorizeInput {
  merchant: string
  raw: string
  amount: number
  type: "debit" | "credit"
  payee_type_hint?: "business" | "person" | "unknown"
  payee_history?: PayeeHistoryItem[]
}

export interface GroqCategorizeResult {
  merchant_clean: string
  category: Category
  confidence: number
  source: "history" | "knowledge"
  payee_type: "business" | "person" | "unknown"
  reason: string
}

export const GROQ_CATEGORIZATION_SYSTEM_PROMPT = `You are a transaction categorizer for an Indian personal finance app.
Return ONLY valid JSON. No markdown, no commentary.

ALLOWED CATEGORIES (use these exact strings):
Food & Dining, Rent / Housing, Transport, Utilities, Healthcare,
Entertainment, Shopping, Education, Insurance, Investments,
EMI / Loans, Personal Care, Salary, Freelance Income, Business Income,
Transfer, Other

INPUT: { "merchant": string, "raw": string, "amount": number,
"type": "debit" | "credit",
"payee_type_hint": "business" | "person" | "unknown",
"payee_history": [ { "category": string, "count": number,
                     "last_seen": "YYYY-MM-DD",
                     "user_confirmed": boolean } ] }

RULES
1. Direction: debit -> only expense categories, Transfer or Other.
   credit -> only Salary, Freelance Income, Business Income, Transfer,
   Other. Never label a credit as an expense category.
2. Recognise Indian brands, UPI handles and bank narration styles
   (UPI-SWIGGY-swiggy@icici, POS 1234 BIGBASKET, IMPS/..., NACH...).
   Brand examples: Swiggy/Zomato/Zepto/Blinkit/BigBasket -> Food &
   Dining. Uber/Ola/Rapido/IRCTC/redBus/FASTag/petrol pumps/airlines
   -> Transport. Jio/Airtel/Vi/electricity/gas/broadband/DTH ->
   Utilities. Netflix/Hotstar/Spotify/BookMyShow -> Entertainment.
   Amazon/Flipkart/Myntra/Ajio/Meesho/Croma -> Shopping. Zerodha/
   Groww/Upstox/mutual fund/SIP/NPS -> Investments. LIC/Star Health/
   Acko/policy premium -> Insurance. Bajaj Finance/loan EMI/NACH
   debit -> EMI / Loans. Apollo/Practo/1mg/PharmEasy/hospital ->
   Healthcare. Unacademy/Coursera/college fees -> Education.
   Nykaa/salon/gym/Cult.fit -> Personal Care. Rent/maintenance/
   NoBroker/PG -> Rent / Housing.
3. Payments to a person (a human name, no business words) ->
   Transfer. Credit card bill payments, wallet top-ups, ATM cash
   withdrawals and self transfers -> Transfer.
4. Amazon Pay, Paytm, PhonePe, GPay, CRED, Razorpay, BillDesk are
   payment gateways, not merchants. Look at the rest of the narration
   for the real merchant. If you cannot tell, use the amount and
   context: small recurring amounts like 99, 149, 199, 299, 499, 649
   are often subscriptions (Entertainment); round amounts to people
   are usually Transfer.
5. Hints from amount: a credit above 10,000 on 1st-7th or last 3 days
   of month with words like SAL/PAYROLL -> Salary. A credit with
   settlement/invoice/payout words -> Business Income.
6. If genuinely unsure, return "Other" with confidence below 0.5.
   Do NOT guess to look helpful.
7. Normalise the merchant: return a clean display name
   (e.g. "Swiggy", not "UPI-SWIGGY-swiggy@icici").
8. If payee_history contains a user_confirmed category, return it.
9. If payee_history shows the same category at least twice and no
   conflicting category, return it, unless the raw narration clearly
   shows a different purpose (for example a loan keyword on a payee
   usually labelled Food & Dining). Respect the direction rules in
   rule 1 first.
10. If payee_type_hint is "person", prefer Transfer unless history or
    the narration says otherwise. If it is "business", classify from
    the name and narration.
11. Add "source" to the output: "history" if you relied on
    payee_history, otherwise "knowledge".

OUTPUT: { "merchant_clean": string, "category": string,
"confidence": number, "source": "history" | "knowledge",
"payee_type": "business" | "person" | "unknown",
"reason": "max 8 words" }`

const groqResponseSchema = z.object({
  merchant_clean: z.string().default("Unknown"),
  category: z.string(),
  confidence: z.number().min(0).max(1).default(0.5),
  source: z.enum(["history", "knowledge"]).default("knowledge"),
  payee_type: z.enum(["business", "person", "unknown"]).default("unknown"),
  reason: z.string().default("Categorized by AI"),
})

/**
 * Sanitizes input to protect privacy before sending to AI:
 * - Masks phone numbers to last 4 digits
 * - Strips potential emails / account numbers
 */
function sanitizeGroqInput(input: GroqCategorizeInput): GroqCategorizeInput {
  const cleanMerchant = maskPhoneNumbersInText(input.merchant || "")
  let cleanRaw = maskPhoneNumbersInText(input.raw || "")

  // Strip account numbers: e.g. "account ending 1234" is fine, but remove full account numbers
  cleanRaw = cleanRaw.replace(/\b\d{9,18}\b/g, (m) => `XX${m.slice(-4)}`)

  // Strip user email addresses
  cleanRaw = cleanRaw.replace(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g, (m) => {
    // Keep bank handles like @okhdfcbank or @ybl, strip standard email domains like @gmail.com
    if (/@(gmail|yahoo|outlook|hotmail|icloud|proton)\./i.test(m)) {
      return "[EMAIL_REDACTED]"
    }
    return m
  })

  return {
    merchant: cleanMerchant,
    raw: cleanRaw.slice(0, 500),
    amount: input.amount,
    type: input.type,
    payee_type_hint: input.payee_type_hint || "unknown",
    payee_history: input.payee_history || [],
  }
}

/**
 * Calls Groq with JSON mode / temperature 0 to categorize a transaction.
 * Validates the category against the 17 allowed strings and direction rules.
 * Retries once on invalid output, then gracefully falls back to "Other".
 * NEVER throws or crashes sync.
 */
export async function categorizeWithGroq(
  input: GroqCategorizeInput
): Promise<GroqCategorizeResult> {
  const sanitized = sanitizeGroqInput(input)
  const prompt = JSON.stringify(sanitized)

  async function attemptCall(): Promise<GroqCategorizeResult | null> {
    const raw = await aiGenerate({
      systemPrompt: GROQ_CATEGORIZATION_SYSTEM_PROMPT,
      prompt,
      json: true,
      temperature: 0,
    })

    const parsed = groqResponseSchema.parse(JSON.parse(raw))
    const validCategory = guardCategoryDirection(parsed.category, input.type)

    // Check if the returned category was invalid or had wrong direction
    if (validCategory === "Other" && parsed.category.toLowerCase() !== "other") {
      return null // Trigger retry
    }

    return {
      merchant_clean: parsed.merchant_clean || input.merchant || "Transaction",
      category: validCategory,
      confidence: parsed.confidence,
      source: parsed.source,
      payee_type: parsed.payee_type,
      reason: parsed.reason.split(" ").slice(0, 8).join(" "),
    }
  }

  try {
    const firstResult = await attemptCall()
    if (firstResult) return firstResult

    // Retry once if invalid
    const retryResult = await attemptCall()
    if (retryResult) return retryResult

    return {
      merchant_clean: input.merchant || "Transaction",
      category: "Other",
      confidence: 0.3,
      source: "knowledge",
      payee_type: input.payee_type_hint || "unknown",
      reason: "Retry failed, defaulted to Other",
    }
  } catch (err) {
    // Safe fallback: never crash sync
    return {
      merchant_clean: input.merchant || "Transaction",
      category: "Other",
      confidence: 0,
      source: "knowledge",
      payee_type: input.payee_type_hint || "unknown",
      reason: "AI call failed, safe fallback",
    }
  }
}
