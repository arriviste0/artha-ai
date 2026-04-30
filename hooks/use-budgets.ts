"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { CreateBudgetInput, UpdateBudgetInput } from "@/lib/validators/budget"

export interface BudgetDTO {
  _id: string
  name: string
  period: "monthly" | "weekly"
  category: string
  limitPaise: number
  spentPaise: number
  currency: string
  rollover: boolean
  startDate: string
}

async function fetchBudgets(): Promise<BudgetDTO[]> {
  const res = await fetch("/api/budgets")
  if (!res.ok) throw new Error("Failed to fetch budgets")
  const data = await res.json() as { budgets: BudgetDTO[] }
  return data.budgets
}

export function useBudgets() {
  return useQuery({ queryKey: ["budgets"], queryFn: fetchBudgets })
}

export function useCreateBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: CreateBudgetInput) => {
      const res = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? "Failed to create budget")
      }
      return (await res.json() as { budget: BudgetDTO }).budget
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budgets"] }),
  })
}

export function useUpdateBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateBudgetInput }) => {
      const res = await fetch(`/api/budgets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error("Failed to update budget")
      return (await res.json() as { budget: BudgetDTO }).budget
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budgets"] }),
  })
}

export function useDeleteBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/budgets/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete budget")
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budgets"] }),
  })
}
