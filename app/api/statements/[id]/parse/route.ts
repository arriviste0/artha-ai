import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import StatementUpload from "@/models/statement-upload"
import { getStorageProvider } from "@/lib/providers/storage"
import { parseCSV } from "@/lib/parsers/csv"
import { parsePDF } from "@/lib/parsers/pdf"
import { buildDraftTransactions } from "@/lib/parsers/categorize"
import path from "path"
import fs from "fs/promises"

export const POST = withAuth(async (req: NextRequest, { userId, params }) => {
  await connectDB()

  const upload = await StatementUpload.findOne({ _id: params?.id, userId })
  if (!upload) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (upload.status === "parsing") return NextResponse.json({ error: "Already parsing" }, { status: 409 })

  let password: string | undefined
  try {
    const body = await req.json()
    password = body?.password || undefined
  } catch {
    // no body / not JSON — fine, no password
  }

  upload.status = "parsing"
  await upload.save()

  try {
    // Read file from storage
    const storage = getStorageProvider()
    let buffer: Buffer

    if (process.env.AWS_S3_BUCKET) {
      // S3: get signed URL then fetch
      const url = await storage.getSignedUrl(upload.fileKey, 60)
      const res = await fetch(url)
      buffer = Buffer.from(await res.arrayBuffer())
    } else {
      // Local: read directly
      const filePath = path.join(process.cwd(), "uploads", upload.fileKey)
      buffer = await fs.readFile(filePath)
    }

    let rawRows
    let parseMethod: "pdf_text" | "pdf_vision" | "csv" = "csv"
    const parseErrors: string[] = []

    if (upload.mimeType === "text/csv") {
      const result = parseCSV(buffer.toString("utf-8"))
      rawRows = result.rows
      parseErrors.push(...result.errors)
      parseMethod = "csv"
    } else {
      const result = await parsePDF(buffer, password)
      if (result.errors.includes("PASSWORD_REQUIRED")) {
        upload.status = "uploaded"
        await upload.save()
        return NextResponse.json({ error: "PASSWORD_REQUIRED" }, { status: 422 })
      }
      rawRows = result.rows
      parseErrors.push(...result.errors)
      parseMethod = result.method
    }

    const drafts = await buildDraftTransactions(rawRows)

    upload.status = "parsed"
    upload.parseMethod = parseMethod
    upload.detectedRows = rawRows.length
    upload.draftTransactions = drafts
    upload.parseErrors = parseErrors
    upload.parsedAt = new Date()
    await upload.save()

    return NextResponse.json({
      upload: {
        _id: upload._id,
        status: upload.status,
        detectedRows: upload.detectedRows,
        parseMethod: upload.parseMethod,
        parseErrors: upload.parseErrors,
        draftTransactions: upload.draftTransactions,
      },
    })
  } catch (err) {
    upload.status = "failed"
    upload.parseErrors = [(err as Error).message]
    await upload.save()
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
})
