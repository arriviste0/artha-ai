"use client"

import { useState } from "react"
import { ArrowUpRight, ArrowDownLeft, Trash2, AlertCircle, ChevronLeft, ChevronRight, Pencil } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatINR } from "@/lib/money"
import { useAccounts } from "@/hooks/use-accounts"
import { useDeleteTransaction, useUpdateTransaction, type TransactionDTO } from "@/hooks/use-transactions"
import { TransactionForm } from "./transaction-form"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { CreateTransactionInput } from "@/lib/validators/transaction"

interface Props {
  transactions: TransactionDTO[]
  total: number
  page: number
  limit: number
  isLoading: boolean
  onPageChange: (p: number) => void
}

export function TransactionTable({ transactions, total, page, limit, isLoading, onPageChange }: Props) {
  const del = useDeleteTransaction()
  const update = useUpdateTransaction()
  const { data: accounts = [] } = useAccounts()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingTxn, setEditingTxn] = useState<TransactionDTO | null>(null)
  const totalPages = Math.ceil(total / limit)

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await del.mutateAsync(id)
      toast.success("Transaction deleted")
    } catch {
      toast.error("Failed to delete transaction")
    } finally {
      setDeletingId(null)
    }
  }

  async function handleUpdate(data: CreateTransactionInput) {
    if (!editingTxn) return

    try {
      await update.mutateAsync({ id: editingTxn._id, data: { ...data, needsReview: false } })
      setEditingTxn(null)
      toast.success("Transaction updated")
    } catch {
      toast.error("Failed to update transaction")
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No transactions match your filters.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Description</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Category</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {transactions.map((txn) => {
              const date = new Date(txn.occurredAt)
              const isCredit = txn.type === "credit"
              return (
                <tr
                  key={txn._id}
                  className={cn(
                    "hover:bg-muted/30 transition-colors",
                    txn.needsReview && "bg-yellow-50/50 dark:bg-yellow-900/10"
                  )}
                >
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    <span className="hidden sm:inline">
                      {date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </span>
                    <span className="sm:hidden">{date.getDate()}/{date.getMonth() + 1}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={cn(
                        "h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0",
                        isCredit ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30"
                      )}>
                        {isCredit
                          ? <ArrowDownLeft className="h-3 w-3 text-green-600 dark:text-green-400" />
                          : <ArrowUpRight className="h-3 w-3 text-red-500" />
                        }
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium max-w-[200px] md:max-w-xs">
                          {txn.merchant || txn.description}
                        </p>
                        {txn.merchant && (
                          <p className="text-xs text-muted-foreground truncate hidden sm:block">
                            {txn.description}
                          </p>
                        )}
                      </div>
                      {txn.needsReview && (
                        <AlertCircle className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <Badge variant="outline" className="text-xs font-normal">
                      {txn.category}
                    </Badge>
                  </td>
                  <td className={cn(
                    "px-4 py-3 text-right font-medium tabular-nums",
                    isCredit ? "text-green-600 dark:text-green-400" : ""
                  )}>
                    {isCredit ? "+" : "−"}{formatINR(txn.amountPaise)}
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => setEditingTxn(txn)}
                        title="Edit transaction"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(txn._id)}
                        disabled={deletingId === txn._id}
                        title="Delete transaction"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} transactions</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span>Page {page} of {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!editingTxn} onOpenChange={(open) => !open && setEditingTxn(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit transaction</DialogTitle>
            <DialogDescription>
              Update the account, date, amount, category, and description for this transaction.
            </DialogDescription>
          </DialogHeader>
          {editingTxn && (
            <TransactionForm
              accounts={accounts}
              defaultValues={editingTxn}
              onSubmit={handleUpdate}
              onCancel={() => setEditingTxn(null)}
              submitLabel="Save changes"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
