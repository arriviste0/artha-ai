import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import Investment from "@/models/investment"
import { createInvestmentSchema } from "@/lib/validators/investment"

export const GET = withAuth(async (_req: NextRequest, { userId }) => {
  await connectDB()
  const investments = await Investment.find({ userId }).sort({ purchaseDate: -1 }).lean()
  return NextResponse.json({ investments })
})

export const POST = withAuth(async (req: NextRequest, { userId }) => {
  const body: unknown = await req.json()
  const parsed = createInvestmentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  await connectDB()
  const investment = await Investment.create({
    ...parsed.data,
    userId,
    purchaseDate: new Date(parsed.data.purchaseDate),
    maturityDate: parsed.data.maturityDate ? new Date(parsed.data.maturityDate) : undefined,
  })
  return NextResponse.json({ investment }, { status: 201 })
})
