import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { connectDB } from "@/lib/db"
import User from "@/models/user"
import { signUpSchema } from "@/lib/validators/user"

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json()
    const parsed = signUpSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const { name, email, password } = parsed.data

    await connectDB()
    const existing = await User.findOne({ email: email.toLowerCase() })
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    await User.create({ email: email.toLowerCase(), name, passwordHash })

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
