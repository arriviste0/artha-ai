"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { CreateAccountInput, UpdateAccountInput } from "@/lib/validators/account"

export interface AccountDTO {
  _id: string
  name: string
  type: string
  institution: string
  accountNumberMasked?: string
  currentBalancePaise: number
  currency: string
  linkedVia: string
  isActive: boolean
}

async function fetchAccounts(): Promise<AccountDTO[]> {
  const res = await fetch("/api/accounts")
  if (!res.ok) throw new Error("Failed to fetch accounts")
  const data = await res.json() as { accounts: AccountDTO[] }
  return data.accounts
}

export function useAccounts() {
  return useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts })
}

export function useCreateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: CreateAccountInput) => {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? "Failed to create account")
      }
      return (await res.json() as { account: AccountDTO }).account
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
  })
}

export function useUpdateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateAccountInput }) => {
      const res = await fetch(`/api/accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error("Failed to update account")
      return (await res.json() as { account: AccountDTO }).account
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
  })
}

export function useDeleteAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete account")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })
}
