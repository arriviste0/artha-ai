import { NextResponse, type NextRequest } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { getGmailAuthUrl } from "@/lib/sync/gmail"

export const GET = withAuth(async (req: NextRequest, { userId }) => {
  try {
    const origin = req.nextUrl.origin
    const authUrl = getGmailAuthUrl(origin, userId)
    return NextResponse.redirect(authUrl)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to initiate Gmail connection"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
})
