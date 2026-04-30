import mongoose, { Schema, type Document, type Model } from "mongoose"

export type TransactionSource = "manual" | "statement_pdf" | "statement_csv" | "bank_api"

export interface ITransaction extends Document {
  userId: mongoose.Types.ObjectId
  accountId: mongoose.Types.ObjectId
  amountPaise: number
  currency: "INR"
  type: "credit" | "debit"
  occurredAt: Date
  description: string
  merchant?: string
  category: string
  subcategory?: string
  tags: string[]
  isRecurring: boolean
  recurringGroupId?: string
  source: TransactionSource
  sourceFileId?: string
  rawData?: Record<string, unknown>
  needsReview: boolean
  aiConfidence?: number
  splitOf?: mongoose.Types.ObjectId
  goalId?: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const TransactionSchema = new Schema<ITransaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", required: true, index: true },
    amountPaise: {
      type: Number,
      required: true,
      validate: { validator: Number.isInteger, message: "Amount must be integer paise" },
    },
    currency: { type: String, default: "INR" },
    type: { type: String, enum: ["credit", "debit"], required: true },
    occurredAt: { type: Date, required: true, index: true },
    description: { type: String, required: true, trim: true },
    merchant: { type: String, trim: true },
    category: { type: String, required: true, default: "Uncategorized" },
    subcategory: { type: String },
    tags: [{ type: String }],
    isRecurring: { type: Boolean, default: false },
    recurringGroupId: { type: String, index: true },
    source: {
      type: String,
      enum: ["manual", "statement_pdf", "statement_csv", "bank_api"],
      default: "manual",
    },
    sourceFileId: { type: String },
    rawData: { type: Schema.Types.Mixed },
    needsReview: { type: Boolean, default: false },
    aiConfidence: { type: Number, min: 0, max: 1 },
    splitOf: { type: Schema.Types.ObjectId, ref: "Transaction" },
    goalId: { type: Schema.Types.ObjectId, ref: "Goal" },
  },
  { timestamps: true }
)

TransactionSchema.index({ userId: 1, occurredAt: -1 })
TransactionSchema.index({ userId: 1, category: 1 })
TransactionSchema.index({ userId: 1, recurringGroupId: 1 })

const Transaction: Model<ITransaction> =
  (mongoose.models.Transaction as Model<ITransaction>) ??
  mongoose.model<ITransaction>("Transaction", TransactionSchema)

export default Transaction
