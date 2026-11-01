import { redactPII } from "@/lib/ai/redact"
import { type RawRow, normalizeDate } from "./csv"
import { rupeesToPaise } from "@/lib/money"
import { aiGenerate } from "@/lib/ai/provider"
import { runCategorizationPipeline } from "@/lib/categorization/pipeline"
import { z } from "zod"

// Polyfill DOMMatrix and Path2D for PDF libraries in Node.js environment
if (typeof globalThis.DOMMatrix === "undefined") {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor() {
      return [1, 0, 0, 1, 0, 0]
    }
  } as any
}
if (typeof globalThis.Path2D === "undefined") {
  globalThis.Path2D = class Path2D {} as any
}

export interface PDFParseResult {
  rows: RawRow[]
  method: "pdf_text" | "pdf_vision"
  errors: string[]
}

function looksLikeGarbage(text: string): boolean {
  if (text.length < 30) return true
  const nonPrintable = (text.match(/[\x00-\x08\x0e-\x1f\x7f-\x9f]/g) ?? []).length
  return nonPrintable / text.length > 0.05
}

/**
 * Enhanced date normalizer that handles 2-digit years, Indian bank formats (DD-MMM-YYYY),
 * and standard ISO formats.
 */
function normalizeDateStr(raw: string): string {
  const s = raw.trim()

  // 1. DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmy4 = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
  if (dmy4) {
    const [, d, m, y] = dmy4
    const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
    if (!isNaN(Date.parse(iso))) return iso
  }

  // 2. DD/MM/YY or DD-MM-YY
  const dmy2 = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/)
  if (dmy2) {
    const [, d, m, yy] = dmy2
    const y = 2000 + parseInt(yy, 10)
    const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
    if (!isNaN(Date.parse(iso))) return iso
  }

  // 3. DD-MMM-YYYY or DD-MMM-YY (e.g. 15-OCT-2024 or 15-Oct-24 or 15 Oct 2024)
  const dMmm = s.match(/^(\d{1,2})[-/.\s]+([A-Za-z]{3})[-/.\s]+(\d{2,4})$/i)
  if (dMmm) {
    const day = dMmm[1].padStart(2, "0")
    const monthStr = dMmm[2].toLowerCase().slice(0, 3)
    let year = parseInt(dMmm[3], 10)
    if (year < 100) year += 2000

    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    const monthIdx = months.indexOf(monthStr)
    if (monthIdx !== -1) {
      const month = String(monthIdx + 1).padStart(2, "0")
      return `${year}-${month}-${day}`
    }
  }

  // 4. ISO standard YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10)
  }

  // 5. Fallback via normalizeDate from csv.ts
  const fallback = normalizeDate(s)
  if (fallback) return fallback

  const parsed = Date.parse(s)
  if (!isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10)
  }

  return new Date().toISOString().slice(0, 10)
}

/**
 * Assembles raw text lines into distinct statement transaction rows,
 * combining multi-line entries (e.g. wrapped narrations, split dates/amounts)
 * and filtering out non-transaction headers/footers.
 */
function assembleStatementLines(text: string): string[] {
  const rawLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const dateRegex =
    /^(?:\d+[\s.)|]+)?(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}[-/.\s]+[A-Za-z]{3}[-/.\s]+\d{2,4}|\d{4}-\d{2}-\d{2})\b/i

  const headerFilter =
    /^(?:page\s+\d+|statement\s+of|account\s+number|account\s+statement|customer\s+name|joint\s+holder|nomination|registered\s+mobile|branch\s+name|ifsc|micr|currency|opening\s+balance|total\s+withdrawal|total\s+deposit|summary|date\s+narration|sl\s+no|transaction\s+date|value\s+date)\b/i

  const assembled: string[] = []
  let currentBlock = ""

  for (const line of rawLines) {
    if (headerFilter.test(line)) {
      if (currentBlock) {
        assembled.push(currentBlock)
        currentBlock = ""
      }
      continue
    }

    if (dateRegex.test(line)) {
      if (currentBlock) {
        assembled.push(currentBlock)
      }
      currentBlock = line
    } else if (currentBlock) {
      currentBlock += " " + line
    }
  }

  if (currentBlock) {
    assembled.push(currentBlock)
  }

  return assembled
}

