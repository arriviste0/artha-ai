import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import { AIConversation } from "@/models/ai-conversation"
import mongoose from "mongoose"

export const GET = withAuth(async (_req: NextRequest, { userId }) => {
  await connectDB()

  const userOid = new mongoose.Types.ObjectId(userId)
  const conversations = await AIConversation.find({ userId: userOid })
    .sort({ updatedAt: -1 })
    .select("_id title aiModel createdAt updatedAt")
    .limit(30)
    .lean()

  return NextResponse.json({
    conversations: conversations.map((c) => ({
      id: c._id.toString(),
      title: c.title || "Financial Planning Session",
      aiModel: c.aiModel,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
  })
})

export const POST = withAuth(async (req: NextRequest, { userId }) => {
  const body = await req.json().catch(() => ({}))
  const title = body.title || "New Financial Planning Session"

  await connectDB()
  const userOid = new mongoose.Types.ObjectId(userId)

  const conversation = await AIConversation.create({
    userId: userOid,
    title,
    aiModel: "openai/gpt-oss-120b",
  })

  return NextResponse.json({
    conversation: {
      id: conversation._id.toString(),
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    },
  })
})
