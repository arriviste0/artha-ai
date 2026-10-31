"use client"

import { useRef, useEffect } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, PiggyBank } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createTransactionSchema, type CreateTransactionInput, type CreateTransactionFormValues } from "@/lib/validators/transaction"
import type { AccountDTO } from "@/hooks/use-accounts"
import type { TransactionDTO } from "@/hooks/use-transactions"
import { useBudgets, type BudgetDTO } from "@/hooks/use-budgets"
import { formatINR } from "@/lib/money"

const CATEGORIES = [
  "Food & Dining",
  "Rent / Housing",
  "Transport",
  "Utilities",
  "Healthcare",
  "Entertainment",
  "Shopping",
  "Education",
  "Insurance",
  "Investments",
  "EMI / Loans",
  "Personal Care",
  "Salary",
  "Freelance Income",
  "Business Income",
  "Transfer",
  "Other",
]

interface Props {
  accounts: AccountDTO[]
  budgets?: BudgetDTO[]
  onSubmit: (data: CreateTransactionInput) => Promise<void>
  onCancel: () => void
  defaultAccountId?: string
  defaultValues?: TransactionDTO
  submitLabel?: string
}

export function TransactionForm({
  accounts,
  budgets,
  onSubmit,
  onCancel,
  defaultAccountId,
  defaultValues,
  submitLabel = "Add transaction",
}: Props) {
  const { data: fetchedBudgets = [] } = useBudgets()
  const budgetList = budgets ?? fetchedBudgets

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateTransactionFormValues>({
    resolver: zodResolver(createTransactionSchema),
    defaultValues: {
      accountId: defaultValues?.accountId ?? defaultAccountId ?? accounts[0]?._id ?? "",
      type: defaultValues?.type ?? "debit",
      occurredAt: defaultValues?.occurredAt ?? new Date().toISOString().split("T")[0] + "T00:00:00.000Z",
      category: defaultValues?.category ?? "Other",
      tags: defaultValues?.tags ?? [],
      amountPaise: defaultValues?.amountPaise ?? 0,
      description: defaultValues?.description ?? "",
      merchant: defaultValues?.merchant ?? "",
      budgetId: defaultValues?.budgetId ?? "",
    },
  })

  // Auto-link to matching budget on initial load if transaction has matching category
  const isBudgetInitialized = useRef(false)
  useEffect(() => {
    if (isBudgetInitialized.current) return
    if (budgetList.length === 0) return

    isBudgetInitialized.current = true
    const currentBudgetId = watch("budgetId")
    if (!currentBudgetId && defaultValues?.category && watch("type") !== "credit") {
      const matchingBudget = budgetList.find((b) => b.category === defaultValues.category)
      if (matchingBudget) {
        setValue("budgetId", matchingBudget._id)
      }
    }
  }, [budgetList, defaultValues?.category, setValue, watch])

  const amountRupees = ((watch("amountPaise") as number | undefined) ?? 0) / 100
  const txType = watch("type")
  const isCredit = txType === "credit"
  const currentBudgetId = watch("budgetId")
  const selectedBudget = budgetList.find((b) => b._id === currentBudgetId)

  return (
    <form onSubmit={handleSubmit((d) => onSubmit(d as unknown as CreateTransactionInput))} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Controller
            name="type"
            control={control}
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(val: "credit" | "debit") => {
                  field.onChange(val)
                  if (val === "credit") {
                    setValue("budgetId", "")
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="debit">Expense (Debit)</SelectItem>
                  <SelectItem value="credit">Income (Credit)</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Amount (₹)</Label>
          <Input
            type="number"
            step="0.01"
            min="0.01"
            placeholder="0.00"
            value={amountRupees || ""}
            onChange={(e) =>
              setValue("amountPaise", Math.round((parseFloat(e.target.value) || 0) * 100))
            }
          />
          {errors.amountPaise && (
            <p className="text-xs text-destructive">{errors.amountPaise.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Account</Label>
        <Controller
          name="accountId"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a._id} value={a._id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Description</Label>
        <Input placeholder="e.g. Swiggy order, Rent payment" {...register("description")} />
        {errors.description && (
          <p className="text-xs text-destructive">{errors.description.message}</p>
        )}
      </div>

      {/* Budget Category Dropdown */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5">
            <PiggyBank className="h-3.5 w-3.5 text-primary" />
            Budget Category
          </Label>
          {selectedBudget && !isCredit && (
            <span className="text-[11px] text-muted-foreground font-normal">
              {formatINR(Math.max(0, selectedBudget.limitPaise - selectedBudget.spentPaise))} remaining of {formatINR(selectedBudget.limitPaise)}
            </span>
          )}
        </div>
        <Controller
          name="budgetId"
          control={control}
          render={({ field }) => (
            <Select
              value={field.value || "none"}
              onValueChange={(val) => {
                if (val === "none") {
                  field.onChange("")
                } else {
                  field.onChange(val)
                  const chosen = budgetList.find((b) => b._id === val)
                  if (chosen) {
                    setValue("category", chosen.category)
                  }
                }
              }}
              disabled={isCredit}
            >
              <SelectTrigger>
                <SelectValue placeholder={isCredit ? "Budgets apply to expenses" : "Select budget category"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  {budgetList.length === 0 ? "No budgets created (None)" : "No specific budget"}
                </SelectItem>
                {budgetList.map((b) => (
                  <SelectItem key={b._id} value={b._id}>
                    <div className="flex items-center justify-between gap-3 w-full">
                      <span className="font-medium">{b.name}</span>
                      <span className="text-xs text-muted-foreground">({b.category})</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {budgetList.length === 0 && !isCredit && (
          <p className="text-[11px] text-muted-foreground">
            No budgets created yet. Set up category budgets in the{" "}
            <a href="/budgets" className="text-primary underline hover:text-primary/80">
              Budgets page
            </a>{" "}
            to track spending against limits.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Controller
            name="category"
            control={control}
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(val) => {
                  field.onChange(val)
                  const matching = budgetList.find((b) => b.category === val)
                  if (matching && !isCredit) {
                    setValue("budgetId", matching._id)
                  } else if (watch("budgetId")) {
                    setValue("budgetId", "")
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Date</Label>
          <Input
            type="date"
            defaultValue={(defaultValues?.occurredAt ?? new Date().toISOString()).split("T")[0]}
            onChange={(e) =>
              setValue("occurredAt", e.target.value ? e.target.value + "T00:00:00.000Z" : "")
            }
          />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
