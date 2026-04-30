"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { DraftTransaction } from "@/models/statement-upload"

export interface StatementUploadDTO {
  _id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  accountId: string
  status: "uploaded" | "parsing" | "parsed" | "failed" | "reviewed"
  parseMethod?: string
  detectedRows: number
  importedTxnCount: number
  parseErrors: string[]
  draftTransactions: DraftTransaction[]
  uploadedAt: string
  parsedAt?: string
}

export function useStatements() {
  return useQuery<StatementUploadDTO[]>({
    queryKey: ["statements"],
    queryFn: async () => {
      const res = await fetch("/api/statements/upload")
      if (!res.ok) throw new Error("Failed to fetch statements")
      const data = await res.json()
      return data.uploads
    },
  })
}

export function useStatement(id: string) {
  return useQuery<StatementUploadDTO>({
    queryKey: ["statement", id],
    queryFn: async () => {
      const res = await fetch(`/api/statements/${id}/review`)
      if (!res.ok) throw new Error("Failed to fetch statement")
      const data = await res.json()
      return data.upload
    },
    enabled: !!id,
  })
}

export function useUploadStatement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ file, accountId }: { file: File; accountId: string }) => {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("accountId", accountId)
      const res = await fetch("/api/statements/upload", { method: "POST", body: fd })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Upload failed")
      }
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["statements"] }),
  })
}

export function useParseStatement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, password }: { id: string; password?: string }) => {
      const res = await fetch(`/api/statements/${id}/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Parse failed")
      }
      return res.json()
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ["statement", id] })
      qc.invalidateQueries({ queryKey: ["statements"] })
    },
  })
}

export function useUpdateDrafts() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string
      updates: { draftId: string; status: "accepted" | "rejected"; description?: string; category?: string }[]
    }) => {
      const res = await fetch(`/api/statements/${id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      })
      if (!res.ok) throw new Error("Failed to update drafts")
      return res.json()
    },
    onSuccess: (_data, { id }) => qc.invalidateQueries({ queryKey: ["statement", id] }),
  })
}

export function useCommitStatement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/statements/${id}/review`, { method: "POST" })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Commit failed")
      }
      return res.json()
    },
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["statement", id] })
      qc.invalidateQueries({ queryKey: ["statements"] })
      qc.invalidateQueries({ queryKey: ["transactions"] })
      qc.invalidateQueries({ queryKey: ["accounts"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })
}

export function useDeleteStatement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/statements/${id}/review`, { method: "DELETE" })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? "Failed to delete statement")
      }
      return res.json()
    },
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["statement", id] })
      qc.invalidateQueries({ queryKey: ["statements"] })
    },
  })
}
