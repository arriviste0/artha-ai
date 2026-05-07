import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import Budget from "@/models/budget"
import AuditLog from "@/models/audit-log"
import { updateBudgetSchema } from "@/lib/validators/budget"
import mongoose from "mongoose"

export const PATCH = withAuth(async (req: NextRequest, { userId, params }) => {
  if (!mongoose.Types.ObjectId.isValid(params?.id ?? "")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const body: unknown = await req.json()
  const parsed = updateBudgetSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  await connectDB()
  const before = await Budget.findOne({ _id: params?.id, userId }).lean()
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const updateData = {
    ...parsed.data,
    ...(parsed.data.startDate ? { startDate: new Date(parsed.data.startDate) } : {}),
    ...(parsed.data.endDate ? { endDate: new Date(parsed.data.endDate) } : {}),
  }

  const updated = await Budget.findOneAndUpdate(
    { _id: params?.id, userId },
    { $set: updateData },
    { new: true }
  ).lean()

  await AuditLog.create({
    userId,
    entity: "Budget",
    entityId: params?.id,
    action: "update",
    before: before as unknown as Record<string, unknown>,
    after: parsed.data as unknown as Record<string, unknown>,
  })

  return NextResponse.json({ budget: updated })
})

export const DELETE = withAuth(async (_req: NextRequest, { userId, params }) => {
  if (!mongoose.Types.ObjectId.isValid(params?.id ?? "")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  await connectDB()
  const budget = await Budget.findOne({ _id: params?.id, userId })
  if (!budget) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await Budget.deleteOne({ _id: params?.id, userId })

  await AuditLog.create({
    userId,
    entity: "Budget",
    entityId: params?.id,
    action: "delete",
    before: budget.toObject() as unknown as Record<string, unknown>,
  })

  return NextResponse.json({ ok: true })
})
