"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface AccountData {
  accountName: string
  accountType: string
  institution: string
  currentBalancePaise: number
}

interface Props {
  value: AccountData
  onChange: (v: AccountData) => void
}

const ACCOUNT_TYPES = [
  { value: "savings", label: "Savings Account" },
  { value: "current", label: "Current Account" },
  { value: "credit_card", label: "Credit Card" },
  { value: "wallet", label: "Digital Wallet" },
  { value: "cash", label: "Cash" },
  { value: "loan", label: "Loan Account" },
]

export function StepFirstAccount({ value, onChange }: Props) {
  const balanceRupees =
    value.currentBalancePaise > 0 ? (value.currentBalancePaise / 100).toString() : ""

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Account name</Label>
        <Input
          placeholder="e.g. HDFC Savings"
          value={value.accountName}
          onChange={(e) => onChange({ ...value, accountName: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Account type</Label>
        <Select
          value={value.accountType}
          onValueChange={(v) => onChange({ ...value, accountType: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select type" />
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
        <Input
          placeholder="e.g. HDFC Bank (optional)"
          value={value.institution}
          onChange={(e) => onChange({ ...value, institution: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Current balance (₹)</Label>
        <Input
          type="number"
          placeholder="0"
          min="0"
          step="0.01"
          value={balanceRupees}
          onChange={(e) => {
            const rupees = parseFloat(e.target.value) || 0
            onChange({ ...value, currentBalancePaise: Math.round(rupees * 100) })
          }}
        />
        <p className="text-xs text-muted-foreground">Enter 0 if you&apos;ll add this later</p>
      </div>
    </div>
  )
}
