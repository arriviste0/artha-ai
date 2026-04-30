import Papa from "papaparse"
import { rupeesToPaise } from "@/lib/money"

export interface RawRow {
  date: string
  description: string
  debit: number
  credit: number
  balance?: number
  rawLine: string
}

type BankFormat = "hdfc" | "icici" | "sbi" | "axis" | "generic"

interface FormatConfig {
  dateCol: string
  descCol: string
  debitCol: string
  creditCol: string
  skipRows: number
}

const FORMAT_CONFIGS: Record<BankFormat, FormatConfig> = {
  hdfc: {
    dateCol: "Date",
    descCol: "Narration",
    debitCol: "Withdrawal Amt.",
    creditCol: "Deposit Amt.",
    skipRows: 0,
  },
  icici: {
    dateCol: "Transaction Date",
    descCol: "Transaction Remarks",
    debitCol: "Withdrawal Amount (INR )",
    creditCol: "Deposit Amount (INR )",
    skipRows: 0,
  },
  sbi: {
    dateCol: "Txn Date",
    descCol: "Description",
    debitCol: "Debit",
    creditCol: "Credit",
    skipRows: 0,
  },
  axis: {
    dateCol: "Tran. Date",
    descCol: "Particulars",
    debitCol: "Debit",
    creditCol: "Credit",
    skipRows: 0,
  },
  generic: {
    dateCol: "Date",
    descCol: "Description",
    debitCol: "Debit",
    creditCol: "Credit",
    skipRows: 0,
  },
}

function detectFormat(headers: string[]): BankFormat {
  const h = headers.map((x) => x.toLowerCase().trim()).join("|")
  if (h.includes("narration") && h.includes("withdrawal amt")) return "hdfc"
  if (h.includes("transaction remarks") && h.includes("transaction date")) return "icici"
  if (h.includes("txn date") && h.includes("description")) return "sbi"
  if (h.includes("particulars") && h.includes("tran. date")) return "axis"
  return "generic"
}

function parseAmount(val: string | number | undefined): number {
  if (!val) return 0
  const cleaned = String(val).replace(/[,\s]/g, "").trim()
  return isNaN(Number(cleaned)) ? 0 : Number(cleaned)
}

function normalizeDate(raw: string): string {
  // Accept DD/MM/YYYY, DD-MM-YYYY, MM/DD/YYYY, YYYY-MM-DD
  const s = raw.trim()
  const dmySlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmySlash) {
    const [, d, m, y] = dmySlash
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
  }
  const dmyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (dmyDash) {
    const [, d, m, y] = dmyDash
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
  }
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return s
}

export interface CSVParseResult {
  rows: RawRow[]
  format: BankFormat
  errors: string[]
}

export function parseCSV(csvText: string): CSVParseResult {
  const errors: string[] = []

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })

  if (parsed.errors.length) {
    errors.push(...parsed.errors.map((e) => `Row ${e.row}: ${e.message}`))
  }

  const headers = parsed.meta.fields ?? []
  const format = detectFormat(headers)
  const config = FORMAT_CONFIGS[format]

  // For generic format, try to auto-detect columns by name patterns
  const resolvedConfig = format === "generic" ? autoDetectColumns(headers, config) : config

  const rows: RawRow[] = []

  for (const [i, row] of parsed.data.entries()) {
    const rawDate = row[resolvedConfig.dateCol]
    const rawDesc = row[resolvedConfig.descCol]
    const rawDebit = row[resolvedConfig.debitCol]
    const rawCredit = row[resolvedConfig.creditCol]

    if (!rawDate || !rawDesc) continue

    const date = normalizeDate(rawDate)
    if (!date) {
      errors.push(`Row ${i + 2}: could not parse date "${rawDate}"`)
      continue
    }

    const debit = parseAmount(rawDebit)
    const credit = parseAmount(rawCredit)

    if (debit === 0 && credit === 0) continue

    rows.push({
      date,
      description: rawDesc.trim(),
      debit: rupeesToPaise(debit),
      credit: rupeesToPaise(credit),
      rawLine: Object.values(row).join(","),
    })
  }

  return { rows, format, errors }
}

function autoDetectColumns(headers: string[], fallback: FormatConfig): FormatConfig {
  const find = (patterns: RegExp[]) =>
    headers.find((h) => patterns.some((p) => p.test(h.toLowerCase()))) ?? ""

  return {
    dateCol: find([/\bdate\b/, /\bdt\b/]) || fallback.dateCol,
    descCol: find([/\bdescri/, /\bnarr/, /\bparticular/, /\bremarks/, /\bdetail/]) || fallback.descCol,
    debitCol: find([/\bdebit\b/, /\bwithdraw/, /\bdr\b/]) || fallback.debitCol,
    creditCol: find([/\bcredit\b/, /\bdeposit\b/, /\bcr\b/]) || fallback.creditCol,
    skipRows: 0,
  }
}
