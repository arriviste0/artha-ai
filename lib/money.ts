/** All monetary values are stored as integer paise (₹1 = 100 paise). Never use floats. */

export function rupeesToPaise(rupees: number): number {
  if (!Number.isFinite(rupees)) throw new Error(`Invalid rupee amount: ${rupees}`)
  return Math.round(rupees * 100)
}

export function paiseToRupees(paise: number): number {
  if (!Number.isInteger(paise)) throw new Error(`Paise must be an integer, got: ${paise}`)
  return paise / 100
}

const INR_FORMATTER = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const INR_FORMATTER_COMPACT = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
})

export function formatINR(paise: number, compact = false): string {
  const rupees = paiseToRupees(paise)
  return compact ? INR_FORMATTER_COMPACT.format(rupees) : INR_FORMATTER.format(rupees)
}

/** Safe addition/subtraction in paise — avoids floating point drift */
export function addPaise(...amounts: number[]): number {
  return amounts.reduce((sum, a) => {
    if (!Number.isInteger(a)) throw new Error(`Paise must be integers, got: ${a}`)
    return sum + a
  }, 0)
}

export function parsePaiseFromString(value: string): number {
  const cleaned = value.replace(/[₹,\s]/g, "")
  const num = parseFloat(cleaned)
  if (!Number.isFinite(num)) throw new Error(`Cannot parse paise from: "${value}"`)
  return rupeesToPaise(num)
}
