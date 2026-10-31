import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import Transaction from "@/models/transaction"
import Budget from "@/models/budget"
import AuditLog from "@/models/audit-log"
import PayeeProfile from "@/models/payee-profile"

export const POST = withAuth(async (req: NextRequest, { userId }) => {
  await connectDB()
  const userObjectId = new mongoose.Types.ObjectId(userId)

  let body: { transactionIds?: string[] } = {}
  try {
    body = (await req.json()) as { transactionIds?: string[] }
  } catch {
    // optional body
  }

  const query: Record<string, unknown> = {
    userId: userObjectId,
    categoryConfirmedByUser: { $ne: true },
  }

  if (body.transactionIds && Array.isArray(body.transactionIds) && body.transactionIds.length > 0) {
    const validIds = body.transactionIds
      .filter((id) => mongoose.isValidObjectId(id))
      .map((id) => new mongoose.Types.ObjectId(id))
    if (validIds.length > 0) {
      query._id = { $in: validIds }
    }
  }

  // 1. Fetch all unconfirmed transactions
  const txns = await Transaction.find(query).lean()
  if (txns.length === 0) {
    return NextResponse.json({
      success: true,
      confirmedCount: 0,
      updatedPayeesCount: 0,
      message: "No unconfirmed transactions found",
    })
  }

  // 2. Group by (payeeKey, direction) to update PayeeProfiles
  const payeeMap = new Map<
    string,
    { payeeKey: string; direction: "credit" | "debit"; category: string; count: number }
  >()

  for (const t of txns) {
    const pKey =
      t.payeeKey ||
      (t.merchant || t.description || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_")
        .slice(0, 30)

    if (!pKey || !t.category) continue

    const mapKey = `${pKey}:${t.type}`
    const existing = payeeMap.get(mapKey)
    if (existing) {
      existing.count += 1
      existing.category = t.category
    } else {
      payeeMap.set(mapKey, {
        payeeKey: pKey,
        direction: t.type as "credit" | "debit",
        category: t.category,
        count: 1,
      })
    }
  }

  // 3. Upsert PayeeProfiles so future transactions from these payees are auto-categorized
  const profilePromises = Array.from(payeeMap.values()).map(async (item) => {
    return PayeeProfile.findOneAndUpdate(
      { userId: userObjectId, payeeKey: item.payeeKey, direction: item.direction },
      {
        userConfirmedCategory: item.category,
        locked: true,
        lastCategory: item.category,
        lastSeen: new Date(),
        $inc: { txnCount: item.count },
        $set: { [`categoryCounts.${item.category}`]: item.count },
      },
      { upsert: true, new: true }
    )
  })

  // 4. Update all target transactions
  const txnIds = txns.map((t) => t._id)
  await Promise.all([
    ...profilePromises,
    Transaction.updateMany(
      { _id: { $in: txnIds } },
      { $set: { categoryConfirmedByUser: true, needsReview: false } }
    ),
  ])

  // 5. Audit log
  const log = await AuditLog.create({
    userId,
    entity: "PayeeProfile",
    action: "bulk_recategorize",
    after: { confirmedCount: txns.length, payeesUpdated: payeeMap.size },
  })

  return NextResponse.json({
    success: true,
    confirmedCount: txns.length,
    updatedPayeesCount: payeeMap.size,
    undoId: (log as unknown as { _id: { toString(): string } })._id.toString(),
  })
})
