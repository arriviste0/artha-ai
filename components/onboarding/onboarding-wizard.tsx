"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, ChevronLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { StepIncomeMode } from "./step-income-mode"
import { StepFirstAccount } from "./step-first-account"
import { StepIncomeExpenses } from "./step-income-expenses"
import { StepFramework } from "./step-framework"
import type { IncomeMode, BudgetingFramework } from "@/models/user"

const STEPS = [
  { title: "How do you earn?", desc: "This shapes your entire financial plan" },
  { title: "Your first account", desc: "Add a bank account or wallet to get started" },
  { title: "Income & expenses", desc: "Rough estimates — you can always refine later" },
  { title: "Budgeting approach", desc: "Choose how you want to allocate your money" },
]

export function OnboardingWizard() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  const [incomeMode, setIncomeMode] = useState<IncomeMode>("salaried")
  const [account, setAccount] = useState({
    accountName: "",
    accountType: "savings",
    institution: "",
    currentBalancePaise: 0,
  })
  const [monthlyIncomePaise, setMonthlyIncomePaise] = useState(0)
  const [topCategories, setTopCategories] = useState<string[]>([
    "Food & Dining",
    "Rent / Housing",
    "Transport",
  ])
  const [framework, setFramework] = useState<BudgetingFramework | "skip">("50-30-20")

  function canAdvance(): boolean {
    if (step === 0) return true
    if (step === 1) return account.accountName.trim().length > 0 && account.accountType !== ""
    if (step === 2) return topCategories.length > 0
    return true
  }

  async function handleNext() {
    if (step < STEPS.length - 1) {
      setStep(step + 1)
      return
    }
    setIsSubmitting(true)
    setError("")
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incomeMode,
          accountName: account.accountName,
          accountType: account.accountType,
          institution: account.institution,
          currentBalancePaise: account.currentBalancePaise,
          monthlyIncomePaise,
          topCategories,
          budgetingFramework: framework,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? "Something went wrong")
        setIsSubmitting(false)
        return
      }
      router.push("/dashboard")
    } catch {
      setError("Network error — please try again")
      setIsSubmitting(false)
    }
  }

  const current = STEPS[step]

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-lg space-y-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-primary">₹ ArthaAI</div>
          <p className="text-sm text-muted-foreground mt-1">
            Step {step + 1} of {STEPS.length}
          </p>
        </div>
        <Progress value={((step + 1) / STEPS.length) * 100} className="h-1.5" />

        <Card>
          <CardHeader>
            <CardTitle>{current.title}</CardTitle>
            <CardDescription>{current.desc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {step === 0 && <StepIncomeMode value={incomeMode} onChange={setIncomeMode} />}
            {step === 1 && <StepFirstAccount value={account} onChange={setAccount} />}
            {step === 2 && (
              <StepIncomeExpenses
                monthlyIncomePaise={monthlyIncomePaise}
                topCategories={topCategories}
                onChange={(income, cats) => {
                  setMonthlyIncomePaise(income)
                  setTopCategories(cats)
                }}
              />
            )}
            {step === 3 && <StepFramework value={framework} onChange={setFramework} />}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-3 pt-2">
              {step > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setStep(step - 1)}
                  disabled={isSubmitting}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              )}
              <Button
                className="flex-1"
                onClick={handleNext}
                disabled={!canAdvance() || isSubmitting}
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {step === STEPS.length - 1 ? "Go to dashboard" : "Continue"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
