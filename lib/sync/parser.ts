import { z } from "zod"
import { isOtpMessage } from "./config"
import { TRANSACTION_PATTERNS } from "./patterns"
import { aiGenerate } from "@/lib/ai/provider"

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
}

// Rule-based category matching — fast local check for common patterns
const CATEGORY_RULES: { pattern: RegExp; category: string }[] = [
  {
    pattern:
      /swiggy|zomato|eatsure|dominos|mcdonalds|kfc|pizza|starbucks|burger|pan shop|paan|chai|tea|coffee|dhaba|bhojanalaya|restaurant|cafe|bakery|sweets|mithai|hotel|canteen|food|kitchen|tiffin|snack|biryani|blinkit|zepto|instamart|bigbasket|big basket|grofers|dunzo|nature\'s basket|spencer\'s|reliance fresh|more retail|dmart|jiomart/i,
    category: "Food & Dining",
  },
  { pattern: /netflix|prime|hotstar|spotify|youtube|bookmyshow|pvr|inox|movie/i, category: "Entertainment" },
  {
    pattern:
      /ola|uber|rapido|irctc|makemytrip|goibibo|metro|petrol|diesel|fuel|hpcl|bpcl|iocl|cng|toll|fastag|railway|auto|cab|parking/i,
    category: "Transport",
  },
  { pattern: /airtel|jio|vi |vodafone|bsnl|bescom|electricity|billdesk|broadband|wifi|water bill|gas/i, category: "Utilities" },
  {
    pattern:
      /amazon|flipkart|myntra|meesho|ajio|kirana|store|mart|supermarket|provision|general store|bazaar|retail|mall|apparel|clothing|urban company|myntra fashion|the menswear store|global roots|globus|lenovo|hp|dell|apple|samsung|oneplus|mi|realme|nike|adidas|puma|reebok|skechers|woopron|fnp|kika/i,
    category: "Shopping",
  },
  { pattern: /insurance|lic |hdfc life|icici pru|bajaj allianz|max life/i, category: "Insurance" },
  { pattern: /emi|loan|equit[ay]|home loan|car loan/i, category: "EMI / Loans" },
  { pattern: /salary|sal\/|salaryfor|payroll/i, category: "Salary" },
  { pattern: /mutual fund|mf |sip |zerodha|groww|coin by|kuvera|indmoney|upstox|angelone|smallcase/i, category: "Investments" },
  { pattern: /rent|pgpayment|housing|nobroker|maintenance/i, category: "Rent / Housing" },
  {
    pattern:
      /apollo|fortis|manipal|hospital|clinic|pharmacy|medplus|1mg|pharmeasy|chemist|medico|medical|doctor|lab|diagnostic/i,
    category: "Healthcare",
  },
  { pattern: /salon|parlour|spa|gym|fitness|cult\.fit|grooming/i, category: "Personal Care" },
  { pattern: /byju|unacademy|coursera|udemy|school fee|college fee/i, category: "Education" },
  { pattern: /transfer|trf|imps|neft|rtgs|upi\/p2p/i, category: "Transfer" },
]

export const ALLOWED_CATEGORIES = [
  "Food & Dining",
  "Rent / Housing",
  "Transport",
  "Utilities",
  "Healthcare",
  "Entertainment",
  "Shopping",
  "Education",
  "Insurance",
  "Investments",
  "EMI / Loans",
  "Personal Care",
  "Salary",
  "Transfer",
  "Other",
] as const

const categoryCache = new Map<string, string>()

function autoCategorize(text: string, type: "credit" | "debit"): string {
  if (type === "credit") {
    if (/salary|payroll/i.test(text)) return "Salary"
    return "Transfer"
  }
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(text)) {
      return rule.category
    }
  }
  return "Other"
}

/**
 * AI-powered transaction categorization.
 * 1. Checks rule-based engine first.
 * 2. If ambiguous ("Other"), prompts Groq AI to judge where it fits (e.g. food, transport, shopping).
 * 3. Results are cached in memory for high performance.
 */
