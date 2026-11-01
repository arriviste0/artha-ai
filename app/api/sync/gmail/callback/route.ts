import { NextResponse, type NextRequest } from "next/server"
import { connectDB } from "@/lib/db"
import SyncConnection from "@/models/sync-connection"
import { exchangeGmailCode, getGmailUserEmail } from "@/lib/sync/gmail"
import mongoose from "mongoose"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state") // userId
  const error = searchParams.get("error")

  const appBase = process.env.NEXTAUTH_URL || req.nextUrl.origin

  if (error || !code || !state) {
    return NextResponse.redirect(`${appBase}/transactions?syncError=${encodeURIComponent(error || "Authorization cancelled")}`)
  }

  try {
    await connectDB()

    if (!mongoose.Types.ObjectId.isValid(state)) {
      return NextResponse.redirect(`${appBase}/transactions?syncError=Invalid+user+state`)
    }

    const tokens = await exchangeGmailCode(code, req.nextUrl.origin)
    const email = await getGmailUserEmail(tokens.access_token)

    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000)

    await SyncConnection.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(state), provider: "gmail" },
      {
        $set: {
          accessToken: tokens.access_token,
          ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
          tokenExpiresAt,
          hasGmailScope: true,
          ...(email ? { email } : {}),
        },
      },
      { upsert: true, returnDocument: "after" }
    )

    return NextResponse.redirect(`${appBase}/transactions?sync=gmail-connected`)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to connect Gmail"
    return NextResponse.redirect(`${appBase}/transactions?syncError=${encodeURIComponent(msg)}`)
  }
}
