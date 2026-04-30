"use client"

import { useForm } from "react-hook-form"
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
import { createAccountSchema, type CreateAccountInput, type CreateAccountFormValues } from "@/lib/validators/account"
import type { AccountDTO } from "@/hooks/use-accounts"

interface Props {
  defaultValues?: Partial<AccountDTO>
  onSubmit: (data: CreateAccountInput) => Promise<void>
  onCancel: () => void
  submitLabel?: string
}

const ACCOUNT_TYPES = [
  { value: "savings", label: "Savings Account" },
  { value: "current", label: "Current Account" },
  { value: "credit_card", label: "Credit Card" },
  { value: "wallet", label: "Digital Wallet" },
  { value: "demat", label: "Demat Account" },
  { value: "cash", label: "Cash" },
  { value: "loan", label: "Loan / EMI" },
]

export function AccountForm({ defaultValues, onSubmit, onCancel, submitLabel = "Save" }: Props) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateAccountFormValues>({
    resolver: zodResolver(createAccountSchema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      type: (defaultValues?.type as CreateAccountInput["type"]) ?? "savings",
      institution: defaultValues?.institution ?? "",
      currentBalancePaise: defaultValues?.currentBalancePaise ?? 0,
    },
  })

  const balanceRupees = ((watch("currentBalancePaise") as number | undefined) ?? 0) / 100

  return (
    <form onSubmit={handleSubmit((d) => onSubmit(d as unknown as CreateAccountInput))} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Account name</Label>
        <Input placeholder="e.g. HDFC Savings" {...register("name")} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Account type</Label>
        <Select
          defaultValue={defaultValues?.type ?? "savings"}
          onValueChange={(v) => setValue("type", v as CreateAccountInput["type"])}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACCOUNT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Bank / Institution</Label>
        <Input placeholder="e.g. HDFC Bank" {...register("institution")} />
      </div>

      <div className="space-y-1.5">
        <Label>Current balance (₹)</Label>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={balanceRupees || ""}
          placeholder="0"
          onChange={(e) =>
            setValue("currentBalancePaise", Math.round((parseFloat(e.target.value) || 0) * 100))
          }
        />
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
