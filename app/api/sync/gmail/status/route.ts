import { NextResponse, type NextRequest } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import SyncConnection from "@/models/sync-connection"
import crypto from "crypto"

export const GET = withAuth(async (_req: NextRequest, { userId }) => {
  await connectDB()

  let connection = await SyncConnection.findOne({ userId, provider: "gmail" })

  // Ensure user has a webhook token for iOS shortcuts
  if (!connection) {
    const webhookToken = crypto.randomBytes(16).toString("hex")
    connection = await SyncConnection.create({
      userId,
      provider: "gmail",
      webhookToken,
    })
  } else if (!connection.webhookToken) {
    connection.webhookToken = crypto.randomBytes(16).toString("hex")
    await connection.save()
  }

  // Check if token actually has Gmail read scope
  if (connection.hasGmailScope === undefined && connection.accessToken) {
    try {
      const tokenInfoRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${connection.accessToken}`
      )
      if (tokenInfoRes.ok) {
        const tokenInfo = (await tokenInfoRes.json()) as { scope?: string }
        connection.hasGmailScope = Boolean(tokenInfo.scope && tokenInfo.scope.includes("gmail"))
      } else {
        connection.hasGmailScope = false
      }
      await connection.save()
    } catch {
      // Network failure, leave as false
      connection.hasGmailScope = false
    }
  }

  const isConnected = Boolean(connection.hasGmailScope && (connection.accessToken || connection.refreshToken))

  return NextResponse.json({
    connected: isConnected,
    email: connection.email,
    lastSyncedAt: connection.lastSyncedAt ? connection.lastSyncedAt.toISOString() : null,
    webhookToken: connection.webhookToken,
  })
})
