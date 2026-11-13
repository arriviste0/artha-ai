import {
  BANK_ALIASES,
  BILL_PAYMENT_KEYWORDS,
  BIN_PREFIX_LOOKUP,
  CARD_BILL_AGGREGATORS,
  DIRECTION_MARKERS,
  NON_TRANSACTION_IGNORE_PATTERNS,
} from "./card-bill-config"

export interface CardBillPaymentDetection {
  isCardBillPayment: boolean
  confidence: number
  signals: string[]
  issuerGuess?: string
  cardLast4?: string
  suggestedTransfer?: boolean
  direction?: "debit" | "credit"
}

/**
 * Mask card numbers and phone numbers to their last 4 digits.
 * Strips emails and user accounts to ensure privacy before sending to LLM.
 */
export function maskSensitiveData(text: string): string {
  if (!text) return ""
  let masked = text

  // Mask emails: user@domain.com -> u***@domain.com
  masked = masked.replace(/\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Z|a-z]{2,})\b/g, "$1***@$2")

  // Mask 10-digit Indian phone numbers: 9876543210 -> XXXXXX3210
  masked = masked.replace(/(?:\+91[-\s]?)?[6-9]\d{5}(\d{4})\b/g, "XXXXXX$1")

  // Normalize and preserve card numbers ending in 4 digits
  masked = masked.replace(/(?:^|[\s\-_:.,/])(\d{4,6})[*xX\-]{4,12}(\d{4})(?:$|[\s\-_:.,/])/g, " $1XXXXXX$2 ")

  return masked.trim()
}

/**
 * Checks whether an alert is strictly a non-transaction message
 * (OTP, promotional advertisement, or balance-only inquiry).
 */
export function isIgnoredNonTransaction(text: string): boolean {
  if (!text) return true
  for (const pattern of NON_TRANSACTION_IGNORE_PATTERNS) {
    if (pattern.test(text)) {
      return true
    }
  }
  return false
}

/**
 * Parse Indian currency amounts into standard float numbers.
 * Supports: 12,082.41, 1,20,000, Rs.500, INR 500.00, Rs 5,000/-, etc.
 */
export function parseGenericAmount(str?: string): number {
  if (!str) return 0
  const clean = str
    .replace(/(?:Rs\.?|INR)\s*/gi, "")
    .replace(/\/-\s*$/g, "")
    .replace(/,/g, "")
    .trim()

  const match = clean.match(/-?\d+(?:\.\d+)?/)
  if (!match) return 0

  const num = parseFloat(match[0])
  return isNaN(num) ? 0 : Math.abs(num)
}

/**
 * Parse standard Indian banking dates into Date objects.
 * Handles:
 * - dd/mm/yy (e.g. 30/10/26)
 * - dd/mm/yyyy (e.g. 30/10/2026)
 * - dd-MM-yy (e.g. 30-10-26)
 * - dd-Mon-yyyy (e.g. 30-OCT-2026)
 * - dd MMM yy (e.g. 30 Oct 26)
 */
export function parseGenericDate(dateStr?: string, timeStr?: string): Date {
  if (!dateStr) return new Date()
  const clean = dateStr.trim().replace(/,/g, "")

  // 1. dd-Mon-yyyy or dd Mon yy or dd Mon yyyy
  const dmyWord = clean.match(/^(\d{1,2})[\s\-/]([A-Za-z]{3})[\s\-/](\d{2,4})$/i)
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
      dateObj.setUTCHours(
        parseInt(timeParts[0], 10) || 0,
        parseInt(timeParts[1], 10) || 0,
        parseInt(timeParts[2], 10) || 0
      )
    }
    return dateObj
  }

  // 2. dd/mm/yy or dd/mm/yyyy or dd-mm-yy or dd-mm-yyyy
  const dmyNum = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/)
  if (dmyNum) {
    const day = parseInt(dmyNum[1], 10)
    const month = parseInt(dmyNum[2], 10) - 1
    let year = parseInt(dmyNum[3], 10)
    if (year < 100) year += 2000
    const dateObj = new Date(Date.UTC(year, month, day))
    if (timeStr) {
      const timeParts = timeStr.trim().split(":")
      dateObj.setUTCHours(
        parseInt(timeParts[0], 10) || 0,
        parseInt(timeParts[1], 10) || 0,
        parseInt(timeParts[2], 10) || 0
      )
    }
    return dateObj
  }

  const d = new Date(timeStr ? `${clean} ${timeStr}` : clean)
  return isNaN(d.getTime()) ? new Date() : d
}

