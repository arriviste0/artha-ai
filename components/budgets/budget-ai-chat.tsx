"use client"

import { useState, useRef, useEffect } from "react"
import { Send, Loader2, Sparkles, CheckCircle2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatINR } from "@/lib/money"
import { useUpdateBudget } from "@/hooks/use-budgets"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface Suggestion {
  budgetId: string
  category: string
  currentLimitPaise: number
  suggestedLimitPaise: number
  changeRupees: number
  reasoning: string
}

interface AIResponse {
  message: string
  analysis: string
  suggestions: Suggestion[]
  warnings: string[]
  totalImpactRupees: number
}

interface ChatMessage {
  role: "user" | "assistant"
  content: string
  suggestions?: Suggestion[]
  warnings?: string[]
  analysis?: string
  applied?: boolean
}

type AIProvider = "gemini" | "ollama"

const QUICK_PROMPTS = [
  "I'll spend ₹3000 more on dining this month — help me adjust",
  "I want to save more. Where can I cut back?",
  "Suggest a budget plan for ₹60,000 monthly income",
  "I have a medical expense coming up — help me plan",
]

export function BudgetAIChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hi! I'm your AI Budget Advisor. Tell me about your spending plans and I'll help you adjust your budgets intelligently. For example: \"I'll spend ₹5000 more on travel this month\" or \"Help me save more for my emergency fund\".",
    },
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [provider, setProvider] = useState<AIProvider>("gemini")
  const scrollRef = useRef<HTMLDivElement>(null)
  const updateBudget = useUpdateBudget()

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  async function sendMessage(text?: string) {
    const msg = (text ?? input).trim()
    if (!msg || isLoading) return

    const userMsg: ChatMessage = { role: "user", content: msg }
    const history = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))

    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setIsLoading(true)

    try {
      const res = await fetch("/api/budgets/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, history, provider }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? "Failed to get response")
      }

      const data = await res.json() as { suggestion: AIResponse }
      const { suggestion } = data

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: suggestion.message,
          analysis: suggestion.analysis,
          suggestions: suggestion.suggestions,
          warnings: suggestion.warnings,
          applied: false,
        },
      ])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err instanceof Error ? err.message : "Sorry, I couldn't process that right now. Please try again.",
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  async function applyChanges(msgIndex: number, suggestions: Suggestion[]) {
    try {
      await Promise.all(
        suggestions.map((s) =>
          updateBudget.mutateAsync({
            id: s.budgetId,
            data: { limitPaise: s.suggestedLimitPaise },
          })
        )
      )
      setMessages((prev) =>
        prev.map((m, i) => (i === msgIndex ? { ...m, applied: true } : m))
      )
      toast.success(`Applied ${suggestions.length} budget adjustment${suggestions.length > 1 ? "s" : ""}`)
    } catch {
      toast.error("Failed to apply some budget changes")
    }
  }

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-3 border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Budget Advisor
          <Badge variant="secondary" className="text-xs ml-1">Beta</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Tell me how your spending plans are changing — I&apos;ll rebalance your budgets.
        </p>
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs text-muted-foreground">AI</span>
          <div className="flex rounded-md border bg-muted/40 p-0.5">
            <button
              type="button"
              className={cn(
                "h-7 rounded px-2.5 text-xs transition-colors",
                provider === "gemini" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setProvider("gemini")}
              disabled={isLoading}
            >
              Gemini
            </button>
            <button
              type="button"
              className={cn(
                "h-7 rounded px-2.5 text-xs transition-colors",
                provider === "ollama" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setProvider("ollama")}
              disabled={isLoading}
              title="Uses OLLAMA_MODEL, default qwen2.5-coder:7b"
            >
              Local Ollama
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 min-h-0">
        <ScrollArea className="flex-1 px-4 pt-4" ref={scrollRef as React.RefObject<HTMLDivElement>}>
          <div className="space-y-4 pb-4">
            {messages.map((msg, i) => (
              <div key={i} className={cn("flex gap-3", msg.role === "user" && "flex-row-reverse")}>
                {msg.role === "assistant" && (
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}

                <div className={cn("max-w-[85%] space-y-2", msg.role === "user" && "items-end")}>
                  <div
                    className={cn(
                      "rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-muted rounded-tl-sm"
                    )}
                  >
                    {msg.content}
                  </div>

                  {msg.analysis && (
                    <p className="text-xs text-muted-foreground italic px-1">{msg.analysis}</p>
                  )}

                  {msg.warnings && msg.warnings.length > 0 && (
                    <div className="flex items-start gap-1.5 px-1">
                      <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0 mt-0.5" />
                      <div className="text-xs text-yellow-600 dark:text-yellow-400 space-y-0.5">
                        {msg.warnings.map((w, wi) => <p key={wi}>{w}</p>)}
                      </div>
                    </div>
                  )}

                  {msg.suggestions && msg.suggestions.length > 0 && !msg.applied && (
                    <div className="rounded-lg border bg-card p-3 space-y-2.5">
                      <p className="text-xs font-medium text-muted-foreground">Suggested adjustments</p>
                      {msg.suggestions.map((s, si) => (
                        <div key={si} className="flex items-start justify-between gap-3 text-xs">
                          <div className="min-w-0">
                            <p className="font-medium">{s.category}</p>
                            <p className="text-muted-foreground">{s.reasoning}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-muted-foreground line-through">
                              {formatINR(s.currentLimitPaise)}
                            </p>
                            <p className={cn(
                              "font-semibold",
                              s.changeRupees > 0 ? "text-orange-500" : "text-green-600"
                            )}>
                              {formatINR(s.suggestedLimitPaise)}
                              <span className="ml-1 font-normal">
                                ({s.changeRupees > 0 ? "+" : ""}₹{s.changeRupees})
                              </span>
                            </p>
                          </div>
                        </div>
                      ))}
                      <Button
                        size="sm"
                        className="w-full h-8 text-xs mt-1"
                        onClick={() => applyChanges(i, msg.suggestions!)}
                        disabled={updateBudget.isPending}
                      >
                        {updateBudget.isPending ? (
                          <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                        ) : (
                          <CheckCircle2 className="mr-1.5 h-3 w-3" />
                        )}
                        Apply these changes
                      </Button>
                    </div>
                  )}

                  {msg.applied && (
                    <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 px-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Budget adjustments applied
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-3">
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="bg-muted rounded-xl rounded-tl-sm px-3.5 py-2.5">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {messages.length <= 1 && (
          <div className="px-4 pb-3 flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => sendMessage(p)}
                className="text-xs bg-muted hover:bg-accent rounded-full px-3 py-1.5 text-left transition-colors border"
              >
                {p}
              </button>
            ))}
          </div>
        )}

        <div className="px-4 pb-4 pt-2 border-t">
          <div className="flex gap-2">
            <Input
              placeholder="Tell me about your spending plans..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
              disabled={isLoading}
              className="flex-1"
            />
            <Button
              size="icon"
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
