import { NextResponse, type NextRequest } from "next/server"
import mongoose from "mongoose"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import SyncConnection from "@/models/sync-connection"
import Account from "@/models/account"
import Investment from "@/models/investment"
import { fetchInvestmentEmails, getValidAccessToken } from "@/lib/sync/gmail"
import { parseInvestmentPurchaseAlert } from "@/lib/sync/investment-parser"

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export const POST = withAuth(async (req: NextRequest, { userId }) => {
  await connectDB()

  const connection = await SyncConnection.findOne({ userId, provider: "gmail" })
  if (!connection || (!connection.accessToken && !connection.refreshToken) || connection.hasGmailScope === false) {
    return NextResponse.json({
      error: "Gmail read permission missing. Please connect your Gmail account.",
      notConnected: true,
    }, { status: 400 })
  }

  let body: { fromDate?: string } = {}
  try {
    body = (await req.json()) as { fromDate?: string }
  } catch {
    // Use the default range when no body was supplied.
  }

  let fromDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
  if (body.fromDate) {
    const selectedDate = new Date(body.fromDate)
    if (!Number.isNaN(selectedDate.getTime())) {
      selectedDate.setUTCHours(0, 0, 0, 0)
      fromDate = selectedDate
    }
  }

  const userOid = new mongoose.Types.ObjectId(userId)
  const account = await Account.findOne({ userId: userOid, type: "demat", isActive: true })
    || await Account.findOne({ userId: userOid, isActive: true })
  if (!account) {
    return NextResponse.json({
      error: "Add a Demat or savings account before syncing investment emails.",
    }, { status: 400 })
  }

  let accessToken: string
  try {
    accessToken = await getValidAccessToken(connection)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Authentication error"
    return NextResponse.json({ error: message, notConnected: true }, { status: 401 })
  }

  let emails
  try {
    emails = await fetchInvestmentEmails(accessToken, fromDate)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch investment emails"
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const eligibleEmails = emails.filter((email) => email.date.getTime() >= fromDate.getTime())
  const existingImports = await Investment.find({
    userId: userOid,
    syncEmailIds: { $in: eligibleEmails.map((email) => email.id) },
  }).select({ syncEmailIds: 1 }).lean()
  const importedEmailIds = new Set(existingImports.flatMap((investment) => investment.syncEmailIds || []))

  let createdCount = 0
  let updatedCount = 0
  let duplicateCount = 0
  let skippedCount = 0

  for (const email of eligibleEmails) {
    if (importedEmailIds.has(email.id)) {
      duplicateCount++
      continue
    }

    const purchase = parseInvestmentPurchaseAlert(email.bodyText, email.date)
    if (!purchase) {
      skippedCount++
      continue
    }

    const identifierFilter = purchase.symbol
      ? { symbol: new RegExp(`^${escapeRegex(purchase.symbol)}$`, "i") }
      : { name: new RegExp(`^${escapeRegex(purchase.name)}$`, "i") }
    const existingHolding = await Investment.findOne({
      userId: userOid,
      accountId: account._id,
      ...identifierFilter,
    })

    if (existingHolding) {
      const units = existingHolding.units + purchase.units
      const investedPaise = existingHolding.investedPaise + purchase.investedPaise
      existingHolding.units = units
      existingHolding.investedPaise = investedPaise
      existingHolding.avgCostPaise = Math.round(investedPaise / units)
      existingHolding.currentValuePaise += purchase.investedPaise
      existingHolding.purchaseDate = existingHolding.purchaseDate < purchase.occurredAt
        ? existingHolding.purchaseDate
        : purchase.occurredAt
      existingHolding.syncEmailIds = [...new Set([...(existingHolding.syncEmailIds || []), email.id])]
      await existingHolding.save()
      updatedCount++
    } else {
      const avgCostPaise = Math.round(purchase.investedPaise / purchase.units)
      await Investment.create({
        userId: userOid,
        accountId: account._id,
        instrument: purchase.instrument,
        name: purchase.name,
        symbol: purchase.symbol,
        units: purchase.units,
        avgCostPaise,
        currentPricePaise: avgCostPaise,
        investedPaise: purchase.investedPaise,
        currentValuePaise: purchase.investedPaise,
        purchaseDate: purchase.occurredAt,
        notes: "Imported from broker trade-confirmation email",
        syncEmailIds: [email.id],
      })
      createdCount++
    }
    importedEmailIds.add(email.id)
  }

  return NextResponse.json({
    syncedCount: createdCount + updatedCount,
    createdCount,
    updatedCount,
    duplicateCount,
    skippedCount,
    noEmailsFound: eligibleEmails.length === 0,
  })
})
