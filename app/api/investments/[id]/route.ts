import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import Investment from "@/models/investment"
import { updateInvestmentSchema } from "@/lib/validators/investment"

export const PATCH = withAuth(async (req: NextRequest, { userId, params }) => {
  const body: unknown = await req.json()
  const parsed = updateInvestmentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  await connectDB()
  const update = {
    ...parsed.data,
    ...(parsed.data.purchaseDate ? { purchaseDate: new Date(parsed.data.purchaseDate) } : {}),
    ...(parsed.data.maturityDate ? { maturityDate: new Date(parsed.data.maturityDate) } : {}),
  }
  const investment = await Investment.findOneAndUpdate(
    { _id: params?.id, userId },
    { $set: update },
    { new: true }
  ).lean()
  if (!investment) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ investment })
})

export const DELETE = withAuth(async (_req: NextRequest, { userId, params }) => {
  await connectDB()
  const investment = await Investment.findOneAndDelete({ _id: params?.id, userId })
  if (!investment) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
})
