"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { CreateInvestmentInput, UpdateInvestmentInput } from "@/lib/validators/investment"

export interface InvestmentDTO {
  _id: string
  accountId: string
  instrument: string
  name: string
  symbol?: string
  units: number
  avgCostPaise: number
  currentPricePaise?: number
  investedPaise: number
  currentValuePaise: number
  purchaseDate: string
  maturityDate?: string
  notes?: string
}

async function fetchInvestments(): Promise<InvestmentDTO[]> {
  const res = await fetch("/api/investments")
  if (!res.ok) throw new Error("Failed to fetch investments")
  const data = await res.json() as { investments: InvestmentDTO[] }
  return data.investments
}

export function useInvestments() {
  return useQuery({ queryKey: ["investments"], queryFn: fetchInvestments })
}

export function useCreateInvestment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: CreateInvestmentInput) => {
      const res = await fetch("/api/investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? "Failed to add investment")
      }
      return (await res.json() as { investment: InvestmentDTO }).investment
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["investments"] }),
  })
}

export function useUpdateInvestment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateInvestmentInput }) => {
      const res = await fetch(`/api/investments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error("Failed to update investment")
      return (await res.json() as { investment: InvestmentDTO }).investment
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["investments"] }),
  })
}

export function useDeleteInvestment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/investments/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete investment")
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["investments"] }),
  })
}
