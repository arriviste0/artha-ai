"use client"

import Link from "next/link"
import { ArrowRight, Shield, PiggyBank, TrendingDown, Target } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { formatINR } from "@/lib/money"
import { useGoals } from "@/hooks/use-goals"
import { cn } from "@/lib/utils"

const KIND_ICONS = {
  emergency_fund: Shield,
  savings: PiggyBank,
  debt_payoff: TrendingDown,
}

const KIND_COLORS = {
  emergency_fund: "text-blue-500",
  savings: "text-green-500",
  debt_payoff: "text-orange-500",
}

export function GoalsSummaryCard() {
  const { data: goals, isLoading } = useGoals()

  if (isLoading) return <Skeleton className="h-40 rounded-xl" />

  const activeGoals = (goals ?? []).filter((g) => g.status === "active" || g.status === "paused")

  if (activeGoals.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-muted p-2">
              <Target className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">No active goals</p>
              <p className="text-xs text-muted-foreground">Set up an emergency fund or savings goal</p>
            </div>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/goals">Create goal</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const displayGoals = activeGoals.slice(0, 3)

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">Goals</CardTitle>
          <Link href="/goals" className="flex items-center gap-0.5 text-xs text-primary hover:underline">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {displayGoals.map((goal) => {
          const Icon = KIND_ICONS[goal.kind]
          const pct = goal.targetPaise > 0
            ? Math.min(Math.round((goal.currentPaise / goal.targetPaise) * 100), 100)
            : 0
          return (
            <div key={goal._id} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Icon className={cn("h-3.5 w-3.5 flex-shrink-0", KIND_COLORS[goal.kind])} />
                  <span className="text-sm font-medium truncate">{goal.name}</span>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
                  {formatINR(goal.currentPaise, true)} / {formatINR(goal.targetPaise, true)}
                </span>
              </div>
              <Progress value={pct} className="h-1.5" />
            </div>
          )
        })}
        {activeGoals.length > 3 && (
          <p className="text-xs text-muted-foreground text-center">
            +{activeGoals.length - 3} more goal{activeGoals.length - 3 !== 1 ? "s" : ""}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
