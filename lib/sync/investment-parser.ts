import type { InstrumentType } from "@/models/investment"

export interface ParsedInvestmentPurchase {
  name: string
  symbol?: string
  instrument: InstrumentType
  units: number
  investedPaise: number
  occurredAt: Date
}

function amountToPaise(value: string): number | null {
  const amount = Number.parseFloat(value.replace(/,/g, ""))
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null
}

function findLabeledAmount(text: string): number | null {
  const label = "order (?:value|amount)|investment amount|amount invested|net amount|total (?:amount|value|consideration)|consideration"
  const match = text.match(new RegExp(
    `(?:${label})[^\\u20B90-9]{0,24}(?:\\u20B9|Rs\\.?|INR)?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)`,
    "i"
  ))
  return match?.[1] ? amountToPaise(match[1]) : null
}

function findUnits(text: string): number | null {
  const match = text.match(/(?:quantity|qty|units|shares|no\.?\s*of\s*(?:units|shares))\s*[:\-]?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i)
  if (!match?.[1]) return null
  const units = Number.parseFloat(match[1].replace(/,/g, ""))
  return Number.isFinite(units) && units > 0 ? units : null
}

function findInvestmentName(text: string): string | null {
  const patterns = [
    /(?:fund|scheme|scrip|stock)\s*(?:name)?\s*[:\-]\s*([A-Za-z][A-Za-z0-9&().,'\-/ ]{2,120}?)(?=\s+(?:quantity|qty|units|shares|price|nav|amount|order|value)\b|$)/i,
    /(?:bought|purchased)\s+(?:[0-9,.]+\s+(?:units?|shares?)\s+(?:of\s+)?)?([A-Za-z][A-Za-z0-9&().,'\-/ ]{2,120}?)(?=\s+(?:for|at|on|worth|units?|shares?|qty|quantity)\b|[,.]|$)/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    const name = match?.[1]?.replace(/\s+/g, " ").trim()
    if (name && !/^your\s+(?:order|investment)/i.test(name)) return name.slice(0, 200)
  }
  return null
}

/**
 * Parses only completed investment purchases with enough detail to form a
 * holding. Contract-note PDFs and generic portfolio updates are deliberately
 * ignored instead of creating guessed investments.
 */
export function parseInvestmentPurchaseAlert(text: string, emailDate: Date): ParsedInvestmentPurchase | null {
  const normalized = text.replace(/\s+/g, " ").trim()
  const isPurchase = /\b(?:bought|purchased|order (?:has been )?executed|sip (?:purchase )?successful|units (?:have been )?allotted|allotment)\b/i.test(normalized)
  const isSaleOrRedemption = /\b(?:sold|sell|redemption|redeemed)\b/i.test(normalized)
  if (!isPurchase || isSaleOrRedemption) return null

  const name = findInvestmentName(normalized)
  const units = findUnits(normalized)
  const investedPaise = findLabeledAmount(normalized)
  if (!name || !units || !investedPaise) return null

  const isin = normalized.match(/\b(?:ISIN\s*[:#-]?\s*)?([A-Z]{2}[A-Z0-9]{9}[0-9])\b/)
  const symbol = isin?.[1] || normalized.match(/(?:symbol|ticker)\s*[:#-]?\s*([A-Z][A-Z0-9.-]{1,19})\b/i)?.[1]?.toUpperCase()
  const instrument: InstrumentType = /\b(?:mutual fund|mf|sip|nav|scheme)\b/i.test(normalized)
    ? "mutual_fund"
    : /\betf\b/i.test(normalized)
      ? "etf"
      : "stock"

  return { name, symbol, instrument, units, investedPaise, occurredAt: emailDate }
}
