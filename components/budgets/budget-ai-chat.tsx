"use client"

import { useState, useRef, useEffect } from "react"
import { Send, Loader2, Sparkles, CheckCircle2, AlertTriangle, TrendingUp, TrendingDown, Bot, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
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
  totalImpactRupees?: number
  applied?: boolean
}

type AIProvider = "gemini" | "ollama"

const QUICK_PROMPTS = [
  "I'll spend ₹3,000 more on dining this month",
  "Where can I cut back to save more?",
  "Plan a ₹60,000 monthly budget for me",
  "I have a medical expense coming up",
]

function getFollowUpChips(msg: ChatMessage): string[] {
  if (msg.suggestions && msg.suggestions.length > 0) {
    const chips: string[] = []
    // Up to 2 category-specific chips
    for (const s of msg.suggestions.slice(0, 2)) {
      chips.push(s.changeRupees < 0 ? `Don't reduce ${s.category}` : `Increase ${s.category} less`)
    }
    chips.push("Show a more conservative plan")
    chips.push("Try a completely different approach")
    return chips.slice(0, 4)
  }
  return [
    "Give me more budget ideas",
    "Help me save more",
    "What categories should I review?",
  ]
}

export function BudgetAIChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [provider, setProvider] = useState<AIProvider>("gemini")
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const updateBudget = useUpdateBudget()

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isLoading])

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
    setTimeout(() => inputRef.current?.focus(), 0)

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
          totalImpactRupees: suggestion.totalImpactRupees,
          applied: false,
        },
      ])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err instanceof Error ? err.message : "Sorry, something went wrong. Please try again.",
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

  const isEmpty = messages.length === 0
  const lastAssistantIdx = messages.reduce((acc, m, i) => (m.role === "assistant" ? i : acc), -1)

  return (
    <div className="flex flex-col h-full rounded-xl border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">AI Budget Advisor</span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Beta</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">Powered by {provider === "gemini" ? "Gemini 2.5" : "Ollama"}</p>
          </div>
        </div>
        <div className="flex rounded-lg border bg-background p-0.5 text-xs">
          <button
            type="button"
            className={cn(
              "rounded-md px-3 py-1 font-medium transition-all",
              provider === "gemini"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setProvider("gemini")}
            disabled={isLoading}
          >
            Gemini
          </button>
          <button
            type="button"
            className={cn(
              "rounded-md px-3 py-1 font-medium transition-all",
              provider === "ollama"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setProvider("ollama")}
            disabled={isLoading}
          >
            Ollama
          </button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1" ref={scrollRef as React.RefObject<HTMLDivElement>}>
        <div className="px-4 py-4 space-y-6">

          {/* Welcome state */}
          {isEmpty && (
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-7 w-7 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">How can I help with your budget?</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                  Tell me about your spending plans and I&apos;ll suggest smart adjustments across your budgets.
                </p>
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={cn("flex gap-3", msg.role === "user" && "flex-row-reverse")}>
              {/* Avatar */}
              <div className={cn(
                "h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
                msg.role === "assistant" ? "bg-primary/10" : "bg-muted"
              )}>
                {msg.role === "assistant"
                  ? <Bot className="h-3.5 w-3.5 text-primary" />
                  : <User className="h-3.5 w-3.5 text-muted-foreground" />
                }
              </div>

              <div className={cn("flex flex-col gap-2 max-w-[82%]", msg.role === "user" && "items-end")}>
                {/* Bubble */}
                <div className={cn(
                  "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-muted rounded-tl-sm"
                )}>
                  {msg.content}
                </div>

                {/* Analysis */}
                {msg.analysis && (
                  <p className="text-[11px] text-muted-foreground italic px-1">{msg.analysis}</p>
                )}

                {/* Warnings */}
                {msg.warnings && msg.warnings.length > 0 && (
                  <div className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950/30 px-3 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      {msg.warnings.map((w, wi) => (
                        <p key={wi} className="text-xs text-yellow-700 dark:text-yellow-400">{w}</p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Follow-up chips — only on the last assistant message while not loading */}
                {msg.role === "assistant" && i === lastAssistantIdx && !isLoading && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {getFollowUpChips(msg).map((chip) => (
                      <button
                        key={chip}
                        onClick={() => {
                          setInput(chip)
                          setTimeout(() => inputRef.current?.focus(), 0)
                        }}
                        className="text-[11px] border rounded-full px-2.5 py-1 bg-background hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}

                {/* Suggestions card */}
                {msg.suggestions && msg.suggestions.length > 0 && (
                  <div className="w-full rounded-xl border bg-card shadow-sm overflow-hidden">
                    <div className="px-3.5 py-2.5 bg-muted/40 border-b flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">Suggested adjustments</span>
                      {msg.totalImpactRupees !== undefined && (
                        <span className={cn(
                          "text-xs font-medium",
                          msg.totalImpactRupees > 0 ? "text-orange-500" : msg.totalImpactRupees < 0 ? "text-green-600" : "text-muted-foreground"
                        )}>
                          Net: {msg.totalImpactRupees > 0 ? "+" : ""}₹{msg.totalImpactRupees.toLocaleString("en-IN")}
                        </span>
                      )}
                    </div>

                    <div className="divide-y">
                      {msg.suggestions.map((s, si) => (
                        <div key={si} className="px-3.5 py-2.5 flex items-center gap-3">
                          <div className={cn(
                            "h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0",
                            s.changeRupees > 0 ? "bg-orange-50 dark:bg-orange-950/30" : "bg-green-50 dark:bg-green-950/30"
                          )}>
                            {s.changeRupees > 0
                              ? <TrendingUp className="h-3.5 w-3.5 text-orange-500" />
                              : <TrendingDown className="h-3.5 w-3.5 text-green-600" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{s.category}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{s.reasoning}</p>
                          </div>
                          <div className="text-right flex-shrink-0 space-y-0.5">
                            <p className="text-[11px] text-muted-foreground line-through">{formatINR(s.currentLimitPaise)}</p>
                            <p className={cn(
                              "text-xs font-semibold",
                              s.changeRupees > 0 ? "text-orange-500" : "text-green-600"
                            )}>
                              {formatINR(s.suggestedLimitPaise)}
                              <span className="ml-1 font-normal text-[11px]">
                                ({s.changeRupees > 0 ? "+" : ""}₹{Math.abs(s.changeRupees).toLocaleString("en-IN")})
                              </span>
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {!msg.applied ? (
                      <div className="px-3.5 py-2.5 bg-muted/20 border-t">
                        <Button
                          size="sm"
                          className="w-full h-8 text-xs gap-1.5"
                          onClick={() => applyChanges(i, msg.suggestions!)}
                          disabled={updateBudget.isPending}
                        >
                          {updateBudget.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3" />
                          )}
                          Apply {msg.suggestions.length} change{msg.suggestions.length > 1 ? "s" : ""}
                        </Button>
                      </div>
                    ) : (
                      <div className="px-3.5 py-2.5 bg-green-50 dark:bg-green-950/20 border-t flex items-center justify-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                        <span className="text-xs font-medium text-green-700 dark:text-green-400">Changes applied</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isLoading && (
            <div className="flex gap-3">
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Quick prompts — only shown when empty */}
      {isEmpty && (
        <>
          <Separator />
          <div className="px-4 py-2.5 flex gap-2 overflow-x-auto scrollbar-none">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => sendMessage(p)}
                disabled={isLoading}
                className="flex-shrink-0 text-xs bg-muted hover:bg-accent border rounded-full px-3 py-1.5 transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {p}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Input */}
      <Separator />
      <div className="px-4 py-3">
        <div className="flex gap-2 items-center">
          <Input
            ref={inputRef}
            placeholder="E.g. I need ₹5,000 more for travel this month…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            disabled={isLoading}
            className="flex-1 h-9 text-sm bg-muted/40 border-muted-foreground/20 focus-visible:bg-background"
          />
          <Button
            size="icon"
            className="h-9 w-9 flex-shrink-0"
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
    </div>
  )
}
