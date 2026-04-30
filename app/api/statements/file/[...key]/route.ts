import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import fs from "fs/promises"
import path from "path"

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ key: string[] }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const userId = session.user.id

  const { key: keyParts } = await context.params
  const fileKey = keyParts.join("/")

  if (!fileKey.startsWith(`statements/${userId}/`)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const filePath = path.join(process.cwd(), "uploads", fileKey)
  try {
    const buffer = await fs.readFile(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const contentType = ext === ".pdf" ? "application/pdf" : "text/csv"
    return new NextResponse(buffer, {
      headers: { "Content-Type": contentType, "Content-Disposition": "inline" },
    })
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
}
