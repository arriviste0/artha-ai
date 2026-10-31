/**
 * Bank Email & SMS Transaction Patterns
 *
 * Each pattern extracts: amount, debit/credit, merchant/VPA, date/time,
 * last 4 digits of account/card, and reference number.
 *
 * Designed so that adding a new email/SMS pattern is a one-line config change!
 */

export interface ParsedTransactionMatch {
  amountRupees: number
  type: "credit" | "debit"
  accountLast4?: string
  merchant?: string
  occurredAt?: Date
  referenceNumber?: string
  bank?: string
}

export interface PatternDefinition {
  name: string
  regex: RegExp
  extract: (m: RegExpExecArray) => Partial<ParsedTransactionMatch> | null
}

function parseAmount(str: string): number {
  return parseFloat(str.replace(/,/g, "").trim()) || 0
}

function parseDate(dateStr?: string, timeStr?: string): Date {
  if (!dateStr) return new Date()
  try {
    const combined = timeStr ? `${dateStr.trim()} ${timeStr.trim()}` : dateStr.trim()
    const d = new Date(combined)
    if (!isNaN(d.getTime())) return d

    // Parse DD-MMM-YY or DD-MM-YY formats (e.g. 15-OCT-24 or 15-10-24)
    const dmy = dateStr.match(/^(\d{1,2})[-/](\w{3}|\d{1,2})[-/](\d{2,4})$/i)
    if (dmy) {
      const day = parseInt(dmy[1], 10)
      const monthStr = dmy[2]
      let year = parseInt(dmy[3], 10)
      if (year < 100) year += 2000

      let month = 0
      if (/^\d+$/.test(monthStr)) {
        month = parseInt(monthStr, 10) - 1
      } else {
        const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
        month = months.indexOf(monthStr.toLowerCase().slice(0, 3))
        if (month === -1) month = 0
      }
      return new Date(Date.UTC(year, month, day))
    }
  } catch {
    // fallback to current date
  }
  return new Date()
}

function cleanMerchant(str?: string): string {
  if (!str) return "Bank Transfer"
  let clean = str.trim()

  // If merchant has name in parentheses e.g. "******3569@ybl (RAM MANU SINGH PAN SHOP)", prefer the name inside parens
  const parenMatch = clean.match(/\(([^)]+)\)/)
  if (parenMatch && parenMatch[1].trim().length > 1) {
    clean = parenMatch[1].trim()
  }

  // Strip leading prefixes
  clean = clean.replace(/^(to\s+|towards\s+|at\s+|by\s+|from\s+|vpa\s+)/i, "").trim()
  // Strip trailing artifacts like "UPI", "via UPI", punctuation
  clean = clean.replace(/(?:\s+(?:via\s+)?upi|\s+ref|\s+rrn)[.:]?$/i, "").trim()
  clean = clean.replace(/[.,;]+$/, "").trim()
  return clean || "Bank Transfer"
}

