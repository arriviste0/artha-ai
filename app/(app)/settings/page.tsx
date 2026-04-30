import { auth } from "@/lib/auth"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { Badge } from "@/components/ui/badge"
import { connectDB } from "@/lib/db"
import User from "@/models/user"

export default async function SettingsPage() {
  const session = await auth()
  await connectDB()
  const user = await User.findById(session!.user.id).select("incomeMode preferences baseCurrency")

  const incomeModeLabel = {
    salaried: "Salaried",
    variable: "Freelancer / Variable",
    business: "Business Owner",
  }[user?.incomeMode ?? "salaried"]

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your account preferences and integrations
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your account details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{session?.user?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Income mode</span>
            <Badge variant="secondary">{incomeModeLabel}</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Budgeting framework</span>
            <Badge variant="outline">{user?.preferences?.budgetingFramework ?? "50-30-20"}</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Currency</span>
            <span className="font-medium">INR (₹)</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Customize the look of ArthaAI</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Theme</p>
              <p className="text-xs text-muted-foreground">Light, dark, or follow system</p>
            </div>
            <ThemeToggle />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Coming soon</CardTitle>
          <CardDescription>Features in development</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="text-sm text-muted-foreground space-y-1.5 list-disc list-inside">
            <li>Custom category editor</li>
            <li>Notification preferences</li>
            <li>Export all data (CSV / PDF)</li>
            <li>Delete account & data wipe</li>
            <li>Connected bank accounts (Account Aggregator)</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
