"use client"

import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
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
  onSubmit: (data: CreateTransactionInput) => Promise<void>
  onCancel: () => void
  defaultAccountId?: string
  defaultValues?: TransactionDTO
  submitLabel?: string
}

export function TransactionForm({
  accounts,
  onSubmit,
  onCancel,
  defaultAccountId,
  defaultValues,
  submitLabel = "Add transaction",
}: Props) {
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
    },
  })

  const amountRupees = ((watch("amountPaise") as number | undefined) ?? 0) / 100

  return (
    <form onSubmit={handleSubmit((d) => onSubmit(d as unknown as CreateTransactionInput))} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Controller
            name="type"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
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

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Controller
            name="category"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
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
