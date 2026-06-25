"use client"

import { IFinancialPlan } from "@/hooks/use-planner"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, CheckCircle2, TrendingUp, AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

export function PlanView({ plan, onRegenerate, isRegenerating }: { plan: IFinancialPlan, onRegenerate: () => void, isRegenerating: boolean }) {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Your Action Plan</h2>
          <p className="text-muted-foreground">
            Generated on {new Date(plan.generatedAt).toLocaleDateString()}
          </p>
        </div>
        <Button variant="outline" onClick={onRegenerate} disabled={isRegenerating}>
          {isRegenerating ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Regenerate Plan
        </Button>
      </div>

      <Card className="bg-gradient-to-br from-primary/10 via-background to-background border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SparklesIcon className="w-5 h-5 text-primary" />
            Executive Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-lg leading-relaxed">{plan.summary}</p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Risk Flags
            </CardTitle>
            <CardDescription>Areas needing your attention</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {plan.riskFlags.length === 0 ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                No major risk flags detected!
              </div>
            ) : (
              plan.riskFlags.map((flag, idx) => (
                <div key={idx} className="flex gap-3 p-3 rounded-lg border bg-card">
                  <div className="mt-0.5">
                    {flag.severity === "high" ? (
                      <AlertCircle className="w-5 h-5 text-destructive" />
                    ) : flag.severity === "medium" ? (
                      <AlertTriangle className="w-5 h-5 text-amber-500" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-blue-500" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm">{flag.title}</h4>
                    <p className="text-sm text-muted-foreground">{flag.description}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              Prioritized Actions
            </CardTitle>
            <CardDescription>Step-by-step roadmap</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {plan.actionItems.map((action, idx) => (
              <div key={idx} className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                  {action.priority}
                </div>
                <div>
                  <h4 className="font-semibold text-sm">{action.title}</h4>
                  <p className="text-sm text-muted-foreground">{action.description}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-500" />
            Recommended Allocation
          </CardTitle>
          <CardDescription>Suggested budget buckets based on your spending</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {plan.allocationBuckets.map((bucket, idx) => (
              <div key={idx} className="space-y-2">
                <div className="flex justify-between items-center">
                  <div className="font-semibold">{bucket.category}</div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{bucket.percentage}%</Badge>
                    <span className="text-sm font-medium">₹{bucket.amount.toLocaleString()}</span>
                  </div>
                </div>
                <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-primary h-full rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${bucket.percentage}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{bucket.recommendation}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SparklesIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    </svg>
  )
}
