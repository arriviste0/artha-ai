import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

export interface IFinancialPlan {
  _id: string
  userId: string
  generatedAt: string
  summary: string
  allocationBuckets: {
    category: string
    percentage: number
    amount: number
    recommendation: string
  }[]
  riskFlags: {
    severity: "low" | "medium" | "high"
    title: string
    description: string
  }[]
  actionItems: {
    priority: number
    title: string
    description: string
  }[]
}

export function usePlan() {
  return useQuery({
    queryKey: ["planner"],
    queryFn: async (): Promise<IFinancialPlan | null> => {
      const res = await fetch("/api/planner")
      if (!res.ok) throw new Error("Failed to fetch plan")
      const data = await res.json()
      return data.plan
    },
  })
}

export function useGeneratePlan() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<IFinancialPlan> => {
      const res = await fetch("/api/planner/generate", { method: "POST" })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to generate plan")
      }
      const data = await res.json()
      return data.plan
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planner"] })
      toast.success("Financial plan generated successfully!")
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}
