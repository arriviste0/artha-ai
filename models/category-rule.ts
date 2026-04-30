import mongoose, { Schema, type Document, type Model } from "mongoose"

export interface ICategoryRule extends Document {
  userId: mongoose.Types.ObjectId
  matchType: "merchant" | "description_contains" | "regex"
  pattern: string
  category: string
  subcategory?: string
  autoApply: boolean
  createdAt: Date
  updatedAt: Date
}

const CategoryRuleSchema = new Schema<ICategoryRule>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    matchType: {
      type: String,
      enum: ["merchant", "description_contains", "regex"],
      required: true,
    },
    pattern: { type: String, required: true },
    category: { type: String, required: true },
    subcategory: { type: String },
    autoApply: { type: Boolean, default: true },
  },
  { timestamps: true }
)

const CategoryRule: Model<ICategoryRule> =
  (mongoose.models.CategoryRule as Model<ICategoryRule>) ??
  mongoose.model<ICategoryRule>("CategoryRule", CategoryRuleSchema)

export default CategoryRule
