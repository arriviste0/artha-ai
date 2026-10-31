import mongoose from "mongoose"
import {
  type Category,
  ALLOWED_CATEGORIES,
  isValidCategoryForType,
  guardCategoryDirection,
} from "./categories"
import {
  normalizeMerchant,
  matchRuleCategory,
  isAmbiguousMerchant,
} from "./rules-config"
import {
  detectPayeeType,
  buildPayeeKey,
  type PayeeType,
  type PayeeDetectionResult,
} from "./payee-detector"
import {
  categorizeWithGroq,
  type PayeeHistoryItem,
} from "./groq-categorizer"
import PayeeProfile, { type IPayeeProfile } from "@/models/payee-profile"

export interface PipelineInput {
  userId?: string
  merchant: string
  rawText: string
  amountRupees: number
  type: "credit" | "debit"
  vpa?: string
  payeeName?: string
  phoneNumber?: string
  occurredAt?: Date
  forceSkipGroq?: boolean // useful for pure-rule or pure-history testing
}

export interface PipelineOutput {
  category: Category
  confidence: number
  source: "user_confirmed" | "learned_history" | "rule" | "ai" | "fallback"
  merchantClean: string
  payeeKey: string
  payeeType: PayeeType
  isFirstTimePayee: boolean
  isMixedHistory: boolean
  userConfirmationNeeded: boolean
  reason?: string
}

// In-memory cache by cacheKey so runtime avoids duplicate AI calls
const memoryCache = new Map<string, PipelineOutput>()

// Test in-memory payee profiles store (used when MongoDB is not connected or in tests)
export const inMemoryPayeeProfiles = new Map<string, Partial<IPayeeProfile>>()

export function clearPipelineCache(): void {
  memoryCache.clear()
  inMemoryPayeeProfiles.clear()
}

/**
 * Gateways that must NEVER auto-learn without explicit user confirmation.
 */
const GATEWAY_PAYEES = new Set([
  "amazon pay",
  "paytm",
  "phonepe",
  "google pay",
  "gpay",
  "razorpay",
  "billdesk",
  "cred",
])

function isGatewayPayee(payeeKey: string, merchant: string): boolean {
  const normKey = payeeKey.toLowerCase()
  const normMerch = merchant.toLowerCase()
  for (const gw of GATEWAY_PAYEES) {
    if (normKey.includes(gw) || normMerch.includes(gw)) {
      return true
    }
  }
  return false
}

function getCategoryCounts(counts: unknown): Record<string, number> {
  if (!counts) return {}
  if (counts instanceof Map) {
    return Object.fromEntries(counts.entries())
  }
  if (typeof counts === "object") {
    return counts as Record<string, number>
  }
  return {}
}

/**
 * Loads or initializes a PayeeProfile for (userId, payeeKey, direction).
 */
async function loadPayeeProfile(
  userId: string | undefined,
  payeeKey: string,
  direction: "credit" | "debit"
): Promise<Partial<IPayeeProfile> | null> {
  const profileKey = `${userId || "anon"}:${payeeKey}:${direction}`

  // 1. Check in-memory store
  if (inMemoryPayeeProfiles.has(profileKey)) {
    return inMemoryPayeeProfiles.get(profileKey)!
  }

  // 2. Check MongoDB if connected
  if (mongoose.connection.readyState === 1 && userId && mongoose.Types.ObjectId.isValid(userId)) {
    try {
      const doc = await PayeeProfile.findOne({
        userId: new mongoose.Types.ObjectId(userId),
        payeeKey,
        direction,
      }).lean()
      if (doc) {
        return doc as unknown as Partial<IPayeeProfile>
      }
    } catch {
      // fallback to memory
    }
  }

  return null
}

/**
 * Updates or persists learned transaction history for a PayeeProfile.
 */
