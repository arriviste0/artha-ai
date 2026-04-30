"use client"

import { useState } from "react"
import { MoreHorizontal, Pencil, Trash2, Wallet, CreditCard, Building, PiggyBank } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AccountForm } from "./account-form"
import { formatINR } from "@/lib/money"
import { useUpdateAccount, useDeleteAccount, type AccountDTO } from "@/hooks/use-accounts"
import { toast } from "sonner"
import type { CreateAccountInput } from "@/lib/validators/account"

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  savings: Building,
  current: Building,
  credit_card: CreditCard,
  wallet: Wallet,
  demat: PiggyBank,
  cash: Wallet,
  loan: CreditCard,
}

const TYPE_LABELS: Record<string, string> = {
  savings: "Savings",
  current: "Current",
  credit_card: "Credit Card",
  wallet: "Wallet",
  demat: "Demat",
  cash: "Cash",
  loan: "Loan",
}

export function AccountCard({ account }: { account: AccountDTO }) {
  const [editOpen, setEditOpen] = useState(false)
  const update = useUpdateAccount()
  const del = useDeleteAccount()

  const Icon = TYPE_ICONS[account.type] ?? Wallet
  const isNegative = account.currentBalancePaise < 0

  async function handleUpdate(data: CreateAccountInput) {
    await update.mutateAsync({ id: account._id, data })
    setEditOpen(false)
    toast.success("Account updated")
  }

  async function handleDelete() {
    await del.mutateAsync(account._id)
    toast.success("Account removed")
  }

  return (
    <>
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="rounded-lg bg-muted p-2 flex-shrink-0">
                <Icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="font-medium truncate">{account.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {account.institution || TYPE_LABELS[account.type] || account.type}
                </p>
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <Pencil className="mr-2 h-4 w-4" /> Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={handleDelete}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="mt-4 flex items-end justify-between">
            <p
              className={`text-xl font-bold tabular-nums ${isNegative ? "text-destructive" : ""}`}
            >
              {formatINR(Math.abs(account.currentBalancePaise))}
              {isNegative && <span className="text-sm font-normal ml-1">(owed)</span>}
            </p>
            <Badge variant="outline" className="text-xs">
              {TYPE_LABELS[account.type] ?? account.type}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit account</DialogTitle>
            <DialogDescription>
              Update this account&apos;s details and current tracked balance.
            </DialogDescription>
          </DialogHeader>
          <AccountForm
            defaultValues={account}
            onSubmit={handleUpdate}
            onCancel={() => setEditOpen(false)}
            submitLabel="Save changes"
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
