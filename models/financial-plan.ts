import mongoose, { Document, Model } from "mongoose"

export interface IFinancialPlan extends Document {
  userId: string
  generatedAt: Date
  summary: string
  allocationBuckets: {
    category: string
    percentage: number
    amount: number
    recommendation: string
  }[]
  riskFlags: {
    severity: "low" | "medium" | "high"
    title: string
    description: string
  }[]
  actionItems: {
    priority: number
    title: string
    description: string
  }[]
  createdAt: Date
  updatedAt: Date
}

const BucketSchema = new mongoose.Schema({
  category: { type: String, required: true },
  percentage: { type: Number, required: true },
  amount: { type: Number, required: true },
  recommendation: { type: String, required: true },
})

const RiskFlagSchema = new mongoose.Schema({
  severity: { type: String, enum: ["low", "medium", "high"], required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
})

const ActionItemSchema = new mongoose.Schema({
  priority: { type: Number, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
})

const FinancialPlanSchema = new mongoose.Schema<IFinancialPlan>(
  {
    userId: { type: String, required: true, index: true },
    generatedAt: { type: Date, required: true, default: Date.now },
    summary: { type: String, required: true },
    allocationBuckets: [BucketSchema],
    riskFlags: [RiskFlagSchema],
    actionItems: [ActionItemSchema],
  },
  { timestamps: true }
)

const FinancialPlan: Model<IFinancialPlan> =
  mongoose.models.FinancialPlan || mongoose.model<IFinancialPlan>("FinancialPlan", FinancialPlanSchema)

export default FinancialPlan
