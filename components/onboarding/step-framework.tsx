"use client"

import { cn } from "@/lib/utils"
import type { BudgetingFramework } from "@/models/user"

interface Props {
  value: BudgetingFramework | "skip"
  onChange: (v: BudgetingFramework | "skip") => void
}

const OPTIONS = [
  {
    value: "50-30-20" as const,
    label: "50/30/20",
    subtitle: "Classic rule",
    desc: "50% needs · 30% wants · 20% savings & investments",
    highlight: true,
  },
  {
    value: "50-20-30" as const,
    label: "50/20/30",
    subtitle: "India-context",
    desc: "50% needs · 20% wants · 30% savings (higher savings priority)",
    highlight: false,
  },
  {
    value: "custom" as const,
    label: "Custom",
    subtitle: "Set your own",
    desc: "Define your own category-level limits in Budgets",
    highlight: false,
  },
  {
    value: "skip" as const,
    label: "Skip for now",
    subtitle: "",
    desc: "You can set this up later in Settings",
    highlight: false,
  },
]

export function StepFramework({ value, onChange }: Props) {
  return (
    <div className="space-y-3">
      {OPTIONS.map((opt) => {
        const selected = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "w-full flex items-start gap-3 rounded-lg border p-4 text-left transition-colors",
              selected
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 hover:bg-muted/50"
            )}
          >
            <div
              className={cn(
                "mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0",
                selected ? "border-primary bg-primary" : "border-muted-foreground"
              )}
            />
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">{opt.label}</p>
                {opt.subtitle && (
                  <span className="text-xs text-muted-foreground">{opt.subtitle}</span>
                )}
                {opt.highlight && (
                  <span className="text-xs bg-primary/10 text-primary rounded px-1.5 py-0.5">
                    Recommended
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">{opt.desc}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
