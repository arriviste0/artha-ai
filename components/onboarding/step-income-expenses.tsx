"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { X } from "lucide-react"

const SUGGESTED_CATEGORIES = [
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
]

interface Props {
  monthlyIncomePaise: number
  topCategories: string[]
  onChange: (income: number, categories: string[]) => void
}

export function StepIncomeExpenses({ monthlyIncomePaise, topCategories, onChange }: Props) {
  const incomeRupees = monthlyIncomePaise > 0 ? (monthlyIncomePaise / 100).toString() : ""

  function toggleCategory(cat: string) {
    if (topCategories.includes(cat)) {
      onChange(monthlyIncomePaise, topCategories.filter((c) => c !== cat))
    } else if (topCategories.length < 8) {
      onChange(monthlyIncomePaise, [...topCategories, cat])
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Label>Approximate monthly income (₹)</Label>
        <Input
          type="number"
          placeholder="e.g. 80000"
          min="0"
          value={incomeRupees}
          onChange={(e) => {
            const rupees = parseFloat(e.target.value) || 0
            onChange(Math.round(rupees * 100), topCategories)
          }}
        />
        <p className="text-xs text-muted-foreground">
          Used only for planning. Your actual transactions always take priority.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Your main expense categories</Label>
        <p className="text-xs text-muted-foreground">Pick up to 8 that apply to you</p>
        <div className="flex flex-wrap gap-2 mt-2">
          {SUGGESTED_CATEGORIES.map((cat) => {
            const selected = topCategories.includes(cat)
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                className="focus:outline-none"
              >
                <Badge
                  variant={selected ? "default" : "outline"}
                  className="cursor-pointer select-none"
                >
                  {selected && <X className="mr-1 h-3 w-3" />}
                  {cat}
                </Badge>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
