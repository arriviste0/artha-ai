"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatINR } from "@/lib/money"
import { useDashboard } from "@/hooks/use-dashboard"
import { cn } from "@/lib/utils"

type AccountFilter = "all" | "assets" | "debts"

export function AccountsOverviewCard() {
  const { data, isLoading } = useDashboard()
  const [filter, setFilter] = useState<AccountFilter>("all")
  const [showAll, setShowAll] = useState(false)

  const accounts = useMemo(() => {
    const rows = data?.accounts ?? []
    return rows
      .filter((account) => {
        if (filter === "assets") return account.balancePaise >= 0
        if (filter === "debts") return account.balancePaise < 0
        return true
      })
      .sort((a, b) => Math.abs(b.balancePaise) - Math.abs(a.balancePaise))
  }, [data?.accounts, filter])

  if (isLoading) return <Skeleton className="h-56 rounded-xl" />

  const visibleAccounts = showAll ? accounts : accounts.slice(0, 4)
  const hiddenCount = Math.max(accounts.length - visibleAccounts.length, 0)

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">Accounts</CardTitle>
          <Link
            href="/accounts"
            className="flex items-center gap-0.5 text-xs text-primary hover:underline"
          >
            Manage <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="flex rounded-md bg-muted p-1">
          {(["all", "assets", "debts"] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={cn(
                "flex-1 rounded-sm px-2 py-1 text-xs font-medium capitalize text-muted-foreground transition-colors",
                filter === item && "bg-background text-foreground shadow-sm"
              )}
              onClick={() => {
                setFilter(item)
                setShowAll(false)
              }}
            >
              {item}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No accounts in this view.</p>
        ) : (
          visibleAccounts.map((a) => (
            <Link
              key={`${a.name}-${a.type}`}
              href="/accounts"
              className="flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/70"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Badge variant="outline" className="text-xs capitalize">
                  {a.type.replace("_", " ")}
                </Badge>
                <span className="truncate text-sm">{a.name}</span>
              </div>
              <span
                className={cn(
                  "whitespace-nowrap text-sm font-medium tabular-nums",
                  a.balancePaise < 0 && "text-destructive"
                )}
              >
                {a.balancePaise < 0 ? "-" : ""}{formatINR(Math.abs(a.balancePaise))}
              </span>
            </Link>
          ))
        )}

        {hiddenCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => setShowAll(true)}
          >
            Show {hiddenCount} more
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
