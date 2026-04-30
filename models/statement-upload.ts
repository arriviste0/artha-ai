import mongoose, { Schema, type Document, type Model } from "mongoose"

export type UploadStatus = "uploaded" | "parsing" | "parsed" | "failed" | "reviewed"
export type ParseMethod = "pdf_text" | "pdf_vision" | "csv"
export type DraftStatus = "pending" | "accepted" | "rejected"

export interface DraftTransaction {
  _id?: string
  rawLine: string
  occurredAt: string
  description: string
  amountPaise: number
  type: "credit" | "debit"
  category: string
  merchant?: string
  confidence: number
  needsReview: boolean
  status: DraftStatus
}

export interface IStatementUpload extends Document {
  userId: mongoose.Types.ObjectId
  fileKey: string
  fileName: string
  mimeType: string
  sizeBytes: number
  accountId: mongoose.Types.ObjectId
  status: UploadStatus
  parseMethod?: ParseMethod
  detectedRows: number
  importedTxnCount: number
  parseErrors: string[]
  draftTransactions: DraftTransaction[]
  uploadedAt: Date
  parsedAt?: Date
}

const DraftTransactionSchema = new Schema<DraftTransaction>(
  {
    rawLine: { type: String, required: true },
    occurredAt: { type: String, required: true },
    description: { type: String, required: true },
    amountPaise: { type: Number, required: true },
    type: { type: String, enum: ["credit", "debit"], required: true },
    category: { type: String, required: true },
    merchant: { type: String },
    confidence: { type: Number, default: 1 },
    needsReview: { type: Boolean, default: false },
    status: { type: String, enum: ["pending", "accepted", "rejected"], default: "pending" },
  },
  { _id: true }
)

const StatementUploadSchema = new Schema<IStatementUpload>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    fileKey: { type: String, required: true },
    fileName: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    status: {
      type: String,
      enum: ["uploaded", "parsing", "parsed", "failed", "reviewed"],
      default: "uploaded",
    },
    parseMethod: { type: String, enum: ["pdf_text", "pdf_vision", "csv"] },
    detectedRows: { type: Number, default: 0 },
    importedTxnCount: { type: Number, default: 0 },
    parseErrors: [{ type: String }],
    draftTransactions: { type: [DraftTransactionSchema], default: [] },
    uploadedAt: { type: Date, default: Date.now },
    parsedAt: { type: Date },
  },
  { timestamps: true }
)

const StatementUpload: Model<IStatementUpload> =
  (mongoose.models.StatementUpload as Model<IStatementUpload>) ??
  mongoose.model<IStatementUpload>("StatementUpload", StatementUploadSchema)

export default StatementUpload
