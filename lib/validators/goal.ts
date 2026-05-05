import { z } from "zod"

export const createGoalSchema = z.object({
  kind: z.enum(["savings", "emergency_fund", "debt_payoff"]),
  name: z.string().min(1).max(200),
  targetPaise: z.number().int("Must be integer paise").positive(),
  targetDate: z.string().datetime().optional(),
  monthlyContributionPaise: z.number().int().min(0).default(0),
  linkedAccountId: z.string().optional(),
  priority: z.number().int().min(1).max(5).default(3),
})

export const updateGoalSchema = createGoalSchema
  .partial()
  .extend({
    currentPaise: z.number().int("Must be integer paise").min(0).optional(),
    status: z.enum(["active", "paused", "achieved", "abandoned"]).optional(),
  })

export type CreateGoalInput = z.infer<typeof createGoalSchema>
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>
