"use client"

import { useState } from "react"
import { Plus, ArrowLeftRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { TransactionTable } from "@/components/transactions/transaction-table"
import { TransactionFilters } from "@/components/transactions/transaction-filters"
import { TransactionForm } from "@/components/transactions/transaction-form"
import { useTransactions, useCreateTransaction, type TransactionFiltersInput } from "@/hooks/use-transactions"
import { useAccounts } from "@/hooks/use-accounts"
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

  async function handleCreate(d: CreateTransactionInput) {
    await create.mutateAsync(d)
    setAddOpen(false)
    toast.success("Transaction added")
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Transactions</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {total > 0 ? `${total} transactions` : "Every rupee in and out"}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} disabled={accounts.length === 0}>
          <Plus className="h-4 w-4 mr-2" /> Add transaction
        </Button>
      </div>

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
