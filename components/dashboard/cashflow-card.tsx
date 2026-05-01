"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatINR } from "@/lib/money"
import { useDashboard } from "@/hooks/use-dashboard"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts"
import { cn } from "@/lib/utils"

interface TooltipProps {
  active?: boolean
  payload?: { value: number; payload: { label: string; fill: string } }[]
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null
  const item = payload[0]
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-md text-xs">
      <p className="font-medium text-popover-foreground">{item.payload.label}</p>
      <p className="text-muted-foreground mt-0.5">₹{item.value.toLocaleString("en-IN")}</p>
    </div>
  )
}

export function CashflowCard() {
  const { data, isLoading } = useDashboard()

  if (isLoading) return <Skeleton className="h-44 rounded-xl" />

  const curr = data?.currentMonth ?? { incomePaise: 0, expensesPaise: 0 }
  const last = data?.lastMonth ?? { incomePaise: 0, expensesPaise: 0 }
  const netSavings = curr.incomePaise - curr.expensesPaise
  const isNetPositive = netSavings >= 0

  const savingsRate = curr.incomePaise > 0
    ? Math.round(((curr.incomePaise - curr.expensesPaise) / curr.incomePaise) * 100)
    : 0

  const chartData = [
    { label: "Last mo. income",   value: last.incomePaise / 100,   fill: "#86efac" },
    { label: "Last mo. expenses", value: last.expensesPaise / 100,  fill: "#fca5a5" },
    { label: "This mo. income",   value: curr.incomePaise / 100,   fill: "#16a34a" },
    { label: "This mo. expenses", value: curr.expensesPaise / 100,  fill: "#ef4444" },
  ]

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Cashflow</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Income</p>
            <p className="font-semibold text-green-600 dark:text-green-400 tabular-nums">
              +{formatINR(curr.incomePaise, true)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Expenses</p>
            <p className="font-semibold text-red-500 tabular-nums">−{formatINR(curr.expensesPaise, true)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Net</p>
            <p className={cn("font-semibold tabular-nums", isNetPositive ? "text-green-600 dark:text-green-400" : "text-destructive")}>
              {isNetPositive ? "+" : "−"}{formatINR(Math.abs(netSavings), true)}
            </p>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={80}>
          <BarChart data={chartData} barGap={3} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 8 }} tickLine={false} axisLine={false} interval={0} />
            <YAxis hide />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "transparent" }} />
            <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={28}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-2">
          <span>Savings rate this month</span>
          <span className={cn("font-semibold", savingsRate >= 20 ? "text-green-600 dark:text-green-400" : savingsRate < 0 ? "text-destructive" : "text-foreground")}>
            {savingsRate}%
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
