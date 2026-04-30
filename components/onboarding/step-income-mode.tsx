"use client"

import { cn } from "@/lib/utils"
import { Briefcase, TrendingUp, Building2 } from "lucide-react"
import type { IncomeMode } from "@/models/user"

interface Props {
  value: IncomeMode
  onChange: (v: IncomeMode) => void
}

const OPTIONS = [
  {
    value: "salaried" as const,
    icon: Briefcase,
    label: "Salaried",
    desc: "Fixed monthly salary from an employer",
  },
  {
    value: "variable" as const,
    icon: TrendingUp,
    label: "Freelancer / Variable",
    desc: "Irregular income from projects or clients",
  },
  {
    value: "business" as const,
    icon: Building2,
    label: "Business Owner",
    desc: "Run a business, draw salary or dividends",
  },
]

export function StepIncomeMode({ value, onChange }: Props) {
  return (
    <div className="space-y-3">
      {OPTIONS.map((opt) => {
        const Icon = opt.icon
        const selected = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "w-full flex items-start gap-4 rounded-lg border p-4 text-left transition-colors",
              selected
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 hover:bg-muted/50"
            )}
          >
            <div
              className={cn(
                "mt-0.5 rounded-md p-2",
                selected ? "bg-primary text-primary-foreground" : "bg-muted"
              )}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <p className="font-medium">{opt.label}</p>
              <p className="text-sm text-muted-foreground">{opt.desc}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
