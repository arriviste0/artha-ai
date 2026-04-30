import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import StatementUpload from "@/models/statement-upload"
import Account from "@/models/account"
import { getStorageProvider } from "@/lib/providers/storage"
import { randomUUID } from "crypto"
import path from "path"

const MAX_SIZE = 10 * 1024 * 1024 // 10 MB
export const POST = withAuth(async (req: NextRequest, { userId }) => {
  try {
    const formData = await req.formData()
    const file = formData.get("file")
    const accountId = formData.get("accountId")

    if (!(file instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 })
    if (typeof accountId !== "string" || !accountId) {
      return NextResponse.json({ error: "accountId required" }, { status: 400 })
    }
    if (file.size > MAX_SIZE) return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 400 })

    const mimeType = file.type || "application/octet-stream"
    const lowerName = file.name.toLowerCase()
    const isCSV = mimeType.includes("csv") || lowerName.endsWith(".csv")
    const isPDF = mimeType === "application/pdf" || lowerName.endsWith(".pdf")

    if (!isCSV && !isPDF) {
      return NextResponse.json({ error: "Only PDF and CSV files are supported" }, { status: 400 })
    }

    await connectDB()
    const account = await Account.exists({ _id: accountId, userId })
    if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const ext = path.extname(file.name).toLowerCase() || (isPDF ? ".pdf" : ".csv")
    const fileKey = `statements/${userId}/${randomUUID()}${ext}`

    const storage = getStorageProvider()
    await storage.upload(fileKey, buffer, mimeType)

    const upload = await StatementUpload.create({
      userId,
      fileKey,
      fileName: file.name,
      mimeType: isCSV ? "text/csv" : "application/pdf",
      sizeBytes: file.size,
      accountId,
      status: "uploaded",
    })

    return NextResponse.json({ upload: { _id: upload._id, status: upload.status, fileName: upload.fileName } }, { status: 201 })
  } catch (err) {
    console.error("Statement upload error:", err)
    return NextResponse.json({ error: (err as Error).message || "Upload failed" }, { status: 500 })
  }
})

export const GET = withAuth(async (_req: NextRequest, { userId }) => {
  await connectDB()
  const uploads = await StatementUpload.find({ userId })
    .sort({ uploadedAt: -1 })
    .limit(50)
    .lean()
  return NextResponse.json({ uploads })
})
