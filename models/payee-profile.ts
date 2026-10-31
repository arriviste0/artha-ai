import mongoose, { Schema, type Document, type Model } from "mongoose"
import type { PayeeType } from "@/lib/categorization/payee-detector"

export interface IPayeeProfile extends Document {
  userId: mongoose.Types.ObjectId
  payeeKey: string
  direction: "credit" | "debit"
  displayName: string
  payeeType: PayeeType
  categoryCounts: Record<string, number>
  lastCategory?: string
  lastSeen: Date
  txnCount: number
  userConfirmedCategory: string | null
  locked: boolean
  createdAt: Date
  updatedAt: Date
}

const PayeeProfileSchema = new Schema<IPayeeProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    payeeKey: { type: String, required: true, trim: true, index: true },
    direction: { type: String, enum: ["credit", "debit"], required: true },
    displayName: { type: String, required: true, trim: true },
    payeeType: {
      type: String,
      enum: ["business", "person", "unknown"],
      default: "unknown",
    },
    categoryCounts: {
      type: Map,
      of: Number,
      default: {},
    },
    lastCategory: { type: String, trim: true },
    lastSeen: { type: Date, default: Date.now },
    txnCount: { type: Number, default: 0 },
    userConfirmedCategory: { type: String, default: null },
    locked: { type: Boolean, default: false },
  },
  { timestamps: true }
)

// Unique compound index per user, payeeKey, and direction
PayeeProfileSchema.index({ userId: 1, payeeKey: 1, direction: 1 }, { unique: true })

const PayeeProfile: Model<IPayeeProfile> =
  (mongoose.models.PayeeProfile as Model<IPayeeProfile>) ??
  mongoose.model<IPayeeProfile>("PayeeProfile", PayeeProfileSchema)

export default PayeeProfile
