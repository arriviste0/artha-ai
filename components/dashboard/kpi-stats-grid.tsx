"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatINR } from "@/lib/money"
import type { DashboardSummary } from "@/hooks/use-dashboard"
import {
  Wallet,
  PiggyBank,
  Flame,
  TrendingUp,
  ShieldCheck,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface KPIStatsGridProps {
  data?: DashboardSummary
  isLoading: boolean
}

export function KPIStatsGrid({ data, isLoading }: KPIStatsGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    )
  }

  const curr = data?.currentMonth ?? { incomePaise: 0, expensesPaise: 0, netSavingsPaise: 0 }
  const netSavings = curr.netSavingsPaise ?? (curr.incomePaise - curr.expensesPaise)
  const isNetPositive = netSavings >= 0

  const savingsRate = data?.savingsRate ?? 0
  const dailyBurn = data?.dailyBurnRatePaise ?? 0
  const durationDays = data?.period?.durationDays ?? 30

  const investments = data?.investments ?? {
    totalInvestedPaise: 0,
    currentValuePaise: 0,
    gainPaise: 0,
    gainPct: 0,
    count: 0,
  }

  const budgets = data?.budgets ?? {
    total: 0,
    onTrack: 0,
    exceeded: 0,
    adherencePct: 100,
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      {/* 1. Net Cashflow */}
      <Card className="shadow-sm hover:border-primary/40 transition-all">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span className="font-medium">Net Cashflow</span>
            <div className={cn("p-1.5 rounded-lg", isNetPositive ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-destructive/10 text-destructive")}>
              {isNetPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
            </div>
          </div>
          <div>
            <p className={cn("text-xl font-bold tabular-nums tracking-tight", isNetPositive ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
              {isNetPositive ? "+" : "−"}{formatINR(Math.abs(netSavings), true)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              In: {formatINR(curr.incomePaise, true)} • Out: {formatINR(curr.expensesPaise, true)}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 2. Savings Rate */}
      <Card className="shadow-sm hover:border-primary/40 transition-all">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span className="font-medium">Savings Rate</span>
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <PiggyBank className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <p className="text-xl font-bold tabular-nums tracking-tight">{savingsRate}%</p>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] px-1.5 py-0 h-4 border",
                  savingsRate >= 20
                    ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                    : savingsRate > 0
                    ? "border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10"
                    : "border-destructive/30 text-destructive bg-destructive/10"
                )}
              >
                {savingsRate >= 20 ? "Target Met" : savingsRate > 0 ? "Moderate" : "Deficit"}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Target: 20%+ of income
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 3. Daily Burn Rate */}
      <Card className="shadow-sm hover:border-primary/40 transition-all">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span className="font-medium">Daily Outflow</span>
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
              <Flame className="h-4 w-4" />
            </div>
          </div>
          <div>
            <p className="text-xl font-bold tabular-nums tracking-tight">
              {formatINR(dailyBurn, true)} <span className="text-xs font-normal text-muted-foreground">/day</span>
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              Averaged over {durationDays} active days
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 4. Investments Portfolio */}
      <Card className="shadow-sm hover:border-primary/40 transition-all">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span className="font-medium">Investments</span>
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div>
            <p className="text-xl font-bold tabular-nums tracking-tight">
              {formatINR(investments.currentValuePaise, true)}
            </p>
            <div className="flex items-center gap-1 text-[11px] mt-0.5">
              {investments.gainPaise >= 0 ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  +{formatINR(investments.gainPaise, true)} ({investments.gainPct}%)
                </span>
              ) : (
                <span className="text-destructive font-medium">
                  −{formatINR(Math.abs(investments.gainPaise), true)} ({investments.gainPct}%)
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 5. Budget Adherence */}
      <Card className="shadow-sm hover:border-primary/40 transition-all">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span className="font-medium">Budget Health</span>
            <div className={cn("p-1.5 rounded-lg", budgets.exceeded === 0 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-destructive/10 text-destructive")}>
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <p className="text-xl font-bold tabular-nums tracking-tight">
                {budgets.onTrack}/{budgets.total}
              </p>
              <span className="text-xs text-muted-foreground">on track</span>
            </div>
            <p className={cn("text-[11px] mt-0.5 font-medium truncate", budgets.exceeded === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
              {budgets.exceeded === 0 ? "All budgets in limit" : `${budgets.exceeded} budgets exceeded`}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
