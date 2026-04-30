"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatINR } from "@/lib/money"
import { useDashboard } from "@/hooks/use-dashboard"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"

const CHART_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6"]

export function CategorySpendCard() {
  const { data, isLoading } = useDashboard()

  if (isLoading) return <Skeleton className="h-52 rounded-xl" />

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

  const chartData = categories.map((c) => ({
    name: c.category,
    value: c.amountPaise / 100,
  }))

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Top Spending — This Month
        </CardTitle>
      </CardHeader>
      <CardContent className="flex gap-4 items-center">
        <ResponsiveContainer width={100} height={100}>
          <PieChart>
            <Pie data={chartData} dataKey="value" cx="50%" cy="50%" outerRadius={45} strokeWidth={0}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v) => [`₹${Number(v).toLocaleString("en-IN")}`, ""]}
              contentStyle={{ fontSize: 11 }}
            />
          </PieChart>
        </ResponsiveContainer>

        <div className="flex-1 space-y-2 min-w-0">
          {categories.map((c, i) => {
            const pct = totalExpenses > 0 ? Math.round((c.amountPaise / totalExpenses) * 100) : 0
            return (
              <div key={c.category} className="flex items-center gap-2 text-xs">
                <span
                  className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                  style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                />
                <span className="flex-1 truncate">{c.category}</span>
                <span className="text-muted-foreground">{pct}%</span>
                <span className="font-medium tabular-nums">{formatINR(c.amountPaise)}</span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
