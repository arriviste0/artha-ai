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
    const cleanDate = dateStr.trim().replace(/,/g, "")

    // Parse DD MMM YYYY or DD-MMM-YYYY or DD MMM, YYYY (e.g. 25 Oct 2026 or 30-OCT-2026)
    const dmyWord = cleanDate.match(/^(\d{1,2})[\s\-/]([A-Za-z]{3})[\s\-/](\d{2,4})$/i)
    if (dmyWord) {
      const day = parseInt(dmyWord[1], 10)
      const monthStr = dmyWord[2]
      let year = parseInt(dmyWord[3], 10)
      if (year < 100) year += 2000
      const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
      const month = months.indexOf(monthStr.toLowerCase().slice(0, 3))
      const dateObj = new Date(Date.UTC(year, month >= 0 ? month : 0, day))
      if (timeStr) {
        const timeParts = timeStr.trim().split(":")
        const hours = parseInt(timeParts[0], 10) || 0
        const mins = parseInt(timeParts[1], 10) || 0
        const secs = parseInt(timeParts[2], 10) || 0
        dateObj.setUTCHours(hours, mins, secs)
      }
      return dateObj
    }

    // Parse Indian bank DD-MM-YY or DD/MM/YYYY (e.g. 01-11-26, 31-10-26)
    // NOTE: Must run BEFORE new Date(cleanDate) because JS Date defaults to MM-DD-YY
    const dmy = cleanDate.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/i)
    if (dmy) {
      const day = parseInt(dmy[1], 10)
      const month = parseInt(dmy[2], 10) - 1
      let year = parseInt(dmy[3], 10)
      if (year < 100) year += 2000
      const dateObj = new Date(Date.UTC(year, month, day))
      if (timeStr) {
        const timeParts = timeStr.trim().split(":")
        const hours = parseInt(timeParts[0], 10) || 0
        const mins = parseInt(timeParts[1], 10) || 0
        const secs = parseInt(timeParts[2], 10) || 0
        dateObj.setUTCHours(hours, mins, secs)
      }
      return dateObj
    }

    // Fallback to JS Date constructor
    const combined = timeStr ? `${cleanDate} ${timeStr.trim()}` : cleanDate
    const d = new Date(combined)
    if (!isNaN(d.getTime())) return d
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

const INVALID_REF_TOKENS = new Set([
  "hdfc", "bank", "icici", "sbi", "axis", "kotak", "pnb", "bob", "idfc", "indusind", "yes", "canara", "federal", "union", "rbl", "paytm", "airtel",
  "upi", "imps", "neft", "rtgs", "rrn", "utr", "txn", "ref", "reference",
  "dr", "cr", "null", "undefined", "none", "na", "to", "from", "is",
  "dear", "customer", "your", "account", "ending", "towards", "vpa",
  "no", "num", "number", "at", "on", "in", "by", "rs", "inr"
])

