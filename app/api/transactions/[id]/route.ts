import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import Transaction from "@/models/transaction"
import Account from "@/models/account"
import Budget from "@/models/budget"
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

  const oldAccountId = before.accountId.toString()
  const newAccountId = parsed.data.accountId ?? oldAccountId

  if (newAccountId !== oldAccountId) {
    const accountExists = await Account.exists({ _id: newAccountId, userId })
    if (!accountExists) return NextResponse.json({ error: "Account not found" }, { status: 404 })
  }

  const oldDelta = before.type === "credit" ? before.amountPaise : -before.amountPaise
  const newAmount = parsed.data.amountPaise ?? before.amountPaise
  const newType = parsed.data.type ?? before.type
  const newDelta = newType === "credit" ? newAmount : -newAmount

  if (newAccountId !== oldAccountId) {
    await Promise.all([
      Account.findByIdAndUpdate(before.accountId, {
        $inc: { currentBalancePaise: -oldDelta },
      }),
      Account.findByIdAndUpdate(newAccountId, {
        $inc: { currentBalancePaise: newDelta },
      }),
    ])
  } else if (newDelta !== oldDelta) {
    await Account.findByIdAndUpdate(before.accountId, {
      $inc: { currentBalancePaise: newDelta - oldDelta },
    })
  }

  const updateData: Record<string, unknown> = { ...parsed.data }
  if (parsed.data.occurredAt) {
    updateData.occurredAt = new Date(parsed.data.occurredAt)
  }
  if (parsed.data.budgetId && mongoose.Types.ObjectId.isValid(parsed.data.budgetId)) {
    updateData.budgetId = new mongoose.Types.ObjectId(parsed.data.budgetId)
  } else if (parsed.data.budgetId === "") {
    updateData.budgetId = null
  } else if (!parsed.data.budgetId && parsed.data.category) {
    const matching = await Budget.findOne({ userId, category: parsed.data.category })
    if (matching) {
      updateData.budgetId = matching._id
    }
  }
  if (parsed.data.goalId === "") {
    updateData.goalId = null
  }

  const updated = await Transaction.findOneAndUpdate(
    { _id: params?.id, userId },
    { $set: updateData },
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