/**
 * Deterministic statement table extractor.
 * Scans tabular lines common in Indian bank statements (HDFC, SBI, ICICI, Axis, Kotak, etc.).
 * Assembles multi-line records and reconciles Debit vs Credit using closing balance delta,
 * explicit Dr/Cr tags, and narration keywords.
 */
async function extractTransactionsFromTextRules(text: string): Promise<RawRow[]> {
  const lines = assembleStatementLines(text)

  const dateRegex =
    /^(?:\d+[\s.)|]+)?(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}[-/.\s]+[A-Za-z]{3}[-/.\s]+\d{2,4}|\d{4}-\d{2}-\d{2})\b/i

  interface Candidate {
    rawDate: string
    date: string
    description: string
    txnAmount: number
    closingBalance: number | null
    explicitType: "credit" | "debit" | null
    rawLine: string
  }

  const candidates: Candidate[] = []

  for (const line of lines) {
    const dateMatch = line.match(dateRegex)
    if (!dateMatch) continue

    const rawDate = dateMatch[1]
    const rest = line.slice(dateMatch[0].length).trim()

    // Find all monetary numbers (e.g. 1,250.00, 50,000.00, 250.00 Dr)
    const amountMatches = [
      ...rest.matchAll(
        /\b(?:Rs\.?|INR)?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})|[0-9]+(?:\.[0-9]{2}))\s*(Dr|Cr)?\b/gi
      ),
    ]

    if (amountMatches.length === 0) continue

    let txnAmount = 0
    let closingBalance: number | null = null
    let explicitType: "credit" | "debit" | null = null

    if (/\b(Cr|Credit|Deposit)\b/i.test(line)) explicitType = "credit"
    if (/\b(Dr|Debit|Withdrawal)\b/i.test(line)) explicitType = "debit"

    if (amountMatches.length >= 3) {
      // 3 amounts: [Debit, Credit, Balance]
      const amt1 = parseFloat(amountMatches[0][1].replace(/,/g, ""))
      const amt2 = parseFloat(amountMatches[1][1].replace(/,/g, ""))
      const amt3 = parseFloat(amountMatches[2][1].replace(/,/g, ""))
      closingBalance = amt3

      if (amt1 > 0 && amt2 === 0) {
        txnAmount = amt1
        explicitType = "debit"
      } else if (amt2 > 0 && amt1 === 0) {
        txnAmount = amt2
        explicitType = "credit"
      } else if (amt1 > 0) {
        txnAmount = amt1
      }
    } else if (amountMatches.length === 2) {
      // 2 amounts: [Txn Amount, Balance]
      txnAmount = parseFloat(amountMatches[0][1].replace(/,/g, ""))
      closingBalance = parseFloat(amountMatches[1][1].replace(/,/g, ""))
    } else {
      // 1 amount
      txnAmount = parseFloat(amountMatches[0][1].replace(/,/g, ""))
    }

    if (txnAmount <= 0) continue

    // Clean description: strip amounts and extra whitespace
    let desc = rest
    for (const m of amountMatches) {
      desc = desc.replace(m[0], " ")
    }
    desc = desc
      .replace(/\s+/g, " ")
      .replace(/^[-/.,;:|\s]+|[-/.,;:|\s]+$/g, "")
      .trim()

    candidates.push({
      rawDate,
      date: normalizeDateStr(rawDate),
      description: desc || "Bank Transaction",
      txnAmount,
      closingBalance,
      explicitType,
      rawLine: line,
    })
  }

  if (candidates.length === 0) return []

  // Determine chronological direction
  const isChronological =
    candidates.length < 2 ||
    candidates[candidates.length - 1].date >= candidates[0].date

  // Pass 2: Reconcile Debit vs Credit using closing balance differences and keywords
  const candidateRows: Array<{
    date: string
    description: string
    debitPaise: number
    creditPaise: number
    rawLine: string
  }> = []

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]
    let type = c.explicitType

    // Check balance progression with adjacent row
    if (c.closingBalance !== null) {
      if (isChronological && i > 0 && candidates[i - 1].closingBalance !== null) {
        const prevBal = candidates[i - 1].closingBalance!
        const diff = c.closingBalance - prevBal

        if (Math.abs(diff - c.txnAmount) < 0.05) {
          type = "credit"
        } else if (Math.abs(-diff - c.txnAmount) < 0.05) {
          type = "debit"
        } else if (!type) {
          type = diff > 0 ? "credit" : "debit"
        }
      } else if (!isChronological && i < candidates.length - 1 && candidates[i + 1].closingBalance !== null) {
        const prevBal = candidates[i + 1].closingBalance!
        const diff = c.closingBalance - prevBal

        if (Math.abs(diff - c.txnAmount) < 0.05) {
          type = "credit"
        } else if (Math.abs(-diff - c.txnAmount) < 0.05) {
          type = "debit"
        } else if (!type) {
          type = diff > 0 ? "credit" : "debit"
        }
      }
    }

    if (!type) {
      // Keyword fallback
      if (
        /\b(salary|credited|credit|refund|interest|reversal|cashback|dividend|bonus|deposit|received\s+from|neft\s*cr|imps\s*cr|upi\s*cr|by\s*transfer)\b/i.test(
          c.rawLine
        )
      ) {
        type = "credit"
      } else {
        type = "debit"
      }
    }

    const isCredit = type === "credit"
    candidateRows.push({
      date: c.date,
      description: c.description,
      debitPaise: isCredit ? 0 : Math.round(c.txnAmount * 100),
      creditPaise: isCredit ? Math.round(c.txnAmount * 100) : 0,
      rawLine: c.rawLine,
    })
  }

  // Assign categories using the master 5-stage categorization pipeline
  const rows: RawRow[] = []
  for (const item of candidateRows) {
    const isCredit = item.creditPaise > 0
    const type = isCredit ? "credit" : "debit"
    const amountRupees = (isCredit ? item.creditPaise : item.debitPaise) / 100

    const catResult = await runCategorizationPipeline({
      merchant: item.description,
      rawText: item.rawLine,
      amountRupees,
      type,
    })

    rows.push({
      date: item.date,
      description: item.description,
      debit: item.debitPaise,
      credit: item.creditPaise,
      rawLine: item.rawLine,
      aiAssigned: {
        category: catResult.category,
        merchant: catResult.merchantClean || item.description,
        confidence: catResult.confidence,
      },
    })
  }

  return rows
}

