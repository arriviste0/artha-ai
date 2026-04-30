import mongoose, { Schema, type Document, type Model } from "mongoose"

export interface IAIConversation extends Document {
  userId: mongoose.Types.ObjectId
  title?: string
  aiModel: string
  totalInputTokens: number
  totalOutputTokens: number
  createdAt: Date
  updatedAt: Date
}

const AIConversationSchema = new Schema<IAIConversation>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String },
    aiModel: { type: String, required: true },
    totalInputTokens: { type: Number, default: 0 },
    totalOutputTokens: { type: Number, default: 0 },
  },
  { timestamps: true }
)

export interface IAIMessage extends Document {
  conversationId: mongoose.Types.ObjectId
  userId: mongoose.Types.ObjectId
  role: "user" | "assistant" | "tool"
  content: string
  toolName?: string
  toolCallId?: string
  inputTokens?: number
  outputTokens?: number
  createdAt: Date
}

const AIMessageSchema = new Schema<IAIMessage>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "AIConversation",
      required: true,
      index: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: { type: String, enum: ["user", "assistant", "tool"], required: true },
    content: { type: String, required: true },
    toolName: { type: String },
    toolCallId: { type: String },
    inputTokens: { type: Number },
    outputTokens: { type: Number },
  },
  { timestamps: true }
)

export const AIConversation: Model<IAIConversation> =
  (mongoose.models.AIConversation as Model<IAIConversation>) ??
  mongoose.model<IAIConversation>("AIConversation", AIConversationSchema)

export const AIMessage: Model<IAIMessage> =
  (mongoose.models.AIMessage as Model<IAIMessage>) ??
  mongoose.model<IAIMessage>("AIMessage", AIMessageSchema)
