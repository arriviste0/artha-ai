import mongoose, { Schema, type Document, type Model } from "mongoose"

export type GoalKind = "savings" | "emergency_fund" | "debt_payoff"
export type GoalStatus = "active" | "paused" | "achieved" | "abandoned"

export interface IGoal extends Document {
  userId: mongoose.Types.ObjectId
  kind: GoalKind
  name: string
  targetPaise: number
  currentPaise: number
  currency: "INR"
  targetDate?: Date
  monthlyContributionPaise: number
  linkedAccountId?: mongoose.Types.ObjectId
  priority: number
  status: GoalStatus
  aiPlan?: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

const GoalSchema = new Schema<IGoal>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: { type: String, enum: ["savings", "emergency_fund", "debt_payoff"], required: true },
    name: { type: String, required: true, trim: true },
    targetPaise: {
      type: Number,
      required: true,
      validate: { validator: Number.isInteger, message: "Target must be integer paise" },
    },
    currentPaise: {
      type: Number,
      default: 0,
      validate: { validator: Number.isInteger, message: "Current must be integer paise" },
    },
    currency: { type: String, default: "INR" },
    targetDate: { type: Date },
    monthlyContributionPaise: {
      type: Number,
      default: 0,
      validate: { validator: Number.isInteger, message: "Contribution must be integer paise" },
    },
    linkedAccountId: { type: Schema.Types.ObjectId, ref: "Account" },
    priority: { type: Number, min: 1, max: 5, default: 3 },
    status: {
      type: String,
      enum: ["active", "paused", "achieved", "abandoned"],
      default: "active",
    },
    aiPlan: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
)

const Goal: Model<IGoal> =
  (mongoose.models.Goal as Model<IGoal>) ?? mongoose.model<IGoal>("Goal", GoalSchema)

export default Goal
