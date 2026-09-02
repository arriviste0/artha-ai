"use client"

import { useQuery } from "@tanstack/react-query"

export interface DashboardFilterParams {
  period?: "this_month" | "last_month" | "last_3_months" | "last_6_months" | "this_year" | "all_time" | "custom_month_year" | "custom_range"
  month?: number
  year?: number
  from?: string
  to?: string
}

export interface DashboardSummary {
  period: {
    key: string
    label: string
    startDate: string
    endDate: string
    durationDays: number
  }
  netWorthPaise: number
  totalNetWorthPaise: number
  liquidNetWorthPaise: number
  netCashflowPaise: number
  savingsRate: number
  dailyBurnRatePaise: number
  transactionCount: number
  accounts: { name: string; type: string; balancePaise: number }[]
  currentMonth: {
    incomePaise: number
    expensesPaise: number
    netSavingsPaise: number
  }
  lastMonth: {
    incomePaise: number
    expensesPaise: number
  }
  investments: {
    totalInvestedPaise: number
    currentValuePaise: number
    gainPaise: number
    gainPct: number
    count: number
  }
  budgets: {
    total: number
    onTrack: number
    exceeded: number
    adherencePct: number
    list: Array<{
      id: string
      name: string
      category: string
      limitPaise: number
      spentPaise: number
      isOverBudget: boolean
    }>
  }
  topCategories: { category: string; amountPaise: number }[]
  budgetCount: number
}

export function useDashboard(params?: DashboardFilterParams) {
  const queryParams = new URLSearchParams()
  if (params?.period) queryParams.set("period", params.period)
  if (params?.month !== undefined) queryParams.set("month", params.month.toString())
  if (params?.year !== undefined) queryParams.set("year", params.year.toString())
  if (params?.from) queryParams.set("from", params.from)
  if (params?.to) queryParams.set("to", params.to)

  const queryString = queryParams.toString()

  return useQuery<DashboardSummary>({
    queryKey: ["dashboard", params],
    queryFn: async () => {
      const url = queryString ? `/api/dashboard/summary?${queryString}` : "/api/dashboard/summary"
      const res = await fetch(url)
      if (!res.ok) throw new Error("Failed to load dashboard")
      return res.json() as Promise<DashboardSummary>
    },
    refetchInterval: 60_000,
  })
}
