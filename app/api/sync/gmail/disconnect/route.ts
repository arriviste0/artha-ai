import { NextResponse, type NextRequest } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import SyncConnection from "@/models/sync-connection"
import { revokeGmailToken } from "@/lib/sync/gmail"

export const POST = withAuth(async (_req: NextRequest, { userId }) => {
  await connectDB()

  const connection = await SyncConnection.findOne({ userId, provider: "gmail" })
  if (connection) {
    if (connection.accessToken) {
      await revokeGmailToken(connection.accessToken)
    }
    if (connection.refreshToken) {
      await revokeGmailToken(connection.refreshToken)
    }

    connection.accessToken = undefined
    connection.refreshToken = undefined
    connection.tokenExpiresAt = undefined
    connection.email = undefined
    await connection.save()
  }

  return NextResponse.json({ success: true, message: "Gmail disconnected and access revoked" })
})
