import mongoose, { Schema, type Document, type Model } from "mongoose"

export type IncomeMode = "salaried" | "variable" | "business"
export type BudgetingFramework = "50-30-20" | "50-20-30" | "custom"

export interface IUser extends Document {
  email: string
  passwordHash?: string
  name?: string
  image?: string
  incomeMode: IncomeMode
  baseCurrency: "INR"
  onboardingCompleted: boolean
  preferences: {
    theme: "light" | "dark" | "system"
    notifications: boolean
    budgetingFramework: BudgetingFramework
  }
  createdAt: Date
  updatedAt: Date
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String },
    name: { type: String, trim: true },
    image: { type: String },
    incomeMode: { type: String, enum: ["salaried", "variable", "business"], default: "salaried" },
    baseCurrency: { type: String, default: "INR" },
    onboardingCompleted: { type: Boolean, default: false },
    preferences: {
      theme: { type: String, enum: ["light", "dark", "system"], default: "system" },
      notifications: { type: Boolean, default: true },
      budgetingFramework: {
        type: String,
        enum: ["50-30-20", "50-20-30", "custom"],
        default: "50-30-20",
      },
    },
  },
  { timestamps: true }
)

const User: Model<IUser> =
  (mongoose.models.User as Model<IUser>) ?? mongoose.model<IUser>("User", UserSchema)

export default User
