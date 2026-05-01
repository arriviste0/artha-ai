"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { CreateGoalInput, UpdateGoalInput } from "@/lib/validators/goal"

export interface GoalDTO {
  _id: string
  kind: "savings" | "emergency_fund" | "debt_payoff"
  name: string
  targetPaise: number
  currentPaise: number
  monthlyContributionPaise: number
  targetDate?: string
  linkedAccountId?: string
  priority: number
  status: "active" | "paused" | "achieved" | "abandoned"
  createdAt: string
}

async function fetchGoals(): Promise<GoalDTO[]> {
  const res = await fetch("/api/goals")
  if (!res.ok) throw new Error("Failed to fetch goals")
  const data = await res.json() as { goals: GoalDTO[] }
  return data.goals
}

export function useGoals() {
  return useQuery({ queryKey: ["goals"], queryFn: fetchGoals })
}

export function useCreateGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: CreateGoalInput) => {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? "Failed to create goal")
      }
      return (await res.json() as { goal: GoalDTO }).goal
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  })
}

export function useUpdateGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateGoalInput }) => {
      const res = await fetch(`/api/goals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error("Failed to update goal")
      return (await res.json() as { goal: GoalDTO }).goal
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  })
}

export function useDeleteGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/goals/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete goal")
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  })
}