export function extractReferenceNumber(text: string): string | undefined {
  const match =
    text.match(
      /\b(?:upi\s+(?:transaction\s+)?(?:reference|ref)\b(?:\s+(?:number|no\.?|num))?(?:\s+is)?|(?:reference|ref)\b(?:\s+(?:number|no\.?|num))?(?:\s+is)?|rrn|utr|auth\s*code)\s*[:#.]?\s*([A-Za-z0-9]+)/i
    ) ||
    text.match(/\b(?:reference|ref|txn\s*id)\b\s*[:#.]?\s*([A-Za-z0-9]{5,})/i)
  return match ? match[1].trim() : undefined
}

export const TRANSACTION_PATTERNS: PatternDefinition[] = [
  // 1. HDFC Email: "Rs.25.00 is debited from your account ending 6934 towards VPA ******3569@ybl (RAM MANU SINGH PAN SHOP) on 31-10-26."
  {
    name: "hdfc_debit_vpa_account_ending",
    regex: /(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:is|has been)\s+debited from your account (?:ending\s+|[*xX]*)(\d{4})\s+(?:towards|to)\s+(?:VPA\s+)?(.+?)\s+on\s+(\d{1,2}[-/]\w{3}[-/]\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    extract: (m) => ({
      amountRupees: parseAmount(m[1]),
      type: "debit",
      accountLast4: m[2],
      merchant: cleanMerchant(m[3]),
      occurredAt: parseDate(m[4]),
      referenceNumber: extractReferenceNumber(m.input),
      bank: "HDFC Bank",
    }),
  },

  // 2. HDFC Email Credit: "Rs.500.00 is credited to your account ending 6934 from VPA user@upi (SENDER NAME) on 31-10-26."
  {
    name: "hdfc_credit_vpa_account_ending",
    regex: /(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:is|has been)\s+credited to your account (?:ending\s+|[*xX]*)(\d{4})\s+(?:from|by)\s+(?:VPA\s+)?(.+?)\s+on\s+(\d{1,2}[-/]\w{3}[-/]\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    extract: (m) => ({
      amountRupees: parseAmount(m[1]),
      type: "credit",
      accountLast4: m[2],
      merchant: cleanMerchant(m[3]),
      occurredAt: parseDate(m[4]),
      referenceNumber: extractReferenceNumber(m.input),
      bank: "HDFC Bank",
    }),
  },

  // 3. HDFC Email/SMS: "Rs.1,250.00 has been debited from account **1234 to VPA swiggy@icici on 15-OCT-24. Your UPI transaction reference number is 428912345678."
  {
    name: "hdfc_debit_vpa_email",
    regex: /(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)\s+has been debited from account\s*[*xX]*(\d{4})\s+to\s+(?:VPA\s+)?([^\s,]+@[^\s,]+|.+?)\s+on\s+(\d{1,2}[-/]\w{3}[-/]\d{2,4})/i,
    extract: (m) => ({
      amountRupees: parseAmount(m[1]),
      type: "debit",
      accountLast4: m[2],
      merchant: cleanMerchant(m[3]),
      occurredAt: parseDate(m[4]),
      referenceNumber: extractReferenceNumber(m.input),
      bank: "HDFC Bank",
    }),
  },

  // 2. HDFC Email/SMS Credit: "Rs.50,000.00 has been credited to account **1234 on 01-OCT-24 by UPI ref no 427512345678."
  {
    name: "hdfc_credit_email",
    regex: /(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)\s+has been credited to account\s*[*xX]*(\d{4})\s+on\s+(\d{1,2}[-/]\w{3}[-/]\d{2,4})(?:.*?(?:by|from)\s+([^\n,.]+?))?/i,
    extract: (m) => ({
      amountRupees: parseAmount(m[1]),
      type: "credit",
      accountLast4: m[2],
      occurredAt: parseDate(m[3]),
      merchant: cleanMerchant(m[4] || "Deposit / Transfer"),
      referenceNumber: extractReferenceNumber(m.input),
      bank: "HDFC Bank",
    }),
  },

  // 3. HDFC Card Alert: "Alert: You've spent Rs. 450.00 on HDFC Bank Card ending 5678 at SWIGGY on 2024-10-14 19:30:15. Auth code: 123456."
  {
    name: "hdfc_card_spent",
    regex: /(?:spent|debited)\s+(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)\s+on\s+(?:HDFC Bank\s+)?(?:Card|Credit Card|Debit Card)[^0-9]*(\d{4})\s+at\s+([^\n,.]+?)\s+on\s+(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\w{3}[-/]\d{2,4})(?:\s+(\d{2}:\d{2}(?::\d{2})?))?/i,
    extract: (m) => ({
      amountRupees: parseAmount(m[1]),
      type: "debit",
      accountLast4: m[2],
      merchant: cleanMerchant(m[3]),
      occurredAt: parseDate(m[4], m[5]),
      referenceNumber: extractReferenceNumber(m.input),
      bank: "HDFC Bank",
    }),
  },

  // 4. HDFC SMS Sent via UPI: "Sent Rs.250.00 from HDFC Bank A/C *1234 to ZOMATO via UPI Ref 428901234567 on 15-10-24"
  {
    name: "hdfc_sms_sent_upi",
    regex: /Sent\s+(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)\s+from\s+HDFC Bank\s+A\/C\s*[*xX]*(\d{4})\s+to\s+([^\n,.]+?)\s+(?:via UPI\s+)?Ref\s*(\w+)\s+on\s+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{1,2}[-/]\w{3}[-/]\d{2,4})/i,
    extract: (m) => ({
      amountRupees: parseAmount(m[1]),
      type: "debit",
      accountLast4: m[2],
      merchant: cleanMerchant(m[3]),
      referenceNumber: m[4],
      occurredAt: parseDate(m[5]),
      bank: "HDFC Bank",
    }),
  },

  // 5. HDFC / Indian Bank SMS Debited: "Rs 1500.00 debited from HDFC Bank A/C **1234 on 12-OCT-24 to AMAZON. Ref 428612345678"
  {
    name: "hdfc_sms_debited_to",
    regex: /(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)\s+debited from\s+(?:[A-Za-z ]+\s+)?A\/C\s*[*xX]*(\d{4})\s+on\s+(\d{1,2}[-/]\w{3}[-/]\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s+(?:to|towards|for)\s+([^\n,.]+?)(?:\.|$).*?Ref\s*(?:no\.?)?\s*(\w+)/i,
    extract: (m) => ({
      amountRupees: parseAmount(m[1]),
      type: "debit",
      accountLast4: m[2],
      occurredAt: parseDate(m[3]),
      merchant: cleanMerchant(m[4]),
      referenceNumber: m[5],
      bank: "HDFC Bank",
    }),
  },

  // 6. Generic UPI Debit: "Debited! INR 320.00 from a/c **8899 on 18-Oct-24 to BLINKIT UPI Ref 429212345678"
  {
    name: "generic_upi_debit",
    regex: /(?:debited|paid|transferred)[!\s]+(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)\s+from\s+(?:a\/c|acc|card)\s*[*xX]*(\d{4})\s+on\s+(\d{1,2}[-/]\w{3}[-/]\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s+(?:to|for)\s+([^\n,.]+?)(?:UPI\s+)?Ref\s*(\w+)/i,
    extract: (m) => ({
      amountRupees: parseAmount(m[1]),
      type: "debit",
      accountLast4: m[2],
      occurredAt: parseDate(m[3]),
      merchant: cleanMerchant(m[4]),
      referenceNumber: m[5],
    }),
  },

  // 7. Generic Credit: "INR 10,000.00 credited to A/C **1234 on 15-OCT-24 by UPI Ref 428901234567"
  {
    name: "generic_credit_alert",
    regex: /(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)\s+credited\s+to\s+(?:A\/C|account|card)\s*[*xX]*(\d{4})\s+on\s+(\d{1,2}[-/]\w{3}[-/]\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})(?:.*?(?:by|from)\s+([^\n,.]+?))?.*?Ref\s*(?:no\.?)?\s*(\w+)/i,
    extract: (m) => ({
      amountRupees: parseAmount(m[1]),
      type: "credit",
      accountLast4: m[2],
      occurredAt: parseDate(m[3]),
      merchant: cleanMerchant(m[4] || "Credit Transfer"),
      referenceNumber: m[5],
    }),
  },

  // 8. Fallback Broad Debit Pattern (matches standard banking SMS formats)
  {
    name: "broad_debit_pattern",
    regex: /(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:has been\s+)?(?:debited|spent|paid|withdrawn)[^\d]*[*xX]*(\d{4})?.*?on\s+(\d{1,2}[-/]\w{3}[-/]\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}).*?(?:to|at|for)\s+([^\n,.]+?)(?:\.|\s+Ref|$)/i,
    extract: (m) => ({
      amountRupees: parseAmount(m[1]),
      type: "debit",
      accountLast4: m[2],
      occurredAt: parseDate(m[3]),
      merchant: cleanMerchant(m[4]),
    }),
  },
]