export async function persistPayeeLearning(params: {
  userId?: string
  payeeKey: string
  direction: "credit" | "debit"
  category: Category
  confidence: number
  displayName: string
  payeeType: PayeeType
  userConfirmed?: boolean
}): Promise<void> {
  const {
    userId,
    payeeKey,
    direction,
    category,
    confidence,
    displayName,
    payeeType,
    userConfirmed = false,
  } = params

  // Safety rule: never learn from "Other", from confidence < 0.8,
  // or from gateway-only payees unless user explicitly confirmed
  if (!userConfirmed) {
    if (category === "Other" || confidence < 0.8) return
    if (isGatewayPayee(payeeKey, displayName)) return
  }

  const profileKey = `${userId || "anon"}:${payeeKey}:${direction}`
  const existing = (await loadPayeeProfile(userId, payeeKey, direction)) || {
    userId: userId && mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : undefined,
    payeeKey,
    direction,
    displayName,
    payeeType,
    categoryCounts: {},
    txnCount: 0,
    locked: false,
    userConfirmedCategory: null,
  }

  // Increment counts
  const counts = { ...getCategoryCounts(existing.categoryCounts) }
  counts[category] = (counts[category] || 0) + 1

  existing.categoryCounts = counts
  existing.lastCategory = category
  existing.lastSeen = new Date()
  existing.txnCount = (existing.txnCount || 0) + 1
  existing.displayName = displayName || existing.displayName || payeeKey
  existing.payeeType = payeeType

  if (userConfirmed) {
    existing.userConfirmedCategory = category
    existing.locked = true
  }

  // Save to in-memory store
  inMemoryPayeeProfiles.set(profileKey, existing)

  // Persist to MongoDB if connected
  if (mongoose.connection.readyState === 1 && userId && mongoose.Types.ObjectId.isValid(userId)) {
    try {
      const updateDoc: Record<string, unknown> = {
        displayName: existing.displayName,
        payeeType: existing.payeeType,
        categoryCounts: counts,
        lastCategory: category,
        lastSeen: new Date(),
        $inc: { txnCount: 1 },
      }
      if (userConfirmed) {
        updateDoc.userConfirmedCategory = category
        updateDoc.locked = true
      }

      await PayeeProfile.findOneAndUpdate(
        {
          userId: new mongoose.Types.ObjectId(userId),
          payeeKey,
          direction,
        },
        updateDoc,
        { upsert: true, new: true }
      )
    } catch {
      // ignore Mongo errors
    }
  }
}

/**
 * Master Transaction Categorization Pipeline:
 *
 * 1. User-confirmed rule: if user_confirmed_category exists for this
 *    payee_key + direction, use it. Confidence 1.0. Stop.
 * 2. Learned history: if the payee has txn_count >= 2 and one
 *    category accounts for >= 80% of its history, and it is not on
 *    the AMBIGUOUS gateway list, use that category. Confidence 0.9.
 *    Stop.
 * 3. Brand rules from the rule layer (exact brand match = 0.95, generic = 0.8).
 * 4. Groq, with payee history passed as context.
 * 5. Fallback "Other".
 *
 * Always validates final category against allowed list and direction rules.
 */
