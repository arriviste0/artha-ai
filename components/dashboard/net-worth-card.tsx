"use client"

import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatINR } from "@/lib/money"
import { useDashboard } from "@/hooks/use-dashboard"
import { cn } from "@/lib/utils"

export function NetWorthCard() {
  const { data, isLoading } = useDashboard()

  if (isLoading) return <Skeleton className="h-36 rounded-xl" />

  const netWorth = data?.netWorthPaise ?? 0
  const currentSavings = (data?.currentMonth.incomePaise ?? 0) - (data?.currentMonth.expensesPaise ?? 0)
  const isPositive = currentSavings >= 0

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Net Worth</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={cn("text-3xl font-bold tabular-nums", netWorth < 0 && "text-destructive")}>
          {netWorth < 0 ? "−" : ""}{formatINR(Math.abs(netWorth))}
        </p>
        <div className="flex items-center gap-1 mt-2 text-sm">
          {currentSavings === 0
            ? <Minus className="h-3.5 w-3.5 text-muted-foreground" />
            : isPositive
            ? <TrendingUp className="h-3.5 w-3.5 text-green-500" />
            : <TrendingDown className="h-3.5 w-3.5 text-destructive" />
          }
          <span className={cn(
            "font-medium",
            isPositive ? "text-green-600 dark:text-green-400" : "text-destructive"
          )}>
            {isPositive ? "+" : "−"}{formatINR(Math.abs(currentSavings))}
          </span>
          <span className="text-muted-foreground">this month</span>
        </div>
      </CardContent>
    </Card>
  )
}