/**
 * Capture reference numbers (10 to 20 digits) excluding the masked card token.
 */
export function parseGenericReference(text: string, cardToken?: string): string | undefined {
  if (!text) return undefined
  const digitMatches = text.match(/\b\d{10,20}\b/g) || []
  const cardDigitsOnly = cardToken ? cardToken.replace(/\D/g, "") : ""
  return digitMatches.find((d) => d !== cardToken && d !== cardDigitsOnly)
}

// A card identifier alone is not evidence of a bill payment: it is present in
// ordinary card-purchase alerts too. Keep purchase language ahead of the bill
// detector so those expenses never become transfers.
const CARD_PURCHASE_PATTERNS = [
  /\b(?:spent|used|charged|purchased|transaction)\b[\s\S]{0,80}\b(?:credit\s+)?card\b/i,
  /\b(?:debited|charged)\s+from\s+(?:your\s+)?(?:[A-Za-z]+\s+){0,4}(?:credit\s+)?card\b/i,
  /\b(?:credit\s+)?card\b[\s\S]{0,40}\b(?:has been|was)?\s*(?:debited|charged)\s+(?:for|with|at)\b/i,
]

// These describe money settling a card balance, rather than spending on a card.
// They intentionally require payment/bill wording or an account-to-card direction.
const CARD_BILL_PAYMENT_PATTERNS = [
  /\b(?:ib\s*)?bill\s*pay\b|\bbillpay\b|\bbbps\b|\bccpay\b/i,
  /\b(?:cc|credit\s+card)\s+(?:bill\s+)?payment\b/i,
  /\b(?:payment|amount)\b[\s\S]{0,100}\b(?:received|credited|successful|processed)\b[\s\S]{0,100}\b(?:credit\s+)?card\b/i,
  /\b(?:debited|paid|transferred)\b[\s\S]{0,80}\b(?:a\/c|account)\b[\s\S]{0,120}\b(?:towards|to|for)\b[\s\S]{0,100}\b(?:credit\s+)?card\b/i,
]

/**
 * Generic Credit Card Bill Payment Detector
 *
 * Detects card bill payments based on structural signals, not hardcoded strings.
 * Signals combine to produce a confidence score:
 * - confidence >= 0.8 -> isCardBillPayment = true
 * - 0.5 <= confidence < 0.8 -> suggestedTransfer = true (Transfer (suggested) chip)
 * - confidence < 0.5 -> normal pipeline
 */
