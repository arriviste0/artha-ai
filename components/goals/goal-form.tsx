"use client"

import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, Shield, PiggyBank, TrendingDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createGoalSchema } from "@/lib/validators/goal"
import type { GoalDTO } from "@/hooks/use-goals"
import { cn } from "@/lib/utils"
import { z } from "zod"

const KIND_OPTIONS = [
  { value: "emergency_fund", label: "Emergency Fund", icon: Shield, hint: "Aim for 3–6 months of expenses" },
  { value: "savings", label: "Savings Goal", icon: PiggyBank, hint: "Holiday, gadget, down payment, etc." },
  { value: "debt_payoff", label: "Debt Payoff", icon: TrendingDown, hint: "Pay off a loan or credit card" },
] as const

const formSchema = z.object({
  kind: z.enum(["savings", "emergency_fund", "debt_payoff"]),
  name: z.string().min(1, "Name is required").max(200),
  targetRupees: z.number().positive("Target must be greater than 0"),
  monthlyRupees: z.number().min(0).default(0),
  targetDate: z.string().optional(),
  priority: z.number().int().min(1).max(5).default(3),
})

type FormValues = z.infer<typeof formSchema>

interface Props {
  onSubmit: (data: z.infer<typeof createGoalSchema>) => Promise<void>
  onCancel: () => void
  defaultValues?: GoalDTO
  submitLabel?: string
}

export function GoalForm({ onSubmit, onCancel, defaultValues, submitLabel = "Create goal" }: Props) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      kind: defaultValues?.kind ?? "emergency_fund",
      name: defaultValues?.name ?? "",
      targetRupees: defaultValues ? defaultValues.targetPaise / 100 : undefined,
      monthlyRupees: defaultValues ? defaultValues.monthlyContributionPaise / 100 : 0,
      targetDate: defaultValues?.targetDate
        ? new Date(defaultValues.targetDate).toISOString().slice(0, 10)
        : "",
      priority: defaultValues?.priority ?? 3,
    },
  })

  const selectedKind = watch("kind")
  const kindMeta = KIND_OPTIONS.find((k) => k.value === selectedKind)

  async function handleFormSubmit(values: FormValues) {
    await onSubmit({
      kind: values.kind,
      name: values.name,
      targetPaise: Math.round(values.targetRupees * 100),
      monthlyContributionPaise: Math.round((values.monthlyRupees ?? 0) * 100),
      targetDate: values.targetDate ? new Date(values.targetDate).toISOString() : undefined,
      priority: values.priority,
    })
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label>Goal type</Label>
        <Controller
          name="kind"
          control={control}
          render={({ field }) => (
            <div className="grid grid-cols-3 gap-2">
              {KIND_OPTIONS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => field.onChange(value)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium transition-colors",
                    field.value === value
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:bg-muted/50 text-muted-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          )}
        />
        {kindMeta && (
          <p className="text-xs text-muted-foreground">{kindMeta.hint}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Goal name</Label>
        <Input placeholder={selectedKind === "emergency_fund" ? "Emergency Fund" : selectedKind === "debt_payoff" ? "Car Loan Payoff" : "Travel to Goa"} {...register("name")} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Target amount (₹)</Label>
          <Input
            type="number"
            step="1000"
            min="1"
            placeholder="300000"
            {...register("targetRupees", { valueAsNumber: true })}
          />
          {errors.targetRupees && <p className="text-xs text-destructive">{errors.targetRupees.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Monthly contribution (₹)</Label>
          <Input
            type="number"
            step="500"
            min="0"
            placeholder="5000"
            {...register("monthlyRupees", { valueAsNumber: true })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Target date <span className="text-muted-foreground">(optional)</span></Label>
          <Input type="date" {...register("targetDate")} />
        </div>

        <div className="space-y-1.5">
          <Label>Priority</Label>
          <Controller
            name="priority"
            control={control}
            render={({ field }) => (
              <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 — Critical</SelectItem>
                  <SelectItem value="2">2 — High</SelectItem>
                  <SelectItem value="3">3 — Medium</SelectItem>
                  <SelectItem value="4">4 — Low</SelectItem>
                  <SelectItem value="5">5 — Someday</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
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
