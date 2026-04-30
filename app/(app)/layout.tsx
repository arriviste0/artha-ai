import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db"
import User from "@/models/user"
import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  await connectDB()
  const user = await User.findById(session.user.id, { onboardingCompleted: 1 }).lean()
  if (!user?.onboardingCompleted) redirect("/onboarding")

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
