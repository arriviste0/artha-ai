"use client"

import { useState, useMemo } from "react"
import { Plus, TrendingUp, TrendingDown, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { InvestmentForm } from "@/components/investments/investment-form"
import { InvestmentRow } from "@/components/investments/investment-row"
import { useInvestments, useCreateInvestment } from "@/hooks/use-investments"
import { useAccounts } from "@/hooks/use-accounts"
import { toast } from "sonner"
import { formatINR } from "@/lib/money"
import { cn } from "@/lib/utils"
import type { CreateInvestmentInput } from "@/lib/validators/investment"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"

const INSTRUMENT_LABELS: Record<string, string> = {
  stock: "Stocks", mutual_fund: "Mutual Funds", etf: "ETFs",
  fd: "Fixed Deposits", rd: "Recurring Deposits",
  ppf: "PPF", epf: "EPF", nps: "NPS",
  gold: "Gold", crypto: "Crypto", real_estate: "Real Estate", other: "Other",
}

const CHART_COLORS = ["#2563eb", "#f59e0b", "#10b981", "#ef4444", "#7c3aed", "#f97316", "#06b6d4", "#84cc16", "#ec4899", "#64748b"]

type InstrumentFilter = "all" | string

export default function InvestmentsPage() {
  const [addOpen, setAddOpen] = useState(false)
  const [filter, setFilter] = useState<InstrumentFilter>("all")

  const { data: investments = [], isLoading } = useInvestments()
  const { data: accounts = [] } = useAccounts()
  const create = useCreateInvestment()

  const totalInvested = investments.reduce((s, i) => s + i.investedPaise, 0)
  const totalValue = investments.reduce((s, i) => s + i.currentValuePaise, 0)
  const totalPnL = totalValue - totalInvested
  const totalPnLPct = totalInvested > 0 ? ((totalPnL / totalInvested) * 100).toFixed(1) : "0.0"
  const isGain = totalPnL >= 0

  const allocationData = useMemo(() => {
    const map = new Map<string, number>()
    for (const inv of investments) {
      map.set(inv.instrument, (map.get(inv.instrument) ?? 0) + inv.currentValuePaise)
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name: INSTRUMENT_LABELS[name] ?? name, key: name, value }))
      .sort((a, b) => b.value - a.value)
  }, [investments])

  const instrumentTypes = useMemo(() =>
    Array.from(new Set(investments.map((i) => i.instrument))),
    [investments]
  )

  const filtered = filter === "all" ? investments : investments.filter((i) => i.instrument === filter)

  async function handleCreate(data: CreateInvestmentInput) {
    await create.mutateAsync(data)
    setAddOpen(false)
    toast.success(`"${data.name}" added to portfolio`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Investments</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track your mutual funds, stocks, FDs, and other instruments
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} disabled={accounts.length === 0}>
          <Plus className="h-4 w-4 mr-2" /> Add investment
        </Button>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          ArthaAI is an educational tool. Investment tracking here is for personal record-keeping only — not SEBI-registered advice.
        </AlertDescription>
      </Alert>

      {accounts.length === 0 && !isLoading && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Add a Demat or savings account first before tracking investments.
          </AlertDescription>
        </Alert>
      )}

      {investments.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Total invested</p>
                  <p className="text-lg font-bold tabular-nums">{formatINR(totalInvested)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Current value</p>
                  <p className="text-lg font-bold tabular-nums">{formatINR(totalValue)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Overall P&amp;L</p>
                  <p className={cn("text-lg font-bold tabular-nums", isGain ? "text-green-600 dark:text-green-400" : "text-destructive")}>
                    {isGain ? "+" : ""}{formatINR(Math.abs(totalPnL))}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Returns</p>
                  <div className={cn("flex items-center gap-1", isGain ? "text-green-600 dark:text-green-400" : "text-destructive")}>
                    {isGain ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    <p className="text-lg font-bold tabular-nums">{isGain ? "+" : ""}{totalPnLPct}%</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground">Allocation</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="flex items-center gap-3">
                <ResponsiveContainer width={72} height={72}>
                  <PieChart>
                    <Pie data={allocationData} dataKey="value" cx="50%" cy="50%" outerRadius={34} innerRadius={18} strokeWidth={0}>
                      {allocationData.map((entry, i) => (
                        <Cell key={entry.key} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => [`₹${Number(v).toLocaleString("en-IN")}`, ""]} contentStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1 flex-1 min-w-0">
                  {allocationData.slice(0, 4).map((entry, i) => {
                    const pct = totalValue > 0 ? Math.round((entry.value / totalValue) * 100) : 0
                    return (
                      <div key={entry.key} className="flex items-center gap-1.5 text-xs">
                        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="truncate text-muted-foreground">{entry.name}</span>
                        <span className="ml-auto font-medium">{pct}%</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : investments.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="No investments tracked"
          description="Add your mutual funds, stocks, FDs, PPF, and other instruments to see your portfolio allocation and returns."
          action={accounts.length > 0 ? { label: "Add investment", onClick: () => setAddOpen(true) } : { label: "Add an account first", href: "/accounts" }}
        />
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Holdings ({investments.length})
              </CardTitle>
              <div className="flex gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setFilter("all")}
                  className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors", filter === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}
                >
                  All
                </button>
                {instrumentTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFilter(type)}
                    className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors", filter === type ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}
                  >
                    {INSTRUMENT_LABELS[type] ?? type}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-2">
            <div className="divide-y">
              {filtered.map((inv) => (
                <InvestmentRow key={inv._id} investment={inv} accounts={accounts} />
              ))}
            </div>
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No {INSTRUMENT_LABELS[filter] ?? filter} investments yet.</p>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add investment</DialogTitle>
            <DialogDescription>Record a stock, mutual fund, FD, or any other investment instrument.</DialogDescription>
          </DialogHeader>
          <InvestmentForm accounts={accounts} onSubmit={handleCreate} onCancel={() => setAddOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