export function detectCardBillPayment(
  narration: string,
  direction: "debit" | "credit" = "debit",
  amount?: number
): CardBillPaymentDetection {
  let confidence = 0
  const signals: string[] = []
  let issuerGuess: string | undefined = undefined
  let cardLast4: string | undefined = undefined
  const lower = narration.toLowerCase()

  // A credit card debit is card spend (purchases/expenses), NEVER a card bill payment!
  // Per Part 2: "Direction rule: a card bill payment is a DEBIT on the bank account.
  // The matching 'payment received' entry on the card side is a CREDIT on the card account."
  if (CARD_PURCHASE_PATTERNS.some((pattern) => pattern.test(narration))) {
    return {
      isCardBillPayment: false,
      confidence: 0,
      signals: [],
      direction: "debit",
    }
  }

  // Strong settlement language is required when the narration only says
  // "credit card". This prevents a card purchase from being treated as a bill.
  if (CARD_BILL_PAYMENT_PATTERNS.some((pattern) => pattern.test(narration))) {
    signals.push("card_bill_payment_language")
    confidence += 0.55
  }

  // Inferred direction: if narration explicitly indicates credit / payment received on card side
  let effectiveDirection = direction
  if (
    /\b(payment received|payment credited|credited to your card|credit received|payment of .*?received)\b/i.test(narration) ||
    (/\b(credit|cr)\b/i.test(narration) && !/\b(debit|dr|debited)\b/i.test(narration))
  ) {
    effectiveDirection = "credit"
  }

  // Signal a: Masked card number (12 to 19 characters, ending in 4 digits) or card ending 4 digits
  // Matches tokens like: 463202XXXXXX8377, XXXXXX8377, ************8377, 4111********1234
  const cardRegex = /(?:^|[\s\-_:.,/])((?:\d{4,6}[*xX\-]{4,12}\d{4}|[*xX]{6,14}\d{4}))(?:$|[\s\-_:.,/])/
  const cardMatch = narration.match(cardRegex)
  if (cardMatch && cardMatch[1]) {
    signals.push("masked_card_number")
    confidence += 0.50
    cardLast4 = cardMatch[1].replace(/\D/g, "").slice(-4)

    // Signal e: Optional BIN prefix lookup (first 6 digits -> issuer)
    const first6 = cardMatch[1].slice(0, 6)
    if (/^\d{6}$/.test(first6) && BIN_PREFIX_LOOKUP[first6]) {
      issuerGuess = BIN_PREFIX_LOOKUP[first6]
      signals.push("bin_lookup")
      confidence += 0.10
    }
  } else {
    // If masked card token wasn't formatted with X/*, check for explicit "card ending \d{4}"
    const cardEndingMatch = narration.match(/\bcredit\s+card(?:\s+ending|\s+no\.?)?\s*(\d{4})\b/i)
    if (cardEndingMatch) {
      signals.push("card_ending_digits")
      confidence += 0.40
      cardLast4 = cardEndingMatch[1]
    }
  }

  // Signal b: Bill-payment keywords (config-driven)
  for (const kw of BILL_PAYMENT_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) {
      signals.push("bill_payment_keyword")
      confidence += 0.35
      break
    }
  }

  // Signal c: Direction markers inside narration (DR, CR, DEBIT, CREDIT)
  if (effectiveDirection === "debit") {
    if (DIRECTION_MARKERS.debit.some((rx) => rx.test(narration))) {
      signals.push("direction_marker_debit")
      confidence += 0.05
    }
  } else if (effectiveDirection === "credit") {
    if (DIRECTION_MARKERS.credit.some((rx) => rx.test(narration))) {
      signals.push("direction_marker_credit")
      confidence += 0.05
    }
  }

  // Signal d: Issuer token in narration (bank short codes or names)
  if (!issuerGuess) {
    // Sort aliases by length descending so longer/more specific aliases match first
    const sortedAliases = Object.entries(BANK_ALIASES).sort((a, b) => b[0].length - a[0].length)
    for (const [alias, canonicalName] of sortedAliases) {
      // Must be a distinct token with word boundaries or followed by digits/hyphens (e.g. HDFC001)
      const aliasRx = new RegExp(`\\b${alias}\\b|\\b${alias}(?=[0-9_-])`, "i")
      if (aliasRx.test(narration)) {
        issuerGuess = canonicalName
        signals.push("issuer_token")
        confidence += 0.15
        break
      }
    }
  }

  // If masked card + bill payment keyword are detected but no known bank alias was in config
  if (!issuerGuess && signals.includes("masked_card_number")) {
    issuerGuess = "unknown"
  }

  // Signal f: Counter-party aggregator (BillDesk, CRED, Paytm, etc.)
  for (const agg of CARD_BILL_AGGREGATORS) {
    if (lower.includes(agg.toLowerCase())) {
      signals.push("aggregator")
      confidence += 0.10
      break
    }
  }

  confidence = Math.min(1.0, Math.round(confidence * 100) / 100)

  const isCardBillPayment = confidence >= 0.8
  const suggestedTransfer = confidence >= 0.5 && confidence < 0.8

  return {
    isCardBillPayment,
    confidence,
    signals,
    issuerGuess,
    cardLast4,
    suggestedTransfer,
    direction: effectiveDirection,
  }
}

