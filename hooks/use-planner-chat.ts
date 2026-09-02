"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
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

export interface ConversationItem {
  id: string
  title: string
  aiModel?: string
  createdAt: string
  updatedAt: string
}

export function useApplyPlannerAction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      action,
      messageId,
      actionIndex,
    }: {
      action: ActionableChange
      messageId?: string
      actionIndex?: number
    }): Promise<{ success: boolean; message: string }> => {
      const res = await fetch("/api/planner/apply-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, messageId, actionIndex }),
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
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [activeConversationTitle, setActiveConversationTitle] = useState<string | undefined>()
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)

  const queryClient = useQueryClient()
  const applyActionMutation = useApplyPlannerAction()

  // 1. Fetch conversations list
  const { data: conversationsData, isLoading: isConversationsLoading } = useQuery<{
    conversations: ConversationItem[]
  }>({
    queryKey: ["planner-conversations"],
    queryFn: async () => {
      const res = await fetch("/api/planner/conversations")
      if (!res.ok) throw new Error("Failed to load chat history")
      return res.json()
    },
  })

  const conversations = conversationsData?.conversations ?? []

  // 2. Load conversation by ID
  async function loadConversation(id: string) {
    if (activeConversationId === id) return
    setIsLoadingMessages(true)
    try {
      const res = await fetch(`/api/planner/conversations/${id}`)
      if (!res.ok) throw new Error("Failed to load conversation")
      const data = await res.json()

      setActiveConversationId(data.conversation.id)
      setActiveConversationTitle(data.conversation.title)

      const formattedMessages: PlannerChatMessage[] = data.messages.map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        analysis: m.analysis,
        actionableChanges: m.actionableChanges || [],
        warnings: m.warnings || [],
        quickReplies: m.quickReplies || [],
        appliedActions: m.appliedActions || {},
        createdAt: new Date(m.createdAt),
      }))

      setMessages(formattedMessages)
    } catch (err) {
      toast.error((err as Error).message || "Failed to load conversation")
    } finally {
      setIsLoadingMessages(false)
    }
  }

  // 3. Start a fresh new chat
  function startNewChat() {
    setActiveConversationId(null)
    setActiveConversationTitle(undefined)
    setMessages([])
  }

  // 4. Delete conversation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/planner/conversations/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete chat")
      return res.json()
    },
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["planner-conversations"] })
      toast.success("Chat deleted")
      if (activeConversationId === deletedId) {
        startNewChat()
      }
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  // 5. Send message
  const chatMutation = useMutation({
    mutationFn: async ({
      message,
      conversationId,
      history,
    }: {
      message: string
      conversationId?: string | null
      history: Array<{ role: "user" | "assistant"; content: string }>
    }): Promise<{
      advice: PlannerAdviceResponse
      conversationId: string
      messageId: string
      conversationTitle?: string
    }> => {
      const res = await fetch("/api/planner/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          conversationId: conversationId || undefined,
          history,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || "Failed to communicate with AI Copilot")
      }

      return res.json()
    },
    onSuccess: (data) => {
      setActiveConversationId(data.conversationId)
      if (data.conversationTitle) {
        setActiveConversationTitle(data.conversationTitle)
      }
      queryClient.invalidateQueries({ queryKey: ["planner-conversations"] })
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
      const result = await chatMutation.mutateAsync({
        message: trimmed,
        conversationId: activeConversationId,
        history: historyForApi.slice(-8),
      })

      const assistantMsg: PlannerChatMessage = {
        id: result.messageId || `assistant-${Date.now()}`,
        role: "assistant",
        content: result.advice.message,
        analysis: result.advice.analysis,
        actionableChanges: result.advice.actionableChanges,
        warnings: result.advice.warnings,
        quickReplies: result.advice.quickReplies,
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
      await applyActionMutation.mutateAsync({
        action,
        messageId,
        actionIndex,
      })
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
    isLoading: chatMutation.isPending || isLoadingMessages,
    isApplying: applyActionMutation.isPending,
    // Conversation history management
    conversations,
    isConversationsLoading,
    activeConversationId,
    activeConversationTitle,
    loadConversation,
    startNewChat,
    deleteConversation: (id: string) => deleteMutation.mutate(id),
    isDeletingChat: deleteMutation.isPending,
  }
}
