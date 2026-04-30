"use client"

import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import type { AccountDTO } from "@/hooks/use-accounts"
import type { TransactionFiltersInput } from "@/hooks/use-transactions"

const CATEGORIES = [
  "Food & Dining", "Rent / Housing", "Transport", "Utilities", "Healthcare",
  "Entertainment", "Shopping", "Education", "Insurance", "Investments",
  "EMI / Loans", "Personal Care", "Salary", "Freelance Income", "Business Income",
  "Transfer", "Other",
]

interface Props {
  filters: TransactionFiltersInput
  accounts: AccountDTO[]
  onChange: (f: TransactionFiltersInput) => void
  onReset: () => void
}

export function TransactionFilters({ filters, accounts, onChange, onReset }: Props) {
  const hasFilters = !!(filters.search || filters.category || filters.accountId || filters.from || filters.to)

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <Input
        placeholder="Search description..."
        className="w-48"
        value={filters.search ?? ""}
        onChange={(e) => onChange({ ...filters, search: e.target.value || undefined, page: 1 })}
      />

      <Select
        value={filters.category ?? "all"}
        onValueChange={(v) => onChange({ ...filters, category: v === "all" ? undefined : v, page: 1 })}
      >
        <SelectTrigger className="w-44">
          <SelectValue placeholder="All categories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {CATEGORIES.map((c) => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.accountId ?? "all"}
        onValueChange={(v) => onChange({ ...filters, accountId: v === "all" ? undefined : v, page: 1 })}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="All accounts" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All accounts</SelectItem>
          {accounts.map((a) => (
            <SelectItem key={a._id} value={a._id}>{a.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        type="date"
        className="w-36"
        value={filters.from?.split("T")[0] ?? ""}
        onChange={(e) =>
          onChange({ ...filters, from: e.target.value ? e.target.value + "T00:00:00.000Z" : undefined, page: 1 })
        }
      />
      <span className="text-muted-foreground text-sm">to</span>
      <Input
        type="date"
        className="w-36"
        value={filters.to?.split("T")[0] ?? ""}
        onChange={(e) =>
          onChange({ ...filters, to: e.target.value ? e.target.value + "T23:59:59.999Z" : undefined, page: 1 })
        }
      />

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={onReset} className="gap-1">
          <X className="h-3 w-3" /> Clear
        </Button>
      )}
    </div>
  )
}
