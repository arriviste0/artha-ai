import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { connectDB } from "@/lib/db"
import { AIConversation, AIMessage } from "@/models/ai-conversation"
import mongoose from "mongoose"

export const GET = withAuth(async (_req: NextRequest, { userId, params }) => {
  const conversationId = params?.id as string
  if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
    return NextResponse.json({ error: "Invalid conversation ID" }, { status: 400 })
  }

  await connectDB()
  const userOid = new mongoose.Types.ObjectId(userId)
  const convOid = new mongoose.Types.ObjectId(conversationId)

  const conversation = await AIConversation.findOne({ _id: convOid, userId: userOid }).lean()
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
  }

  const messages = await AIMessage.find({ conversationId: convOid, userId: userOid })
    .sort({ createdAt: 1 })
    .lean()

  return NextResponse.json({
    conversation: {
      id: conversation._id.toString(),
      title: conversation.title || "Financial Planning Session",
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    },
    messages: messages.map((m) => ({
      id: m._id.toString(),
      role: m.role,
      content: m.content,
      analysis: m.analysis,
      actionableChanges: m.actionableChanges || [],
      warnings: m.warnings || [],
      quickReplies: m.quickReplies || [],
      appliedActions: m.appliedActions || {},
      createdAt: m.createdAt,
    })),
  })
})

export const DELETE = withAuth(async (_req: NextRequest, { userId, params }) => {
  const conversationId = params?.id as string
  if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
    return NextResponse.json({ error: "Invalid conversation ID" }, { status: 400 })
  }

  await connectDB()
  const userOid = new mongoose.Types.ObjectId(userId)
  const convOid = new mongoose.Types.ObjectId(conversationId)

  const deleted = await AIConversation.findOneAndDelete({ _id: convOid, userId: userOid })
  if (!deleted) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
  }

  // Delete all messages belonging to this conversation
  await AIMessage.deleteMany({ conversationId: convOid, userId: userOid })

  return NextResponse.json({ success: true, message: "Conversation deleted" })
})
