import { auth } from "@/lib/auth"
import { NextResponse, type NextRequest } from "next/server"

export type AuthedHandler = (
  req: NextRequest,
  ctx: { userId: string; params?: Record<string, string> }
) => Promise<NextResponse>

/** Wraps an API route handler, injects verified userId. Returns 401 if unauthenticated. */
export function withAuth(handler: AuthedHandler) {
  return async (req: NextRequest, context: { params?: Promise<Record<string, string>> }) => {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const params = context.params ? await context.params : undefined
    return handler(req, { userId: session.user.id, params })
  }
}
