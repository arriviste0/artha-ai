/**
 * Generic Credit Card Bill Payment & Alert Configuration
 *
 * Config-only file. Any bank alias, bill-payment keyword, or BIN prefix
 * can be added here with a single line change.
 */

/**
 * Bill-payment keywords (case-insensitive)
 * Matches standard bank statements, SMS, and email alerts across Indian banks.
 */
export const BILL_PAYMENT_KEYWORDS: string[] = [
  "billpay",
  "bill pay",
  "bbps",
  "cc payment",
  "cc payment received",
  "ccpay",
  "credit card",
  "card payment",
  "card payment received",
  "card bill",
  "cardbill",
  "autopay",
  "auto pay",
  "si-",
  "standing instruction",
  "billdesk card",
  "ib billpay",
  "ibbillpay",
  "netbanking billpay",
  "mobile banking billpay",
  "credit card payment",
]

/**
 * Bank token & alias registry
 * Maps short codes or tokens found in bank narrations to canonical bank names.
 * Adding a new bank is a one-line entry!
 */
export const BANK_ALIASES: Record<string, string> = {
  hdfc: "HDFC Bank",
  hdfc8e: "HDFC Bank",
  icici: "ICICI Bank",
  sbi: "State Bank of India",
  axis: "Axis Bank",
  kotak: "Kotak Mahindra Bank",
  yes: "Yes Bank",
  idfc: "IDFC FIRST Bank",
  indusind: "IndusInd Bank",
  rbl: "RBL Bank",
  federal: "Federal Bank",
  au: "AU Small Finance Bank",
  bob: "Bank of Baroda",
  pnb: "Punjab National Bank",
  canara: "Canara Bank",
  amex: "American Express",
  citi: "Citibank",
  hsbc: "HSBC",
  scb: "Standard Chartered",
  "standard chartered": "Standard Chartered",
  onecard: "OneCard",
  slice: "Slice",
}

/**
 * Optional BIN prefix lookup (first 6 digits -> issuer)
 * Empty by default, user/admin can extend. Never treated as authoritative.
 */
export const BIN_PREFIX_LOOKUP: Record<string, string> = {
  // e.g. "463202": "HDFC Bank",
}

/**
 * Payment aggregators commonly used for card bills
 * Serves as a supporting signal (+0.10)
 */
export const CARD_BILL_AGGREGATORS: string[] = [
  "billdesk",
  "cred",
  "paytm",
  "phonepe",
  "amazon pay",
  "razorpay",
  "mobikwik",
  "freecharge",
]

/**
 * Direction markers inside narrations
 */
export const DIRECTION_MARKERS = {
  debit: [/\bdr\b/i, /\bdr[-_]/i, /[-_]dr\b/i, /\bdebit\b/i],
  credit: [/\bcr\b/i, /\bcr[-_]/i, /[-_]cr\b/i, /\bcredit\b/i],
}

/**
 * Non-transaction items that must be strictly IGNORED (never sent to review queue)
 */
export const NON_TRANSACTION_IGNORE_PATTERNS: RegExp[] = [
  // 1. OTP / Verification codes
  /\b(otp|one time password|verification code|secret code|login code|authorization code|pin code)\b/i,
  // 2. Promotional / marketing offers
  /\b(pre-approved loan|apply now|flat \d+% off|exclusive discount|special festive treat|raffle is back|congrats! you're now all set|double festive discount|save up to rs\.?|sale ends|exclusive invite|gift card on us)\b/i,
  // 3. Balance inquiry / balance-only messages
  /\b(available balance is|clear balance is|balance in your a\/c.*is rs\.?|your a\/c balance is)\b/i,
]

export function isIgnoredNonTransaction(text?: string): boolean {
  if (!text) return false
  return NON_TRANSACTION_IGNORE_PATTERNS.some((pattern) => pattern.test(text))
}

/**
 * Configurable alert types for search and filtering
 */
export interface BankAlertType {
  id: string
  name: string
  keywords: string[]
}

export const BANK_ALERT_TYPES: BankAlertType[] = [
  {
    id: "card_bill_payment",
    name: "Credit Card Bill Payments",
    keywords: [
      '"BILLPAY"',
      '"BillPay"',
      '"card payment"',
      '"credit card payment"',
      '"card bill"',
      '"CC PAYMENT"',
      '"bbps"',
      '"autopay"',
    ],
  },
  {
    id: "card_spend",
    name: "Credit Card Spends",
    keywords: ['"Credit Card ending"', '"spent on"', '"payment was made using your Credit Card"'],
  },
  {
    id: "upi",
    name: "UPI Transfers",
    keywords: ['"VPA"', '"UPI Ref"', '"UPI transaction reference"', '"InstaAlerts"'],
  },
  {
    id: "deposit",
    name: "Salary & Account Credits",
    keywords: ['"Amount received:"', '"New Deposit Alert"', '"has been credited"', '"is credited"'],
  },
  {
    id: "netbanking",
    name: "Account Debits & NetBanking",
    keywords: ['"debited from"', '"is debited"', '"has been debited"'],
  },
]