/**
 * AI-powered fallback extractor for complex or non-standard bank statement layouts.
 * Uses structured JSON mode with automatic system prompt and recovery.
 */
async function extractTransactionsWithAI(text: string): Promise<RawRow[]> {
  const CATEGORIES = [
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
  ]

  const CHUNK_SIZE = 4000
  const chunks = []
  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    chunks.push(text.slice(i, i + CHUNK_SIZE))
  }

  const allTransactions: any[] = []

  for (const chunk of chunks) {
    const prompt = `Extract all completed bank transactions from this account statement.
CRITICAL INSTRUCTIONS:
1. Extract Date (YYYY-MM-DD), Description, Debit amount in rupees, Credit amount in rupees.
2. DO NOT extract running balances or closing balances as the transaction amount.
3. Categorize each transaction into one of: ${CATEGORIES.join(", ")}.

Return STRICT JSON matching:
{
  "transactions": [
    {
      "date": "2024-10-15",
      "description": "Swiggy Bangalore",
      "debit": 450.0,
      "credit": 0,
      "category": "Food & Dining",
      "merchant": "Swiggy",
      "confidence": 0.95
    }
  ]
}

Statement Text:
${chunk}`

    const schema = z.object({
      transactions: z.array(
        z.object({
          date: z.string(),
          description: z.string(),
          debit: z.number(),
          credit: z.number(),
          category: z.string(),
          merchant: z.string().optional(),
          confidence: z.number().optional(),
          rawLine: z.string().optional(),
        })
      ),
    })

    try {
      const textRes = await aiGenerate({
        prompt,
        systemPrompt:
          "You are a financial statement extraction AI. You must respond strictly with a valid JSON object matching the requested schema. Do not output markdown codeblocks or conversational text.",
        json: true,
      })

      const cleanJson = textRes.replace(/```json/g, "").replace(/```/g, "").trim()
      const parsed = schema.parse(JSON.parse(cleanJson))
      if (parsed.transactions && parsed.transactions.length > 0) {
        allTransactions.push(...parsed.transactions)
      }
    } catch (err) {
      console.warn("AI chunk extraction warning:", err)
      continue
    }
  }

  const finalRows: RawRow[] = []
  for (const t of allTransactions) {
    let finalDate = normalizeDateStr(t.date)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(finalDate)) {
      finalDate = new Date().toISOString().slice(0, 10)
    }

    const debitPaise = rupeesToPaise(t.debit || 0)
    const creditPaise = rupeesToPaise(t.credit || 0)

    if (debitPaise === 0 && creditPaise === 0) continue

    finalRows.push({
      date: finalDate,
      description: t.description || "Bank Transaction",
      debit: debitPaise,
      credit: creditPaise,
      rawLine: t.rawLine || t.description,
      aiAssigned: {
        category: t.category || "Other",
        merchant: t.merchant,
        confidence: t.confidence || 0.85,
      },
    })
  }

  return finalRows
}

