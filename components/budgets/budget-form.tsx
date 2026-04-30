"use client"

import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { createBudgetSchema, type CreateBudgetInput, type CreateBudgetFormValues } from "@/lib/validators/budget"
import type { BudgetDTO } from "@/hooks/use-budgets"

const CATEGORIES = [
  "Food & Dining", "Rent / Housing", "Transport", "Utilities", "Healthcare",
  "Entertainment", "Shopping", "Education", "Insurance", "Investments",
  "EMI / Loans", "Personal Care", "Other",
]

interface Props {
  onSubmit: (data: CreateBudgetInput) => Promise<void>
  onCancel: () => void
  defaultValues?: BudgetDTO
  submitLabel?: string
}

export function BudgetForm({ onSubmit, onCancel, defaultValues, submitLabel = "Create budget" }: Props) {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateBudgetFormValues>({
    resolver: zodResolver(createBudgetSchema),
    defaultValues: {
      period: defaultValues?.period ?? "monthly",
      category: defaultValues?.category ?? "Food & Dining",
      rollover: defaultValues?.rollover ?? false,
      startDate: defaultValues?.startDate ? new Date(defaultValues.startDate).toISOString() : monthStart,
      limitPaise: defaultValues?.limitPaise ?? 0,
      name: defaultValues?.name ?? "",
    },
  })

  const limitRupees = ((watch("limitPaise") as number | undefined) ?? 0) / 100

  return (
    <form onSubmit={handleSubmit((d) => onSubmit(d as unknown as CreateBudgetInput))} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Budget name</Label>
        <Input placeholder="e.g. Monthly Food Budget" {...register("name")} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Controller
            name="category"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Period</Label>
          <Controller
            name="period"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Spending limit (₹)</Label>
        <p className="text-xs text-muted-foreground">
          This is the maximum amount you plan to spend in this budget&apos;s period.
        </p>
        <Input
          type="number"
          step="1"
          min="1"
          placeholder="e.g. 10000"
          value={limitRupees || ""}
          onChange={(e) =>
            setValue("limitPaise", Math.round((parseFloat(e.target.value) || 0) * 100))
          }
        />
        {errors.limitPaise && (
          <p className="text-xs text-destructive">{errors.limitPaise.message}</p>
        )}
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
