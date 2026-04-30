import mongoose, { Schema, type Document, type Model } from "mongoose"

export interface IBudget extends Document {
  userId: mongoose.Types.ObjectId
  name: string
  period: "monthly" | "weekly"
  category: string
  limitPaise: number
  currency: "INR"
  rollover: boolean
  startDate: Date
  endDate?: Date
  createdAt: Date
  updatedAt: Date
}

const BudgetSchema = new Schema<IBudget>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    period: { type: String, enum: ["monthly", "weekly"], default: "monthly" },
    category: { type: String, required: true },
    limitPaise: {
      type: Number,
      required: true,
      validate: { validator: Number.isInteger, message: "Limit must be integer paise" },
    },
    currency: { type: String, default: "INR" },
    rollover: { type: Boolean, default: false },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
  },
  { timestamps: true }
)

const Budget: Model<IBudget> =
  (mongoose.models.Budget as Model<IBudget>) ?? mongoose.model<IBudget>("Budget", BudgetSchema)

export default Budget
