import { Target } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"

export default function GoalsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Goals</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Save for what matters — emergency fund, big purchases, debt payoff
          </p>
        </div>
      </div>
      <EmptyState
        icon={Target}
        title="No goals yet"
        description="Start with an emergency fund — ArthaAI's wizard calculates the right target based on your income type and expenses, then suggests a monthly contribution."
        action={{ label: "Create emergency fund", href: "/goals" }}
      />
    </div>
  )
}