export function extractReferenceNumber(text: string): string | undefined {
  if (!text) return undefined

  const patterns = [
    /\b(?:upi\s+(?:transaction\s+)?(?:reference|ref)\b(?:\s+(?:number|no\.?|num))?(?:\s+is)?|(?:reference|ref)\b(?:\s+(?:number|no\.?|num))?(?:\s+is)?|rrn|utr|auth\s*code)\s*[:#.]?\s*(?:[A-Za-z]{1,12}\s+)*([A-Za-z0-9]{4,})/gi,
    /\b(?:reference|ref|txn\s*id)\b\s*[:#.]?\s*(?:[A-Za-z]{1,12}\s+)*([A-Za-z0-9]{4,})/gi,
  ]

  for (const regex of patterns) {
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      const candidate = match[1]?.trim().replace(/[.,;:]+$/, "")
      if (!candidate) continue

      const lower = candidate.toLowerCase()
      if (INVALID_REF_TOKENS.has(lower)) continue
      if (candidate.length < 4) continue
      if (/^[A-Za-z]+$/.test(candidate) && candidate.length < 6) continue

      return candidate
    }
  }

  return undefined
}

export const TRANSACTION_PATTERNS: PatternDefinition[] = [
  // 0a. HDFC Credit Card Debit: "Rs. 8521.00 has been debited from your HDFC Bank Credit Card ending 8377 towards MAKEMYTRIP INDIA PVT L on 25 Oct, 2026 at 00:12:40."
  {
    name: "hdfc_credit_card_debited",
    regex: /(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:has been|is)\s+debited from your\s+(?:HDFC Bank\s+)?Credit Card\s+(?:ending\s+|[*xX]*)(\d{4})\s+(?:towards|at|to)\s+([^\n,.]+?)\s+on\s+(\d{1,2}\s+[A-Za-z]{3},?\s+\d{2,4}|\d{1,2}[-/]\w{3}[-/]\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})(?:\s+at\s+(\d{2}:\d{2}(?::\d{2})?))?/i,
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

  // 0b. HDFC Account Update (Credit Alert): "We're writing to inform you that Rs.1000.00 has been successfully credited to your HDFC Bank account ending in 6934. Transaction Details: a. Date: 31-10-26 b. Sender: MANTRA PRAKASHBHAI PATEL (VPA: ******p425@okhdfcbank) c. UPI Reference No.: 132145644339"
  {
    name: "hdfc_account_update_credit",
    regex: /(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)\s+has been successfully credited to your\s+(?:HDFC Bank\s+)?account ending in\s*(\d{4}).*?Date:\s*(\d{1,2}[-/]\w{3}[-/]\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{1,2}\s+[A-Za-z]{3},?\s+\d{2,4}).*?Sender:\s*([^(\n\r]+?)(?:\s*\(|$).*?(?:UPI Reference No\.?|Reference No\.?|Ref No\.?|Ref)\s*[:.]?\s*(\w+)/i,
    extract: (m) => ({
      amountRupees: parseAmount(m[1]),
      type: "credit",
      accountLast4: m[2],
      occurredAt: parseDate(m[3]),
      merchant: cleanMerchant(m[4]),
      referenceNumber: m[5]?.trim(),
      bank: "HDFC Bank",
    }),
  },

  // 0c. HDFC Deposit Alert (NEFT/RTGS/IMPS): "Amount received: INR 53,661.00 Account: XX6934 Date: 30-OCT-2026 Reference Details: NEFT Cr-DEUT0784BBY-SIEMENS HEALTHINEERS INDIA LLP-Pranshu Patel-DEUTH00630304527 Available Balance: INR 62,263.35"
  {
    name: "hdfc_deposit_alert",
    regex: /Amount received:\s*(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)\s+Account:\s*[*xX]*(\d{4})\s+Date:\s*(\d{1,2}[-/]\w{3}[-/]\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s+Reference Details:\s*([^\n]+)/i,
    extract: (m) => {
      const refLine = m[4] || ""
      const beforeBalance = refLine.split(/Available Balance/i)[0].trim()
      const parts = beforeBalance.split("-").map((p) => p.trim()).filter(Boolean)
      let merchant = "Deposit / Transfer"
      let refNo: string | undefined = undefined

      if (parts.length >= 3) {
        merchant = parts[2]
      } else if (parts.length > 0) {
        merchant = parts.join(" ")
      }
      if (parts.length >= 4) {
        refNo = parts[parts.length - 1]
      }

      return {
        amountRupees: parseAmount(m[1]),
        type: "credit",
        accountLast4: m[2],
        occurredAt: parseDate(m[3]),
        merchant: cleanMerchant(merchant),
        referenceNumber: refNo || extractReferenceNumber(m.input),
        bank: "HDFC Bank",
      }
    },
  },

  // 0d. Credit Card Bill Payment Received Alert: "Payment of Rs. 12,082.41 received towards your HDFC Bank Credit Card ending 8377 on 30-10-2026."
  {
    name: "credit_card_payment_received",
    regex: /(?:Payment of\s+)?(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:received|successful|processed|credited|made)\s+(?:towards|for)\s+(?:your\s+)?(?:[A-Za-z ]+?\s+)?Credit Card\s+(?:ending\s+|[*xX]*)(\d{4})?(?:.*?on\s+(\d{1,2}[-/]\w{3}[-/]\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{1,2}\s+[A-Za-z]{3},?\s+\d{2,4}))?/i,
    extract: (m) => ({
      amountRupees: parseAmount(m[1]),
      type: "credit",
      accountLast4: m[2],
      occurredAt: parseDate(m[3]),
      merchant: "Credit Card Bill Payment",
      referenceNumber: extractReferenceNumber(m.input),
      bank: "HDFC Bank",
    }),
  },

  // 0e. Account Debit for NetBanking BillPay / CC Payment: "Rs. 12,082.41 is debited from your account ending 6934 towards IB BILLPAY DR-HDFC8E-463202XXXXXX8377 on 30-10-26"
  {
    name: "account_billpay_debit",
    regex: /(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:is|has been)\s+debited from your account (?:ending\s+|[*xX]*)(\d{4})\s+(?:towards|for)\s+(IB\s+BILLPAY[^\n.]+|[^\n.]+BILLPAY[^\n.]+|HDFC Bank Credit Card[^\n.]*|[^\n.]+Credit Card Bill[^\n.]*)(?:.*?on\s+(\d{1,2}[-/]\w{3}[-/]\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{1,2}\s+[A-Za-z]{3},?\s+\d{2,4}))?/i,
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

  // 0f. Generic Credit Card Debit: "Your Credit Card XX1234 has been debited for INR 1,500.00 at AMAZON on 25-Oct-26"
  {
    name: "generic_credit_card_debited",
    regex: /(?:Credit Card|Card)\s*[*xX]*(\d{4})\s+(?:has been debited|debited)\s+(?:for|with)?\s+(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:at|on|towards)\s+([^\n,.]+?)\s+on\s+(\d{1,2}[-/]\w{3}[-/]\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{1,2}\s+[A-Za-z]{3},?\s+\d{2,4})/i,
    extract: (m) => ({
      amountRupees: parseAmount(m[2]),
      type: "debit",
      accountLast4: m[1],
      merchant: cleanMerchant(m[3]),
      occurredAt: parseDate(m[4]),
      referenceNumber: extractReferenceNumber(m.input),
    }),
  },

  // 0g. HDFC Account Credited Fallback: "Rs.1000.00 has been successfully credited to your HDFC Bank account ending in 6934"
  {
    name: "hdfc_account_credited_fallback",
    regex: /(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)\s+has been successfully credited to your\s+(?:HDFC Bank\s+)?account ending in\s*(\d{4})(?:.*?on\s+(\d{1,2}[-/]\w{3}[-/]\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{1,2}\s+[A-Za-z]{3},?\s+\d{2,4}))?/i,
    extract: (m) => ({
      amountRupees: parseAmount(m[1]),
      type: "credit",
      accountLast4: m[2],
      occurredAt: parseDate(m[3]),
      merchant: "Deposit / Transfer",
      referenceNumber: extractReferenceNumber(m.input),
      bank: "HDFC Bank",
    }),
  },
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
