"use client"

import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createInvestmentSchema, type CreateInvestmentInput } from "@/lib/validators/investment"
import type { AccountDTO } from "@/hooks/use-accounts"
import type { InvestmentDTO } from "@/hooks/use-investments"
import { z } from "zod"

const INSTRUMENT_LABELS: Record<string, string> = {
  stock: "Stock", mutual_fund: "Mutual Fund", etf: "ETF",
  fd: "Fixed Deposit (FD)", rd: "Recurring Deposit (RD)",
  ppf: "PPF", epf: "EPF", nps: "NPS",
  gold: "Gold", crypto: "Crypto", real_estate: "Real Estate", other: "Other",
}

const formSchema = z.object({
  accountId: z.string().min(1, "Account is required"),
  instrument: createInvestmentSchema.shape.instrument,
  name: z.string().min(1, "Name is required").max(200),
  symbol: z.string().max(20).optional(),
  units: z.number().positive("Must be positive"),
  avgCostRupees: z.number().min(0, "Must be 0 or more"),
  currentValueRupees: z.number().min(0, "Must be 0 or more"),
  purchaseDate: z.string().min(1, "Date is required"),
  maturityDate: z.string().optional(),
  notes: z.string().max(500).optional(),
})

type FormValues = z.infer<typeof formSchema>

interface Props {
  accounts: AccountDTO[]
  onSubmit: (data: CreateInvestmentInput) => Promise<void>
  onCancel: () => void
  defaultValues?: InvestmentDTO
  submitLabel?: string
}

export function InvestmentForm({ accounts, onSubmit, onCancel, defaultValues, submitLabel = "Add investment" }: Props) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      accountId: defaultValues?.accountId ?? (accounts[0]?._id ?? ""),
      instrument: (defaultValues?.instrument as FormValues["instrument"]) ?? "mutual_fund",
      name: defaultValues?.name ?? "",
      symbol: defaultValues?.symbol ?? "",
      units: defaultValues?.units ?? 1,
      avgCostRupees: defaultValues ? defaultValues.avgCostPaise / 100 : undefined,
      currentValueRupees: defaultValues ? defaultValues.currentValuePaise / 100 : undefined,
      purchaseDate: defaultValues?.purchaseDate
        ? new Date(defaultValues.purchaseDate).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      maturityDate: defaultValues?.maturityDate
        ? new Date(defaultValues.maturityDate).toISOString().slice(0, 10)
        : "",
      notes: defaultValues?.notes ?? "",
    },
  })

  const units = watch("units") ?? 0
  const avgCost = watch("avgCostRupees") ?? 0
  const totalInvested = units * avgCost

  const instrument = watch("instrument")
  const hasMaturity = ["fd", "rd", "ppf", "epf", "nps"].includes(instrument)
  const hasSymbol = ["stock", "mutual_fund", "etf", "crypto"].includes(instrument)

  async function handleFormSubmit(values: FormValues) {
    const avgCostPaise = Math.round((values.avgCostRupees ?? 0) * 100)
    const investedPaise = Math.round(values.units * (values.avgCostRupees ?? 0) * 100)
    const currentValuePaise = Math.round((values.currentValueRupees ?? 0) * 100)
    await onSubmit({
      accountId: values.accountId,
      instrument: values.instrument,
      name: values.name,
      symbol: values.symbol || undefined,
      units: values.units,
      avgCostPaise,
      investedPaise,
      currentValuePaise,
      purchaseDate: values.purchaseDate,
      maturityDate: values.maturityDate || undefined,
      notes: values.notes || undefined,
    })
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Instrument type</Label>
          <Controller
            name="instrument"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(INSTRUMENT_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Account</Label>
          <Controller
            name="accountId"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a._id} value={a._id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.accountId && <p className="text-xs text-destructive">{errors.accountId.message}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input placeholder={instrument === "stock" ? "e.g. Reliance Industries" : instrument === "mutual_fund" ? "e.g. Mirae Asset Large Cap" : "e.g. SBI FD"} {...register("name")} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      {hasSymbol && (
        <div className="space-y-1.5">
          <Label>Symbol / ISIN <span className="text-muted-foreground">(optional)</span></Label>
          <Input placeholder={instrument === "stock" ? "e.g. RELIANCE" : "e.g. INF209K01YJ5"} {...register("symbol")} />
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Units</Label>
          <Input type="number" step="0.001" min="0.001" placeholder="10" {...register("units", { valueAsNumber: true })} />
          {errors.units && <p className="text-xs text-destructive">{errors.units.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Avg cost / unit (₹)</Label>
          <Input type="number" step="0.01" min="0" placeholder="150" {...register("avgCostRupees", { valueAsNumber: true })} />
        </div>
        <div className="space-y-1.5">
          <Label>Total invested (₹)</Label>
          <Input value={totalInvested > 0 ? totalInvested.toFixed(0) : ""} readOnly className="bg-muted/50 text-muted-foreground" tabIndex={-1} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Current value (₹)</Label>
        <Input type="number" step="0.01" min="0" placeholder="18000" {...register("currentValueRupees", { valueAsNumber: true })} />
        {errors.currentValueRupees && <p className="text-xs text-destructive">{errors.currentValueRupees.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Purchase date</Label>
          <Input type="date" {...register("purchaseDate")} />
          {errors.purchaseDate && <p className="text-xs text-destructive">{errors.purchaseDate.message}</p>}
        </div>
        {hasMaturity && (
          <div className="space-y-1.5">
            <Label>Maturity date <span className="text-muted-foreground">(optional)</span></Label>
            <Input type="date" {...register("maturityDate")} />
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Notes <span className="text-muted-foreground">(optional)</span></Label>
        <Input placeholder="e.g. Auto-SIP, locked until 2026" {...register("notes")} />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
