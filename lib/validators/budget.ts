import { z } from "zod"

export const createBudgetSchema = z.object({
  name: z.string().min(1).max(200),
  period: z.enum(["monthly", "weekly"]).default("monthly"),
  category: z.string().min(1).max(100),
  limitPaise: z.number().int("Must be integer paise").positive(),
  rollover: z.boolean().default(false),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
})

export const updateBudgetSchema = createBudgetSchema.partial()

export type CreateBudgetInput = z.infer<typeof createBudgetSchema>
export type CreateBudgetFormValues = z.input<typeof createBudgetSchema>
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>
