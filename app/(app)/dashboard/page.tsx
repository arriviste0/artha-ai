"use client"

import Link from "next/link"
import { LayoutDashboard, Plus, RefreshCw, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { NetWorthCard } from "@/components/dashboard/net-worth-card"
import { CashflowCard } from "@/components/dashboard/cashflow-card"
import { CategorySpendCard } from "@/components/dashboard/category-spend-card"
import { AccountsOverviewCard } from "@/components/dashboard/accounts-overview-card"
import { useDashboard } from "@/hooks/use-dashboard"
import { cn } from "@/lib/utils"

export default function DashboardPage() {
  const { data, isLoading, isFetching, refetch } = useDashboard()
  const hasData = (data?.accounts.length ?? 0) > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your financial overview at a glance</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/statements">
              <Upload className="h-4 w-4" />
              Upload
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/transactions">
              <Plus className="h-4 w-4" />
              Add
            </Link>
          </Button>
        </div>
      </div>

      {!isLoading && !hasData ? (
        <EmptyState
          icon={LayoutDashboard}
          title="Your dashboard is ready"
          description="Add an account and start recording transactions to see your net worth, cashflow, and spending breakdown."
          action={{ label: "Add account", href: "/accounts" }}
        />
      ) : (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="w-full overflow-x-auto sm:w-fit">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="spending">Spending</TabsTrigger>
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <NetWorthCard />
              <CashflowCard />
              <CategorySpendCard />
              <AccountsOverviewCard />
            </div>
          </TabsContent>

          <TabsContent value="spending" className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <CashflowCard />
            <CategorySpendCard />
          </TabsContent>

          <TabsContent value="accounts" className="grid gap-4 lg:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
            <NetWorthCard />
            <AccountsOverviewCard />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
