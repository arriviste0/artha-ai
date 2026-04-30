import mongoose, { Schema, type Document, type Model } from "mongoose"

export interface IIncomeProfile extends Document {
  userId: mongoose.Types.ObjectId
  rolling3MonthAvgPaise: number
  rolling6MonthAvgPaise: number
  rolling12MonthAvgPaise: number
  volatilityScore: number
  lastComputedAt: Date
}

const IncomeProfileSchema = new Schema<IIncomeProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    rolling3MonthAvgPaise: { type: Number, default: 0 },
    rolling6MonthAvgPaise: { type: Number, default: 0 },
    rolling12MonthAvgPaise: { type: Number, default: 0 },
    volatilityScore: { type: Number, default: 0, min: 0, max: 100 },
    lastComputedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

const IncomeProfile: Model<IIncomeProfile> =
  (mongoose.models.IncomeProfile as Model<IIncomeProfile>) ??
  mongoose.model<IIncomeProfile>("IncomeProfile", IncomeProfileSchema)

export default IncomeProfile
