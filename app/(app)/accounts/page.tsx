"use client"

import { useState } from "react"
import { Plus, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { AccountCard } from "@/components/accounts/account-card"
import { AccountForm } from "@/components/accounts/account-form"
import { useAccounts, useCreateAccount } from "@/hooks/use-accounts"
import { toast } from "sonner"
import type { CreateAccountInput } from "@/lib/validators/account"
import { formatINR } from "@/lib/money"

export default function AccountsPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const { data: accounts = [], isLoading } = useAccounts()
  const create = useCreateAccount()

  const totalBalance = accounts.reduce((s, a) => s + a.currentBalancePaise, 0)

  async function handleCreate(data: CreateAccountInput) {
    await create.mutateAsync(data)
    setCreateOpen(false)
    toast.success(`"${data.name}" account added`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Accounts</h1>
          <p className="text-muted-foreground text-sm mt-1">
            All your banks, wallets, and investment accounts
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add account
        </Button>
      </div>

      {accounts.length > 0 && (
        <div className="rounded-xl border bg-muted/30 px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Combined balance
            </p>
            <p className={`text-2xl font-bold tabular-nums ${totalBalance < 0 ? "text-destructive" : ""}`}>
              {totalBalance < 0 ? "−" : ""}{formatINR(Math.abs(totalBalance))}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">{accounts.length} account{accounts.length !== 1 ? "s" : ""}</p>
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No accounts yet"
          description="Add a savings account, credit card, or wallet to start tracking your money."
          action={{ label: "Add your first account", onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => <AccountCard key={a._id} account={a} />)}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add account</DialogTitle>
            <DialogDescription>
              Add a bank, wallet, cash, or credit account for tracking balances and transactions.
            </DialogDescription>
          </DialogHeader>
          <AccountForm
            onSubmit={handleCreate}
            onCancel={() => setCreateOpen(false)}
            submitLabel="Add account"
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
