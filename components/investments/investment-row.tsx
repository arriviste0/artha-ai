"use client"

import { useState } from "react"
import { Pencil, Trash2, TrendingUp, TrendingDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { formatINR } from "@/lib/money"
import { useUpdateInvestment, useDeleteInvestment, type InvestmentDTO } from "@/hooks/use-investments"
import { InvestmentForm } from "./investment-form"
import type { AccountDTO } from "@/hooks/use-accounts"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { CreateInvestmentInput } from "@/lib/validators/investment"

const INSTRUMENT_LABELS: Record<string, string> = {
  stock: "Stock", mutual_fund: "MF", etf: "ETF",
  fd: "FD", rd: "RD", ppf: "PPF", epf: "EPF", nps: "NPS",
  gold: "Gold", crypto: "Crypto", real_estate: "RE", other: "Other",
}

interface Props {
  investment: InvestmentDTO
  accounts: AccountDTO[]
}

export function InvestmentRow({ investment, accounts }: Props) {
  const [editOpen, setEditOpen] = useState(false)
  const update = useUpdateInvestment()
  const del = useDeleteInvestment()

  const pnl = investment.currentValuePaise - investment.investedPaise
  const pnlPct = investment.investedPaise > 0
    ? ((pnl / investment.investedPaise) * 100).toFixed(1)
    : "0.0"
  const isGain = pnl >= 0

  async function handleUpdate(data: CreateInvestmentInput) {
    await update.mutateAsync({ id: investment._id, data })
    setEditOpen(false)
    toast.success("Investment updated")
  }

  async function handleDelete() {
    await del.mutateAsync(investment._id)
    toast.success(`"${investment.name}" removed`)
  }

  return (
    <>
      <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/50 transition-colors group">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">{investment.name}</p>
            {investment.symbol && (
              <span className="text-xs text-muted-foreground font-mono">{investment.symbol}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Badge variant="outline" className="text-xs px-1.5 py-0">
              {INSTRUMENT_LABELS[investment.instrument] ?? investment.instrument}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {investment.units} units · ₹{(investment.avgCostPaise / 100).toLocaleString("en-IN")} avg
            </span>
          </div>
        </div>

        <div className="text-right flex-shrink-0 min-w-[100px]">
          <p className="text-sm font-semibold tabular-nums">{formatINR(investment.currentValuePaise)}</p>
          <div className={cn("flex items-center justify-end gap-0.5 text-xs", isGain ? "text-green-600 dark:text-green-400" : "text-destructive")}>
            {isGain ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            <span>{isGain ? "+" : ""}{formatINR(Math.abs(pnl))} ({isGain ? "+" : ""}{pnlPct}%)</span>
          </div>
        </div>

        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={handleDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit investment</DialogTitle>
            <DialogDescription>Update the details for {investment.name}.</DialogDescription>
          </DialogHeader>
          <InvestmentForm
            accounts={accounts}
            defaultValues={investment}
            onSubmit={handleUpdate}
            onCancel={() => setEditOpen(false)}
            submitLabel="Save changes"
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
