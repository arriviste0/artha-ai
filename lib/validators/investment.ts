import { z } from "zod"

export const instrumentTypeSchema = z.enum([
  "stock", "mutual_fund", "etf", "fd", "rd", "ppf",
  "epf", "nps", "gold", "crypto", "real_estate", "other",
])

export const createInvestmentSchema = z.object({
  accountId: z.string().min(1, "Account is required"),
  instrument: instrumentTypeSchema,
  name: z.string().min(1, "Name is required").max(200),
  symbol: z.string().max(20).optional(),
  units: z.number().positive("Units must be positive"),
  avgCostPaise: z.number().int().min(0),
  currentPricePaise: z.number().int().min(0).optional(),
  investedPaise: z.number().int().min(0),
  currentValuePaise: z.number().int().min(0),
  purchaseDate: z.string().min(1, "Purchase date is required"),
  maturityDate: z.string().optional(),
  notes: z.string().max(500).optional(),
})

export const updateInvestmentSchema = createInvestmentSchema.partial()

export type CreateInvestmentInput = z.infer<typeof createInvestmentSchema>
export type UpdateInvestmentInput = z.infer<typeof updateInvestmentSchema>
