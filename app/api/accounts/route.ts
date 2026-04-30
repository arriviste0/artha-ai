import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import Account from "@/models/account"
import AuditLog from "@/models/audit-log"
import { createAccountSchema } from "@/lib/validators/account"

export const GET = withAuth(async (_req: NextRequest, { userId }) => {
  await connectDB()
  const accounts = await Account.find({ userId, isActive: true }).sort({ createdAt: 1 }).lean()
  return NextResponse.json({ accounts })
})

export const POST = withAuth(async (req: NextRequest, { userId }) => {
  const body: unknown = await req.json()
  const parsed = createAccountSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  await connectDB()
  const account = await Account.create({ ...parsed.data, userId })

  await AuditLog.create({
    userId,
    entity: "Account",
    entityId: account._id,
    action: "create",
    after: parsed.data,
  })

  return NextResponse.json({ account }, { status: 201 })
})
