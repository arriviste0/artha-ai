import mongoose, { Schema, type Document, type Model } from "mongoose"

export type AccountType =
  | "savings"
  | "current"
  | "credit_card"
  | "wallet"
  | "demat"
  | "cash"
  | "loan"

export type LinkedVia = "manual" | "statement_upload" | "hdfc_api" | "aa_framework"

export interface IAccount extends Document {
  userId: mongoose.Types.ObjectId
  name: string
  type: AccountType
  institution: string
  accountNumberMasked?: string
  currentBalancePaise: number
  currency: "INR"
  linkedVia: LinkedVia
  linkedProviderId?: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const AccountSchema = new Schema<IAccount>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["savings", "current", "credit_card", "wallet", "demat", "cash", "loan"],
      required: true,
    },
    institution: { type: String, trim: true, default: "" },
    accountNumberMasked: { type: String },
    currentBalancePaise: {
      type: Number,
      required: true,
      default: 0,
      validate: { validator: Number.isInteger, message: "Balance must be integer paise" },
    },
    currency: { type: String, default: "INR" },
    linkedVia: {
      type: String,
      enum: ["manual", "statement_upload", "hdfc_api", "aa_framework"],
      default: "manual",
    },
    linkedProviderId: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)

const Account: Model<IAccount> =
  (mongoose.models.Account as Model<IAccount>) ??
  mongoose.model<IAccount>("Account", AccountSchema)

export default Account
