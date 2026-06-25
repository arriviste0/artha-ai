"use client"

import { Sparkles } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { usePlan, useGeneratePlan } from "@/hooks/use-planner"
import { PlanView } from "@/components/planner/plan-view"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function PlannerPage() {
  const { data: plan, isLoading: isPlanLoading } = usePlan()
  const generateMutation = useGeneratePlan()

  if (isPlanLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (generateMutation.isPending) {
    return (
      <div className="flex flex-col h-[50vh] items-center justify-center space-y-4">
        <div className="relative">
          <div className="absolute -inset-4 bg-primary/20 blur-xl rounded-full animate-pulse" />
          <Loader2 className="h-12 w-12 animate-spin text-primary relative" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold">Analyzing your finances...</h2>
          <p className="text-muted-foreground mt-1 animate-pulse">
            Crunching numbers and preparing your personalized roadmap
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {!plan && (
        <div>
          <h1 className="text-2xl font-bold">AI Financial Planner</h1>
          <p className="text-muted-foreground text-sm mt-1">
            A personalised plan built from your actual numbers — not generic advice
          </p>
        </div>
      )}

      {plan ? (
        <PlanView 
          plan={plan} 
          onRegenerate={() => generateMutation.mutate()} 
          isRegenerating={generateMutation.isPending}
        />
      ) : (
        <EmptyState
          icon={Sparkles}
          title="Your plan is one click away"
          description="Once you have at least 1 month of transactions, ArthaAI analyses your income, expenses, and goals to generate a structured financial plan — allocation buckets, risk flags, and prioritised actions."
          action={{
            label: "Generate AI Plan",
            onClick: () => generateMutation.mutate()
          }}
        />
      )}
    </div>
  )
}
