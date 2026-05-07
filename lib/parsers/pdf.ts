import { redactPII } from "@/lib/ai/redact"
import type { RawRow } from "./csv"
import { rupeesToPaise } from "@/lib/money"
import path from "path"
import { pathToFileURL } from "url"

export interface PDFParseResult {
  rows: RawRow[]
  method: "pdf_text" | "pdf_vision"
  errors: string[]
}

function looksLikeGarbage(text: string): boolean {
  if (text.length < 50) return true
  const nonPrintable = (text.match(/[\x00-\x08\x0e-\x1f\x7f-\x9f]/g) ?? []).length
  return nonPrintable / text.length > 0.05
}

function extractFromText(text: string): RawRow[] {
  const rows: RawRow[] = []
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean)

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

  // Vision-based PDF parsing is not available with the current AI provider.
  errors.push("Could not extract transactions from this PDF automatically. Please upload a CSV export from your bank instead.")
  return { rows: [], method: "pdf_vision", errors }
}
