import {
  type Category,
  isValidCategoryForType,
  CREDIT_ONLY_CATEGORIES,
  DEBIT_ONLY_CATEGORIES,
} from "./categories"

export interface RuleCategoryConfig {
  category: Category
  brands: string[]
  generic: string[]
  creditOnly?: boolean
  debitOnly?: boolean
}

export interface RuleMatchResult {
  category: Category
  confidence: number
  matchedKeyword?: string
  isAmbiguous?: boolean
}

/**
 * Normalises the merchant text:
 * 1. Lowercase
 * 2. Strip UPI handles (@okhdfcbank, @ybl, @paytm, @ibl, @axl, @icici, etc.)
 * 3. Strip prefixes like "UPI-", "POS ", "PAYTM-", "BILLDESK", "RAZORPAY*", "PYU*", "IN*", "IMPS/", "NEFT-"
 * 4. Strip digits, reference numbers and extra spaces
 */
export function normalizeMerchant(text: string): string {
  if (!text) return ""
  let s = text.toLowerCase()

  // 1. Strip UPI handles (@okhdfcbank, @ybl, @paytm, @ibl, @axl, @icici, @ptys, etc.)
  s = s.replace(/@[a-z0-9.\-_]+/g, " ")

  // 2. Strip prefixes like "UPI-", "POS ", "PAYTM-", "BILLDESK", "RAZORPAY*", "PYU*", "IN*", "IMPS/", "NEFT-"
  // Only strip when followed by specified delimiters (e.g. razorpay* or paytm-, NOT razorpay settlement)
  s = s.replace(/^(?:upi[\s\-_/]+|pos[\s\-_/]+|paytm[\-_/]+|billdesk[\s\-_/*]+|razorpay[*_\-/]+|pyu[*_\-/]+|in\*+|imps[\s\-_/]+|neft[\s\-_/]+|rtgs[\s\-_/]+)/gi, " ")
  s = s.replace(/\b(?:upi|pos|paytm|billdesk|razorpay|pyu|in)[*\-_/]+/gi, " ")

  // 3. Strip reference numbers and UTR codes
  s = s.replace(/\b(?:ref|rrn|utr|txnid|txn|id)[:\s]*[a-z0-9]+/gi, " ")

  // 4. Strip standalone digits & reference numbers (preserve tokens with digits like 1mg, d2h)
  s = s.replace(/\b\d{4,}\b/g, " ")
  s = s.replace(/(?<=\s)\d+(?=\s)/g, " ")

  // 5. Replace hyphens, underscores and non-alphanumeric (keep &, ., ' for brands like cult.fit, AT&T)
  s = s.replace(/[-_]+/g, " ")
  s = s.replace(/[^a-z0-9&.' ]/g, " ")

  // 6. Collapse multiple spaces
  s = s.replace(/\s+/g, " ").trim()
  return s
}

/**
 * List of ambiguous keywords and gateways that MUST ALWAYS be sent to AI and never rule-matched.
 */
export const AMBIGUOUS_KEYWORDS = [
  "amazon pay",
  "amazon",
  "paytm",
  "phonepe",
  "google pay",
  "gpay",
  "razorpay",
  "billdesk",
  "cred",
  "uber eats",
  "urban company",
  "jio mart",
  "jiomart",
  "tata",
  "reliance",
  "bajaj",
  "hdfc",
  "icici",
  "sbi",
  "axis",
] as const

/**
 * Checks whether a merchant is on the ambiguous list, has 2 or fewer characters,
 * or is a person payee that should not be matched by brand rules.
 */
export function isAmbiguousMerchant(normalizedText: string, payeeType?: string): boolean {
  if (!normalizedText || normalizedText.length <= 2) {
    return true
  }

  // If detected as a person payee, do not match brand rules
  if (payeeType === "person") {
    return true
  }

  const lower = normalizedText.toLowerCase()

  // Specific ambiguous multi-word phrases that always go to AI
  if (/\buber eats\b/i.test(lower)) return true
  if (/\bamazon pay\b/i.test(lower)) return true
  if (/\bjio\s*mart\b/i.test(lower)) return true
  if (/\burban company\b/i.test(lower)) return true

  // Gateways alone without merchant context
  if (/\b(?:phonepe|google pay|gpay|billdesk|cred)\b/i.test(lower)) {
    if (/\bphonepe business\b/i.test(lower)) return false
    return true
  }

  if (/\bpaytm\b/i.test(lower)) {
    if (/\bpaytm money\b/i.test(lower) || /\bpaytm settlement\b/i.test(lower)) return false
    return true
  }

  if (/\brazorpay\b/i.test(lower)) {
    if (/\brazorpay settlement\b/i.test(lower)) return false
    return true
  }

  if (/\bamazon\b/i.test(lower)) {
    if (/\bamazon seller\b/i.test(lower)) return false
    return true
  }

  // Standalone broad conglomerate / bank names alone without specific subsidiary
  const broadStandaloneRegexes = [
    { pattern: /^\s*tata\s*$/i, allowed: /tata\s*(?:power|1mg|cliq|play|aig|capital)/i },
    { pattern: /^\s*reliance\s*$/i, allowed: /reliance\s*(?:fresh|smart|digital|jio)/i },
    { pattern: /^\s*bajaj\s*$/i, allowed: /bajaj\s*(?:finance|finserv|allianz)/i },
    { pattern: /^\s*hdfc\s*(?:bank)?\s*$/i, allowed: /hdfc\s*(?:life|loan|securities)/i },
    { pattern: /^\s*icici\s*(?:bank)?\s*$/i, allowed: /icici\s*(?:pru|prudential|lombard|direct|loan)/i },
    { pattern: /^\s*sbi\s*(?:bank)?\s*$/i, allowed: /sbi\s*(?:life|loan|card)/i },
    { pattern: /^\s*axis\s*(?:bank)?\s*$/i, allowed: /axis\s*(?:bank loan|securities|mutual)/i },
  ]

  for (const { pattern, allowed } of broadStandaloneRegexes) {
    if (pattern.test(lower) && !allowed.test(lower)) {
      return true
    }
  }

  return false
}

/**
 * All rules in ONE config file.
 * Priority order:
 * Salary / Business Income / Freelance Income (credit only)
 * > Investments > EMI / Loans > Insurance > Healthcare > Education
 * > Utilities > Transport > Food & Dining > Entertainment > Personal Care
 * > Rent / Housing > Shopping > Transfer > Other
 */
export const CATEGORY_RULES_CONFIG: RuleCategoryConfig[] = [
  // 1. Salary (credit only)
  {
    category: "Salary",
    creditOnly: true,
    brands: [],
    generic: ["salary", "sal", "payroll", "stipend", "wages"],
  },
  // 2. Business Income (credit only)
  {
    category: "Business Income",
    creditOnly: true,
    brands: [
      "razorpay settlement",
      "cashfree",
      "payu",
      "stripe",
      "paytm settlement",
      "phonepe business",
      "shopify",
      "amazon seller",
      "flipkart seller",
    ],
    generic: ["invoice", "gst"],
  },
  // 3. Freelance Income (credit only)
  {
    category: "Freelance Income",
    creditOnly: true,
    brands: ["upwork", "fiverr", "freelancer", "payoneer", "wise", "paypal", "toptal"],
    generic: [],
  },
  // 4. Investments (debit only)
  {
    category: "Investments",
    debitOnly: true,
    brands: [
      "zerodha",
      "groww",
      "upstox",
      "angel one",
      "icici direct",
      "hdfc securities",
      "kotak securities",
      "kuvera",
      "paytm money",
      "indmoney",
      "smallcase",
      "coin",
      "indian clearing",
      "nse clearing",
      "bse star",
      "safegold",
      "jar",
    ],
    generic: [
      "nps",
      "ppf",
      "sip",
      "mutual fund",
      "demat",
      "digital gold",
      "gold bond",
      "fd",
      "fixed deposit",
    ],
  },
  // 5. EMI / Loans (debit only)
  {
    category: "EMI / Loans",
    debitOnly: true,
    brands: [
      "bajaj finance",
      "bajaj finserv",
      "hdfc loan",
      "icici loan",
      "sbi loan",
      "home credit",
      "kreditbee",
      "moneyview",
      "navi",
      "lazypay",
      "simpl",
      "zestmoney",
      "slice",
      "tata capital",
      "fullerton",
    ],
    generic: ["loan", "emi", "nach", "ecs"],
  },
  // 6. Insurance (debit only)
  {
    category: "Insurance",
    debitOnly: true,
    brands: [
      "lic",
      "hdfc life",
      "icici prudential",
      "icici lombard",
      "sbi life",
      "max life",
      "star health",
      "care health",
      "niva bupa",
      "digit",
      "acko",
      "policybazaar",
      "bajaj allianz",
      "tata aig",
    ],
    generic: ["insurance", "premium"],
  },
  // 7. Healthcare (debit only)
  {
    category: "Healthcare",
    debitOnly: true,
    brands: [
      "apollo",
      "practo",
      "tata 1mg",
      "1mg",
      "pharmeasy",
      "netmeds",
      "medplus",
      "dr lal",
      "lal pathlabs",
      "thyrocare",
      "metropolis",
      "manipal",
      "fortis",
      "max healthcare",
      "narayana",
      "aster",
      "pristyn",
      "lenskart",
      "titan eyeplus",
      "lawrence & mayo",
    ],
    generic: [
      "hospital",
      "clinic",
      "pharmacy",
      "medical",
      "diagnostic",
      "dental",
      "dentist",
      "doctor",
      "lab",
      "optics",
      "optical",
      "opticals",
      "optician",
      "eyewear",
      "eye care",
      "spectacles",
    ],
  },
  // 8. Education (debit only)
  {
    category: "Education",
    debitOnly: true,
    brands: [
      "unacademy",
      "byju",
      "coursera",
      "udemy",
      "upgrad",
      "physics wallah",
      "pw",
      "vedantu",
      "nptel",
      "scaler",
      "great learning",
      "linkedin learning",
      "skillshare",
    ],
    generic: [
      "college",
      "university",
      "school",
      "tuition",
      "exam fee",
      "course",
      "coaching",
      "library",
    ],
  },
  // 9. Utilities (debit only)
  {
    category: "Utilities",
    debitOnly: true,
    brands: [
      "reliance jio",
      "jio",
      "airtel",
      "vodafone",
      "vi",
      "bsnl",
      "act fibernet",
      "hathway",
      "excitel",
      "bescom",
      "msedcl",
      "adani electricity",
      "tata power",
      "torrent power",
      "bses",
      "tneb",
      "bwssb",
      "indane",
      "hp gas",
      "bharat gas",
      "mahanagar gas",
      "igl",
      "tata play",
      "dish tv",
      "sun direct",
      "d2h",
    ],
    generic: [
      "electricity",
      "water bill",
      "gas bill",
      "broadband",
      "recharge",
      "postpaid",
      "prepaid",
      "dth",
    ],
  },
  // 10. Transport (debit only)
  {
    category: "Transport",
    debitOnly: true,
    brands: [
      "uber",
      "ola",
      "rapido",
      "namma yatri",
      "blusmart",
      "redbus",
      "abhibus",
      "irctc",
      "ksrtc",
      "bmtc",
      "bmrcl",
      "namma metro",
      "dmrc",
      "metro card",
      "fastag",
      "nhai",
      "indian oil",
      "iocl",
      "hpcl",
      "bpcl",
      "shell",
      "nayara",
      "indigo",
      "air india",
      "akasa",
      "spicejet",
      "vistara",
      "makemytrip",
      "goibibo",
      "cleartrip",
      "ixigo",
      "yatra",
      "easemytrip",
      "parkplus",
      "yulu",
      "bounce",
      "zoomcar",
    ],
    generic: ["petrol", "diesel", "fuel", "parking", "toll"],
  },
  // 11. Food & Dining (debit only)
  {
    category: "Food & Dining",
    debitOnly: true,
    brands: [
      "swiggy",
      "zomato",
      "zepto",
      "blinkit",
      "instamart",
      "bigbasket",
      "dunzo",
      "dmart",
      "avenue supermarts",
      "reliance fresh",
      "reliance smart",
      "more retail",
      "nature's basket",
      "licious",
      "freshtohome",
      "eatsure",
      "faasos",
      "behrouz",
      "box8",
      "domino",
      "dominos",
      "mcdonald",
      "mcdonalds",
      "kfc",
      "pizza hut",
      "burger king",
      "subway",
      "starbucks",
      "chaayos",
      "third wave",
      "cafe coffee day",
      "ccd",
      "haldiram",
      "barbeque nation",
      "wow momo",
      "theobroma",
      "baskin robbins",
      "amul",
      "dineout",
      "eazydiner",
      "magicpin",
    ],
    generic: [
      "restaurant",
      "cafe",
      "bakery",
      "biryani",
      "dhaba",
      "canteen",
      "mess",
      "tea",
      "chai",
      "juice",
      "pan shop",
      "paan",
    ],
  },
  // 12. Entertainment (debit only)
  {
    category: "Entertainment",
    debitOnly: true,
    brands: [
      "netflix",
      "prime video",
      "hotstar",
      "jiohotstar",
      "sonyliv",
      "zee5",
      "spotify",
      "youtube premium",
      "gaana",
      "jiosaavn",
      "bookmyshow",
      "pvr",
      "inox",
      "steam",
      "playstation",
      "xbox",
      "audible",
      "apple music",
      "dream11",
      "mpl",
    ],
    generic: ["cinema", "movie"],
  },
  // 13. Personal Care (debit only)
  {
    category: "Personal Care",
    debitOnly: true,
    brands: [
      "nykaa",
      "purplle",
      "mamaearth",
      "bombay shaving",
      "man matters",
      "traya",
      "bebodywise",
      "naturals",
      "lakme salon",
      "jawed habib",
      "green trends",
      "cult.fit",
      "curefit",
      "gold's gym",
      "anytime fitness",
    ],
    generic: [
      "salon",
      "spa",
      "barber",
      "gym",
      "fitness",
      "grooming",
      "haircut",
    ],
  },
  // 14. Rent / Housing (debit only)
  {
    category: "Rent / Housing",
    debitOnly: true,
    brands: [
      "nobroker",
      "nobrokerhood",
      "mygate",
      "apnacomplex",
      "housing.com",
      "furlenco",
      "rentomojo",
    ],
    generic: [
      "rent",
      "maintenance",
      "society",
      "landlord",
      "pg",
      "hostel",
      "deposit",
      "brokerage",
    ],
  },
  // 15. Shopping (debit only)
  {
    category: "Shopping",
    debitOnly: true,
    brands: [
      "flipkart",
      "myntra",
      "ajio",
      "meesho",
      "tata cliq",
      "croma",
      "reliance digital",
      "vijay sales",
      "decathlon",
      "ikea",
      "lenskart",
      "pepperfry",
      "urban ladder",
      "zudio",
      "westside",
      "h&m",
      "zara",
      "uniqlo",
      "lifestyle",
      "pantaloons",
      "max fashion",
      "shoppers stop",
      "snitch",
      "bewakoof",
      "souled store",
      "apple store",
      "samsung",
      "xiaomi",
      "oneplus",
      "boat",
      "fabindia",
    ],
    generic: [],
  },
  // 16. Salary (credit only)
  {
    category: "Salary",
    creditOnly: true,
    brands: [
      "siemens",
      "tcs",
      "infosys",
      "wipro",
      "cognizant",
      "accenture",
      "hcl",
      "capgemini",
      "tech mahindra",
    ],
    generic: [
      "salary",
      "payroll",
      "stipend",
      "remuneration",
      "wages",
      "bonus",
      "healthineers",
    ],
  },
  // 17. Freelance Income (credit only)
  {
    category: "Freelance Income",
    creditOnly: true,
    brands: ["upwork", "fiverr", "toptal", "freelancer", "deel"],
    generic: ["consulting", "freelance", "client payment", "honorarium"],
  },
  // 18. Business Income (credit only)
  {
    category: "Business Income",
    creditOnly: true,
    brands: ["razorpay settlement", "stripe payout", "paytm settlement", "cashfree settlement"],
    generic: ["merchant payout", "settlement", "invoice payment", "sales proceeds"],
  },
  // 19. Transfer (both credit & debit)
  {
    category: "Transfer",
    brands: [],
    generic: [
      "self transfer",
      "own account",
      "credit card bill",
      "wallet top up",
      "paytm wallet",
      "atm",
      "cash withdrawal",
    ],
  },
  // 20. Other (fallback)
  {
    category: "Other",
    brands: [],
    generic: [],
  },
]

/**
 * Helper to match keyword on word boundary.
 */
function matchWordBoundary(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  // For keywords containing spaces/dots/hyphens, match word boundary at edges
  const pattern = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i")
  return pattern.test(text)
}

/**
 * Matches rule-based layer against normalized merchant text:
 * - Brand matches return confidence 0.95
 * - Generic keywords return confidence 0.80
 * - Enforces credit-only and debit-only direction guards
 * - Skips ambiguous keywords and sends them to AI (isAmbiguous: true)
 */
export function matchRuleCategory(
  rawText: string,
  type: "credit" | "debit",
  payeeType?: string
): RuleMatchResult | null {
  const normalized = normalizeMerchant(rawText)

  // 1. Check ambiguous list & person payee detection
  if (isAmbiguousMerchant(normalized, payeeType)) {
    return {
      category: "Other",
      confidence: 0,
      isAmbiguous: true,
    }
  }

  // 2. Phase A: Check exact brand keywords first across all categories in priority order (confidence 0.95)
  for (const rule of CATEGORY_RULES_CONFIG) {
    if (rule.creditOnly && type !== "credit") continue
    if (rule.debitOnly && type !== "debit") continue
    if (!isValidCategoryForType(rule.category, type)) continue

    for (const brand of rule.brands) {
      if (matchWordBoundary(normalized, brand)) {
        return {
          category: rule.category,
          confidence: 0.95,
          matchedKeyword: brand,
          isAmbiguous: false,
        }
      }
    }
  }

  // 3. Phase B: Check generic keywords across all categories in priority order (confidence 0.80)
  for (const rule of CATEGORY_RULES_CONFIG) {
    if (rule.creditOnly && type !== "credit") continue
    if (rule.debitOnly && type !== "debit") continue
    if (!isValidCategoryForType(rule.category, type)) continue

    for (const kw of rule.generic) {
      if (matchWordBoundary(normalized, kw)) {
        return {
          category: rule.category,
          confidence: 0.8,
          matchedKeyword: kw,
          isAmbiguous: false,
        }
      }
    }
  }

  return null
}
