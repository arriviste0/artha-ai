"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { signIn } from "next-auth/react"
import { Calendar, CheckCircle2, Loader2, Mail, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface GmailStatus {
  connected: boolean
  email?: string
}

interface SyncResult {
  syncedCount: number
  createdCount: number
  updatedCount: number
  duplicateCount: number
  skippedCount: number
  noEmailsFound: boolean
}

const oneYearAgo = () => new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

export function SyncInvestmentsDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient()
  const [fromDate, setFromDate] = useState(oneYearAgo)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)

  const { data: status, isLoading: isStatusLoading } = useQuery<GmailStatus>({
    queryKey: ["gmail-sync-status"],
    queryFn: async () => {
      const response = await fetch("/api/sync/gmail/status")
      if (!response.ok) throw new Error("Failed to check Gmail connection")
      return response.json()
    },
    enabled: open,
  })

  async function connectGmail() {
    setIsConnecting(true)
    try {
      await signIn("google", { callbackUrl: "/investments" })
    } catch {
      toast.error("Failed to connect Gmail")
      setIsConnecting(false)
    }
  }

  async function syncInvestments() {
    setIsSyncing(true)
    setResult(null)
    try {
      const response = await fetch("/api/sync/gmail/investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromDate: `${fromDate}T00:00:00.000Z` }),
      })
      const data = await response.json() as SyncResult & { error?: string }
      if (!response.ok) throw new Error(data.error || "Failed to sync investment emails")

      setResult(data)
      queryClient.invalidateQueries({ queryKey: ["investments"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] })
      toast.success(data.syncedCount ? `Synced ${data.syncedCount} investment ${data.syncedCount === 1 ? "holding" : "holdings"}` : "No new investment purchases found")
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to sync investment emails")
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-primary" /> Sync investment emails
          </DialogTitle>
          <DialogDescription>
            Import confirmed stock, ETF, and mutual-fund purchases from Groww, Zerodha, Upstox, Angel One, and similar broker emails.
          </DialogDescription>
        </DialogHeader>

        {!status?.connected && !isStatusLoading ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
              Connect the Gmail account that receives your broker trade confirmations. We read only matching investment emails and never store raw email content.
            </div>
            <Button className="w-full" onClick={connectGmail} disabled={isConnecting}>
              {isConnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              Connect Gmail
            </Button>
          </div>
        ) : isStatusLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              Connected as <span className="font-medium text-foreground">{status.email || "your Gmail account"}</span>. Only completed purchases with an instrument name, units, and value are imported; incomplete emails are skipped for safety.
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Search from</Label>
              <Input type="date" value={fromDate} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setFromDate(event.target.value)} />
            </div>

            {result && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" /> Sync complete
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {result.createdCount} new, {result.updatedCount} updated, {result.duplicateCount} already imported, and {result.skippedCount} skipped because they lacked complete purchase details.
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={isSyncing}>Close</Button>
              <Button className="flex-1" onClick={syncInvestments} disabled={isSyncing || !fromDate}>
                {isSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Sync emails
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