export async function judgeCategoryWithAI(
  merchant: string,
  fullText: string,
  type: "credit" | "debit"
): Promise<string> {
  // 1. Fast rule check
  const ruleCategory = autoCategorize(`${merchant} ${fullText}`, type)
  if (ruleCategory !== "Other" && (type === "debit" || ruleCategory === "Salary")) {
    return ruleCategory
  }

  // 2. Cache lookup
  const cacheKey = merchant.toLowerCase().trim()
  if (cacheKey && categoryCache.has(cacheKey)) {
    return categoryCache.get(cacheKey)!
  }

  // 3. AI judgment via Groq
  try {
    const prompt = `You are an Indian personal finance categorization expert.
Classify this transaction into EXACTLY ONE category from the list.

Merchant: "${merchant}"
Details: "${fullText.slice(0, 300)}"
Type: ${type}

Categories:
- Food & Dining (restaurants, cafes, food delivery, street food, pan shops, dhabas, snacks, bakeries, sweets, blinkit, zepto, instamart, bigbasket, grofers, dmart, jiomart, reliance fresh, nature\'s basket)
- Shopping (retail, clothing, electronics, kirana, general stores, supermarkets, e-commerce, fashion, urban company, myntra, ajio)
- Transport (cabs, autos, petrol pumps, fuel, metro, trains, flights, tolls, fastag, parking)
- Utilities (electricity, water, gas, mobile recharge, broadband, DTH)
- Healthcare (pharmacies, medical stores, doctors, hospitals, labs, clinics)
- Entertainment (movies, OTT subscriptions, concerts, gaming, events)
- Rent / Housing (house rent, society maintenance, domestic help)
- Education (school/college fees, books, courses, coaching)
- Investments (stocks, mutual funds, SIP, trading, crypto, gold)
- Insurance (health, life, vehicle insurance premiums)
- EMI / Loans (loan repayments, credit card bills, finance EMIs)
- Personal Care (salon, barber, spa, gym, fitness)
- Salary (salary credits from employer)
- Transfer (person-to-person transfer, self transfer, family gift)
- Other (only if completely unclassifiable)

Return ONLY JSON: { "category": "<Exact Category Name>" }`

    const res = await aiGenerate({ prompt, json: true })
    const parsed = JSON.parse(res) as { category?: string }
    const matched = ALLOWED_CATEGORIES.find(
      (c) => c.toLowerCase() === (parsed.category || "").toLowerCase().trim()
    )

    const finalCategory = matched || (type === "credit" ? "Transfer" : "Other")
    if (cacheKey) {
      categoryCache.set(cacheKey, finalCategory)
    }
    return finalCategory
  } catch {
    return ruleCategory
  }
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

    const category = await judgeCategoryWithAI(merchantName, text, parsed.type)

    return {
      amountPaise: Math.round(parsed.amount * 100),
      type: parsed.type,
      merchant: merchantName,
      description: `${parsed.type === "credit" ? "Received from" : "Paid to"} ${merchantName}`,
      category,
      occurredAt,
      accountNumberMasked: maskAccountNumber(parsed.accountLast4),
      referenceNumber: parsed.referenceNumber?.trim() || undefined,
      bank: parsed.bank?.trim() || undefined,
      source: "email_sync", // caller can override
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
        const occurredAt = extracted.occurredAt ?? emailDate ?? new Date()
        const category = await judgeCategoryWithAI(merchant, text, extracted.type)

        return {
          amountPaise: Math.round(extracted.amountRupees * 100),
          type: extracted.type,
          merchant,
          description: `${extracted.type === "credit" ? "Received from" : "Paid to"} ${merchant}`,
          category,
          occurredAt,
          accountNumberMasked: maskAccountNumber(extracted.accountLast4),
          referenceNumber: extracted.referenceNumber?.trim() || undefined,
          bank: extracted.bank || undefined,
          source,
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
