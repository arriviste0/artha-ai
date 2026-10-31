import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import Transaction from "@/models/transaction"
import AuditLog from "@/models/audit-log"
import PayeeProfile from "@/models/payee-profile"

export const POST = withAuth(async (req: NextRequest, { userId }) => {
  const body = (await req.json()) as { undoId?: string }
  const { undoId } = body

  if (!undoId || !mongoose.Types.ObjectId.isValid(undoId)) {
    return NextResponse.json({ error: "Valid undoId is required" }, { status: 400 })
  }

  await connectDB()
  const log = await AuditLog.findOne({
    _id: new mongoose.Types.ObjectId(undoId),
    userId,
    action: "bulk_recategorize",
  })

  if (!log || !log.before) {
    return NextResponse.json({ error: "Undo record not found or already restored" }, { status: 404 })
  }

  const beforeData = log.before as {
    snapshot?: Array<{
      transactionId: string
      previousCategory: string
      previousBudgetId: string | null
    }>
    payeeKey?: string
    direction?: "credit" | "debit"
    previousCategory?: string
  }

  const snapshot = beforeData.snapshot || []
  let restoredCount = 0

  // Restore each transaction to its previous category and budgetId
  for (const item of snapshot) {
    if (mongoose.Types.ObjectId.isValid(item.transactionId)) {
      await Transaction.updateOne(
        { _id: new mongoose.Types.ObjectId(item.transactionId), userId },
        {
          $set: {
            category: item.previousCategory,
            budgetId: item.previousBudgetId ? new mongoose.Types.ObjectId(item.previousBudgetId) : null,
            categoryConfirmedByUser: false,
          },
        }
      )
      restoredCount++
    }
  }

  // Restore previous payee profile category if available
  if (beforeData.payeeKey && beforeData.direction) {
    await PayeeProfile.updateOne(
      {
        userId: new mongoose.Types.ObjectId(userId),
        payeeKey: beforeData.payeeKey,
        direction: beforeData.direction,
      },
      {
        $set: {
          userConfirmedCategory: beforeData.previousCategory || null,
          locked: false,
        },
      }
    )
  }

  // Mark audit log as restored so it cannot be undone twice
  await AuditLog.updateOne({ _id: log._id }, { $set: { action: "bulk_recategorize_undone" } })

  return NextResponse.json({
    success: true,
    restoredCount,
  })
})