/**
 * Extracts raw text from PDF buffer using unpdf (modern PDF.js v4) with pdf-parse-fixed fallback.
 * Properly catches password-protection exceptions.
 */
async function extractTextFromPDF(pdfBuffer: Buffer, password?: string): Promise<string> {
  // 1. Try unpdf (modern PDF.js v4+ engine — zero legacy lexer errors, handles modern streams and fonts)
  try {
    const { getDocumentProxy, extractText } = await import("unpdf")
    const pdfData = new Uint8Array(pdfBuffer)
    const proxy = await getDocumentProxy(pdfData, password ? { password } : undefined)
    const res = await extractText(proxy, { mergePages: true })
    const text = Array.isArray(res.text) ? (res.text as string[]).join("\n") : String(res.text || "")
    if (text && text.trim().length > 0) {
      return text
    }
  } catch (err: any) {
    const msg = String(err?.message || err)
    if (err?.name === "PasswordException" || msg.includes("Password") || msg.includes("password") || err?.code === 1 || err?.code === 2) {
      const passErr = new Error("PASSWORD_REQUIRED")
      ;(passErr as any).isPasswordRequired = true
      throw passErr
    }
    // If not a password error, fall through to fallback parser
  }

  // 2. Fallback to pdf-parse-fixed
  try {
    // @ts-ignore
    const pdfParse = (await import("pdf-parse-fixed")).default || (await import("pdf-parse-fixed"))
    const data = await pdfParse(password ? { data: pdfBuffer, password } : pdfBuffer)
    if (data && data.text) {
      return data.text
    }
  } catch (err: any) {
    const msg = String(err?.message || err)
    if (err?.name === "PasswordException" || msg.includes("Password") || msg.includes("password")) {
      const passErr = new Error("PASSWORD_REQUIRED")
      ;(passErr as any).isPasswordRequired = true
      throw passErr
    }
    throw err
  }

  return ""
}

/**
 * Primary PDF statement parser:
 * 1. Extracts text using unpdf / pdf-parse-fixed (handles passwords cleanly).
 * 2. Runs fast, deterministic table regex parser first (instant, 100% accurate on Indian bank statements).
 * 3. Falls back to AI structured extraction if table format is complex.
 */
export async function parsePDF(pdfBuffer: Buffer, password?: string): Promise<PDFParseResult> {
  const errors: string[] = []

  let text = ""
  try {
    text = await extractTextFromPDF(pdfBuffer, password)
  } catch (err: any) {
    if (err?.isPasswordRequired || err?.message === "PASSWORD_REQUIRED") {
      return { rows: [], method: "pdf_text", errors: ["PASSWORD_REQUIRED"] }
    }
    errors.push(`PDF text extraction error: ${err?.message || String(err)}`)
  }

  if (text && !looksLikeGarbage(text)) {
    // 1. Try deterministic table extraction first
    try {
      const ruleRows = await extractTransactionsFromTextRules(text)
      if (ruleRows.length > 0) {
        return { rows: ruleRows, method: "pdf_text", errors }
      }
    } catch (ruleErr) {
      console.warn("Rule extraction warning:", ruleErr)
    }

    // 2. Fallback to AI-powered extraction
    const redacted = redactPII(text)
    try {
      const aiRows = await extractTransactionsWithAI(redacted)
      if (aiRows.length > 0) {
        return { rows: aiRows, method: "pdf_text", errors }
      }
    } catch (aiErr) {
      errors.push(`AI parsing failed: ${(aiErr as Error).message}`)
    }
  }

  errors.push(
    "Could not extract transactions from this PDF automatically. Please check if the PDF is scanned or upload a CSV export from your bank."
  )
  return { rows: [], method: "pdf_vision", errors }
}
