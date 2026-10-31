import crypto from "crypto"
import { PAYEE_DETECTOR_CONFIG } from "./payee-detector-config"
import { CATEGORY_RULES_CONFIG, normalizeMerchant } from "./rules-config"

export type PayeeType = "business" | "person" | "unknown"

export interface PayeeDetectionResult {
  payee_type: PayeeType
  confidence: number
  signals: string[]
}

/**
 * Masks any 10-digit phone number or raw phone string to the last 4 digits.
 * Never leaks raw numbers in logs, UI, or Groq prompts.
 * Example: "9876543210" -> "XXXXXX3210"
 */
export function maskPhoneNumber(phone?: string | null): string {
  if (!phone) return ""
  const digits = phone.replace(/\D/g, "")
  if (digits.length >= 10) {
    return `XXXXXX${digits.slice(-4)}`
  }
  if (digits.length > 4) {
    return `${"X".repeat(digits.length - 4)}${digits.slice(-4)}`
  }
  return phone
}

/**
 * Replaces any 10-digit phone numbers in a string with masked variants (XXXXXX1234).
 */
export function maskPhoneNumbersInText(text: string): string {
  if (!text) return ""
  return text.replace(/\b([6-9]\d{9})\b/g, (_match, phone) => maskPhoneNumber(phone))
}

/**
 * Checks if a string looks like a standard human name:
 * - 2 to 3 words
 * - Only alphabetic characters (and space/dots)
 * - Length between 4 and 40 characters
 * - Does not contain business keywords
 */
function isLikelyPersonName(name: string): boolean {
  const trimmed = name.trim().toLowerCase()
  if (!trimmed || trimmed.length < 3 || trimmed.length > 40) return false
  if (/\d/.test(trimmed)) return false

  // Must not have business words
  for (const bw of PAYEE_DETECTOR_CONFIG.businessNameWords) {
    const rx = new RegExp(`\\b${bw}\\b`, "i")
    if (rx.test(trimmed)) return false
  }

  // Must only consist of alphabetic words
  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length < 2 || words.length > 4) return false

  return words.every((w) => /^[a-z]+$/i.test(w) && w.length >= 2)
}

/**
 * Detects whether a payee is a business, person, or unknown.
 * Note: Does NOT claim to know GST, Udyam, or shop registration status.
 */
export function detectPayeeType(params: {
  vpa?: string
  payeeName?: string
  rawText?: string
}): PayeeDetectionResult {
  const { vpa, payeeName, rawText } = params
  const businessSignals: string[] = []
  const personSignals: string[] = []

  const cleanVpa = (vpa || "").trim().toLowerCase()
  const cleanName = (payeeName || "").trim().toLowerCase()
  const cleanRaw = (rawText || "").trim().toLowerCase()

  // 1. Check VPA for business signals
  if (cleanVpa) {
    for (const pattern of PAYEE_DETECTOR_CONFIG.businessVpaPatterns) {
      if (pattern.test(cleanVpa)) {
        businessSignals.push(`VPA pattern: ${pattern.toString()}`)
        break
      }
    }

    // Long alphanumeric ID before @ (e.g. mab.03728198129@axisbank)
    const vpaPrefix = cleanVpa.split("@")[0] || ""
    if (vpaPrefix.length >= 14 && /\d/.test(vpaPrefix) && /[a-z]/.test(vpaPrefix)) {
      businessSignals.push("Long alphanumeric merchant VPA ID")
    }

    // Check VPA for person signals
    for (const pattern of PAYEE_DETECTOR_CONFIG.personVpaPatterns) {
      if (pattern.test(cleanVpa)) {
        personSignals.push(`Person VPA pattern: ${pattern.toString()}`)
        break
      }
    }
  }

  // 2. Check Name and Raw Text for Business Words
  const combinedName = `${cleanName} ${cleanRaw}`
  for (const bw of PAYEE_DETECTOR_CONFIG.businessNameWords) {
    const rx = new RegExp(`\\b${bw}\\b`, "i")
    if (rx.test(combinedName)) {
      businessSignals.push(`Business keyword: "${bw}"`)
      break
    }
  }

  // 3. Check if name matches a known brand
  const normalizedMerchant = normalizeMerchant(cleanName || cleanRaw)
  for (const rule of CATEGORY_RULES_CONFIG) {
    for (const brand of rule.brands) {
      const rx = new RegExp(`\\b${brand}\\b`, "i")
      if (rx.test(normalizedMerchant)) {
        businessSignals.push(`Known brand: "${brand}"`)
        break
      }
    }
    if (businessSignals.some((s) => s.startsWith("Known brand:"))) break
  }

  // 4. Check if Name looks like a human name (and no business words)
  if (cleanName && isLikelyPersonName(cleanName)) {
    personSignals.push(`Human name format: "${cleanName}"`)
  }

  // 5. Conflict Resolution & Confidence Assignment
  const hasBusiness = businessSignals.length > 0
  const hasPerson = personSignals.length > 0

  if (hasBusiness && hasPerson) {
    // Conflict between signals: do not assume certainty
    return {
      payee_type: "unknown",
      confidence: 0.5,
      signals: [...businessSignals, ...personSignals, "Conflict between business and person signals"],
    }
  }

  if (hasBusiness) {
    const confidence = Math.min(0.95, 0.75 + businessSignals.length * 0.1)
    return {
      payee_type: "business",
      confidence,
      signals: businessSignals,
    }
  }

  if (hasPerson) {
    const confidence = Math.min(0.9, 0.75 + personSignals.length * 0.1)
    return {
      payee_type: "person",
      confidence,
      signals: personSignals,
    }
  }

  return {
    payee_type: "unknown",
    confidence: 0.3,
    signals: ["No decisive business or person signals found"],
  }
}

/**
 * Builds a payee key for a transaction:
 * a. normalised VPA (lowercase, trimmed), if present
 * b. else normalised payee name (lowercase, no digits or noise)
 * c. else a hash of the phone number, if only a number is present
 */
export function buildPayeeKey(params: {
  vpa?: string | null
  payeeName?: string | null
  phoneNumber?: string | null
  rawText?: string | null
}): string {
  const { vpa, payeeName, phoneNumber, rawText } = params

  // 1. Normalised VPA (lowercase, trimmed)
  if (vpa) {
    const cleanVpa = vpa.trim().toLowerCase()
    if (cleanVpa.includes("@") && cleanVpa.length > 3) {
      return cleanVpa
    }
  }

  // 2. Normalised payee name
  if (payeeName) {
    const norm = normalizeMerchant(payeeName)
    if (norm && norm.length >= 2) {
      return norm
    }
  }

  // Check if rawText contains a VPA (e.g. towards VPA foo@ybl)
  if (rawText) {
    const vpaMatch = rawText.match(/\b([a-z0-9._\-*]+@[a-z0-9.\-_]+)\b/i)
    if (vpaMatch && vpaMatch[1]) {
      return vpaMatch[1].trim().toLowerCase()
    }
  }

  // 3. Hash of phone number if only a number is present
  if (phoneNumber) {
    const digits = phoneNumber.replace(/\D/g, "")
    if (digits.length >= 10) {
      const hash = crypto.createHash("sha256").update(digits).digest("hex").slice(0, 16)
      return `phone_${hash}`
    }
  }

  // Fallback to normalized rawText or unknown
  if (rawText) {
    const norm = normalizeMerchant(rawText)
    if (norm) return norm.slice(0, 50)
  }

  return "unknown_payee"
}
