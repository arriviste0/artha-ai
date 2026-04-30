"use client"

import { useState } from "react"
import { Check, X, Edit2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatINR } from "@/lib/money"
import type { DraftTransaction } from "@/models/statement-upload"
import { useUpdateDrafts, useCommitStatement } from "@/hooks/use-statements"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

const CATEGORIES = [
  "Food & Dining", "Rent / Housing", "Transport", "Utilities", "Healthcare",
  "Entertainment", "Shopping", "Education", "Insurance", "Investments",
  "EMI / Loans", "Personal Care", "Salary", "Freelance Income",
  "Business Income", "Transfer", "Other",
]

interface EditState {
  description: string
  category: string
}

interface Props {
  uploadId: string
  drafts: DraftTransaction[]
}

export function ReviewTable({ uploadId, drafts }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState>({ description: "", category: "" })
  const [localDrafts, setLocalDrafts] = useState<DraftTransaction[]>(drafts)
  const router = useRouter()

  const updateDrafts = useUpdateDrafts()
  const commit = useCommitStatement()

  const pending = localDrafts.filter((d) => d.status === "pending")
  const accepted = localDrafts.filter((d) => d.status === "accepted")

  const setStatus = async (draftId: string, status: "accepted" | "rejected", overrides?: Partial<EditState>) => {
    setLocalDrafts((prev) =>
      prev.map((d) =>
        d._id === draftId
          ? { ...d, status, ...(overrides?.description ? { description: overrides.description } : {}), ...(overrides?.category ? { category: overrides.category } : {}) }
          : d
      )
    )

    await updateDrafts.mutateAsync({
      id: uploadId,
      updates: [{ draftId, status, ...overrides }],
    })
  }

  const startEdit = (draft: DraftTransaction) => {
    setEditingId(draft._id!)
    setEditState({ description: draft.description, category: draft.category })
  }

  const saveEdit = async (draftId: string) => {
    await setStatus(draftId, "accepted", editState)
    setEditingId(null)
  }

  const acceptAll = async () => {
    const pendingDrafts = localDrafts.filter((d) => d.status === "pending")
    setLocalDrafts((prev) => prev.map((d) => d.status === "pending" ? { ...d, status: "accepted" } : d))
    await updateDrafts.mutateAsync({
      id: uploadId,
      updates: pendingDrafts.map((d) => ({ draftId: d._id!, status: "accepted" as const })),
    })
  }

  const handleCommit = async () => {
    try {
      const result = await commit.mutateAsync(uploadId)
      toast.success(`Imported ${result.importedCount} transactions`)
      router.push("/transactions")
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>{pending.length} pending</span>
          <span className="text-green-600 font-medium">{accepted.length} accepted</span>
          <span>{localDrafts.filter((d) => d.status === "rejected").length} rejected</span>
        </div>
        <div className="flex gap-2">
          {pending.length > 0 && (
            <Button variant="outline" size="sm" onClick={acceptAll}>
              Accept all
            </Button>
          )}
          <Button
            size="sm"
            disabled={accepted.length === 0 || commit.isPending}
            onClick={handleCommit}
          >
            {commit.isPending ? "Importing…" : `Import ${accepted.length} transactions`}
          </Button>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-2 text-muted-foreground font-medium">Date</th>
              <th className="text-left px-3 py-2 text-muted-foreground font-medium">Description</th>
              <th className="text-left px-3 py-2 text-muted-foreground font-medium">Category</th>
              <th className="text-right px-3 py-2 text-muted-foreground font-medium">Amount</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {localDrafts.map((draft) => (
              <tr
                key={draft._id}
                className={
                  draft.status === "accepted"
                    ? "bg-green-50/50 dark:bg-green-950/20"
                    : draft.status === "rejected"
                    ? "bg-muted/30 opacity-50"
                    : ""
                }
              >
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                  {draft.occurredAt.slice(0, 10)}
                </td>
                <td className="px-3 py-2">
                  {editingId === draft._id ? (
                    <Input
                      value={editState.description}
                      onChange={(e) => setEditState((s) => ({ ...s, description: e.target.value }))}
                      className="h-7 text-sm"
                      autoFocus
                    />
                  ) : (
                    <div className="flex items-center gap-1">
                      {draft.needsReview && draft.status === "pending" && (
                        <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                      )}
                      <span className="truncate max-w-xs">{draft.description}</span>
                      {draft.merchant && (
                        <span className="text-muted-foreground">· {draft.merchant}</span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  {editingId === draft._id ? (
                    <Select
                      value={editState.category}
                      onValueChange={(v) => setEditState((s) => ({ ...s, category: v }))}
                    >
                      <SelectTrigger className="h-7 text-sm w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="secondary" className="text-xs font-normal">
                      {draft.category}
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                  <span className={draft.type === "credit" ? "text-green-600" : "text-foreground"}>
                    {draft.type === "credit" ? "+" : "-"}{formatINR(draft.amountPaise)}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {editingId === draft._id ? (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => saveEdit(draft._id!)}
                        className="text-green-600 hover:text-green-700"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1">
                      {draft.status === "pending" && (
                        <>
                          <button
                            type="button"
                            onClick={() => setStatus(draft._id!, "accepted")}
                            className="text-green-600 hover:text-green-700"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => startEdit(draft)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setStatus(draft._id!, "rejected")}
                            className="text-destructive hover:text-destructive/80"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      {draft.status === "accepted" && (
                        <button
                          type="button"
                          onClick={() => setStatus(draft._id!, "rejected")}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                      {draft.status === "rejected" && (
                        <button
                          type="button"
                          onClick={() => setStatus(draft._id!, "accepted")}
                          className="text-muted-foreground hover:text-green-600"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
