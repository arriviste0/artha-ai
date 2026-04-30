import { TrendingUp } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Info } from "lucide-react"

export default function InvestmentsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Investments</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track stocks, mutual funds, FDs, and more in one portfolio view
          </p>
        </div>
      </div>
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          ArthaAI is an educational tool. Investment tracking here is for personal record-keeping
          only — not SEBI-registered advice.
        </AlertDescription>
      </Alert>
      <EmptyState
        icon={TrendingUp}
        title="No investments tracked"
        description="Add your mutual funds, stocks, FDs, PPF, and other instruments. ArthaAI computes your portfolio allocation, XIRR, and CAGR."
        action={{ label: "Add investment", href: "/investments" }}
      />
    </div>
  )
}
