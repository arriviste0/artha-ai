import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { ActionableChange, PlannerAdviceResponse } from "@/lib/ai/planner-advisor"

export interface PlannerChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  analysis?: string
  actionableChanges?: ActionableChange[]
  warnings?: string[]
  quickReplies?: string[]
  appliedActions?: Record<number, boolean>
  createdAt: Date
}

export function useApplyPlannerAction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (action: ActionableChange): Promise<{ success: boolean; message: string }> => {
      const res = await fetch("/api/planner/apply-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to apply financial action")
      }

      return res.json()
    },
    onSuccess: (data) => {
      toast.success(data.message)
      // Invalidate relevant caches so site reflects changes immediately
      queryClient.invalidateQueries({ queryKey: ["budgets"] })
      queryClient.invalidateQueries({ queryKey: ["goals"] })
      queryClient.invalidateQueries({ queryKey: ["planner"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

export function usePlannerChat() {
  const [messages, setMessages] = useState<PlannerChatMessage[]>([])
  const applyActionMutation = useApplyPlannerAction()

  const chatMutation = useMutation({
    mutationFn: async ({
      message,
      history,
    }: {
      message: string
      history: Array<{ role: "user" | "assistant"; content: string }>
    }): Promise<PlannerAdviceResponse> => {
      const res = await fetch("/api/planner/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || "Failed to communicate with AI Copilot")
      }

      const data = await res.json()
      return data.advice
    },
  })

  async function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed || chatMutation.isPending) return

    const userMsgId = `user-${Date.now()}`
    const userMsg: PlannerChatMessage = {
      id: userMsgId,
      role: "user",
      content: trimmed,
      createdAt: new Date(),
    }

    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)

    const historyForApi = nextMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }))

    try {
      const advice = await chatMutation.mutateAsync({
        message: trimmed,
        history: historyForApi.slice(-8),
      })

      const assistantMsgId = `assistant-${Date.now()}`
      const assistantMsg: PlannerChatMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: advice.message,
        analysis: advice.analysis,
        actionableChanges: advice.actionableChanges,
        warnings: advice.warnings,
        quickReplies: advice.quickReplies,
        appliedActions: {},
        createdAt: new Date(),
      }

      setMessages((prev) => [...prev, assistantMsg])
    } catch (err) {
      toast.error((err as Error).message || "Could not get response from AI Copilot")
    }
  }

  async function applyAction(messageId: string, actionIndex: number, action: ActionableChange) {
    try {
      await applyActionMutation.mutateAsync(action)
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== messageId) return msg
          return {
            ...msg,
            appliedActions: {
              ...msg.appliedActions,
              [actionIndex]: true,
            },
          }
        })
      )
    } catch {
      // Error handled by mutation
    }
  }

  async function applyAllActions(messageId: string, actions: ActionableChange[]) {
    for (let i = 0; i < actions.length; i++) {
      const msg = messages.find((m) => m.id === messageId)
      if (msg?.appliedActions?.[i]) continue
      await applyAction(messageId, i, actions[i])
    }
  }

  return {
    messages,
    setMessages,
    sendMessage,
    applyAction,
    applyAllActions,
    isLoading: chatMutation.isPending,
    isApplying: applyActionMutation.isPending,
  }
}
