"use client"

import { useState } from "react"
import { Pencil, Trash2, Plus, Shield, PiggyBank, TrendingDown, CheckCircle2, Pause } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { formatINR } from "@/lib/money"
import { useUpdateGoal, useDeleteGoal, type GoalDTO } from "@/hooks/use-goals"
import { GoalForm } from "./goal-form"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { CreateGoalInput } from "@/lib/validators/goal"

const KIND_ICONS = {
  emergency_fund: Shield,
  savings: PiggyBank,
  debt_payoff: TrendingDown,
}

const KIND_LABELS = {
  emergency_fund: "Emergency Fund",
  savings: "Savings",
  debt_payoff: "Debt Payoff",
}

const KIND_COLORS = {
  emergency_fund: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950",
  savings: "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950",
  debt_payoff: "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950",
}

export function GoalCard({ goal }: { goal: GoalDTO }) {
  const [editOpen, setEditOpen] = useState(false)
  const [contributeOpen, setContributeOpen] = useState(false)
  const [contribution, setContribution] = useState("")
  const update = useUpdateGoal()
  const del = useDeleteGoal()

  const Icon = KIND_ICONS[goal.kind]
  const pct = goal.targetPaise > 0
    ? Math.min(Math.round((goal.currentPaise / goal.targetPaise) * 100), 100)
    : 0
  const remaining = Math.max(goal.targetPaise - goal.currentPaise, 0)
  const achieved = goal.currentPaise >= goal.targetPaise

  const monthsToGoal = goal.monthlyContributionPaise > 0 && remaining > 0
    ? Math.ceil(remaining / goal.monthlyContributionPaise)
    : null

  async function handleUpdate(data: CreateGoalInput) {
    await update.mutateAsync({ id: goal._id, data })
    setEditOpen(false)
    toast.success("Goal updated")
  }

  async function handleDelete() {
    await del.mutateAsync(goal._id)
    toast.success(`"${goal.name}" removed`)
  }

  async function handleContribute() {
    const amount = parseFloat(contribution)
    if (!amount || amount <= 0) return
    const newPaise = goal.currentPaise + Math.round(amount * 100)
    const isNowAchieved = newPaise >= goal.targetPaise
    await update.mutateAsync({
      id: goal._id,
      data: {
        currentPaise: newPaise,
        ...(isNowAchieved ? { status: "achieved" } : {}),
      },
    })
    setContributeOpen(false)
    setContribution("")
    toast.success(isNowAchieved ? `Goal "${goal.name}" achieved! 🎉` : `Added ₹${amount.toLocaleString("en-IN")} to "${goal.name}"`)
  }

  async function toggleStatus() {
    const newStatus = goal.status === "active" ? "paused" : "active"
    await update.mutateAsync({ id: goal._id, data: { status: newStatus } })
    toast.success(newStatus === "active" ? "Goal resumed" : "Goal paused")
  }

  return (
    <>
      <Card className={cn("transition-shadow hover:shadow-md", goal.status === "achieved" && "opacity-80")}>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={cn("rounded-lg p-2 flex-shrink-0", KIND_COLORS[goal.kind])}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="font-medium truncate">{goal.name}</p>
                <p className="text-xs text-muted-foreground">{KIND_LABELS[goal.kind]}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {achieved && (
                <Badge variant="default" className="text-xs bg-green-600 hover:bg-green-600">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Done
                </Badge>
              )}
              {goal.status === "paused" && !achieved && (
                <Badge variant="secondary" className="text-xs">Paused</Badge>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={handleDelete}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs mb-1">
              <span className="font-medium">{formatINR(goal.currentPaise)}</span>
              <span className="text-muted-foreground">of {formatINR(goal.targetPaise)}</span>
            </div>
            <div className="relative h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  achieved ? "bg-green-500" : pct >= 75 ? "bg-blue-500" : "bg-primary"
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{pct}% saved</span>
              {!achieved && <span>{formatINR(remaining)} to go</span>}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="space-y-0.5">
              {goal.monthlyContributionPaise > 0 && (
                <p>{formatINR(goal.monthlyContributionPaise)}/mo</p>
              )}
              {monthsToGoal && (
                <p>~{monthsToGoal} month{monthsToGoal !== 1 ? "s" : ""} to go</p>
              )}
              {goal.targetDate && (
                <p>By {new Date(goal.targetDate).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</p>
              )}
            </div>
            <div className="flex gap-1">
              {!achieved && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground"
                    onClick={toggleStatus}
                    title={goal.status === "active" ? "Pause goal" : "Resume goal"}
                  >
                    <Pause className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setContributeOpen(true)}
                  >
                    <Plus className="mr-1 h-3 w-3" /> Add
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit goal</DialogTitle>
            <DialogDescription>Update your goal details and contribution plan.</DialogDescription>
          </DialogHeader>
          <GoalForm defaultValues={goal} onSubmit={handleUpdate} onCancel={() => setEditOpen(false)} submitLabel="Save changes" />
        </DialogContent>
      </Dialog>

      <Dialog open={contributeOpen} onOpenChange={setContributeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add contribution</DialogTitle>
            <DialogDescription>How much did you put towards &quot;{goal.name}&quot; today?</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Amount (₹)</Label>
              <Input
                type="number"
                min="1"
                step="500"
                placeholder="5000"
                value={contribution}
                onChange={(e) => setContribution(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleContribute()}
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setContributeOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleContribute} disabled={!contribution || parseFloat(contribution) <= 0 || update.isPending}>
                Confirm
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
