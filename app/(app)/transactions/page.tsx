"use client"

import { useState } from "react"
import { Plus, ArrowLeftRight, ArrowDownRight, ArrowUpRight, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { TransactionTable } from "@/components/transactions/transaction-table"
import { TransactionFilters } from "@/components/transactions/transaction-filters"
import { TransactionForm } from "@/components/transactions/transaction-form"
import { useTransactions, useCreateTransaction, type TransactionFiltersInput } from "@/hooks/use-transactions"
import { useAccounts } from "@/hooks/use-accounts"
import { formatINR } from "@/lib/money"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { CreateTransactionInput } from "@/lib/validators/transaction"

const DEFAULT_FILTERS: TransactionFiltersInput = { page: 1, limit: 50 }

export default function TransactionsPage() {
  const [filters, setFilters] = useState<TransactionFiltersInput>(DEFAULT_FILTERS)
  const [addOpen, setAddOpen] = useState(false)

  const { data, isLoading } = useTransactions(filters)
  const { data: accounts = [] } = useAccounts()
  const create = useCreateTransaction()

  const transactions = data?.transactions ?? []
  const total = data?.total ?? 0
  const stats = data?.stats

  async function handleCreate(d: CreateTransactionInput) {
    await create.mutateAsync(d)
    setAddOpen(false)
    toast.success("Transaction added")
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {total > 0 ? `${total} transactions recorded` : "Every rupee in and out"}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} disabled={accounts.length === 0}>
          <Plus className="h-4 w-4 mr-2" /> Add transaction
        </Button>
      </div>

      {/* Net Spending Summary Bar */}
      {stats && (total > 0 || Object.keys(filters).length > 2) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Net Spending / Outflow */}
          <Card className="shadow-sm hover:border-primary/40 transition-all">
            <CardContent className="p-3.5 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Net Spending</p>
                <p
                  className={cn(
                    "text-xl font-bold tabular-nums mt-0.5",
                    stats.netSpendingPaise > 0
                      ? "text-destructive"
                      : "text-emerald-600 dark:text-emerald-400"
                  )}
                >
                  {stats.netSpendingPaise > 0 ? "−" : "+"}
                  {formatINR(Math.abs(stats.netSpendingPaise), true)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {stats.netSpendingPaise > 0 ? "Net Outflow" : "Net Surplus / Savings"}
                </p>
              </div>
              <div
                className={cn(
                  "p-2 rounded-lg",
                  stats.netSpendingPaise > 0
                    ? "bg-destructive/10 text-destructive"
                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                )}
              >
                {stats.netSpendingPaise > 0 ? (
                  <ArrowDownRight className="h-5 w-5" />
                ) : (
                  <ArrowUpRight className="h-5 w-5" />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Total Expenses */}
          <Card className="shadow-sm hover:border-primary/40 transition-all">
            <CardContent className="p-3.5 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total Expenses</p>
                <p className="text-xl font-bold tabular-nums text-destructive mt-0.5">
                  −{formatINR(stats.totalExpensesPaise, true)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Total debit outflow
                </p>
              </div>
              <div className="p-2 rounded-lg bg-destructive/10 text-destructive">
                <ArrowDownRight className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          {/* Total Income */}
          <Card className="shadow-sm hover:border-primary/40 transition-all">
            <CardContent className="p-3.5 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total Income</p>
                <p className="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
                  +{formatINR(stats.totalIncomePaise, true)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Total credit inflow
                </p>
              </div>
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <ArrowUpRight className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {(transactions.length > 0 || Object.keys(filters).length > 2) && (
        <TransactionFilters
          filters={filters}
          accounts={accounts}
          onChange={setFilters}
          onReset={() => setFilters(DEFAULT_FILTERS)}
        />
      )}

      {!isLoading && transactions.length === 0 && Object.keys(filters).length <= 2 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="No transactions yet"
          description={
            accounts.length === 0
              ? "Add an account first, then record your transactions here."
              : "Add transactions manually or upload a bank statement to get started."
          }
          action={
            accounts.length === 0
              ? { label: "Add an account", href: "/accounts" }
              : { label: "Add transaction", onClick: () => setAddOpen(true) }
          }
        />
      ) : (
        <TransactionTable
          transactions={transactions}
          total={total}
          page={filters.page ?? 1}
          limit={filters.limit ?? 50}
          isLoading={isLoading}
          onPageChange={(p) => setFilters((f) => ({ ...f, page: p }))}
        />
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add transaction</DialogTitle>
            <DialogDescription>
              Record money coming in or going out for one of your accounts.
            </DialogDescription>
          </DialogHeader>
          <TransactionForm
            accounts={accounts}
            onSubmit={handleCreate}
            onCancel={() => setAddOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
