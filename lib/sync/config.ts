/**
 * Bank Alert Senders & Detection Configuration
 *
 * All bank senders and SMS headers are configured here in one editable place.
 * To support another bank, simply add an entry to BANK_CONFIGS.
 */

export interface BankSenderConfig {
  bankId: string
  bankName: string
  // Email senders or domains used by the bank for transaction alerts
  emailSenders: string[]
  // Sender headers used by SMS gateways in India (usually 6 characters, e.g. "HDFCBK")
  smsHeaders: string[]
}

export const BANK_CONFIGS: BankSenderConfig[] = [
  {
    bankId: "hdfc",
    bankName: "HDFC Bank",
    emailSenders: [
      "alerts@hdfcbank.bank.in",
      "instaalerts@hdfcbank.bank.in",
      "alert@hdfcbank.bank.in",
      "alerts@hdfcbank.net",
      "instaalerts@hdfcbank.net",
      "alert@hdfcbank.net",
      "hdfcbankalerts@hdfcbank.net",
      "alerts@hdfcbank.com",
      "instaalerts@hdfcbank.com",
      "hdfcbankalerts@hdfcbank.com",
      "alerts@hdfcbank.in",
      "alerts@hdfc.bank.in",
    ],
    smsHeaders: ["HDFCBK", "HDFCBN", "HDFCAL", "HDFCCC", "HDFCTx", "HDFCSM"],
  },
  {
    bankId: "icici",
    bankName: "ICICI Bank",
    emailSenders: ["alerts@icicibank.com", "bankingalerts@icicibank.com"],
    smsHeaders: ["ICICIB", "ICICIT", "ICICIP", "ICICIA"],
  },
  {
    bankId: "sbi",
    bankName: "State Bank of India",
    emailSenders: ["alerts@sbi.co.in", "cbalert@sbi.co.in"],
    smsHeaders: ["SBIINB", "SBIPSG", "SBISMS", "ATMSBI"],
  },
  {
    bankId: "axis",
    bankName: "Axis Bank",
    emailSenders: ["alerts@axisbank.com"],
    smsHeaders: ["AXISBK", "AXISBN", "AXISTX"],
  },
  {
    bankId: "pnb",
    bankName: "Punjab National Bank",
    emailSenders: ["alerts@pnb.co.in", "ebank@pnb.co.in", "alerts@pnb.bank.in"],
    smsHeaders: ["PNBSMS", "PNBBNK"],
  },
  {
    bankId: "bob",
    bankName: "Bank of Baroda",
    emailSenders: ["alerts@bankofbaroda.com", "bobalert@bankofbaroda.co.in"],
    smsHeaders: ["BOBSMS", "BOBALT"],
  },
  {
    bankId: "idfc",
    bankName: "IDFC FIRST Bank",
    emailSenders: ["alerts@idfcfirstbank.com", "bankalerts@idfcfirstbank.com"],
    smsHeaders: ["IDFCFB", "IDFCSM"],
  },
  {
    bankId: "indusind",
    bankName: "IndusInd Bank",
    emailSenders: ["alerts@indusind.com", "reachus@indusind.com"],
    smsHeaders: ["INDBNK", "INDSMS"],
  },
  {
    bankId: "yes",
    bankName: "Yes Bank",
    emailSenders: ["alerts@yesbank.in", "yestouch@yesbank.in"],
    smsHeaders: ["YESBNK", "YESSMS"],
  },
  {
    bankId: "canara",
    bankName: "Canara Bank",
    emailSenders: ["alerts@canarabank.com", "canarabankalerts@canarabank.com"],
    smsHeaders: ["CANBNK", "CANSMS"],
  },
  {
    bankId: "federal",
    bankName: "Federal Bank",
    emailSenders: ["alerts@federalbank.co.in", "contact@federalbank.co.in"],
    smsHeaders: ["FEDBNK", "FEDALT"],
  },
  {
    bankId: "union",
    bankName: "Union Bank of India",
    emailSenders: ["alerts@unionbankofindia.bank.in", "alerts@unionbankofindia.com"],
    smsHeaders: ["UBININ", "UNIONB"],
  },
  {
    bankId: "rbl",
    bankName: "RBL Bank",
    emailSenders: ["alerts@rblbank.com"],
    smsHeaders: ["RBLBNK"],
  },
  {
    bankId: "paytm",
    bankName: "Paytm Payments Bank",
    emailSenders: ["alerts@paytmbank.com"],
    smsHeaders: ["PAYTMB"],
  },
  {
    bankId: "airtel",
    bankName: "Airtel Payments Bank",
    emailSenders: ["alerts@airtelbank.com"],
    smsHeaders: ["AIRBNK"],
  },
]

/**
 * Returns all configured email senders across all banks for Gmail queries.
 */
export function getAllBankEmailSenders(): string[] {
  return BANK_CONFIGS.flatMap((b) => b.emailSenders)
}

/**
 * Returns all configured SMS headers across all banks.
 */
export function getAllSmsHeaders(): string[] {
  return BANK_CONFIGS.flatMap((b) => b.smsHeaders)
}

/**
 * Common bank transaction keywords to catch alert emails from ANY Indian bank.
 */
export const TRANSACTION_SEARCH_KEYWORDS = [
  '"debited from"',
  '"credited to"',
  '"spent on"',
  '"is debited"',
  '"is credited"',
  '"account ending"',
  '"VPA"',
  '"UPI Ref"',
  '"InstaAlerts"',
  '"transaction reference"',
]

/**
 * Build Gmail search query string for bank alert emails.
 * Matches known bank senders OR general Indian bank transaction keywords.
 * Subtracts a 2-day buffer so that timezone variations and boundary hours
 * on the start date are never missed. Deduplication prevents duplicates.
 */
export function buildGmailQuery(fromDate: Date, senders: string[] = getAllBankEmailSenders()): string {
  const fromStr = senders.map((s) => `from:${s}`).join(" OR ")
  const keywordsStr = TRANSACTION_SEARCH_KEYWORDS.join(" OR ")
  const bufferedDate = new Date(fromDate.getTime() - 2 * 24 * 60 * 60 * 1000)
  const year = bufferedDate.getFullYear()
  const month = String(bufferedDate.getMonth() + 1).padStart(2, "0")
  const day = String(bufferedDate.getDate()).padStart(2, "0")
  const afterStr = `after:${year}/${month}/${day}`

  return `(${fromStr} OR (${keywordsStr})) ${afterStr}`
}

/**
 * Strict OTP / Security Code Detector
 * If a message matches ANY of these terms, it MUST BE DROPPED IMMEDIATELY.
 * Never store or log these messages.
 */
export const OTP_DETECTION_REGEX =
  /\b(otp|one time password|verification code|secret code|login code|do not share|valid for \d+ (?:min|sec)|authorization code|pin code)\b/i

export function isOtpMessage(text: string): boolean {
  return OTP_DETECTION_REGEX.test(text)
}
