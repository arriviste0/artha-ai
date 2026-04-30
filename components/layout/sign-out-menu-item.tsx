"use client"

import { LogOut } from "lucide-react"
import { signOut } from "next-auth/react"

export function SignOutMenuItem() {
  return (
    <button
      type="button"
      className="flex w-full items-center"
      onClick={() => signOut({ callbackUrl: "/login" })}
    >
      <LogOut className="mr-2 h-4 w-4" /> Sign out
    </button>
  )
}
