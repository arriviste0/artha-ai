import { redactPII } from "@/lib/ai/redact"
import { type RawRow, normalizeDate } from "./csv"
import { rupeesToPaise } from "@/lib/money"
import path from "path"
import { pathToFileURL } from "url"
import { aiGenerate } from "@/lib/ai/provider"
import { z } from "zod"

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


async function extractTransactionsWithAI(text: string): Promise<RawRow[]> {
  const CATEGORIES = [
    "Food & Dining", "Rent / Housing", "Transport", "Utilities", "Healthcare",
    "Entertainment", "Shopping", "Education", "Insurance", "Investments",
    "EMI / Loans", "Personal Care", "Salary", "Freelance Income",
    "Business Income", "Transfer", "Other",
  ]

  const CHUNK_SIZE = 5000
  const chunks = []
  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    chunks.push(text.slice(i, i + CHUNK_SIZE))
  }

  const allTransactions: any[] = []

  for (const chunk of chunks) {
    const prompt = `You are a financial data extraction AI. Extract all bank transactions from the following account statement text.
CRITICAL INSTRUCTIONS:
1. Identify the Bank Name and Statement Type based on headers or text.
2. Extract the Date, Description, Amount, and Type (credit or debit).
3. CAREFULLY ignore running balances, closing balances, or opening balances. ONLY extract the actual transaction amount.
4. Analyze the vendor name, payment gateway (e.g. Razorpay, UPI), and description carefully to assign the most accurate category from the allowed list: ${CATEGORIES.join(", ")}.
5. Also extract the explicit Merchant/Vendor name if discernible.
6. Provide a confidence score (0-1).

Return JSON in this format:
{
  "statementType": "...",
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "...",
      "debit": 0, // actual withdrawal amount in rupees if debit, else 0. Do NOT use the running balance.
      "credit": 0, // actual deposit amount in rupees if credit, else 0. Do NOT use the running balance.
      "category": "...",
      "merchant": "...",
      "confidence": 0.95,
      "rawLine": "..." // the original text line that matched
    }
  ]
}

Text:
${chunk}`

    let textRes = await aiGenerate({ prompt, json: true })
    
    const schema = z.object({
      statementType: z.string().optional(),
      transactions: z.array(z.object({
        date: z.string(),
        description: z.string(),
        debit: z.number(),
        credit: z.number(),
        category: z.string(),
        merchant: z.string().optional(),
        confidence: z.number(),
        rawLine: z.string().optional()
      }))
    })

    let parsed
    try {
      const cleanJson = textRes.replace(/```json/g, "").replace(/```/g, "").trim()
      parsed = schema.parse(JSON.parse(cleanJson))
    } catch {
      try {
        textRes = await aiGenerate({ prompt, json: true })
        const cleanJson = textRes.replace(/```json/g, "").replace(/```/g, "").trim()
        parsed = schema.parse(JSON.parse(cleanJson))
      } catch (err) {
        console.error("Failed to parse chunk:", err)
        continue // Skip broken chunk to avoid failing entire PDF
      }
    }
    
    if (parsed && parsed.transactions) {
      allTransactions.push(...parsed.transactions)
    }
  }

  return allTransactions.map((t) => {
    let finalDate = normalizeDate(t.date)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(finalDate)) {
      finalDate = new Date().toISOString().slice(0, 10)
    }
    
    return {
      date: finalDate,
      description: t.description,
      debit: rupeesToPaise(t.debit),
      credit: rupeesToPaise(t.credit),
      rawLine: t.rawLine || t.description,
      aiAssigned: {
        category: t.category,
        merchant: t.merchant,
        confidence: t.confidence,
      },
    }
  })
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
      let rows: RawRow[] = []
      
      try {
        rows = await extractTransactionsWithAI(redacted)
      } catch (aiErr) {
        errors.push(`AI parsing failed: ${(aiErr as Error).message}`)
      }

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
