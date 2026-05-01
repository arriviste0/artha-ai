import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import Goal from "@/models/goal"
import { updateGoalSchema } from "@/lib/validators/goal"

export const PATCH = withAuth(async (req: NextRequest, { userId, params }) => {
  const body: unknown = await req.json()
  const parsed = updateGoalSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  await connectDB()
  const update = {
    ...parsed.data,
    ...(parsed.data.targetDate ? { targetDate: new Date(parsed.data.targetDate) } : {}),
  }
  const goal = await Goal.findOneAndUpdate(
    { _id: params?.id, userId },
    { $set: update },
    { new: true }
  ).lean()
  if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ goal })
})

export const DELETE = withAuth(async (_req: NextRequest, { userId, params }) => {
  await connectDB()
  const goal = await Goal.findOneAndDelete({ _id: params?.id, userId })
  if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
})
