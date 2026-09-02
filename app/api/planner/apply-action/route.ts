import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import Budget from "@/models/budget"
import Goal from "@/models/goal"
import AuditLog from "@/models/audit-log"
import { actionableChangeSchema } from "@/lib/ai/planner-advisor"
import { paiseToRupees } from "@/lib/money"
import mongoose from "mongoose"

export const POST = withAuth(async (req: NextRequest, { userId }) => {
  const body: unknown = await req.json()
  const parsed = actionableChangeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid action payload: " + parsed.error.issues[0]?.message },
      { status: 400 }
    )
  }

  await connectDB()
  const action = parsed.data

  try {
    switch (action.type) {
      case "set_budget": {
        if (!mongoose.Types.ObjectId.isValid(action.budgetId)) {
          return NextResponse.json({ error: "Invalid budget ID" }, { status: 400 })
        }

        const prev = await Budget.findOne({ _id: action.budgetId, userId })
        if (!prev) {
          return NextResponse.json({ error: "Budget not found" }, { status: 404 })
        }

        const updated = await Budget.findOneAndUpdate(
          { _id: action.budgetId, userId },
          { $set: { limitPaise: action.suggestedLimitPaise } },
          { new: true }
        ).lean()

        await AuditLog.create({
          userId,
          entity: "Budget",
          entityId: action.budgetId,
          action: "update",
          before: { limitPaise: prev.limitPaise },
          after: { limitPaise: action.suggestedLimitPaise },
        })

        return NextResponse.json({
          success: true,
          message: `Budget for ${action.category} updated to ₹${paiseToRupees(action.suggestedLimitPaise).toLocaleString("en-IN")}`,
          entity: updated,
        })
      }

      case "create_budget": {
        const now = new Date()
        const startDate = new Date(now.getFullYear(), now.getMonth(), 1)

        const budget = await Budget.create({
          userId,
          name: action.name,
          category: action.category,
          period: action.period,
          limitPaise: action.limitPaise,
          startDate,
        })

        await AuditLog.create({
          userId,
          entity: "Budget",
          entityId: budget._id,
          action: "create",
          after: {
            name: action.name,
            category: action.category,
            limitPaise: action.limitPaise,
          },
        })

        return NextResponse.json({
          success: true,
          message: `Created budget "${action.name}" of ₹${paiseToRupees(action.limitPaise).toLocaleString("en-IN")}`,
          entity: budget,
        })
      }

      case "create_goal": {
        const goal = await Goal.create({
          userId,
          name: action.name,
          kind: action.kind,
          targetPaise: action.targetPaise,
          currentPaise: 0,
          monthlyContributionPaise: action.monthlyContributionPaise,
          targetDate: action.targetDate ? new Date(action.targetDate) : undefined,
          status: "active",
        })

        await AuditLog.create({
          userId,
          entity: "Goal",
          entityId: goal._id,
          action: "create",
          after: {
            name: action.name,
            kind: action.kind,
            targetPaise: action.targetPaise,
          },
        })

        return NextResponse.json({
          success: true,
          message: `Created goal "${action.name}" with target ₹${paiseToRupees(action.targetPaise).toLocaleString("en-IN")}`,
          entity: goal,
        })
      }

      case "update_goal": {
        if (!mongoose.Types.ObjectId.isValid(action.goalId)) {
          return NextResponse.json({ error: "Invalid goal ID" }, { status: 400 })
        }

        const prev = await Goal.findOne({ _id: action.goalId, userId })
        if (!prev) {
          return NextResponse.json({ error: "Goal not found" }, { status: 404 })
        }

        const updateFields: Record<string, unknown> = {}
        if (action.suggestedMonthlyContributionPaise !== undefined) {
          updateFields.monthlyContributionPaise = action.suggestedMonthlyContributionPaise
        }
        if (action.suggestedTargetPaise !== undefined) {
          updateFields.targetPaise = action.suggestedTargetPaise
        }

        const updated = await Goal.findOneAndUpdate(
          { _id: action.goalId, userId },
          { $set: updateFields },
          { new: true }
        ).lean()

        await AuditLog.create({
          userId,
          entity: "Goal",
          entityId: action.goalId,
          action: "update",
          before: {
            monthlyContributionPaise: prev.monthlyContributionPaise,
            targetPaise: prev.targetPaise,
          },
          after: updateFields,
        })

        return NextResponse.json({
          success: true,
          message: `Updated goal "${action.name}" successfully`,
          entity: updated,
        })
      }

      default:
        return NextResponse.json({ error: "Unsupported action type" }, { status: 400 })
    }
  } catch (err) {
    console.error("Apply Action Error:", err)
    return NextResponse.json(
      { error: (err as Error).message || "Failed to execute financial action" },
      { status: 500 }
    )
  }
})
