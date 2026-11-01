import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import Transaction from "@/models/transaction"
import Budget from "@/models/budget"
import AuditLog from "@/models/audit-log"
import PayeeProfile from "@/models/payee-profile"
import { guardCategoryDirection, isValidCategoryForType } from "@/lib/categorization/categories"

export const POST = withAuth(async (req: NextRequest, { userId }) => {
  const body = (await req.json()) as {
    payeeKey?: string
    direction?: "credit" | "debit"
    category?: string
    applyToPast?: boolean
  }

  const { payeeKey, direction = "debit", category, applyToPast = true } = body

  if (!payeeKey || !category) {
    return NextResponse.json({ error: "payeeKey and category are required" }, { status: 400 })
  }

  if (!isValidCategoryForType(category, direction)) {
    return NextResponse.json(
      { error: `Category "${category}" is not valid for ${direction} transactions.` },
      { status: 400 }
    )
  }

  await connectDB()
  const userObjectId = new mongoose.Types.ObjectId(userId)

  // 1. Update PayeeProfile
  const profile = await PayeeProfile.findOneAndUpdate(
    { userId: userObjectId, payeeKey, direction },
    {
      userConfirmedCategory: category,
      locked: true,
      lastCategory: category,
      lastSeen: new Date(),
      $inc: { txnCount: 1 },
      $set: { [`categoryCounts.${category}`]: 1 },
    },
    { upsert: true, returnDocument: "after" }
  )

  let updatedCount = 0
  let undoLogId: string | null = null

  // 2. Re-categorise all past transactions from this payee
  if (applyToPast) {
    const pastTxns = await Transaction.find({
      userId: userObjectId,
      payeeKey,
      type: direction,
    }).lean()

    if (pastTxns.length > 0) {
      // Snapshot previous categories for undo
      const snapshot = pastTxns.map((t) => ({
        transactionId: t._id.toString(),
        previousCategory: t.category,
        previousBudgetId: t.budgetId ? t.budgetId.toString() : null,
      }))

      // Check matching budget for new category
      const matchingBudget = await Budget.findOne({ userId: userObjectId, category })

      await Transaction.updateMany(
        { userId: userObjectId, payeeKey, type: direction },
        {
          $set: {
            category,
            categoryConfirmedByUser: true,
            ...(matchingBudget ? { budgetId: matchingBudget._id } : {}),
          },
        }
      )

      updatedCount = pastTxns.length

      // Save audit log for undo
      const log = await AuditLog.create({
        userId,
        entity: "PayeeProfile",
        entityId: payeeKey,
        action: "bulk_recategorize",
        before: { snapshot, payeeKey, direction, previousCategory: profile?.lastCategory },
        after: { newCategory: category, updatedCount },
      })

      undoLogId = (log as unknown as { _id: { toString(): string } })._id.toString()
    }
  }

  return NextResponse.json({
    success: true,
    payeeKey,
    category,
    updatedCount,
    undoId: undoLogId,
  })
})
