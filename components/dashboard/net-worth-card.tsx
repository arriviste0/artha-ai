"use client"

import Link from "next/link"
import { TrendingUp, TrendingDown, Minus, ArrowRight } from "lucide-react"
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

  const assets = (data?.accounts ?? []).filter((a) => a.balancePaise >= 0)
  const debts = (data?.accounts ?? []).filter((a) => a.balancePaise < 0)
  const totalAssets = assets.reduce((s, a) => s + a.balancePaise, 0)
  const totalDebts = debts.reduce((s, a) => s + Math.abs(a.balancePaise), 0)

  return (
    <Link href="/accounts" className="block group">
      <Card className="transition-shadow group-hover:shadow-md cursor-pointer h-full">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Worth</CardTitle>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className={cn("text-3xl font-bold tabular-nums", netWorth < 0 && "text-destructive")}>
              {netWorth < 0 ? "−" : ""}{formatINR(Math.abs(netWorth))}
            </p>
            <div className="flex items-center gap-1 mt-1 text-sm">
              {currentSavings === 0
                ? <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                : isPositive
                ? <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                : <TrendingDown className="h-3.5 w-3.5 text-destructive" />
              }
              <span className={cn("font-medium", isPositive ? "text-green-600 dark:text-green-400" : "text-destructive")}>
                {isPositive ? "+" : "−"}{formatINR(Math.abs(currentSavings))}
              </span>
              <span className="text-muted-foreground">this month</span>
            </div>
          </div>

          {(totalAssets > 0 || totalDebts > 0) && (
            <div className="flex gap-3 pt-1 border-t text-xs">
              <div>
                <p className="text-muted-foreground">Assets</p>
                <p className="font-medium text-green-600 dark:text-green-400">{formatINR(totalAssets, true)}</p>
              </div>
              {totalDebts > 0 && (
                <div>
                  <p className="text-muted-foreground">Liabilities</p>
                  <p className="font-medium text-destructive">−{formatINR(totalDebts, true)}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
