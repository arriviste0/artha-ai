"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  PiggyBank,
  Target,
  TrendingUp,
  Sparkles,
  Settings,
  FileText,
} from "lucide-react"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/transactions", icon: ArrowLeftRight, label: "Transactions" },
  { href: "/accounts", icon: Wallet, label: "Accounts" },
  { href: "/statements", icon: FileText, label: "Statements" },
  { href: "/budgets", icon: PiggyBank, label: "Budgets" },
  { href: "/goals", icon: Target, label: "Goals" },
  { href: "/investments", icon: TrendingUp, label: "Investments" },
  { href: "/planner", icon: Sparkles, label: "AI Planner" },
  { href: "/settings", icon: Settings, label: "Settings" },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden lg:flex flex-col w-60 border-r bg-sidebar h-screen sticky top-0 overflow-y-auto">
      <div className="p-4 border-b">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="text-xl font-bold text-primary">₹</span>
          <span className="font-semibold text-sidebar-foreground">ArthaAI</span>
        </Link>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + "/")
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t text-xs text-muted-foreground">
        ArthaAI is an educational tool. Not investment advice.
      </div>
    </aside>
  )
}
