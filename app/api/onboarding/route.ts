import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import User from "@/models/user"
import Account from "@/models/account"
import AuditLog from "@/models/audit-log"
import { onboardingSchema } from "@/lib/validators/user"

export const POST = withAuth(async (req: NextRequest, { userId }) => {
  try {
    const body: unknown = await req.json()
    const parsed = onboardingSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const {
      incomeMode,
      accountName,
      accountType,
      institution,
      currentBalancePaise,
      budgetingFramework,
    } = parsed.data

    await connectDB()

    const [account] = await Promise.all([
      Account.create({
        userId,
        name: accountName,
        type: accountType,
        institution,
        currentBalancePaise,
        linkedVia: "manual",
        isActive: true,
      }),
    ])

    const framework = budgetingFramework === "skip" ? "50-30-20" : budgetingFramework

    await User.findByIdAndUpdate(userId, {
      incomeMode,
      onboardingCompleted: true,
      "preferences.budgetingFramework": framework,
    })

    await AuditLog.create({
      userId,
      entity: "User",
      entityId: userId,
      action: "update",
      after: { onboardingCompleted: true, incomeMode },
    })

    return NextResponse.json({ ok: true, accountId: account._id.toString() })
  } catch (err) {
    console.error("[POST /api/onboarding]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
})
