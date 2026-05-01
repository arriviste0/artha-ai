"use client"

import { useState } from "react"
import { Plus, Target, Shield, PiggyBank, TrendingDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { GoalCard } from "@/components/goals/goal-card"
import { GoalForm } from "@/components/goals/goal-form"
import { useGoals, useCreateGoal } from "@/hooks/use-goals"
import { toast } from "sonner"
import { formatINR } from "@/lib/money"
import type { CreateGoalInput } from "@/lib/validators/goal"

const KIND_TABS = [
  { value: "all", label: "All" },
  { value: "emergency_fund", label: "Emergency Fund", icon: Shield },
  { value: "savings", label: "Savings", icon: PiggyBank },
  { value: "debt_payoff", label: "Debt Payoff", icon: TrendingDown },
] as const

type KindFilter = "all" | "emergency_fund" | "savings" | "debt_payoff"

export default function GoalsPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const [filter, setFilter] = useState<KindFilter>("all")
  const { data: goals = [], isLoading } = useGoals()
  const create = useCreateGoal()

  async function handleCreate(data: CreateGoalInput) {
    await create.mutateAsync(data)
    setCreateOpen(false)
    toast.success(`"${data.name}" goal created`)
  }

  const activeGoals = goals.filter((g) => g.status !== "abandoned")
  const filtered = filter === "all" ? activeGoals : activeGoals.filter((g) => g.kind === filter)

  const totalTarget = activeGoals.reduce((s, g) => s + g.targetPaise, 0)
  const totalSaved = activeGoals.reduce((s, g) => s + g.currentPaise, 0)
  const overallPct = totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0
  const achievedCount = activeGoals.filter((g) => g.currentPaise >= g.targetPaise).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Goals</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Save for what matters — emergency fund, big purchases, debt payoff
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> New goal
        </Button>
      </div>

      {activeGoals.length > 0 && (
        <div className="grid grid-cols-1 gap-4 rounded-xl border bg-muted/30 p-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Total target</p>
            <p className="text-lg font-bold tabular-nums">{formatINR(totalTarget)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total saved</p>
            <p className="text-lg font-bold tabular-nums text-green-600 dark:text-green-400">{formatINR(totalSaved)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Overall progress</p>
            <p className="text-lg font-bold tabular-nums">
              {overallPct}%
              {achievedCount > 0 && (
                <span className="ml-2 text-sm font-normal text-green-600 dark:text-green-400">
                  ({achievedCount} achieved)
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {activeGoals.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {KIND_TABS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                filter === value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              {value !== "all" && (
                <span className="ml-1.5 text-xs opacity-70">
                  ({activeGoals.filter((g) => g.kind === value).length})
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Target}
          title={filter === "all" ? "No goals yet" : `No ${filter.replace("_", " ")} goals`}
          description={
            filter === "all"
              ? "Start with an emergency fund — aim for 3–6 months of expenses to cover unexpected costs."
              : `Create a ${filter.replace("_", " ")} goal to track your progress.`
          }
          action={{ label: "Create goal", onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((g) => <GoalCard key={g._id} goal={g} />)}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create goal</DialogTitle>
            <DialogDescription>
              Set a target, track contributions, and watch your progress grow.
            </DialogDescription>
          </DialogHeader>
          <GoalForm onSubmit={handleCreate} onCancel={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
