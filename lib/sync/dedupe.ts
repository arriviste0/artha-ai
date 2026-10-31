import mongoose from "mongoose"
import Transaction from "@/models/transaction"
import type { ParsedSyncTransaction } from "./parser"

export interface DedupeResult {
  newTransactions: ParsedSyncTransaction[]
  duplicateCount: number
}

/**
 * Remove duplicates:
 * 1. By reference number (if present).
 * 2. Else by (amount + time [within 10 mins] + merchant).
 * Ensures the same transaction is never added twice even if it arrives via both email and SMS.
 */
export async function deduplicateTransactions(
  userId: string,
  incoming: ParsedSyncTransaction[]
): Promise<DedupeResult> {
  if (incoming.length === 0) {
    return { newTransactions: [], duplicateCount: 0 }
  }

  const isConnected = mongoose.connection.readyState === 1
  const userOid = mongoose.isValidObjectId(userId)
    ? new mongoose.Types.ObjectId(userId)
    : undefined

  // 1. Gather all reference numbers from incoming items to batch-check DB
  const refNumbers = incoming
    .map((t) => t.referenceNumber?.trim())
    .filter((ref): ref is string => Boolean(ref && ref.length > 0))

  let existingRefNumbers = new Set<string>()
  if (isConnected && userOid && refNumbers.length > 0) {
    const existingWithRefs = await Transaction.find({
      userId: userOid,
      referenceNumber: { $in: refNumbers },
    })
      .select("referenceNumber")
      .lean()

    existingRefNumbers = new Set(
      existingWithRefs
        .map((t) => t.referenceNumber?.trim())
        .filter((ref): ref is string => typeof ref === "string" && ref.length > 0)
    )
  }

  // 2. Fetch existing transactions in the date range of incoming items for time+amount check
  const timestamps = incoming.map((t) => t.occurredAt.getTime())
  const minTime = new Date(Math.min(...timestamps) - 15 * 60 * 1000) // 15 mins before
  const maxTime = new Date(Math.max(...timestamps) + 15 * 60 * 1000) // 15 mins after

  let existingInRange: Array<{
    amountPaise: number
    type: string
    occurredAt: Date
    merchant?: string
    description?: string
    referenceNumber?: string
  }> = []

  if (isConnected && userOid) {
    existingInRange = await Transaction.find({
      userId: userOid,
      occurredAt: { $gte: minTime, $lte: maxTime },
    })
      .select("amountPaise type occurredAt merchant description referenceNumber")
      .lean()
  }

  const newTransactions: ParsedSyncTransaction[] = []
  let duplicateCount = 0

  // Track items accepted in the current batch for intra-batch deduplication
  const batchRefNumbers = new Set<string>()
  const batchItems: ParsedSyncTransaction[] = []

  for (const item of incoming) {
    let isDuplicate = false
    const itemRef = item.referenceNumber?.trim()

    // A. Check by reference number (primary key for UPI / bank transfers)
    if (itemRef) {
      if (existingRefNumbers.has(itemRef) || batchRefNumbers.has(itemRef)) {
        isDuplicate = true
      }
    }

    // B. Fallback: check by amount + time window + merchant
    // CRITICAL: If BOTH transactions have reference numbers and they differ,
    // they are separate transactions (e.g. repeated transfers to the same person)
    // and MUST NEVER be considered duplicates!
    if (!isDuplicate) {
      const itemTime = item.occurredAt.getTime()
      const WINDOW_MS = 10 * 60 * 1000 // 10 minutes

      // Check against DB
      const matchedDb = existingInRange.some((dbTx) => {
        const dbRef = dbTx.referenceNumber?.trim()
        if (itemRef && dbRef && itemRef.toLowerCase() !== dbRef.toLowerCase()) {
          return false
        }

        if (dbTx.amountPaise !== item.amountPaise || dbTx.type !== item.type) return false
        const timeDiff = Math.abs(new Date(dbTx.occurredAt).getTime() - itemTime)
        if (timeDiff > WINDOW_MS) return false

        const cleanDbMerchant = (dbTx.merchant || dbTx.description || "").toLowerCase()
        const cleanItemMerchant = item.merchant.toLowerCase()
        return (
          cleanDbMerchant.includes(cleanItemMerchant) ||
          cleanItemMerchant.includes(cleanDbMerchant) ||
          cleanItemMerchant.length === 0
        )
      })

      if (matchedDb) {
        isDuplicate = true
      } else {
        // Check against current batch
        const matchedBatch = batchItems.some((batchTx) => {
          const batchRef = batchTx.referenceNumber?.trim()
          if (itemRef && batchRef && itemRef.toLowerCase() !== batchRef.toLowerCase()) {
            return false
          }

          if (batchTx.amountPaise !== item.amountPaise || batchTx.type !== item.type) return false
          const timeDiff = Math.abs(batchTx.occurredAt.getTime() - itemTime)
          if (timeDiff > WINDOW_MS) return false

          const cleanBatch = batchTx.merchant.toLowerCase()
          const cleanItem = item.merchant.toLowerCase()
          return cleanBatch.includes(cleanItem) || cleanItem.includes(cleanBatch)
        })

        if (matchedBatch) {
          isDuplicate = true
        }
      }
    }

    if (isDuplicate) {
      duplicateCount++
    } else {
      newTransactions.push(item)
      batchItems.push(item)
      if (itemRef) {
        batchRefNumbers.add(itemRef)
      }
    }
  }

  return { newTransactions, duplicateCount }
}
