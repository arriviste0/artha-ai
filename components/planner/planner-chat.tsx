"use client"

import { useState, useRef, useEffect } from "react"
import {
  Send,
  Loader2,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Target,
  PiggyBank,
  Wallet,
  RotateCcw,
  Check,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { formatINR, paiseToRupees } from "@/lib/money"
import { usePlannerChat } from "@/hooks/use-planner-chat"
import type { ActionableChange } from "@/lib/ai/planner-advisor"
import { cn } from "@/lib/utils"

const STARTER_PROMPTS = [
  {
    title: "Find Savings in Expenses",
    desc: "Analyze my monthly spending and suggest practical budget cuts",
    prompt: "Analyze my monthly expenses and suggest where I can cut back to save more.",
  },
  {
    title: "Set Up Emergency Fund",
    desc: "Calculate 6 months of expenses and create an emergency goal",
    prompt: "Help me calculate 6 months of living expenses and set up an Emergency Fund goal.",
  },
  {
    title: "Balance 50/30/20 Budget",
    desc: "Restructure my categories into Needs, Wants, and Savings",
    prompt: "Restructure my current spending into a 50/30/20 budget framework and adjust my budgets.",
  },
  {
    title: "Trim Dining & Shopping",
    desc: "Reduce discretionary spending and redirect to savings",
    prompt: "I am overspending on dining and shopping. Help me cut these down and set realistic limits.",
  },
]

export function PlannerChat() {
  const {
    messages,
    setMessages,
    sendMessage,
    applyAction,
    applyAllActions,
    isLoading,
    isApplying,
  } = usePlannerChat()

  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isLoading])

  const handleSend = (text?: string) => {
    const query = text ?? input
    if (!query.trim() || isLoading) return
    sendMessage(query)
    setInput("")
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-[78vh] rounded-xl border bg-card/60 backdrop-blur-sm shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b bg-muted/30">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center font-bold">
            <Sparkles className="h-4 w-4 text-primary animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-sm">ArthaAI Financial Copilot</h2>
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-primary/30 text-primary">
                Interactive
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Ask questions, optimize budgets, and apply changes directly to your account
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMessages([])}
            className="text-xs text-muted-foreground hover:text-foreground h-8"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            New Chat
          </Button>
        )}
      </div>

      {/* Message Feed / Starter Prompts */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col justify-center items-center max-w-xl mx-auto text-center space-y-6 py-6">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20">
              <Sparkles className="h-10 w-10 text-primary mx-auto" />
            </div>
            <div>
              <h3 className="text-lg font-bold">How can I assist your financial journey today?</h3>
              <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto">
                I can review your transactions, propose optimized budget limits, set up financial goals, and update your site data instantly.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full text-left">
              {STARTER_PROMPTS.map((starter, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(starter.prompt)}
                  className="group p-3.5 rounded-xl border bg-background/50 hover:bg-accent/60 hover:border-primary/40 transition-all text-left flex flex-col justify-between space-y-2 shadow-sm"
                >
                  <div>
                    <div className="font-medium text-xs text-foreground group-hover:text-primary transition-colors flex items-center justify-between">
                      {starter.title}
                      <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-primary" />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">{starter.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex flex-col space-y-2 max-w-2xl",
                msg.role === "user" ? "ml-auto items-end" : "mr-auto items-start w-full"
              )}
            >
              {/* Message Bubble */}
              <div
                className={cn(
                  "p-4 rounded-2xl text-sm leading-relaxed",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-none shadow-sm max-w-[85%]"
                    : "bg-muted/60 border rounded-bl-none w-full space-y-3"
                )}
              >
                {/* Assistant Message Header */}
                {msg.role === "assistant" && (
                  <div className="flex items-center gap-1.5 text-xs text-primary font-semibold">
                    <Sparkles className="h-3.5 w-3.5" />
                    ArthaAI Copilot
                  </div>
                )}

                {/* Body Content */}
                <div className="whitespace-pre-line text-sm">{msg.content}</div>

                {/* Analysis callout */}
                {msg.analysis && (
                  <div className="p-2.5 rounded-lg bg-background/80 border text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">Insight: </span>
                    {msg.analysis}
                  </div>
                )}

                {/* Warnings */}
                {msg.warnings && msg.warnings.length > 0 && (
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs space-y-1">
                    {msg.warnings.map((w, wi) => (
                      <div key={wi} className="flex items-start gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actionable Changes */}
                {msg.actionableChanges && msg.actionableChanges.length > 0 && (
                  <div className="pt-2 space-y-3 border-t">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Wallet className="h-3.5 w-3.5 text-primary" />
                        Suggested Actions ({msg.actionableChanges.length})
                      </span>
                      {msg.actionableChanges.length > 1 && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-xs px-2.5 font-medium"
                          disabled={isApplying}
                          onClick={() => applyAllActions(msg.id, msg.actionableChanges!)}
                        >
                          Apply All
                        </Button>
                      )}
                    </div>

                    <div className="grid gap-2.5">
                      {msg.actionableChanges.map((action, idx) => {
                        const isApplied = !!msg.appliedActions?.[idx]
                        return (
                          <ActionCard
                            key={idx}
                            action={action}
                            isApplied={isApplied}
                            isApplying={isApplying}
                            onApply={() => applyAction(msg.id, idx, action)}
                          />
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Reply Pills */}
              {msg.quickReplies && msg.quickReplies.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {msg.quickReplies.map((reply, ri) => (
                    <button
                      key={ri}
                      onClick={() => handleSend(reply)}
                      disabled={isLoading}
                      className="text-xs px-3 py-1 rounded-full border bg-background hover:bg-accent/80 text-muted-foreground hover:text-foreground transition-all flex items-center gap-1 shadow-sm"
                    >
                      <span>{reply}</span>
                      <ArrowRight className="h-3 w-3 opacity-60" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        )}

        {/* Loading Bubble */}
        {isLoading && (
          <div className="flex items-start gap-2.5 max-w-md mr-auto">
            <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
              <Sparkles className="h-4 w-4 animate-spin text-primary" />
            </div>
            <div className="p-3.5 rounded-2xl rounded-tl-none bg-muted/60 border text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>Analyzing financial models and preparing recommendations...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input Form */}
      <div className="p-3.5 border-t bg-background/80 backdrop-blur-md">
        <div className="flex items-center gap-2 max-w-4xl mx-auto">
          <Input
            ref={inputRef}
            placeholder="Ask ArthaAI to adjust budgets, plan a purchase, or create goals..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            className="flex-1 bg-background text-sm h-11 shadow-inner focus-visible:ring-primary/40"
          />
          <Button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            size="icon"
            className="h-11 w-11 flex-shrink-0 rounded-lg shadow-sm"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Action Card Component ──────────────────────────────────────────────────────

interface ActionCardProps {
  action: ActionableChange
  isApplied: boolean
  isApplying: boolean
  onApply: () => void
}

function ActionCard({ action, isApplied, isApplying, onApply }: ActionCardProps) {
  let title = ""
  let badgeLabel = ""
  let badgeClass = ""
  let detailText = ""
  let Icon = Wallet

  if (action.type === "set_budget") {
    Icon = PiggyBank
    badgeLabel = "Adjust Budget"
    badgeClass = "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
    title = action.category
    const changeFormatted = formatINR(Math.abs(action.changeRupees) * 100)
    const direction = action.changeRupees < 0 ? `-${changeFormatted}` : `+${changeFormatted}`
    detailText = `Limit: ${formatINR(action.currentLimitPaise)} → ${formatINR(action.suggestedLimitPaise)} (${direction})`
  } else if (action.type === "create_budget") {
    Icon = PiggyBank
    badgeLabel = "New Budget"
    badgeClass = "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
    title = action.name
    detailText = `Category: ${action.category} • Limit: ${formatINR(action.limitPaise)} (${action.period})`
  } else if (action.type === "create_goal") {
    Icon = Target
    badgeLabel = "New Goal"
    badgeClass = "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30"
    title = action.name
    detailText = `Target: ${formatINR(action.targetPaise)} • Monthly: ${formatINR(action.monthlyContributionPaise)}`
  } else if (action.type === "update_goal") {
    Icon = Target
    badgeLabel = "Update Goal"
    badgeClass = "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30"
    title = action.name
    const parts = []
    if (action.suggestedMonthlyContributionPaise !== undefined) {
      parts.push(`Monthly: ${formatINR(action.suggestedMonthlyContributionPaise)}`)
    }
    if (action.suggestedTargetPaise !== undefined) {
      parts.push(`Target: ${formatINR(action.suggestedTargetPaise)}`)
    }
    detailText = parts.join(" • ")
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border bg-background/90 shadow-sm transition-all hover:border-primary/40">
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-lg bg-secondary/80 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-xs text-foreground">{title}</span>
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-4 border", badgeClass)}>
              {badgeLabel}
            </Badge>
          </div>
          <div className="text-xs font-medium text-foreground/80">{detailText}</div>
          <p className="text-[11px] text-muted-foreground line-clamp-2">{action.reasoning}</p>
        </div>
      </div>

      <div className="sm:self-center flex-shrink-0">
        {isApplied ? (
          <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 gap-1 text-xs px-2.5 py-1">
            <Check className="h-3.5 w-3.5" />
            Applied
          </Badge>
        ) : (
          <Button
            size="sm"
            disabled={isApplying}
            onClick={onApply}
            className="h-8 text-xs font-semibold px-3 w-full sm:w-auto shadow-sm"
          >
            {isApplying ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Apply to App
          </Button>
        )}
      </div>
    </div>
  )
}
