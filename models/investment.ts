import mongoose, { Schema, type Document, type Model } from "mongoose"

export type InstrumentType =
  | "stock"
  | "mutual_fund"
  | "etf"
  | "fd"
  | "rd"
  | "ppf"
  | "epf"
  | "nps"
  | "gold"
  | "crypto"
  | "real_estate"
  | "other"

export interface IInvestment extends Document {
  userId: mongoose.Types.ObjectId
  accountId: mongoose.Types.ObjectId
  instrument: InstrumentType
  symbol?: string
  name: string
  units: number
  avgCostPaise: number
  currentPricePaise?: number
  investedPaise: number
  currentValuePaise: number
  currency: "INR"
  purchaseDate: Date
  maturityDate?: Date
  notes?: string
  createdAt: Date
  updatedAt: Date
}

const InvestmentSchema = new Schema<IInvestment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", required: true, index: true },
    instrument: {
      type: String,
      enum: [
        "stock", "mutual_fund", "etf", "fd", "rd", "ppf",
        "epf", "nps", "gold", "crypto", "real_estate", "other",
      ],
      required: true,
    },
    symbol: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    units: { type: Number, required: true },
    avgCostPaise: {
      type: Number,
      required: true,
      validate: { validator: Number.isInteger, message: "Cost must be integer paise" },
    },
    currentPricePaise: {
      type: Number,
      validate: { validator: Number.isInteger, message: "Price must be integer paise" },
    },
    investedPaise: {
      type: Number,
      required: true,
      validate: { validator: Number.isInteger, message: "Invested must be integer paise" },
    },
    currentValuePaise: {
      type: Number,
      required: true,
      validate: { validator: Number.isInteger, message: "Value must be integer paise" },
    },
    currency: { type: String, default: "INR" },
    purchaseDate: { type: Date, required: true },
    maturityDate: { type: Date },
    notes: { type: String },
  },
  { timestamps: true }
)

const Investment: Model<IInvestment> =
  (mongoose.models.Investment as Model<IInvestment>) ??
  mongoose.model<IInvestment>("Investment", InvestmentSchema)

export default Investment
