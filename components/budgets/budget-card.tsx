"use client"

import { useState } from "react"
import { Pencil, Trash2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatINR } from "@/lib/money"
import { useDeleteBudget, useUpdateBudget, type BudgetDTO } from "@/hooks/use-budgets"
import { BudgetForm } from "./budget-form"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { CreateBudgetInput } from "@/lib/validators/budget"

export function BudgetCard({ budget }: { budget: BudgetDTO }) {
  const [editOpen, setEditOpen] = useState(false)
  const del = useDeleteBudget()
  const update = useUpdateBudget()
  const pct = budget.limitPaise > 0
    ? Math.round((budget.spentPaise / budget.limitPaise) * 100)
    : 0
  const remaining = budget.limitPaise - budget.spentPaise

  const status =
    pct >= 120 ? "over" :
    pct >= 100 ? "at-limit" :
    pct >= 80 ? "warning" : "ok"

  const statusColors = {
    over: "text-destructive",
    "at-limit": "text-orange-500",
    warning: "text-yellow-600 dark:text-yellow-400",
    ok: "text-muted-foreground",
  }

  const progressColors = {
    over: "bg-destructive",
    "at-limit": "bg-orange-500",
    warning: "bg-yellow-500",
    ok: "bg-primary",
  }

  async function handleDelete() {
    await del.mutateAsync(budget._id)
    toast.success(`Removed "${budget.name}" budget`)
  }

  async function handleUpdate(data: CreateBudgetInput) {
    await update.mutateAsync({ id: budget._id, data })
    setEditOpen(false)
    toast.success(`Updated "${data.name}" budget`)
  }

  return (
    <>
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium">{budget.name}</p>
              <p className="text-xs text-muted-foreground">{budget.category} - {budget.period}</p>
            </div>
            <div className="flex items-center gap-1">
              {status !== "ok" && (
                <Badge
                  variant={status === "over" ? "destructive" : "outline"}
                  className={cn("text-xs", status !== "over" && statusColors[status])}
                >
                  {status === "over" ? "Over budget" : status === "at-limit" ? "At limit" : "80%"}
                </Badge>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => setEditOpen(true)}
                title="Edit budget"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={handleDelete}
                title="Delete budget"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="relative h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", progressColors[status])}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs">
              <span className={statusColors[status]}>
                {formatINR(budget.spentPaise)} spent ({pct}%)
              </span>
              <span className="text-muted-foreground">
                {remaining >= 0
                  ? `${formatINR(remaining)} left`
                  : `${formatINR(Math.abs(remaining))} over`}
              </span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Limit: {formatINR(budget.limitPaise)} planned for this {budget.period} budget
          </p>
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit budget</DialogTitle>
            <DialogDescription>
              Change the name, category, period, or spending limit for this budget.
            </DialogDescription>
          </DialogHeader>
          <BudgetForm
            defaultValues={budget}
            onSubmit={handleUpdate}
            onCancel={() => setEditOpen(false)}
            submitLabel="Save changes"
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