export async function runCategorizationPipeline(
  input: PipelineInput
): Promise<PipelineOutput> {
  const {
    userId,
    merchant,
    rawText,
    amountRupees,
    type,
    vpa,
    payeeName,
    phoneNumber,
    forceSkipGroq,
  } = input

  // 1. Build payee key and detect payee type
  const payeeKey = buildPayeeKey({
    vpa,
    payeeName: payeeName || merchant,
    phoneNumber,
    rawText,
  })

  const detection: PayeeDetectionResult = detectPayeeType({
    vpa,
    payeeName: payeeName || merchant,
    rawText,
  })

  const normalizedMerchant = normalizeMerchant(merchant || payeeName || rawText)
  const cacheKey = `${userId || "anon"}:${payeeKey}:${type}:${normalizedMerchant}`

  // Check cache
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey)!
  }

  // Load Payee Profile
  const profile = await loadPayeeProfile(userId, payeeKey, type)
  const isFirstTimePayee = !profile || (profile.txnCount || 0) === 0
  let isMixedHistory = false

  // PIPELINE STEP 1: User-confirmed rule
  if (profile && profile.userConfirmedCategory) {
    const valid = guardCategoryDirection(profile.userConfirmedCategory, type)
    if (valid !== "Other" || profile.userConfirmedCategory.toLowerCase() === "other") {
      const result: PipelineOutput = {
        category: valid,
        confidence: 1.0,
        source: "user_confirmed",
        merchantClean: profile.displayName || merchant || "Transaction",
        payeeKey,
        payeeType: profile.payeeType || detection.payee_type,
        isFirstTimePayee: false,
        isMixedHistory: false,
        userConfirmationNeeded: false,
        reason: "User confirmed rule",
      }
      memoryCache.set(cacheKey, result)
      return result
    }
  }

  // PIPELINE STEP 2: Learned history
  if (profile && (profile.txnCount || 0) >= 2 && !isGatewayPayee(payeeKey, merchant)) {
    const counts = getCategoryCounts(profile.categoryCounts)
    const totalTxns = profile.txnCount || 0

    let topCategory: string | null = null
    let topCount = 0

    for (const [cat, count] of Object.entries(counts)) {
      if (count > topCount) {
        topCount = count
        topCategory = cat
      }
    }

    if (topCategory && topCount / totalTxns >= 0.8) {
      // Guard against direction mismatch (e.g. history says Salary, but new txn is debit)
      const valid = guardCategoryDirection(topCategory, type)
      if (valid !== "Other" || topCategory.toLowerCase() === "other") {
        const result: PipelineOutput = {
          category: valid,
          confidence: 0.9,
          source: "learned_history",
          merchantClean: profile.displayName || merchant || "Transaction",
          payeeKey,
          payeeType: profile.payeeType || detection.payee_type,
          isFirstTimePayee: false,
          isMixedHistory: false,
          userConfirmationNeeded: !profile.locked,
          reason: `Learned from ${topCount}/${totalTxns} past transactions`,
        }
        memoryCache.set(cacheKey, result)
        // Record learned count
        await persistPayeeLearning({
          userId,
          payeeKey,
          direction: type,
          category: valid,
          confidence: 0.9,
          displayName: result.merchantClean,
          payeeType: result.payeeType,
        })
        return result
      }
    } else {
      isMixedHistory = true
    }
  }

  // PIPELINE STEP 3: Brand & Rule layer
  // Try specific merchant first, then raw text if not matched
  let ruleResult = merchant ? matchRuleCategory(merchant, type, detection.payee_type) : null
  if (!ruleResult || ruleResult.isAmbiguous || ruleResult.confidence < 0.8) {
    const rawResult = matchRuleCategory(rawText || merchant, type, detection.payee_type)
    if (rawResult && !rawResult.isAmbiguous && rawResult.confidence >= 0.8) {
      ruleResult = rawResult
    }
  }
  if (ruleResult && !ruleResult.isAmbiguous && ruleResult.confidence >= 0.8) {
    const valid = guardCategoryDirection(ruleResult.category, type)
    if (valid !== "Other" || ruleResult.category.toLowerCase() === "other") {
      const result: PipelineOutput = {
        category: valid,
        confidence: ruleResult.confidence,
        source: "rule",
        merchantClean: ruleResult.matchedKeyword || merchant || "Transaction",
        payeeKey,
        payeeType: detection.payee_type,
        isFirstTimePayee,
        isMixedHistory,
        userConfirmationNeeded: true,
        reason: `Matched brand rule: ${ruleResult.matchedKeyword}`,
      }
      memoryCache.set(cacheKey, result)

      // Learn if confidence >= 0.8 and not gateway
      await persistPayeeLearning({
        userId,
        payeeKey,
        direction: type,
        category: valid,
        confidence: ruleResult.confidence,
        displayName: result.merchantClean,
        payeeType: detection.payee_type,
      })

      return result
    }
  }

  // If forceSkipGroq is enabled (e.g. in offline unit tests)
  if (forceSkipGroq) {
    const fallbackCategory: Category = type === "credit" ? "Transfer" : "Other"
    return {
      category: fallbackCategory,
      confidence: 0.4,
      source: "fallback",
      merchantClean: merchant || "Transaction",
      payeeKey,
      payeeType: detection.payee_type,
      isFirstTimePayee,
      isMixedHistory,
      userConfirmationNeeded: true,
      reason: "Groq skipped, returned default",
    }
  }

  // PIPELINE STEP 4: Groq AI with Payee History context
  const payeeHistoryItems: PayeeHistoryItem[] = []
  if (profile && profile.categoryCounts) {
    const counts = profile.categoryCounts as Record<string, number>
    for (const [cat, count] of Object.entries(counts)) {
      payeeHistoryItems.push({
        category: cat,
        count,
        last_seen: profile.lastSeen
          ? new Date(profile.lastSeen).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0],
        user_confirmed: profile.userConfirmedCategory === cat,
      })
    }
  }

  const aiResult = await categorizeWithGroq({
    merchant,
    raw: rawText,
    amount: amountRupees,
    type,
    payee_type_hint: detection.payee_type,
    payee_history: payeeHistoryItems,
  })

  const validAiCategory = guardCategoryDirection(aiResult.category, type)
  const result: PipelineOutput = {
    category: validAiCategory,
    confidence: aiResult.confidence,
    source: "ai",
    merchantClean: aiResult.merchant_clean || merchant || "Transaction",
    payeeKey,
    payeeType: aiResult.payee_type || detection.payee_type,
    isFirstTimePayee,
    isMixedHistory,
    userConfirmationNeeded: true,
    reason: aiResult.reason,
  }

  memoryCache.set(cacheKey, result)

  // Learn if confidence >= 0.8
  if (validAiCategory !== "Other" && aiResult.confidence >= 0.8) {
    await persistPayeeLearning({
      userId,
      payeeKey,
      direction: type,
      category: validAiCategory,
      confidence: aiResult.confidence,
      displayName: result.merchantClean,
      payeeType: result.payeeType,
    })
  }

  return result
}
