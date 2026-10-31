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
  "Freelance Income",
  "Business Income",
  "Transfer",
  "Other",
] as const

export type Category = (typeof ALLOWED_CATEGORIES)[number]

export const CREDIT_ONLY_CATEGORIES: ReadonlySet<Category> = new Set([
  "Salary",
  "Freelance Income",
  "Business Income",
])

export const DEBIT_ONLY_CATEGORIES: ReadonlySet<Category> = new Set([
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
])

export const DUAL_DIRECTION_CATEGORIES: ReadonlySet<Category> = new Set([
  "Transfer",
  "Other",
])

/**
 * Validates whether a category is valid for the transaction type (credit or debit).
 * Income categories (Salary, Freelance Income, Business Income) are ONLY valid for credit.
 * Expense categories are ONLY valid for debit.
 * Transfer and Other can be either.
 */
export function isValidCategoryForType(category: string, type: "credit" | "debit"): boolean {
  if (!ALLOWED_CATEGORIES.includes(category as Category)) return false
  const cat = category as Category
  if (type === "credit") {
    return CREDIT_ONLY_CATEGORIES.has(cat) || DUAL_DIRECTION_CATEGORIES.has(cat)
  }
  return DEBIT_ONLY_CATEGORIES.has(cat) || DUAL_DIRECTION_CATEGORIES.has(cat)
}

/**
 * Normalizes and guards category assignment against direction rules.
 * If invalid or direction mismatched, safely returns "Other".
 */
export function guardCategoryDirection(category: string | undefined | null, type: "credit" | "debit"): Category {
  if (!category) return "Other"
  const trimmed = category.trim()
  const matched = ALLOWED_CATEGORIES.find(
    (c) => c.toLowerCase() === trimmed.toLowerCase()
  )
  if (!matched) return "Other"
  if (isValidCategoryForType(matched, type)) {
    return matched
  }
  return "Other"
}
