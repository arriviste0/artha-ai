import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import StatementUpload from "@/models/statement-upload"
import Transaction from "@/models/transaction"
import Account from "@/models/account"
import AuditLog from "@/models/audit-log"
import { getStorageProvider } from "@/lib/providers/storage"
import { z } from "zod"

const draftUpdateSchema = z.object({
  draftId: z.string(),
  status: z.enum(["accepted", "rejected"]),
  description: z.string().optional(),
  category: z.string().optional(),
  occurredAt: z.string().optional(),
})

const reviewBodySchema = z.object({
  updates: z.array(draftUpdateSchema),
})

// GET: fetch upload with drafts for review screen
export const GET = withAuth(async (_req: NextRequest, { userId, params }) => {
  await connectDB()
  const upload = await StatementUpload.findOne({ _id: params?.id, userId }).lean()
  if (!upload) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ upload })
})

// PATCH: apply draft edits (description/category overrides, accept/reject flags)
export const PATCH = withAuth(async (req: NextRequest, { userId, params }) => {
  const body: unknown = await req.json()
  const parsed = reviewBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  await connectDB()
  const upload = await StatementUpload.findOne({ _id: params?.id, userId })
  if (!upload) return NextResponse.json({ error: "Not found" }, { status: 404 })

  for (const update of parsed.data.updates) {
    const draft = upload.draftTransactions.find((d) => d._id?.toString() === update.draftId)
    if (!draft) continue
    draft.status = update.status
    if (update.description) draft.description = update.description
    if (update.category) draft.category = update.category
    if (update.occurredAt) draft.occurredAt = update.occurredAt
  }

  await upload.save()
  return NextResponse.json({ ok: true, draftTransactions: upload.draftTransactions })
})

// POST: commit accepted transactions to DB
export const POST = withAuth(async (_req: NextRequest, { userId, params }) => {
  await connectDB()
  const upload = await StatementUpload.findOne({ _id: params?.id, userId })
  if (!upload) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (upload.status === "reviewed") {
    return NextResponse.json({ error: "Already committed" }, { status: 409 })
  }

  const accepted = upload.draftTransactions.filter((d) => d.status === "accepted")
  if (accepted.length === 0) {
    return NextResponse.json({ error: "No accepted transactions to commit" }, { status: 400 })
  }

  const txnsToInsert = accepted.map((d) => ({
    userId,
    accountId: upload.accountId,
    type: d.type,
    amountPaise: d.amountPaise,
    description: d.description,
    category: d.category,
    merchant: d.merchant,
    occurredAt: new Date(d.occurredAt),
    source: upload.mimeType === "text/csv" ? "statement_csv" : "statement_pdf",
    sourceFileId: upload._id.toString(),
    tags: [],
  }))

  const inserted = await Transaction.insertMany(txnsToInsert)

  // Update account balance: sum(credit) - sum(debit)
  const netPaise = accepted.reduce((acc, d) => {
    return acc + (d.type === "credit" ? d.amountPaise : -d.amountPaise)
  }, 0)

  await Account.findByIdAndUpdate(upload.accountId, {
    $inc: { currentBalancePaise: netPaise },
  })

  upload.status = "reviewed"
  upload.importedTxnCount = inserted.length
  await upload.save()

  await AuditLog.create({
    userId,
    entity: "StatementUpload",
    entityId: upload._id.toString(),
    action: "create",
    after: { importedTxnCount: inserted.length } as unknown as Record<string, unknown>,
  })

  return NextResponse.json({ ok: true, importedCount: inserted.length })
})

// DELETE: remove an uploaded statement file and its parsed draft record.
// Imported transactions are kept if this statement was already committed.
export const DELETE = withAuth(async (_req: NextRequest, { userId, params }) => {
  await connectDB()

  const upload = await StatementUpload.findOne({ _id: params?.id, userId })
  if (!upload) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (upload.status === "parsing") {
    return NextResponse.json({ error: "Cannot delete a statement while it is parsing" }, { status: 409 })
  }

  const storage = getStorageProvider()
  await storage.delete(upload.fileKey)
  await upload.deleteOne()

  await AuditLog.create({
    userId,
    entity: "StatementUpload",
    entityId: upload._id.toString(),
    action: "delete",
    before: {
      fileName: upload.fileName,
      status: upload.status,
      importedTxnCount: upload.importedTxnCount,
    } as unknown as Record<string, unknown>,
  })

  return NextResponse.json({ ok: true })
})
