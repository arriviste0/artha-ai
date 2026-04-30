"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { CreateTransactionInput } from "@/lib/validators/transaction"

export interface TransactionDTO {
  _id: string
  accountId: string
  amountPaise: number
  currency: string
  type: "credit" | "debit"
  occurredAt: string
  description: string
  merchant?: string
  category: string
  subcategory?: string
  tags: string[]
  isRecurring: boolean
  needsReview: boolean
}

export interface TransactionFiltersInput {
  from?: string
  to?: string
  category?: string
  accountId?: string
  search?: string
  needsReview?: boolean
  page?: number
  limit?: number
}

async function fetchTransactions(
  filters: TransactionFiltersInput
): Promise<{ transactions: TransactionDTO[]; total: number }> {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== "") params.set(k, String(v))
  })
  const res = await fetch(`/api/transactions?${params}`)
  if (!res.ok) throw new Error("Failed to fetch transactions")
  return res.json() as Promise<{ transactions: TransactionDTO[]; total: number }>
}

export function useTransactions(filters: TransactionFiltersInput = {}) {
  return useQuery({
    queryKey: ["transactions", filters],
    queryFn: () => fetchTransactions(filters),
  })
}

export function useCreateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: CreateTransactionInput) => {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? "Failed to create transaction")
      }
      return (await res.json() as { transaction: TransactionDTO }).transaction
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] })
      qc.invalidateQueries({ queryKey: ["accounts"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
      qc.invalidateQueries({ queryKey: ["budgets"] })
    },
  })
}

export function useDeleteTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete transaction")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] })
      qc.invalidateQueries({ queryKey: ["accounts"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })
}

export function useUpdateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreateTransactionInput> & { needsReview?: boolean } }) => {
      const res = await fetch(`/api/transactions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error("Failed to update transaction")
      return (await res.json() as { transaction: TransactionDTO }).transaction
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] })
      qc.invalidateQueries({ queryKey: ["budgets"] })
    },
  })
}
