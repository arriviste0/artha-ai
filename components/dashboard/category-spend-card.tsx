"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { formatINR } from "@/lib/money"
import { useDashboard } from "@/hooks/use-dashboard"
import { cn } from "@/lib/utils"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"

const CHART_COLORS = ["#2563eb", "#f59e0b", "#10b981", "#ef4444", "#7c3aed"]

export function CategorySpendCard() {
  const { data, isLoading } = useDashboard()
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  if (isLoading) return <Skeleton className="h-72 rounded-xl" />

  const categories = data?.topCategories ?? []
  const totalExpenses = data?.currentMonth.expensesPaise ?? 0

  if (categories.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Top Spending</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No expenses recorded this month.</p>
        </CardContent>
      </Card>
    )
  }

  const activeCategory = categories.find((c) => c.category === selectedCategory) ?? categories[0]
  const activePct = totalExpenses > 0
    ? Math.round((activeCategory.amountPaise / totalExpenses) * 100)
    : 0
  const chartData = categories.map((c) => ({
    name: c.category,
    value: c.amountPaise / 100,
  }))

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Top Spending - This Month
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <ResponsiveContainer width={104} height={104}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                cx="50%"
                cy="50%"
                outerRadius={46}
                innerRadius={26}
                strokeWidth={0}
                onClick={(entry) => setSelectedCategory(entry.name ?? null)}
              >
                {chartData.map((entry, i) => (
                  <Cell
                    key={entry.name}
                    fill={CHART_COLORS[i % CHART_COLORS.length]}
                    opacity={activeCategory.category === entry.name ? 1 : 0.45}
                    className="cursor-pointer outline-none"
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(v) => [`₹${Number(v).toLocaleString("en-IN")}`, ""]}
                contentStyle={{ fontSize: 11 }}
              />
            </PieChart>
          </ResponsiveContainer>

          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Selected category</p>
            <p className="truncate text-sm font-semibold">{activeCategory.category}</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{formatINR(activeCategory.amountPaise)}</p>
            <p className="text-xs text-muted-foreground">{activePct}% of this month&apos;s expenses</p>
            <Progress value={activePct} className="mt-2 h-1.5" />
          </div>
        </div>

        <div className="space-y-2">
          {categories.map((c, i) => {
            const pct = totalExpenses > 0 ? Math.round((c.amountPaise / totalExpenses) * 100) : 0
            const isSelected = activeCategory.category === c.category
            return (
              <button
                key={c.category}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/70",
                  isSelected && "bg-muted"
                )}
                onClick={() => setSelectedCategory(c.category)}
              >
                <span
                  className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                  style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                />
                <span className="flex-1 truncate">{c.category}</span>
                <span className="text-muted-foreground">{pct}%</span>
                <span className="font-medium tabular-nums">{formatINR(c.amountPaise)}</span>
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
