"use client"

import { useState } from "react"
import { Check, Edit2, Loader2, Sparkles, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import type { TransactionDTO } from "@/hooks/use-transactions"

interface PayeeConfirmChipProps {
  transaction: TransactionDTO
  onOpenEdit?: () => void
  onConfirmed?: () => void
  onConfirmAll?: () => void
}

export function PayeeConfirmChip({
  transaction,
  onOpenEdit,
  onConfirmed,
  onConfirmAll,
}: PayeeConfirmChipProps) {
  const [isConfirming, setIsConfirming] = useState(false)
  const [isConfirmingAll, setIsConfirmingAll] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)

  // Only show if not yet confirmed by user and has a recognizable payee/merchant
  const payeeDisplayName = transaction.merchant || transaction.description
  const isConfirmed = transaction.categoryConfirmedByUser

  if (isConfirmed || isDismissed || !payeeDisplayName) {
    return null
  }

  const payeeKey =
    transaction.payeeKey ||
    payeeDisplayName.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 30)

  async function handleConfirm() {
    setIsConfirming(true)
    try {
      const res = await fetch("/api/payees/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payeeKey,
          direction: transaction.type,
          category: transaction.category,
          applyToPast: true,
        }),
      })

      if (!res.ok) {
        throw new Error("Failed to lock rule")
      }

      const data = (await res.json()) as { undoId?: string; updatedCount?: number }
      setIsDismissed(true)
      onConfirmed?.()

      toast.success(
        `Always using "${transaction.category}" for ${payeeDisplayName}`,
        {
          description:
            data.updatedCount && data.updatedCount > 1
              ? `Applied to ${data.updatedCount} transactions`
              : "Saved preference for future transactions",
          action: data.undoId
            ? {
                label: "Undo",
                onClick: async () => {
                  try {
                    await fetch("/api/payees/undo", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ undoId: data.undoId }),
                    })
                    toast.info("Rule confirmation undone")
                    setIsDismissed(false)
                  } catch {
                    toast.error("Failed to undo")
                  }
                },
              }
            : undefined,
        }
      )
    } catch {
      toast.error("Could not confirm category rule")
    } finally {
      setIsConfirming(false)
    }
  }

  async function handleConfirmAll() {
    setIsConfirmingAll(true)
    try {
      const res = await fetch("/api/payees/confirm-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      if (!res.ok) {
        throw new Error("Failed to confirm all")
      }

      const data = (await res.json()) as { confirmedCount?: number }
      setIsDismissed(true)
      if (onConfirmAll) {
        onConfirmAll()
      } else if (onConfirmed) {
        onConfirmed()
      }

      toast.success(
        `All transaction categories confirmed! (${data.confirmedCount || "All"} updated)`
      )
    } catch {
      toast.error("Could not confirm all categories")
    } finally {
      setIsConfirmingAll(false)
    }
  }

  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 mt-1 text-xs rounded-md bg-primary/10 border border-primary/20 text-foreground transition-all">
      <Sparkles className="h-3 w-3 text-primary shrink-0" />
      <span className="truncate max-w-[200px] sm:max-w-xs text-muted-foreground">
        Categorised as <strong className="text-foreground font-medium">{transaction.category}</strong>. Always do this for <span className="font-medium text-foreground truncate">{payeeDisplayName}</span>?
      </span>
      <div className="inline-flex items-center gap-1 ml-1 shrink-0">
        <Button
          type="button"
          size="sm"
          variant="default"
          className="h-5 px-2 text-[10px] gap-1 font-medium"
          disabled={isConfirming || isConfirmingAll}
          onClick={handleConfirm}
        >
          {isConfirming ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
          ) : (
            <Check className="h-2.5 w-2.5" />
          )}
          Confirm
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-5 px-2 text-[10px] gap-1 font-medium bg-primary/20 hover:bg-primary/30 text-foreground"
          disabled={isConfirming || isConfirmingAll}
          onClick={handleConfirmAll}
          title="Confirm all pending transaction categories"
        >
          {isConfirmingAll ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
          ) : (
            <Check className="h-2.5 w-2.5 text-primary" />
          )}
          Confirm All
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-5 px-1.5 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
          onClick={() => {
            if (onOpenEdit) onOpenEdit()
          }}
        >
          <Edit2 className="h-2.5 w-2.5" />
          Change
        </Button>
      </div>
    </div>
  )
}
