import { z } from "zod"

export const signUpSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[0-9]/, "Must contain a number"),
})

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
})

export const onboardingSchema = z.object({
  incomeMode: z.enum(["salaried", "variable", "business"]),
  accountName: z.string().min(1, "Account name is required").max(100),
  accountType: z.enum(["savings", "current", "credit_card", "wallet", "demat", "cash", "loan"]),
  institution: z.string().max(100).default(""),
  currentBalancePaise: z
    .number()
    .int("Balance must be integer paise")
    .min(0, "Balance cannot be negative"),
  monthlyIncomePaise: z.number().int().min(0),
  topCategories: z.array(z.string()).min(1).max(10),
  budgetingFramework: z.enum(["50-30-20", "50-20-30", "custom", "skip"]),
})

export type SignUpInput = z.infer<typeof signUpSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type OnboardingInput = z.infer<typeof onboardingSchema>
