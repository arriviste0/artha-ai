"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { formatINR } from "@/lib/money"
import { useDashboard } from "@/hooks/use-dashboard"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

export function AccountsOverviewCard() {
  const { data, isLoading } = useDashboard()

  if (isLoading) return <Skeleton className="h-40 rounded-xl" />

  const accounts = data?.accounts ?? []

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-muted-foreground">Accounts</CardTitle>
        <Link
          href="/accounts"
          className="text-xs text-primary flex items-center gap-0.5 hover:underline"
        >
          Manage <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-2">
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No accounts added yet.</p>
        ) : (
          accounts.map((a, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs capitalize">
                  {a.type.replace("_", " ")}
                </Badge>
                <span className="text-sm">{a.name}</span>
              </div>
              <span
                className={`text-sm font-medium tabular-nums ${
                  a.balancePaise < 0 ? "text-destructive" : ""
                }`}
              >
                {a.balancePaise < 0 ? "−" : ""}{formatINR(Math.abs(a.balancePaise))}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
