"use client"

import { useState } from "react"
import { Plus, PiggyBank } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { BudgetCard } from "@/components/budgets/budget-card"
import { BudgetForm } from "@/components/budgets/budget-form"
import { BudgetAIChat } from "@/components/budgets/budget-ai-chat"
import { useBudgets, useCreateBudget } from "@/hooks/use-budgets"
import { toast } from "sonner"
import type { CreateBudgetInput } from "@/lib/validators/budget"
import { formatINR } from "@/lib/money"

export default function BudgetsPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const { data: budgets = [], isLoading } = useBudgets()
  const create = useCreateBudget()

  const totalLimit = budgets.reduce((s, b) => s + b.limitPaise, 0)
  const totalSpent = budgets.reduce((s, b) => s + b.spentPaise, 0)

  async function handleCreate(data: CreateBudgetInput) {
    await create.mutateAsync(data)
    setCreateOpen(false)
    toast.success(`"${data.name}" budget created`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Budgets</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Set limits, track spending, and let AI help you rebalance
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> New budget
        </Button>
      </div>

      {budgets.length > 0 && (
        <div className="grid grid-cols-1 gap-4 rounded-xl border bg-muted/30 p-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Total budgeted</p>
            <p className="text-lg font-bold tabular-nums">{formatINR(totalLimit)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Spent this month</p>
            <p className="text-lg font-bold tabular-nums">{formatINR(totalSpent)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Remaining</p>
            <p className={`text-lg font-bold tabular-nums ${totalSpent > totalLimit ? "text-destructive" : "text-green-600 dark:text-green-400"}`}>
              {formatINR(Math.max(0, totalLimit - totalSpent))}
            </p>
          </div>
        </div>
      )}

      <Tabs defaultValue="budgets">
        <TabsList>
          <TabsTrigger value="budgets">My Budgets</TabsTrigger>
          <TabsTrigger value="advisor" className="gap-1.5">
            ✦ AI Advisor
          </TabsTrigger>
        </TabsList>

        <TabsContent value="budgets" className="mt-4">
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
            </div>
          ) : budgets.length === 0 ? (
            <EmptyState
              icon={PiggyBank}
              title="No budgets yet"
              description="Create budgets for each spending category. You'll get alerts at 80%, 100%, and 120% of your limit."
              action={{ label: "Create first budget", onClick: () => setCreateOpen(true) }}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {budgets.map((b) => <BudgetCard key={b._id} budget={b} />)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="advisor" className="mt-4">
          <div className="h-[600px] flex flex-col">
            {budgets.length === 0 ? (
              <EmptyState
                icon={PiggyBank}
                title="Create budgets first"
                description="The AI advisor needs at least one budget to work with. Create a budget and come back."
                action={{ label: "Create a budget", onClick: () => setCreateOpen(true) }}
              />
            ) : (
              <BudgetAIChat />
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create budget</DialogTitle>
            <DialogDescription>
              Set a spending limit for a category and track progress through the month.
            </DialogDescription>
          </DialogHeader>
          <BudgetForm onSubmit={handleCreate} onCancel={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
