import { Sparkles } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"

export default function PlannerPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">AI Financial Planner</h1>
        <p className="text-muted-foreground text-sm mt-1">
          A personalised plan built from your actual numbers — not generic advice
        </p>
      </div>
      <EmptyState
        icon={Sparkles}
        title="Your plan is one click away"
        description="Once you have at least 1 month of transactions, ArthaAI analyses your income, expenses, and goals to generate a structured financial plan — allocation buckets, risk flags, and prioritised actions."
        action={{ label: "Add transactions first", href: "/transactions" }}
      />
    </div>
  )
}