/**
 * Extract tokens from an unformatted statement line or email alert
 * in an order-independent manner.
 */
export function extractStatementTokens(line: string): {
  cardToken?: string
  cardLast4?: string
  date?: Date
  amount?: number
  amountPaise: number
  refNo?: string
  cleanNarration: string
} {
  const cardMatch = line.match(/(?:^|[\s\-_:.,/])((?:\d{4,6}[*xX\-]{4,12}\d{4}|[*xX]{6,14}\d{4}))(?:$|[\s\-_:.,/])/)
  const cardToken = cardMatch ? cardMatch[1] : undefined
  const cardLast4 = cardToken ? cardToken.replace(/\D/g, "").slice(-4) : undefined

  // Extract date
  const dateMatch = line.match(/\b(?:\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{1,2}[-/][A-Za-z]{3}[-/]\d{2,4}|\d{1,2}\s+[A-Za-z]{3}\s+\d{2,4})\b/)
  const date = dateMatch ? parseGenericDate(dateMatch[0]) : new Date()

  // Extract reference number (10 to 20 digits, not the card number)
  const refNo = parseGenericReference(line, cardToken)

  // Extract amount: check explicit currency prefix, comma-grouped number, or decimal number
  let rawAmountStr: string | undefined = undefined
  const prefixMatch = line.match(/(?:Rs\.?|INR)\s*[\d,]+(?:\.\d+)?(?:\/-)?/i)
  if (prefixMatch) {
    rawAmountStr = prefixMatch[0]
  } else {
    const commaMatch = line.match(/\b\d{1,3}(?:,\d{2,3})+(?:\.\d+)?\b/)
    if (commaMatch) {
      rawAmountStr = commaMatch[0]
    } else {
      const decMatches = line.match(/\b\d+\.\d{1,2}\b/g) || []
      for (const m of decMatches) {
        if (m.replace(/\D/g, "") !== refNo) {
          rawAmountStr = m
          break
        }
      }
    }
  }

  const amount = rawAmountStr ? parseGenericAmount(rawAmountStr) : 0
  const amountPaise = Math.round(amount * 100)

  return {
    cardToken,
    cardLast4,
    date,
    amount,
    amountPaise,
    refNo,
    cleanNarration: line.trim(),
  }
}

/**
 * Extract bank account digits and card digits from narration.
 * Distinguishes between the bank account being debited and the credit card being paid.
 */
export function extractAccountLast4(text: string): { bankAcc?: string; cardLast4?: string } {
  const bankM = text.match(/\b(?:account|a\/c)(?:\s+ending|\s+no\.?|\s+in)?\s*(?:in\s+)?(\d{4})\b/i)
  const cardM = text.match(/\bcredit\s+card(?:\s+ending|\s+no\.?)?\s*(\d{4})\b/i)
  const maskedCardM = text.match(/(?:^|[\s\-_:.,/])(?:\d{4,6}[*xX\-]{4,12}(\d{4})|[*xX]{6,14}(\d{4}))/)
  const cardLast4 = cardM ? cardM[1] : (maskedCardM ? (maskedCardM[1] || maskedCardM[2]) : undefined)
  const bankAcc = bankM ? bankM[1] : (cardM ? cardM[1] : undefined)
  return { bankAcc, cardLast4 }
}

/**
 * Best-effort pair matching for credit card bill payments:
 * Links the bank-side DEBIT with the card-side CREDIT ("payment received")
 * within a 5-day window when amounts match and cards do not conflict.
 */
export function pairMatchCardBillPayments<
  T extends {
    _id?: unknown
    amountPaise: number
    occurredAt: Date
    type: "credit" | "debit" | string
    category?: string
    subtype?: string
    cardLast4?: string
    linkedTransactionId?: unknown
  }
