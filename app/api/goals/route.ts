import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import Goal from "@/models/goal"
import { createGoalSchema } from "@/lib/validators/goal"

export const GET = withAuth(async (_req: NextRequest, { userId }) => {
  await connectDB()
  const goals = await Goal.find({ userId }).sort({ priority: 1, createdAt: -1 }).lean()
  return NextResponse.json({ goals })
})

export const POST = withAuth(async (req: NextRequest, { userId }) => {
  const body: unknown = await req.json()
  const parsed = createGoalSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  await connectDB()
  const goal = await Goal.create({
    ...parsed.data,
    userId,
    targetDate: parsed.data.targetDate ? new Date(parsed.data.targetDate) : undefined,
  })
  return NextResponse.json({ goal }, { status: 201 })
})
