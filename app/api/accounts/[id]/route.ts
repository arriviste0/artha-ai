import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import Account from "@/models/account"
import Transaction from "@/models/transaction"
import AuditLog from "@/models/audit-log"
import { updateAccountSchema } from "@/lib/validators/account"

export const GET = withAuth(async (_req: NextRequest, { userId, params }) => {
  await connectDB()
  const account = await Account.findOne({ _id: params?.id, userId }).lean()
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ account })
})

export const PATCH = withAuth(async (req: NextRequest, { userId, params }) => {
  const body: unknown = await req.json()
  const parsed = updateAccountSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  await connectDB()
  const before = await Account.findOne({ _id: params?.id, userId }).lean()
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const updated = await Account.findOneAndUpdate(
    { _id: params?.id, userId },
    { $set: parsed.data },
    { new: true }
  ).lean()

  await AuditLog.create({
    userId,
    entity: "Account",
    entityId: params?.id,
    action: "update",
    before: before as unknown as Record<string, unknown>,
    after: parsed.data as unknown as Record<string, unknown>,
  })

  return NextResponse.json({ account: updated })
})

export const DELETE = withAuth(async (_req: NextRequest, { userId, params }) => {
  await connectDB()
  const account = await Account.findOne({ _id: params?.id, userId })
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const txnCount = await Transaction.countDocuments({ accountId: params?.id, userId })
  if (txnCount > 0) {
    // soft-delete: mark inactive rather than destroy
    await Account.findOneAndUpdate({ _id: params?.id, userId }, { isActive: false })
  } else {
    await Account.deleteOne({ _id: params?.id, userId })
  }

  await AuditLog.create({
    userId,
    entity: "Account",
    entityId: params?.id,
    action: "delete",
    before: account.toObject() as unknown as Record<string, unknown>,
  })

  return NextResponse.json({ ok: true })
})