>(transactions: T[]): { linkedCount: number; transactions: T[] } {
  let linkedCount = 0
  const WINDOW_MS = 5 * 24 * 60 * 60 * 1000 // 5 days

  const debits = transactions.filter(
    (t) => t.type === "debit" && (t.subtype === "card_bill_payment" || t.category === "Transfer")
  )
  const credits = transactions.filter(
    (t) => t.type === "credit" && (t.subtype === "card_bill_payment" || t.category === "Transfer")
  )

  for (const debit of debits) {
    if (debit.linkedTransactionId) continue

    const match = credits.find((credit) => {
      if (credit.linkedTransactionId) return false
      if (credit.amountPaise !== debit.amountPaise) return false

      const timeDiff = Math.abs(new Date(credit.occurredAt).getTime() - new Date(debit.occurredAt).getTime())
      if (timeDiff > WINDOW_MS) return false

      // If both specify cardLast4, they must match! (Different cards cannot pair)
      if (debit.cardLast4 && credit.cardLast4 && debit.cardLast4 !== credit.cardLast4) {
        return false
      }

      return true
    })

    if (match) {
      debit.linkedTransactionId = match._id || "paired"
      match.linkedTransactionId = debit._id || "paired"
      linkedCount++
    }
  }

  return { linkedCount, transactions }
}

/**
 * Best-effort pair matching in MongoDB database:
 * Links the bank-side DEBIT with the card-side CREDIT ("payment received")
 * within a 5-day window when amounts match and cards do not conflict.
 */
export async function linkMatchingCardBillPaymentsInDB(
  userId: unknown,
  transactions: Array<{
    _id: unknown
    amountPaise: number
    occurredAt: Date
    type: "credit" | "debit" | string
    category?: string
    subtype?: string
    cardLast4?: string
    linkedTransactionId?: unknown
  }>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TransactionModel: any
): Promise<number> {
  let linkedCount = 0
  const WINDOW_MS = 5 * 24 * 60 * 60 * 1000

  for (const txn of transactions) {
    if (txn.linkedTransactionId) continue
    const isCardBill = txn.subtype === "card_bill_payment" || txn.category === "Transfer"
    if (!isCardBill) continue

    const targetType = txn.type === "debit" ? "credit" : "debit"
    const targetStartDate = new Date(new Date(txn.occurredAt).getTime() - WINDOW_MS)
    const targetEndDate = new Date(new Date(txn.occurredAt).getTime() + WINDOW_MS)

    const candidate = await TransactionModel.findOne({
      userId,
      _id: { $ne: txn._id },
      type: targetType,
      amountPaise: txn.amountPaise,
      occurredAt: { $gte: targetStartDate, $lte: targetEndDate },
      linkedTransactionId: { $exists: false },
      $or: [
        { subtype: "card_bill_payment" },
        { category: "Transfer" },
        { description: /payment received/i },
      ],
    })

    if (candidate) {
      if (txn.cardLast4 && candidate.cardLast4 && txn.cardLast4 !== candidate.cardLast4) {
        continue
      }

      txn.linkedTransactionId = candidate._id
      candidate.linkedTransactionId = txn._id
      await Promise.all([
        TransactionModel.findByIdAndUpdate(txn._id, { linkedTransactionId: candidate._id }),
        TransactionModel.findByIdAndUpdate(candidate._id, { linkedTransactionId: txn._id }),
      ])
      linkedCount++
    }
  }

  return linkedCount
}

/**
 * Calculate report totals excluding credit card bill payments and transfers.
 * Prevents double-counting expenses when the user's spending is already in card transactions.
 */
export function calculateReportTotals(
  transactions: Array<{
    amountPaise: number
    type: "credit" | "debit" | string
    category?: string
    subtype?: string
  }>
): { totalIncomePaise: number; totalExpensesPaise: number; netSavingsPaise: number } {
  let totalIncomePaise = 0
  let totalExpensesPaise = 0

  for (const t of transactions) {
    // Exclude card bill payments and internal transfers from income & expense totals
    if (t.subtype === "card_bill_payment" || t.category === "Transfer") {
      continue
    }

    if (t.type === "credit") {
      totalIncomePaise += t.amountPaise
    } else if (t.type === "debit") {
      totalExpensesPaise += t.amountPaise
    }
  }

  return {
    totalIncomePaise,
    totalExpensesPaise,
    netSavingsPaise: totalIncomePaise - totalExpensesPaise,
  }
}
