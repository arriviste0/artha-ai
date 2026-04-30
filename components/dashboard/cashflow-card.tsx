"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatINR } from "@/lib/money"
import { useDashboard } from "@/hooks/use-dashboard"
import { BarChart, Bar, XAxis, ResponsiveContainer, Cell } from "recharts"

export function CashflowCard() {
  const { data, isLoading } = useDashboard()

  if (isLoading) return <Skeleton className="h-36 rounded-xl" />

  const curr = data?.currentMonth ?? { incomePaise: 0, expensesPaise: 0 }
  const last = data?.lastMonth ?? { incomePaise: 0, expensesPaise: 0 }

  const chartData = [
    { name: "Last month income",   value: last.incomePaise / 100,   fill: "#22c55e", label: "Last mo. income" },
    { name: "Last month expenses", value: last.expensesPaise / 100,  fill: "#f87171", label: "Last mo. expenses" },
    { name: "This month income",   value: curr.incomePaise / 100,   fill: "#16a34a", label: "This mo. income" },
    { name: "This month expenses", value: curr.expensesPaise / 100,  fill: "#ef4444", label: "This mo. expenses" },
  ]

  const savingsRate =
    curr.incomePaise > 0
      ? Math.round(((curr.incomePaise - curr.expensesPaise) / curr.incomePaise) * 100)
      : 0

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Cashflow</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Income</p>
            <p className="font-semibold text-green-600 dark:text-green-400">
              +{formatINR(curr.incomePaise)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-muted-foreground text-xs">Expenses</p>
            <p className="font-semibold text-red-500">−{formatINR(curr.expensesPaise)}</p>
          </div>
          <div className="text-right">
            <p className="text-muted-foreground text-xs">Savings rate</p>
            <p className="font-semibold">{savingsRate}%</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={60}>
          <BarChart data={chartData} barGap={4}>
            <XAxis dataKey="label" tick={{ fontSize: 9 }} />
            <Bar dataKey="value" radius={[3, 3, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
