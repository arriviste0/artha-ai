import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import Transaction from "@/models/transaction"
import Account from "@/models/account"
import AuditLog from "@/models/audit-log"
import { updateTransactionSchema } from "@/lib/validators/transaction"

export const GET = withAuth(async (_req: NextRequest, { userId, params }) => {
  await connectDB()
  const txn = await Transaction.findOne({ _id: params?.id, userId }).lean()
  if (!txn) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ transaction: txn })
})

export const PATCH = withAuth(async (req: NextRequest, { userId, params }) => {
  const body: unknown = await req.json()
  const parsed = updateTransactionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  await connectDB()
  const before = await Transaction.findOne({ _id: params?.id, userId })
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // If amount or type changed, reverse + reapply balance delta
  if (
    (parsed.data.amountPaise !== undefined && parsed.data.amountPaise !== before.amountPaise) ||
    (parsed.data.type !== undefined && parsed.data.type !== before.type)
  ) {
    const oldDelta = before.type === "credit" ? before.amountPaise : -before.amountPaise
    const newAmount = parsed.data.amountPaise ?? before.amountPaise
    const newType = parsed.data.type ?? before.type
    const newDelta = newType === "credit" ? newAmount : -newAmount
    await Account.findByIdAndUpdate(before.accountId, {
      $inc: { currentBalancePaise: newDelta - oldDelta },
    })
  }

  const updated = await Transaction.findOneAndUpdate(
    { _id: params?.id, userId },
    { $set: { ...parsed.data, ...(parsed.data.occurredAt ? { occurredAt: new Date(parsed.data.occurredAt) } : {}) } },
    { new: true }
  ).lean()

  await AuditLog.create({
    userId,
    entity: "Transaction",
    entityId: params?.id,
    action: "update",
    before: before.toObject() as unknown as Record<string, unknown>,
    after: parsed.data as unknown as Record<string, unknown>,
  })

  return NextResponse.json({ transaction: updated })
})

export const DELETE = withAuth(async (_req: NextRequest, { userId, params }) => {
  await connectDB()
  const txn = await Transaction.findOne({ _id: params?.id, userId })
  if (!txn) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Reverse balance
  const delta = txn.type === "credit" ? -txn.amountPaise : txn.amountPaise
  await Account.findByIdAndUpdate(txn.accountId, { $inc: { currentBalancePaise: delta } })
  await Transaction.deleteOne({ _id: params?.id, userId })

  await AuditLog.create({
    userId,
    entity: "Transaction",
    entityId: params?.id,
    action: "delete",
    before: txn.toObject() as unknown as Record<string, unknown>,
  })

  return NextResponse.json({ ok: true })
})
