"use client"

import { useQuery } from "@tanstack/react-query"

export interface DashboardSummary {
  netWorthPaise: number
  accounts: { name: string; type: string; balancePaise: number }[]
  currentMonth: { incomePaise: number; expensesPaise: number }
  lastMonth: { incomePaise: number; expensesPaise: number }
  topCategories: { category: string; amountPaise: number }[]
  budgetCount: number
}

export function useDashboard() {
  return useQuery<DashboardSummary>({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/summary")
      if (!res.ok) throw new Error("Failed to load dashboard")
      return res.json() as Promise<DashboardSummary>
    },
    refetchInterval: 60_000,
  })
}
