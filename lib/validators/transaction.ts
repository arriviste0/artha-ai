import { z } from "zod"

export const createTransactionSchema = z.object({
  accountId: z.string().min(1),
  amountPaise: z.number().int("Must be integer paise").positive(),
  type: z.enum(["credit", "debit"]),
  occurredAt: z.string().datetime(),
  description: z.string().min(1).max(500),
  merchant: z.string().max(200).optional(),
  category: z.string().min(1).max(100),
  subcategory: z.string().max(100).optional(),
  tags: z.array(z.string()).default([]),
  goalId: z.string().optional(),
})

export const updateTransactionSchema = createTransactionSchema
  .partial()
  .extend({ needsReview: z.boolean().optional() })

export const transactionFiltersSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  category: z.string().optional(),
  accountId: z.string().optional(),
  search: z.string().max(200).optional(),
  needsReview: z.boolean().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(50),
})

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>
export type CreateTransactionFormValues = z.input<typeof createTransactionSchema>
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>
export type TransactionFilters = z.infer<typeof transactionFiltersSchema>
