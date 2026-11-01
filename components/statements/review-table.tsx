"use client"

import { useState } from "react"
import { Check, X, Edit2, AlertTriangle, ArrowDownLeft, ArrowUpRight } from "lucide-react"
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
  type: "credit" | "debit"
}

interface Props {
  uploadId: string
  drafts: DraftTransaction[]
}

export function ReviewTable({ uploadId, drafts }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState>({ description: "", category: "", type: "debit" })
  const [localDrafts, setLocalDrafts] = useState<DraftTransaction[]>(drafts)
  const router = useRouter()

  const updateDrafts = useUpdateDrafts()
  const commit = useCommitStatement()

  const pending = localDrafts.filter((d) => d.status === "pending")
  const accepted = localDrafts.filter((d) => d.status === "accepted")
  const rejected = localDrafts.filter((d) => d.status === "rejected")

  const debits = localDrafts.filter((d) => d.type === "debit" && d.status !== "rejected")
  const credits = localDrafts.filter((d) => d.type === "credit" && d.status !== "rejected")
  const totalDebitPaise = debits.reduce((acc, d) => acc + d.amountPaise, 0)
  const totalCreditPaise = credits.reduce((acc, d) => acc + d.amountPaise, 0)

  const setStatus = async (
    draftId: string,
    status: "accepted" | "rejected",
    overrides?: Partial<EditState>
  ) => {
    setLocalDrafts((prev) =>
      prev.map((d) =>
        d._id === draftId
          ? {
              ...d,
              status,
              ...(overrides?.description ? { description: overrides.description } : {}),
              ...(overrides?.category ? { category: overrides.category } : {}),
              ...(overrides?.type ? { type: overrides.type } : {}),
            }
          : d
      )
    )

    await updateDrafts.mutateAsync({
      id: uploadId,
      updates: [{ draftId, status, ...overrides }],
    })
  }

  const toggleType = async (draft: DraftTransaction) => {
    const newType = draft.type === "credit" ? "debit" : "credit"
    setLocalDrafts((prev) =>
      prev.map((d) => (d._id === draft._id ? { ...d, type: newType } : d))
    )

    await updateDrafts.mutateAsync({
      id: uploadId,
      updates: [{
        draftId: draft._id!,
        status: draft.status === "rejected" ? "rejected" : "accepted",
        type: newType,
      }],
    })
    toast.success(`Updated to ${newType === "credit" ? "Credit (+)" : "Debit (-)"}`)
  }

  const startEdit = (draft: DraftTransaction) => {
    setEditingId(draft._id!)
    setEditState({
      description: draft.description,
      category: draft.category,
      type: draft.type,
    })
  }

  const saveEdit = async (draftId: string) => {
    await setStatus(draftId, "accepted", editState)
    setEditingId(null)
  }

  const acceptAll = async () => {
    const pendingDrafts = localDrafts.filter((d) => d.status === "pending")
    setLocalDrafts((prev) => prev.map((d) => (d.status === "pending" ? { ...d, status: "accepted" } : d)))
    await updateDrafts.mutateAsync({
      id: uploadId,
      updates: pendingDrafts.map((d) => ({ draftId: d._id!, status: "accepted" as const })),
    })
    toast.success(`Accepted ${pendingDrafts.length} transactions`)
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
      {/* Top summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 rounded-lg border bg-card text-card-foreground">
          <p className="text-xs text-muted-foreground font-medium">Pending Review</p>
          <p className="text-lg font-bold">{pending.length}</p>
        </div>
        <div className="p-3 rounded-lg border bg-card text-card-foreground">
          <p className="text-xs text-muted-foreground font-medium">Accepted</p>
          <p className="text-lg font-bold text-emerald-600">{accepted.length}</p>
        </div>
        <div className="p-3 rounded-lg border bg-rose-50/50 dark:bg-rose-950/20 border-rose-200/60 dark:border-rose-900/40">
          <p className="text-xs text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1">
            <ArrowUpRight className="h-3 w-3" /> Debits ({debits.length})
          </p>
          <p className="text-lg font-bold text-rose-700 dark:text-rose-300">
            {formatINR(totalDebitPaise)}
          </p>
        </div>
        <div className="p-3 rounded-lg border bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-900/40">
          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
            <ArrowDownLeft className="h-3 w-3" /> Credits ({credits.length})
          </p>
          <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
            {formatINR(totalCreditPaise)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>{localDrafts.length} total rows</span>
          {rejected.length > 0 && <span>· {rejected.length} rejected</span>}
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
              <th className="text-left px-3 py-2 text-muted-foreground font-medium">Type</th>
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
                <td className="px-3 py-2 whitespace-nowrap">
                  {editingId === draft._id ? (
                    <div className="inline-flex rounded-md border p-0.5 bg-muted/40">
                      <button
                        type="button"
                        onClick={() => setEditState((s) => ({ ...s, type: "debit" }))}
                        className={`px-2 py-0.5 text-xs rounded font-medium transition-colors ${
                          editState.type === "debit"
                            ? "bg-rose-600 text-white shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Debit
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditState((s) => ({ ...s, type: "credit" }))}
                        className={`px-2 py-0.5 text-xs rounded font-medium transition-colors ${
                          editState.type === "credit"
                            ? "bg-emerald-600 text-white shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Credit
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleType(draft)}
                      title="Click to toggle between Debit and Credit"
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                        draft.type === "credit"
                          ? "bg-emerald-100/80 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
                          : "bg-rose-100/80 text-rose-800 border border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800"
                      }`}
                    >
                      {draft.type === "credit" ? (
                        <>
                          <ArrowDownLeft className="h-3 w-3" /> Credit
                        </>
                      ) : (
                        <>
                          <ArrowUpRight className="h-3 w-3" /> Debit
                        </>
                      )}
                    </button>
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
                  <span className={draft.type === "credit" ? "text-emerald-600 font-semibold" : "text-foreground"}>
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
                        title="Save edit"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="text-muted-foreground hover:text-foreground"
                        title="Cancel"
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
                            title="Accept"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => startEdit(draft)}
                            className="text-muted-foreground hover:text-foreground"
                            title="Edit"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setStatus(draft._id!, "rejected")}
                            className="text-destructive hover:text-destructive/80"
                            title="Reject"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      {draft.status === "accepted" && (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => startEdit(draft)}
                            className="text-muted-foreground hover:text-foreground"
                            title="Edit"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setStatus(draft._id!, "rejected")}
                            className="text-muted-foreground hover:text-destructive"
                            title="Reject"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                      {draft.status === "rejected" && (
                        <button
                          type="button"
                          onClick={() => setStatus(draft._id!, "accepted")}
                          className="text-muted-foreground hover:text-green-600"
                          title="Restore"
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
