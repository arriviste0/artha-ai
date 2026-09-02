"use client"

import { useState } from "react"
import { Sparkles, MessageSquare, LineChart, Loader2 } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { usePlan, useGeneratePlan } from "@/hooks/use-planner"
import { PlanView } from "@/components/planner/plan-view"
import { PlannerChat } from "@/components/planner/planner-chat"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

export default function PlannerPage() {
  const [activeTab, setActiveTab] = useState<string>("chat")
  const { data: plan, isLoading: isPlanLoading } = usePlan()
  const generateMutation = useGeneratePlan()

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            AI Financial Planner
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Chat with your AI advisor, test scenarios, and apply changes directly to your budgets & goals
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted/80 p-1 border">
          <TabsTrigger value="chat" className="gap-2 text-xs sm:text-sm">
            <MessageSquare className="h-4 w-4 text-primary" />
            AI Copilot Chat
          </TabsTrigger>
          <TabsTrigger value="roadmap" className="gap-2 text-xs sm:text-sm">
            <LineChart className="h-4 w-4 text-primary" />
            Full Plan Roadmap
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: AI Copilot Chat */}
        <TabsContent value="chat" className="m-0 focus-visible:outline-none">
          <PlannerChat />
        </TabsContent>

        {/* Tab 2: Full Plan Roadmap */}
        <TabsContent value="roadmap" className="m-0 focus-visible:outline-none">
          {isPlanLoading ? (
            <div className="flex h-[50vh] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : generateMutation.isPending ? (
            <div className="flex flex-col h-[50vh] items-center justify-center space-y-4">
              <div className="relative">
                <div className="absolute -inset-4 bg-primary/20 blur-xl rounded-full animate-pulse" />
                <Loader2 className="h-12 w-12 animate-spin text-primary relative" />
              </div>
              <div className="text-center">
                <h2 className="text-xl font-bold">Analyzing your finances...</h2>
                <p className="text-muted-foreground mt-1 animate-pulse">
                  Crunching numbers and preparing your personalized roadmap
                </p>
              </div>
            </div>
          ) : plan ? (
            <PlanView
              plan={plan}
              onRegenerate={() => generateMutation.mutate()}
              isRegenerating={generateMutation.isPending}
            />
          ) : (
            <EmptyState
              icon={Sparkles}
              title="Your macro plan is one click away"
              description="ArthaAI analyzes your income, expenses, and goals to generate a structured financial plan — allocation buckets, risk flags, and prioritized actions."
              action={{
                label: "Generate AI Plan",
                onClick: () => generateMutation.mutate(),
              }}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
