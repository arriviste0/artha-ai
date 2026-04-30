import { z } from "zod"

export const accountTypeSchema = z.enum([
  "savings",
  "current",
  "credit_card",
  "wallet",
  "demat",
  "cash",
  "loan",
])

export const createAccountSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  type: accountTypeSchema,
  institution: z.string().max(100).default(""),
  accountNumberMasked: z.string().max(4).optional(),
  currentBalancePaise: z.number().int("Must be integer paise").default(0),
})

export const updateAccountSchema = createAccountSchema.partial()

export type CreateAccountInput = z.infer<typeof createAccountSchema>
export type CreateAccountFormValues = z.input<typeof createAccountSchema>
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>
