import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  ALLOWED_CATEGORIES,
  isValidCategoryForType,
  guardCategoryDirection,
} from "./categories"
import {
  normalizeMerchant,
  matchRuleCategory,
  isAmbiguousMerchant,
  CATEGORY_RULES_CONFIG,
} from "./rules-config"
import {
  detectPayeeType,
  buildPayeeKey,
  maskPhoneNumber,
  maskPhoneNumbersInText,
} from "./payee-detector"
import {
  runCategorizationPipeline,
  clearPipelineCache,
  persistPayeeLearning,
  inMemoryPayeeProfiles,
} from "./pipeline"
import { categorizeWithGroq } from "./groq-categorizer"
import * as aiProvider from "@/lib/ai/provider"

describe("Categorization System", () => {
  beforeEach(() => {
    clearPipelineCache()
    vi.restoreAllMocks()
  })

  // ==========================================
  // PART 1 & 3: CATEGORY VALIDATOR & DIRECTION
  // ==========================================
  describe("Category Direction & Validation Guards", () => {
    it("validates all 17 canonical categories exist", () => {
      expect(ALLOWED_CATEGORIES).toHaveLength(17)
      expect(ALLOWED_CATEGORIES).toContain("Food & Dining")
      expect(ALLOWED_CATEGORIES).toContain("Salary")
      expect(ALLOWED_CATEGORIES).toContain("Transfer")
      expect(ALLOWED_CATEGORIES).toContain("Other")
    })

    it("rejects invalid category names", () => {
      expect(isValidCategoryForType("Groceries", "debit")).toBe(false)
      expect(isValidCategoryForType("Travel", "debit")).toBe(false)
      expect(isValidCategoryForType("RandomCategory", "credit")).toBe(false)
    })

    it("allows credit-only categories strictly on credit", () => {
      expect(isValidCategoryForType("Salary", "credit")).toBe(true)
      expect(isValidCategoryForType("Freelance Income", "credit")).toBe(true)
      expect(isValidCategoryForType("Business Income", "credit")).toBe(true)

      // Must be rejected on debit
      expect(isValidCategoryForType("Salary", "debit")).toBe(false)
      expect(isValidCategoryForType("Freelance Income", "debit")).toBe(false)
      expect(isValidCategoryForType("Business Income", "debit")).toBe(false)
    })

    it("allows expense categories strictly on debit", () => {
      expect(isValidCategoryForType("Food & Dining", "debit")).toBe(true)
      expect(isValidCategoryForType("Transport", "debit")).toBe(true)
      expect(isValidCategoryForType("Shopping", "debit")).toBe(true)
      expect(isValidCategoryForType("Rent / Housing", "debit")).toBe(true)
      expect(isValidCategoryForType("Healthcare", "debit")).toBe(true)

      // Must be rejected on credit
      expect(isValidCategoryForType("Food & Dining", "credit")).toBe(false)
      expect(isValidCategoryForType("Transport", "credit")).toBe(false)
      expect(isValidCategoryForType("Shopping", "credit")).toBe(false)
      expect(isValidCategoryForType("Rent / Housing", "credit")).toBe(false)
    })

    it("allows Transfer and Other on both credit and debit", () => {
      expect(isValidCategoryForType("Transfer", "credit")).toBe(true)
      expect(isValidCategoryForType("Transfer", "debit")).toBe(true)
      expect(isValidCategoryForType("Other", "credit")).toBe(true)
      expect(isValidCategoryForType("Other", "debit")).toBe(true)
    })

    it("guardCategoryDirection falls back to Other on direction mismatch or invalid name", () => {
      expect(guardCategoryDirection("Salary", "debit")).toBe("Other")
      expect(guardCategoryDirection("Food & Dining", "credit")).toBe("Other")
      expect(guardCategoryDirection("InvalidCat", "debit")).toBe("Other")
      expect(guardCategoryDirection("Food & Dining", "debit")).toBe("Food & Dining")
      expect(guardCategoryDirection("Salary", "credit")).toBe("Salary")
    })
  })

  // ==========================================
  // PART 1 & 3: NORMALIZATION & RULE MATCHING (>40 cases across all 17 categories)
  // ==========================================
  describe("Rule Layer & 40+ Cases Across 17 Categories", () => {
    it("normalises UPI handles, POS prefixes, digits, and extra spaces", () => {
      expect(normalizeMerchant("UPI-SWIGGY-swiggy@icici")).toBe("swiggy swiggy")
      expect(normalizeMerchant("POS 1234 BIGBASKET")).toBe("bigbasket")
      expect(normalizeMerchant("PAYTM-CHAAYOS-9876543210@paytm")).toBe("chaayos")
      expect(normalizeMerchant("BILLDESK*ACT FIBERNET")).toBe("act fibernet")
      expect(normalizeMerchant("RAZORPAY*URBAN COMPANY")).toBe("urban company")
      expect(normalizeMerchant("REF:987654321 UTR:112233 ZEPTOMARKET")).toBe("zeptomarket")
    })

    const testCases: Array<{
      narration: string
      type: "credit" | "debit"
      expectedCategory: string
      isBrand?: boolean
    }> = [
      // 1. Food & Dining (Debit)
      { narration: "UPI-SWIGGY-swiggy@icici", type: "debit", expectedCategory: "Food & Dining", isBrand: true },
      { narration: "Zomato Limited Order 5543", type: "debit", expectedCategory: "Food & Dining", isBrand: true },
      { narration: "Zepto Quick Delivery 99", type: "debit", expectedCategory: "Food & Dining", isBrand: true },
      { narration: "Blinkit Commerce Pvt Ltd", type: "debit", expectedCategory: "Food & Dining", isBrand: true },
      { narration: "Bigbasket Supermarket Bangalore", type: "debit", expectedCategory: "Food & Dining", isBrand: true },
      { narration: "McDonalds Restaurant Connaught Place", type: "debit", expectedCategory: "Food & Dining", isBrand: true },
      { narration: "Domino's Pizza Sector 18", type: "debit", expectedCategory: "Food & Dining", isBrand: true },
      { narration: "Starbucks Coffee Mumbai", type: "debit", expectedCategory: "Food & Dining", isBrand: true },
      { narration: "Sharma Dhaba and Food Corner", type: "debit", expectedCategory: "Food & Dining", isBrand: false },
      { narration: "Sai Ram Pan Shop Pan and Chai", type: "debit", expectedCategory: "Food & Dining", isBrand: false },
      { narration: "Swiggy Instamart Grocery", type: "debit", expectedCategory: "Food & Dining", isBrand: true },

      // 2. Transport (Debit)
      { narration: "Uber India Technology", type: "debit", expectedCategory: "Transport", isBrand: true },
      { narration: "Ola Cabs ANI Technologies", type: "debit", expectedCategory: "Transport", isBrand: true },
      { narration: "Rapido Bike Taxi", type: "debit", expectedCategory: "Transport", isBrand: true },
      { narration: "IRCTC Train Booking E-ticket", type: "debit", expectedCategory: "Transport", isBrand: true },
      { narration: "Indian Oil Petrol Pump HPCL", type: "debit", expectedCategory: "Transport", isBrand: true },
      { narration: "FASTag Toll Plaza Bangalore", type: "debit", expectedCategory: "Transport", isBrand: true },
      { narration: "Indigo Airlines 6E Flights", type: "debit", expectedCategory: "Transport", isBrand: true },

      // 3. Utilities (Debit)
      { narration: "Reliance Jio Infocomm Mobile", type: "debit", expectedCategory: "Utilities", isBrand: true },
      { narration: "Airtel Prepaid Recharge", type: "debit", expectedCategory: "Utilities", isBrand: true },
      { narration: "BESCOM Electricity Bill Pay", type: "debit", expectedCategory: "Utilities", isBrand: true },
      { narration: "Tata Power Mumbai Electric", type: "debit", expectedCategory: "Utilities", isBrand: true },
      { narration: "Indane Gas Agency Cylinder", type: "debit", expectedCategory: "Utilities", isBrand: true },

      // 4. Healthcare (Debit)
      { narration: "Apollo Pharmacy Medical Store", type: "debit", expectedCategory: "Healthcare", isBrand: true },
      { narration: "Practo Consult Doctor Online", type: "debit", expectedCategory: "Healthcare", isBrand: true },
      { narration: "Tata 1mg Healthcare Solutions", type: "debit", expectedCategory: "Healthcare", isBrand: true },
      { narration: "Manipal Hospital OPD Billing", type: "debit", expectedCategory: "Healthcare", isBrand: true },
      { narration: "City Dental Clinic Root Canal", type: "debit", expectedCategory: "Healthcare", isBrand: false },

      // 5. Entertainment (Debit)
      { narration: "Netflix Monthly Subscription", type: "debit", expectedCategory: "Entertainment", isBrand: true },
      { narration: "Hotstar Disney VIP Plan", type: "debit", expectedCategory: "Entertainment", isBrand: true },
      { narration: "Spotify Premium Music", type: "debit", expectedCategory: "Entertainment", isBrand: true },
      { narration: "BookMyShow Movie Tickets PVR", type: "debit", expectedCategory: "Entertainment", isBrand: true },

      // 6. Shopping (Debit)
      { narration: "Flipkart Internet Pvt Ltd", type: "debit", expectedCategory: "Shopping", isBrand: true },
      { narration: "Myntra Designs Fashion", type: "debit", expectedCategory: "Shopping", isBrand: true },
      { narration: "Ajio Reliance Retail App", type: "debit", expectedCategory: "Shopping", isBrand: true },
      { narration: "Decathlon Sports India", type: "debit", expectedCategory: "Shopping", isBrand: true },
      { narration: "Croma Retail Electronics", type: "debit", expectedCategory: "Shopping", isBrand: true },

      // 7. Education (Debit)
      { narration: "Unacademy Subscription Course", type: "debit", expectedCategory: "Education", isBrand: true },
      { narration: "Coursera Inc Learning", type: "debit", expectedCategory: "Education", isBrand: true },
      { narration: "Delhi Public School Tuition Fee", type: "debit", expectedCategory: "Education", isBrand: false },

      // 8. Insurance (Debit)
      { narration: "LIC Premium Collection", type: "debit", expectedCategory: "Insurance", isBrand: true },
      { narration: "Star Health Allied Insurance", type: "debit", expectedCategory: "Insurance", isBrand: true },
      { narration: "Acko General Insurance", type: "debit", expectedCategory: "Insurance", isBrand: true },

      // 9. Investments (Debit)
      { narration: "Zerodha Broking Limited", type: "debit", expectedCategory: "Investments", isBrand: true },
      { narration: "Groww Mutual Fund SIP", type: "debit", expectedCategory: "Investments", isBrand: true },
      { narration: "HDFC Securities Demat Account", type: "debit", expectedCategory: "Investments", isBrand: true },

      // 10. EMI / Loans (Debit)
      { narration: "Bajaj Finance Loan EMI Debit", type: "debit", expectedCategory: "EMI / Loans", isBrand: true },
      { narration: "HDFC Loan ECS Payment", type: "debit", expectedCategory: "EMI / Loans", isBrand: true },
      { narration: "Kreditbee Loan Repayment", type: "debit", expectedCategory: "EMI / Loans", isBrand: true },

      // 11. Personal Care (Debit)
      { narration: "Nykaa E-retail Cosmetics", type: "debit", expectedCategory: "Personal Care", isBrand: true },
      { narration: "Cult.fit Fitness Curefit", type: "debit", expectedCategory: "Personal Care", isBrand: true },
      { narration: "Naturals Salon and Spa", type: "debit", expectedCategory: "Personal Care", isBrand: true },

      // 12. Rent / Housing (Debit)
      { narration: "NoBroker Rent Payment Society", type: "debit", expectedCategory: "Rent / Housing", isBrand: true },
      { narration: "MyGate Society Maintenance Bill", type: "debit", expectedCategory: "Rent / Housing", isBrand: true },

      // 13. Transfer (Debit / Credit)
      { narration: "Self Transfer to savings account", type: "debit", expectedCategory: "Transfer", isBrand: false },
      { narration: "Credit Card Bill payment", type: "debit", expectedCategory: "Transfer", isBrand: false },
      { narration: "ATM Cash Withdrawal", type: "debit", expectedCategory: "Transfer", isBrand: false },

      // 14. Salary (Credit only)
      { narration: "Monthly Salary Credit Acme Corp", type: "credit", expectedCategory: "Salary", isBrand: false },
      { narration: "Payroll Transfer For October", type: "credit", expectedCategory: "Salary", isBrand: false },

      // 15. Freelance Income (Credit only)
      { narration: "Upwork Global Escrow Payout", type: "credit", expectedCategory: "Freelance Income", isBrand: true },
      { narration: "Fiverr International Freelancer", type: "credit", expectedCategory: "Freelance Income", isBrand: true },

      // 16. Business Income (Credit only)
      { narration: "Razorpay Settlement Payout", type: "credit", expectedCategory: "Business Income", isBrand: true },
      { narration: "Stripe Payout for Invoice 101", type: "credit", expectedCategory: "Business Income", isBrand: true },
    ]

    for (const tc of testCases) {
      it(`matches "${tc.narration}" -> ${tc.expectedCategory} (${tc.type})`, () => {
        const res = matchRuleCategory(tc.narration, tc.type)
        expect(res).not.toBeNull()
        expect(res?.category).toBe(tc.expectedCategory)
        if (tc.isBrand) {
          expect(res?.confidence).toBe(0.95)
        } else if (res?.matchedKeyword) {
          expect(res?.confidence).toBe(0.8)
        }
      })
    }
  })

  // ==========================================
  // EDGE CASES FROM PART 3
  // ==========================================
  describe("Edge cases specified in Prompt", () => {
    it('"UPI-AMAZON PAY-..." must go to AI (flagged as ambiguous)', () => {
      const res = matchRuleCategory("UPI-AMAZON PAY-ORDER123", "debit")
      expect(res?.isAmbiguous).toBe(true)
    })

    it('"SALARY CREDIT" as debit must NOT become Salary', () => {
      const res = matchRuleCategory("SALARY CREDIT ADVANCE", "debit")
      expect(res?.category).not.toBe("Salary")
    })

    it('"Swiggy Instamart" categorizes as Food & Dining', () => {
      const res = matchRuleCategory("Swiggy Instamart Quick", "debit")
      expect(res?.category).toBe("Food & Dining")
    })

    it('"Uber" vs "Uber Eats": Uber matches Transport, Uber Eats is ambiguous', () => {
      const uber = matchRuleCategory("Uber Trip Bangalore", "debit")
      expect(uber?.category).toBe("Transport")
      expect(uber?.confidence).toBe(0.95)

      const uberEats = matchRuleCategory("Uber Eats Order", "debit")
      expect(uberEats?.isAmbiguous).toBe(true)
    })

    it('"IRCTC" categorizes as Transport', () => {
      const res = matchRuleCategory("IRCTC Train Booking", "debit")
      expect(res?.category).toBe("Transport")
    })
  })

  // ==========================================
  // PART 4: PAYEE DETECTOR & PAYEE KEY
  // ==========================================
  describe("Payee Detection & Privacy Guards", () => {
    it("detects paytmqr...@paytm as business", () => {
      const res = detectPayeeType({ vpa: "paytmqr2810050501011@paytm" })
      expect(res.payee_type).toBe("business")
      expect(res.confidence).toBeGreaterThanOrEqual(0.75)
    })

    it("detects q12345678@ybl as business", () => {
      const res = detectPayeeType({ vpa: "q12345678@ybl" })
      expect(res.payee_type).toBe("business")
    })

    it("detects 9876543210@ybl as person", () => {
      const res = detectPayeeType({ vpa: "9876543210@ybl" })
      expect(res.payee_type).toBe("person")
    })

    it('detects "Sri Ganesh Provision Store" as business', () => {
      const res = detectPayeeType({ payeeName: "Sri Ganesh Provision Store" })
      expect(res.payee_type).toBe("business")
    })

    it('detects "Ramesh Kumar" as person', () => {
      const res = detectPayeeType({ payeeName: "Ramesh Kumar" })
      expect(res.payee_type).toBe("person")
    })

    it("detects weak or conflicting signals as unknown", () => {
      // Conflict: bare phone number VPA but commercial store name
      const res = detectPayeeType({
        vpa: "9876543210@ybl",
        payeeName: "Gupta Electricals Store",
      })
      expect(res.payee_type).toBe("unknown")
    })

    it("masks phone numbers to the last 4 digits everywhere", () => {
      expect(maskPhoneNumber("9876543210")).toBe("XXXXXX3210")
      expect(maskPhoneNumbersInText("Paid 500 to 9876543210 on UPI")).toBe(
        "Paid 500 to XXXXXX3210 on UPI"
      )
    })

    it("builds payee key in correct priority order", () => {
      // 1. VPA priority
      expect(buildPayeeKey({ vpa: "shop@okaxis", payeeName: "Shop Name" })).toBe("shop@okaxis")
      // 2. Payee name if no VPA
      expect(buildPayeeKey({ payeeName: "Swiggy Delivery" })).toBe("swiggy delivery")
      // 3. Phone hash if only phone
      const phoneKey = buildPayeeKey({ phoneNumber: "9876543210" })
      expect(phoneKey).toMatch(/^phone_[a-f0-9]{16}$/)
    })
  })

  // ==========================================
  // PART 5 & 7: LEARNING, GROQ, AND HISTORY TESTS
  // ==========================================
  describe("Payee Learning & Pipeline Logic", () => {
    it("paying the same shop VPA three times: first uses Groq/fallback, third comes from history with no Groq call", async () => {
      const vpa = "localchaishop@okaxis"
      const userId = "user123"

      // Mock Groq AI call for first time
      vi.spyOn(aiProvider, "aiGenerate").mockResolvedValueOnce(
        JSON.stringify({
          merchant_clean: "Local Chai Shop",
          category: "Food & Dining",
          confidence: 0.9,
          source: "knowledge",
          payee_type: "business",
          reason: "Tea shop",
        })
      )

      // Txn 1: First call -> Uses Groq AI
      const res1 = await runCategorizationPipeline({
        userId,
        merchant: "Chai Shop",
        rawText: "Chai Shop",
        vpa,
        amountRupees: 20,
        type: "debit",
      })
      expect(res1.category).toBe("Food & Dining")
      expect(res1.source).toBe("ai")

      // Txn 2: Second call -> Already has 1 count, records second count
      const res2 = await runCategorizationPipeline({
        userId,
        merchant: "Chai Shop",
        rawText: "Chai Shop",
        vpa,
        amountRupees: 25,
        type: "debit",
      })
      expect(res2.category).toBe("Food & Dining")

      // Clear memory cache to ensure Step 2 (Learned History) is queried, not memory cache
      clearPipelineCache()
      // Re-populate learned profile into inMemoryPayeeProfiles
      const profileKey = `${userId}:${vpa}:debit`
      inMemoryPayeeProfiles.set(profileKey, {
        payeeKey: vpa,
        direction: "debit",
        displayName: "Local Chai Shop",
        payeeType: "business",
        categoryCounts: { "Food & Dining": 2 },
        txnCount: 2,
        locked: false,
      })

      const groqSpy = vi.spyOn(aiProvider, "aiGenerate")
      groqSpy.mockClear()

      // Txn 3: Third call -> txnCount >= 2 and 100% Food & Dining -> Must come from learned_history!
      const res3 = await runCategorizationPipeline({
        userId,
        merchant: "Chai Shop",
        rawText: "Chai Shop",
        vpa,
        amountRupees: 30,
        type: "debit",
      })

      expect(res3.category).toBe("Food & Dining")
      expect(res3.source).toBe("learned_history")
      expect(res3.confidence).toBe(0.9)
      // Must NOT have called Groq!
      expect(groqSpy).not.toHaveBeenCalled()
    })

    it("user corrects a payee to Healthcare: user confirmed category locks and later AI cannot override it", async () => {
      const vpa = "genericstore@okaxis"
      const userId = "user_hc"

      // User confirms rule
      await persistPayeeLearning({
        userId,
        payeeKey: vpa,
        direction: "debit",
        category: "Healthcare",
        confidence: 1.0,
        displayName: "Generic Store",
        payeeType: "business",
        userConfirmed: true,
      })

      // Next transaction comes in
      const res = await runCategorizationPipeline({
        userId,
        merchant: "Generic Store",
        rawText: "Generic Store order",
        vpa,
        amountRupees: 500,
        type: "debit",
      })

      expect(res.category).toBe("Healthcare")
      expect(res.source).toBe("user_confirmed")
      expect(res.confidence).toBe(1.0)
    })

    it("same person as debit (Transfer) and credit (Freelance Income): stored under separate keys", async () => {
      const vpa = "alex.designer@okaxis"
      const userId = "user_dual"

      // Learn debit as Transfer (2 txns to satisfy txnCount >= 2)
      await persistPayeeLearning({
        userId,
        payeeKey: vpa,
        direction: "debit",
        category: "Transfer",
        confidence: 0.9,
        displayName: "Alex",
        payeeType: "person",
      })
      await persistPayeeLearning({
        userId,
        payeeKey: vpa,
        direction: "debit",
        category: "Transfer",
        confidence: 0.9,
        displayName: "Alex",
        payeeType: "person",
      })

      // Learn credit as Freelance Income (2 txns to satisfy txnCount >= 2)
      await persistPayeeLearning({
        userId,
        payeeKey: vpa,
        direction: "credit",
        category: "Freelance Income",
        confidence: 0.95,
        displayName: "Alex",
        payeeType: "person",
      })
      await persistPayeeLearning({
        userId,
        payeeKey: vpa,
        direction: "credit",
        category: "Freelance Income",
        confidence: 0.95,
        displayName: "Alex",
        payeeType: "person",
      })

      // Verify debit lookup
      const debitTx = await runCategorizationPipeline({
        userId,
        merchant: "Alex",
        rawText: "Alex payment",
        vpa,
        amountRupees: 1000,
        type: "debit",
      })

      // Verify credit lookup
      const creditTx = await runCategorizationPipeline({
        userId,
        merchant: "Alex",
        rawText: "Alex payment received",
        vpa,
        amountRupees: 10000,
        type: "credit",
      })

      expect(debitTx.category).toBe("Transfer")
      expect(creditTx.category).toBe("Freelance Income")
    })

    it("payee with 50/50 split history goes to Groq and is flagged as mixed", async () => {
      const vpa = "multi.shop@okaxis"
      const userId = "user_split"

      const profileKey = `${userId}:${vpa}:debit`
      inMemoryPayeeProfiles.set(profileKey, {
        payeeKey: vpa,
        direction: "debit",
        displayName: "Multi Shop",
        payeeType: "business",
        categoryCounts: {
          "Food & Dining": 1,
          Shopping: 1,
        },
        txnCount: 2,
        locked: false,
      })

      vi.spyOn(aiProvider, "aiGenerate").mockResolvedValueOnce(
        JSON.stringify({
          merchant_clean: "Multi Shop",
          category: "Shopping",
          confidence: 0.85,
          source: "knowledge",
          payee_type: "business",
          reason: "Clothes retail",
        })
      )

      const res = await runCategorizationPipeline({
        userId,
        merchant: "Multi Shop",
        rawText: "Multi Shop payment",
        vpa,
        amountRupees: 400,
        type: "debit",
      })

      expect(res.isMixedHistory).toBe(true)
      expect(res.source).toBe("ai")
    })

    it("gateway payee (Amazon Pay) never auto-learns without user confirmation", async () => {
      const vpa = "amazonpay@icici"
      const userId = "user_gw"

      // Attempt to auto-persist learning without user confirmation
      await persistPayeeLearning({
        userId,
        payeeKey: vpa,
        direction: "debit",
        category: "Shopping",
        confidence: 0.9,
        displayName: "Amazon Pay",
        payeeType: "business",
        userConfirmed: false,
      })

      const profileKey = `${userId}:${vpa}:debit`
      // Must not have stored learning
      expect(inMemoryPayeeProfiles.has(profileKey)).toBe(false)
    })

    it("direction guard: history says Salary, new transaction is debit -> must NOT return Salary", async () => {
      const vpa = "company@okaxis"
      const userId = "user_sal_guard"

      const profileKey = `${userId}:${vpa}:debit`
      inMemoryPayeeProfiles.set(profileKey, {
        payeeKey: vpa,
        direction: "debit",
        displayName: "Company",
        payeeType: "business",
        categoryCounts: { Salary: 5 },
        txnCount: 5,
        locked: false,
      })

      // Even if history mistakenly has Salary, a debit can NEVER return Salary
      const res = await runCategorizationPipeline({
        userId,
        merchant: "Company",
        rawText: "Company payment",
        vpa,
        amountRupees: 500,
        type: "debit",
        forceSkipGroq: true,
      })

      expect(res.category).not.toBe("Salary")
      expect(isValidCategoryForType(res.category, "debit")).toBe(true)
    })
  })
})
