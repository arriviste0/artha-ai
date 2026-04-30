import { GoogleGenerativeAI } from "@google/generative-ai"
import { redactPII } from "@/lib/ai/redact"
import type { RawRow } from "./csv"
import { rupeesToPaise } from "@/lib/money"
import { z } from "zod"
import path from "path"
import { pathToFileURL } from "url"

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

const geminiRowSchema = z.object({
  date: z.string(),
  description: z.string(),
  debit: z.number().nonnegative(),
  credit: z.number().nonnegative(),
})

const geminiResponseSchema = z.object({
  transactions: z.array(geminiRowSchema),
})

export interface PDFParseResult {
  rows: RawRow[]
  method: "pdf_text" | "pdf_vision"
  errors: string[]
}

async function extractViaGeminiVision(pdfBuffer: Buffer): Promise<RawRow[]> {
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_VISION_MODEL ?? "gemini-2.0-flash",
    generationConfig: { responseMimeType: "application/json" },
  })

  const prompt = `Extract all bank transactions from this statement PDF.
Return a JSON object with a "transactions" array. Each item must have:
- date: string in YYYY-MM-DD format
- description: string (merchant/narration)
- debit: number in rupees (0 if none)
- credit: number in rupees (0 if none)

Only include rows that are actual transactions (ignore headers, summaries, opening/closing balances).`

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        mimeType: "application/pdf",
        data: pdfBuffer.toString("base64"),
      },
    },
  ])

  const text = result.response.text()
  const parsed = geminiResponseSchema.parse(JSON.parse(text))

  return parsed.transactions
    .filter((r) => r.debit > 0 || r.credit > 0)
    .map((r) => ({
      date: r.date,
      description: r.description.trim(),
      debit: rupeesToPaise(r.debit),
      credit: rupeesToPaise(r.credit),
      rawLine: `${r.date}|${r.description}|${r.debit}|${r.credit}`,
    }))
}

function looksLikeGarbage(text: string): boolean {
  if (text.length < 50) return true
  // Check ratio of non-printable / non-ASCII
  const nonPrintable = (text.match(/[\x00-\x08\x0e-\x1f\x7f-\x9f]/g) ?? []).length
  return nonPrintable / text.length > 0.05
}

// Regex-based extraction from clean PDF text
function extractFromText(text: string): RawRow[] {
  const rows: RawRow[] = []
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean)

  // Pattern: date + description + amounts on same or adjacent lines
  const txnPattern =
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s+(.+?)\s+([\d,]+(?:\.\d{2})?)\s+([\d,]+(?:\.\d{2})?)?/

  for (const line of lines) {
    const m = txnPattern.exec(line)
    if (!m) continue

    const [, rawDate, desc, col3, col4] = m
    const dateParts = rawDate.split(/[\/\-]/)
    let dateStr = rawDate
    if (dateParts.length === 3) {
      const [a, b, c] = dateParts
      if (c.length === 4) {
        dateStr = `${c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`
      } else if (a.length === 4) {
        dateStr = `${a}-${b.padStart(2, "0")}-${c.padStart(2, "0")}`
      }
    }

    const amt3 = parseFloat(col3.replace(/,/g, "")) || 0
    const amt4 = col4 ? parseFloat(col4.replace(/,/g, "")) || 0 : 0

    if (amt3 === 0 && amt4 === 0) continue

    rows.push({
      date: dateStr,
      description: desc.trim(),
      debit: rupeesToPaise(amt3),
      credit: rupeesToPaise(amt4),
      rawLine: line,
    })
  }

  return rows
}

export async function parsePDF(pdfBuffer: Buffer, password?: string): Promise<PDFParseResult> {
  const errors: string[] = []

  try {
    const { PDFParse, PasswordException } = await import("pdf-parse")
    PDFParse.setWorker(
      pathToFileURL(
        path.join(process.cwd(), "node_modules", "pdf-parse", "dist", "pdf-parse", "esm", "pdf.worker.mjs")
      ).toString()
    )
    const parser = new PDFParse({ data: pdfBuffer, password })
    let textResult: Awaited<ReturnType<typeof parser.getText>>
    try {
      textResult = await parser.getText()
    } catch (err) {
      if (err instanceof PasswordException) {
        return { rows: [], method: "pdf_text", errors: ["PASSWORD_REQUIRED"] }
      }
      throw err
    } finally {
      await parser.destroy()
    }

    const text = textResult.text

    if (!looksLikeGarbage(text)) {
      const redacted = redactPII(text)
      const rows = extractFromText(redacted)
      if (rows.length > 0) {
        return { rows, method: "pdf_text", errors }
      }
    }
  } catch (err) {
    errors.push(`pdf-parse failed: ${(err as Error).message}`)
  }

  // Fallback to Gemini Vision
  try {
    const rows = await extractViaGeminiVision(pdfBuffer)
    return { rows, method: "pdf_vision", errors }
  } catch (err) {
    const msg = (err as Error).message
    const isQuotaExhausted = msg.includes("429") && msg.includes("free_tier")
    errors.push(
      isQuotaExhausted
        ? "Gemini Vision quota exhausted on free tier — upgrade your Google AI Studio plan to continue processing scanned PDFs."
        : `Gemini Vision failed: ${msg}`,
    )
    return { rows: [], method: "pdf_vision", errors }
  }
}
