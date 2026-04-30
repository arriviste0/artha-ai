"use client"

import { LayoutDashboard } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { NetWorthCard } from "@/components/dashboard/net-worth-card"
import { CashflowCard } from "@/components/dashboard/cashflow-card"
import { CategorySpendCard } from "@/components/dashboard/category-spend-card"
import { AccountsOverviewCard } from "@/components/dashboard/accounts-overview-card"
import { useDashboard } from "@/hooks/use-dashboard"

export default function DashboardPage() {
  const { data, isLoading } = useDashboard()
  const hasData = (data?.accounts.length ?? 0) > 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Your financial overview at a glance</p>
      </div>

      {!isLoading && !hasData ? (
        <EmptyState
          icon={LayoutDashboard}
          title="Your dashboard is ready"
          description="Add an account and start recording transactions to see your net worth, cashflow, and spending breakdown."
          action={{ label: "Add account", href: "/accounts" }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="xl:col-span-1">
            <NetWorthCard />
          </div>
          <div className="xl:col-span-1">
            <CashflowCard />
          </div>
          <div className="xl:col-span-1">
            <CategorySpendCard />
          </div>
          <div className="xl:col-span-1">
            <AccountsOverviewCard />
          </div>
        </div>
      )}
    </div>
  )
}
