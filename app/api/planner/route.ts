import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import FinancialPlan from "@/models/financial-plan"

export const GET = withAuth(async (_req: NextRequest, { userId }) => {
  await connectDB()

  // Fetch the latest generated plan for the user
  const plan = await FinancialPlan.findOne({ userId }).sort({ generatedAt: -1 }).lean()

  return NextResponse.json({ plan: plan || null })
})
