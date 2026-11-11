"use client"

import { useState, useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { signIn } from "next-auth/react"
import {
  RefreshCw,
  Mail,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Copy,
  Check,
  Loader2,
  Calendar,
  Smartphone,
  ExternalLink,
  Shield,
  Unlink,
  CheckCheck,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { formatINR } from "@/lib/money"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

type SyncStep =
  | "mail_idle"
  | "mail_syncing"
  | "mail_no_emails"
  | "mail_retry_failed"
  | "mail_success"
  | "sms_mode"
  | "sms_success"
  | "paste_email"

interface SyncStatusResponse {
  connected: boolean
  email?: string
  lastSyncedAt?: string
  webhookToken?: string
}

interface SyncMailResult {
  syncedCount: number
  skippedCount: number
  unparseableCount: number
  needsReviewCount?: number
  noEmailsFound: boolean
  syncedFromLatest?: boolean
  transactions?: Array<{
    _id: string
    merchant?: string
    description: string
    amountPaise: number
    type: "credit" | "debit"
    occurredAt: string
    accountNumberMasked?: string
    referenceNumber?: string
  }>
}

export function SyncTransactionsDialog({ open, onOpenChange, onSuccess }: Props) {
  const qc = useQueryClient()
  const [step, setStep] = useState<SyncStep>("mail_idle")
  const [retryCount, setRetryCount] = useState(0)
  const [isBulkConfirming, setIsBulkConfirming] = useState(false)

  // Date selection (default: 90 days ago)
  const defaultDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  const [syncFromDate, setSyncFromDate] = useState<string>(defaultDate)
  const [datePreset, setDatePreset] = useState<"latest" | "7d" | "30d" | "90d" | "all" | "custom">("90d")

  // SMS input state
  const [smsText, setSmsText] = useState("")
  const [isSmsParsing, setIsSmsParsing] = useState(false)
  const [copiedWebhook, setCopiedWebhook] = useState(false)
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [copiedSecret, setCopiedSecret] = useState(false)

  // Direct email paste state
  const [emailText, setEmailText] = useState("")
  const [isEmailParsing, setIsEmailParsing] = useState(false)

  // Google OAuth redirect URI state
  const [copiedRedirectUri, setCopiedRedirectUri] = useState(false)
  const [showRedirectGuide, setShowRedirectGuide] = useState(false)
  const [isSigningInGoogle, setIsSigningInGoogle] = useState(false)

  // Custom webhook base URL (e.g. tunnel or domain for iOS access)
  const [customBaseUrl, setCustomBaseUrl] = useState("")

  // Result state
  const [syncResult, setSyncResult] = useState<SyncMailResult | null>(null)
  const [isDisconnecting, setIsDisconnecting] = useState(false)

  // Fetch Gmail connection status
  const { data: status, isLoading: isStatusLoading, refetch: refetchStatus } = useQuery<SyncStatusResponse>({
    queryKey: ["gmail-sync-status"],
    queryFn: async () => {
      const res = await fetch("/api/sync/gmail/status")
      if (!res.ok) throw new Error("Failed to check sync status")
      return res.json()
    },
    enabled: open,
  })

  // Reset step when dialog opens
  useEffect(() => {
    if (open) {
      setStep("mail_idle")
      setRetryCount(0)
      setSyncResult(null)
      setEmailText("")
      refetchStatus()
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem("artha_custom_webhook_base")
        if (saved) setCustomBaseUrl(saved)
      }
    }
  }, [open, refetchStatus])

  function handlePresetChange(preset: "latest" | "7d" | "30d" | "90d" | "all" | "custom") {
    setDatePreset(preset)
    const now = Date.now()
    if (preset === "latest") {
      return
    } else if (preset === "7d") {
      setSyncFromDate(new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0])
    } else if (preset === "30d") {
      setSyncFromDate(new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0])
    } else if (preset === "90d") {
      setSyncFromDate(new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0])
    } else if (preset === "all") {
      setSyncFromDate(new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0])
    }
  }

  async function handleDisconnectGmail() {
    setIsDisconnecting(true)
    try {
      const res = await fetch("/api/sync/gmail/disconnect", { method: "POST" })
      if (!res.ok) throw new Error("Failed to disconnect Gmail")
      toast.success("Gmail disconnected and access revoked")
      refetchStatus()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to disconnect")
    } finally {
      setIsDisconnecting(false)
    }
  }

  async function handleGoogleSignIn() {
    setIsSigningInGoogle(true)
    try {
      await signIn("google", { callbackUrl: "/transactions?sync=gmail-connected" })
    } catch {
      toast.error("Failed to connect Google")
      setIsSigningInGoogle(false)
    }
  }

  async function handleSyncMail() {
    setStep("mail_syncing")
    try {
      const res = await fetch("/api/sync/gmail/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromDate:
            datePreset === "latest"
              ? undefined
              : (syncFromDate ? `${syncFromDate}T00:00:00.000Z` : undefined),
          syncFromLatest: datePreset === "latest",
        }),
      })

      const data = (await res.json()) as SyncMailResult & { error?: string; notConnected?: boolean }

      if (!res.ok) {
        if (data.notConnected) {
          toast.error(data.error || "Please connect your Gmail account first")
          refetchStatus()
          setStep("mail_idle")
          return
        }
        throw new Error(data.error || "Failed to sync emails")
      }

      setSyncResult(data)

      if (data.noEmailsFound) {
        if (retryCount >= 1) {
          setStep("mail_retry_failed")
        } else {
          setStep("mail_no_emails")
        }
      } else {
        setStep("mail_success")
        qc.invalidateQueries({ queryKey: ["transactions"] })
        qc.invalidateQueries({ queryKey: ["dashboard-summary"] })
        qc.invalidateQueries({ queryKey: ["budgets"] })
        qc.invalidateQueries({ queryKey: ["accounts"] })
        toast.success(`Synced ${data.syncedCount} new transactions!`)
        onSuccess?.()
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Sync failed")
      setStep("mail_idle")
    }
  }

  async function handleSyncEmailPaste() {
    if (!emailText.trim()) {
      toast.error("Please paste bank email alert text to parse")
      return
    }

    setIsEmailParsing(true)
    try {
      const res = await fetch("/api/sync/email/paste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: emailText }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Failed to parse email")
      }

      setSyncResult({
        syncedCount: data.syncedCount || 0,
        skippedCount: data.skippedCount || 0,
        unparseableCount: data.unparseableCount || 0,
        needsReviewCount: data.needsReviewCount || 0,
        noEmailsFound: false,
        transactions: data.transactions,
      })

      qc.invalidateQueries({ queryKey: ["transactions"] })
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] })
      qc.invalidateQueries({ queryKey: ["budgets"] })
      qc.invalidateQueries({ queryKey: ["accounts"] })

      setStep("mail_success")
      toast.success(`Synced ${data.syncedCount || 0} transactions from email!`)
      onSuccess?.()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to parse email")
    } finally {
      setIsEmailParsing(false)
    }
  }

  async function handleSyncSms() {
    if (!smsText.trim()) {
      toast.error("Please paste at least one SMS message to parse")
      return
    }

    setIsSmsParsing(true)
    try {
      const res = await fetch("/api/sync/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: smsText }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Failed to parse SMS")
      }

      setSyncResult({
        syncedCount: data.syncedCount || 0,
        skippedCount: data.skippedCount || 0,
        unparseableCount: data.unparseableCount || 0,
        needsReviewCount: data.needsReviewCount || 0,
        noEmailsFound: false,
        transactions: data.transactions,
      })

      qc.invalidateQueries({ queryKey: ["transactions"] })
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] })
      qc.invalidateQueries({ queryKey: ["budgets"] })
      qc.invalidateQueries({ queryKey: ["accounts"] })

      setStep("sms_success")
      toast.success(`Synced ${data.syncedCount || 0} transactions from SMS!`)
      onSuccess?.()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to parse SMS")
    } finally {
      setIsSmsParsing(false)
    }
  }

  // Webhook URL for iOS Shortcuts & OAuth redirect URI
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const redirectUri = `${origin}/api/sync/gmail/callback`
  const secretToken = status?.webhookToken || "YOUR-SECRET"
  const isLocalhost = Boolean(origin && (origin.includes("localhost") || origin.includes("127.0.0.1")))
  const activeBaseUrl = (customBaseUrl.trim() || origin).replace(/\/+$/, "")
  const smsEndpointUrl = `${activeBaseUrl}/api/sync/sms`
  const webhookUrl = `${activeBaseUrl}/api/sync/sms?token=${secretToken}`

  const appleShortcutsPrompt = `When I receive a message containing "debited", get the current date, format it as ISO 8601, and send a POST request to ${smsEndpointUrl} with a JSON body that has two fields: "text" set to the message content, and "date" set to the formatted date. Add a header "x-secret" with the value ${secretToken}. Run automatically without asking and don't notify me.`

  function copyPromptToClipboard() {
    navigator.clipboard.writeText(appleShortcutsPrompt)
    setCopiedPrompt(true)
    toast.success("Shortcuts prompt copied to clipboard!")
    setTimeout(() => setCopiedPrompt(false), 2500)
  }

  function copyWebhookToClipboard() {
    navigator.clipboard.writeText(smsEndpointUrl)
    setCopiedWebhook(true)
    toast.success("Webhook URL copied to clipboard!")
    setTimeout(() => setCopiedWebhook(false), 2500)
  }

  function copySecretToClipboard() {
    navigator.clipboard.writeText(secretToken)
    setCopiedSecret(true)
    toast.success("Secret token copied to clipboard!")
    setTimeout(() => setCopiedSecret(false), 2500)
  }

  function copyRedirectUriToClipboard() {
    navigator.clipboard.writeText(redirectUri)
    setCopiedRedirectUri(true)
    toast.success("Redirect URI copied to clipboard!")
    setTimeout(() => setCopiedRedirectUri(false), 2500)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              {step === "sms_mode" || step === "sms_success" ? (
                <Smartphone className="h-5 w-5" />
              ) : step === "paste_email" ? (
                <Mail className="h-5 w-5" />
              ) : (
                <RefreshCw className="h-5 w-5" />
              )}
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold">
                {step === "sms_mode" || step === "sms_success"
                  ? "Sync via SMS"
                  : step === "paste_email"
                  ? "Paste Bank Email Alert"
                  : "Sync Bank Transactions"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {step === "paste_email"
                  ? "Paste raw email alert text from HDFC or any Indian bank to import transactions"
                  : "Automatically import HDFC & Indian bank debit/credit alerts with zero duplicates"}
              </DialogDescription>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* STEP 1: MAIL IDLE / CONNECT GMAIL */}
          {step === "mail_idle" && (
            <div className="space-y-4">
              {/* Date Selection */}
              <div className="rounded-xl border p-3.5 space-y-2.5 bg-muted/20">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-primary" />
                    Sync Transactions From Date
                  </Label>
                  <span className="text-[11px] text-muted-foreground">Choose a range or continue from the latest</span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {(["latest", "7d", "30d", "90d", "all", "custom"] as const).map((p) => (
                    <Button
                      key={p}
                      type="button"
                      variant={datePreset === p ? "default" : "outline"}
                      size="sm"
                      className="h-7 text-xs px-2.5"
                      onClick={() => handlePresetChange(p)}
                    >
                      {p === "latest"
                        ? "Since Latest"
                        : p === "7d"
                        ? "Last 7 Days"
                        : p === "30d"
                        ? "Last 30 Days"
                        : p === "90d"
                        ? "Last 90 Days"
                        : p === "all"
                        ? "All Time (1 Year)"
                        : "Custom"}
                    </Button>
                  ))}
                </div>

                {datePreset === "latest" && (
                  <p className="text-[11px] text-muted-foreground">
                    Imports transactions after the newest one already recorded on the site, up to today.
                  </p>
                )}

                {datePreset === "custom" && (
                  <Input
                    type="date"
                    value={syncFromDate}
                    max={new Date().toISOString().split("T")[0]}
                    onChange={(e) => setSyncFromDate(e.target.value)}
                    className="h-8 text-xs"
                  />
                )}
              </div>

              {/* Gmail Connection Card */}
              <div className="rounded-xl border p-4 bg-muted/10 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-red-100 dark:bg-red-950/40 text-red-600 flex items-center justify-center shrink-0">
                      <Mail className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Google Mail (Read-Only)</p>
                      <p className="text-xs text-muted-foreground">
                        {status?.connected
                          ? `Connected as ${status.email || "Gmail Account"}`
                          : "Connect Gmail to scan HDFC & bank alert emails"}
                      </p>
                    </div>
                  </div>
                  {status?.connected ? (
                    <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20 text-[11px] py-0.5">
                      Connected
                    </Badge>
                  ) : null}
                </div>

                {status?.lastSyncedAt && (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Shield className="h-3 w-3 text-emerald-600" />
                    Last synced: {new Date(status.lastSyncedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                )}

                {/* Privacy Guarantee */}
                <div className="text-[11px] text-muted-foreground bg-muted/40 p-2.5 rounded-lg space-y-1">
                  <p className="font-medium text-foreground flex items-center gap-1">
                    <Shield className="h-3.5 w-3.5 text-primary" /> Strict Privacy Guarantee
                  </p>
                  <p>
                    We search only official bank alert emails. Raw emails are parsed in memory and never stored. All OTP messages are discarded instantly.
                  </p>
                </div>

                {!status?.connected && (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                        Fix Error 400: redirect_uri_mismatch
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowRedirectGuide((v) => !v)}
                        className="text-[11px] text-primary hover:underline font-medium"
                      >
                        {showRedirectGuide ? "Hide instructions" : "How to fix"}
                      </button>
                    </div>

                    <p className="text-[11px] text-muted-foreground">
                      If Google blocks access with <code>redirect_uri_mismatch</code>, add this URI to your Google Cloud Console project:
                    </p>

                    <div className="flex items-center gap-1.5">
                      <Input
                        readOnly
                        value={redirectUri}
                        className="text-[11px] h-7 font-mono bg-background"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 shrink-0 text-xs gap-1"
                        onClick={copyRedirectUriToClipboard}
                      >
                        {copiedRedirectUri ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-600" />
                            <span className="text-[10px]">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            <span className="text-[10px]">Copy</span>
                          </>
                        )}
                      </Button>
                    </div>

                    {showRedirectGuide && (
                      <ol className="list-decimal list-inside space-y-1 text-[11px] text-muted-foreground pt-1.5 border-t border-amber-500/10">
                        <li>
                          Open{" "}
                          <a
                            href="https://console.cloud.google.com/apis/credentials"
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline inline-flex items-center gap-0.5"
                          >
                            Google Cloud Console Credentials <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        </li>
                        <li>Click your OAuth 2.0 Client ID (Artha AI)</li>
                        <li>Under <strong>Authorized redirect URIs</strong>, click <strong>+ ADD URI</strong></li>
                        <li>Paste: <code className="font-mono text-foreground text-[10px] bg-muted px-1 py-0.5 rounded">{redirectUri}</code></li>
                        <li>Click <strong>Save</strong> and retry.</li>
                      </ol>
                    )}
                  </div>
                )}

                {status?.connected && (
                  <div className="flex justify-end pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground hover:text-destructive h-7 px-2 gap-1"
                      onClick={handleDisconnectGmail}
                      disabled={isDisconnecting}
                    >
                      {isDisconnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlink className="h-3 w-3" />}
                      Disconnect Gmail
                    </Button>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-1">
                {status?.connected ? (
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                      Cancel
                    </Button>
                    <Button className="flex-1" onClick={handleSyncMail} disabled={isStatusLoading}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Sync Mail
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        className="flex-1"
                        onClick={handleGoogleSignIn}
                        disabled={isSigningInGoogle}
                      >
                        {isSigningInGoogle ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Mail className="mr-2 h-4 w-4" />
                        )}
                        Sign in with Google
                      </Button>
                      <Button asChild variant="outline" className="flex-1">
                        <a href="/api/sync/gmail/connect">
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Connect Dedicated Gmail
                        </a>
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground text-center">
                      Tip: &quot;Sign in with Google&quot; uses your pre-authorized NextAuth callback URL
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center gap-4 pt-1">
                <button
                  type="button"
                  onClick={() => setStep("paste_email")}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors underline underline-offset-4"
                >
                  Paste Email Text →
                </button>
                <span className="text-muted-foreground/30 text-xs">•</span>
                <button
                  type="button"
                  onClick={() => setStep("sms_mode")}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors underline underline-offset-4"
                >
                  Sync via SMS (Android & iOS) →
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: MAIL SYNCING */}
          {step === "mail_syncing" && (
            <div className="py-10 text-center space-y-4">
              <div className="relative inline-flex items-center justify-center">
                <div className="h-16 w-16 rounded-full bg-primary/10 animate-ping absolute" />
                <div className="h-14 w-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg relative">
                  <Loader2 className="h-7 w-7 animate-spin" />
                </div>
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-base">Scanning Bank Alert Emails...</p>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  {datePreset === "latest"
                    ? "Searching for HDFC and Indian bank alerts after your latest recorded transaction through today. Extracting amounts, merchants and deduping."
                    : `Searching for HDFC and Indian bank alerts from ${new Date(syncFromDate).toLocaleDateString("en-IN")}. Extracting amounts, merchants and deduping.`}
                </p>
              </div>
            </div>
          )}

          {/* STEP 3: OUTCOME - NO EMAILS FOUND (Exact Flow Guide) */}
          {step === "mail_no_emails" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-semibold">No bank alert emails found</p>
                  <p className="text-muted-foreground">
                    We could not find any transaction alert emails from your bank in the selected date range.
                  </p>
                </div>
              </div>

              {/* Exact Guide requested by user */}
              <div className="rounded-xl border p-4 bg-muted/20 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Quick Setup Guide (HDFC Bank)
                </p>
                <div className="space-y-2 text-xs">
                  <div className="flex items-start gap-2.5">
                    <span className="h-5 w-5 rounded-full bg-primary/10 text-primary font-bold text-[11px] flex items-center justify-center shrink-0">
                      1
                    </span>
                    <p className="pt-0.5">
                      Open <strong>HDFC NetBanking</strong> or the <strong>HDFC MobileBanking App</strong>
                    </p>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="h-5 w-5 rounded-full bg-primary/10 text-primary font-bold text-[11px] flex items-center justify-center shrink-0">
                      2
                    </span>
                    <p className="pt-0.5">
                      Go to <strong>Alerts / InstaAlerts</strong> settings
                    </p>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="h-5 w-5 rounded-full bg-primary/10 text-primary font-bold text-[11px] flex items-center justify-center shrink-0">
                      3
                    </span>
                    <p className="pt-0.5">
                      Turn on <strong>Email alerts</strong> and set the threshold to <strong>₹1</strong>
                    </p>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="h-5 w-5 rounded-full bg-primary/10 text-primary font-bold text-[11px] flex items-center justify-center shrink-0">
                      4
                    </span>
                    <p className="pt-0.5">
                      Make sure your registered bank email matches the connected Gmail (
                      <span className="font-mono text-primary">{status?.email || "your Gmail"}</span>)
                    </p>
                  </div>
                </div>
              </div>

              {/* Two buttons requested by user */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setRetryCount((c) => c + 1)
                    handleSyncMail()
                  }}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry sync
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => setStep("sms_mode")}
                >
                  Still nothing? Use SMS
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 4: RETRY ALSO FOUND NOTHING -> SHOW "SYNC SMS" BUTTON */}
          {step === "mail_retry_failed" && (
            <div className="space-y-4 text-center py-4">
              <div className="h-12 w-12 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-base">Still no emails detected</p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Email alerts might take a little time or bank alerts might be delivered exclusively by SMS. You can sync via SMS right away.
                </p>
              </div>
              <Button size="lg" className="w-full gap-2" onClick={() => setStep("sms_mode")}>
                <Smartphone className="h-4 w-4" />
                Sync SMS
              </Button>
            </div>
          )}

          {/* STEP 5: SUCCESS OUTCOME */}
          {(step === "mail_success" || step === "sms_success") && syncResult && (
            <div className="space-y-4">
              <div className="text-center space-y-2 py-2">
                <div className="h-12 w-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <p className="text-lg font-bold">
                  Synced {syncResult.syncedCount} new transactions!
                </p>
                <div className="flex items-center justify-center flex-wrap gap-2 text-xs">
                  {syncResult.skippedCount > 0 && (
                    <Badge variant="outline" className="text-muted-foreground">
                      {syncResult.skippedCount} duplicates skipped
                    </Badge>
                  )}
                  {syncResult.needsReviewCount && syncResult.needsReviewCount > 0 ? (
                    <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-500/10 font-medium">
                      {syncResult.needsReviewCount} items need review
                    </Badge>
                  ) : null}
                  {syncResult.unparseableCount > 0 && (
                    <Badge variant="outline" className="text-amber-600 border-amber-300">
                      {syncResult.unparseableCount} unparseable items skipped
                    </Badge>
                  )}
                </div>
              </div>


              {/* Transactions Preview List */}
              {syncResult.transactions && syncResult.transactions.length > 0 && (
                <div className="rounded-xl border max-h-52 overflow-y-auto divide-y bg-muted/20">
                  {syncResult.transactions.slice(0, 5).map((t) => (
                    <div key={t._id} className="p-2.5 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-medium">{t.merchant || t.description}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(t.occurredAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                          {t.accountNumberMasked ? ` · A/C ${t.accountNumberMasked}` : ""}
                          {t.referenceNumber ? ` · Ref: ${t.referenceNumber}` : ""}
                        </p>
                      </div>
                      <span className={`font-semibold tabular-nums ${t.type === "credit" ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}>
                        {t.type === "credit" ? "+" : "−"}{formatINR(t.amountPaise)}
                      </span>
                    </div>
                  ))}
                  {syncResult.transactions.length > 5 && (
                    <p className="p-2 text-center text-[11px] text-muted-foreground bg-muted/40">
                      + {syncResult.transactions.length - 5} more transactions
                    </p>
                  )}
                </div>
              )}

              {syncResult.transactions && syncResult.transactions.length > 0 ? (
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    className="flex-1 gap-1.5"
                    disabled={isBulkConfirming}
                    onClick={async () => {
                      setIsBulkConfirming(true)
                      try {
                        const res = await fetch("/api/payees/confirm-all", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            transactionIds: syncResult.transactions?.map((t) => t._id),
                          }),
                        })
                        if (!res.ok) throw new Error("Failed to confirm")
                        const data = (await res.json()) as { confirmedCount?: number }
                        toast.success(
                          `Confirmed all ${data.confirmedCount || syncResult.transactions?.length} transaction categories!`
                        )
                        qc.invalidateQueries({ queryKey: ["transactions"] })
                        qc.invalidateQueries({ queryKey: ["dashboard-summary"] })
                        qc.invalidateQueries({ queryKey: ["budgets"] })
                        onOpenChange(false)
                      } catch {
                        toast.error("Failed to confirm categories")
                      } finally {
                        setIsBulkConfirming(false)
                      }
                    }}
                  >
                    {isBulkConfirming ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    ) : (
                      <CheckCheck className="h-4 w-4 mr-1.5" />
                    )}
                    Confirm All Categories ({syncResult.transactions.length})
                  </Button>
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    Done
                  </Button>
                </div>
              ) : (
                <Button className="w-full" onClick={() => onOpenChange(false)}>
                  Done
                </Button>
              )}
            </div>
          )}

          {/* STEP: PASTE BANK EMAIL TEXT DIRECTLY */}
          {step === "paste_email" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  Paste Bank Alert Email Content
                </Label>
                <textarea
                  rows={6}
                  className="w-full rounded-lg border bg-background p-3 text-xs focus:ring-2 focus:ring-primary focus:outline-none"
                  placeholder="Paste bank transaction alert email content here. e.g.:&#10;Dear Customer, Rs 1,450.00 has been debited from your HDFC Bank A/C **1234 to ZOMATO on 28-OCT-24 via UPI Ref No 430291048591."
                  value={emailText}
                  onChange={(e) => setEmailText(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Our regex & AI parser automatically detects debit/credit, amount, merchant, masked account, and reference number. OTPs are discarded immediately.
                </p>
              </div>

              <Button
                className="w-full"
                onClick={handleSyncEmailPaste}
                disabled={isEmailParsing || !emailText.trim()}
              >
                {isEmailParsing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Parse & Sync Email
              </Button>

              <div className="flex justify-between items-center pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => setStep("mail_idle")}
                >
                  &larr; Back to Email Sync
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => onOpenChange(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          )}

          {/* STEP 6: SYNC SMS (Android & iOS & Direct Paste) */}
          {step === "sms_mode" && (
            <div className="space-y-4">
              <Tabs defaultValue="paste" className="w-full">
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="paste" className="text-xs">
                    Paste SMS
                  </TabsTrigger>
                  <TabsTrigger value="ios" className="text-xs">
                    iOS Shortcuts / Webhook
                  </TabsTrigger>
                </TabsList>

                {/* Direct Paste / Android */}
                <TabsContent value="paste" className="space-y-3 mt-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">
                      Paste Bank SMS Message(s)
                    </Label>
                    <textarea
                      rows={5}
                      className="w-full rounded-lg border bg-background p-3 text-xs focus:ring-2 focus:ring-primary focus:outline-none"
                      placeholder="Paste single or multiple SMS messages here. e.g.:&#10;Sent Rs.250.00 from HDFC Bank A/C *1234 to SWIGGY via UPI Ref 428901234567 on 15-10-24"
                      value={smsText}
                      onChange={(e) => setSmsText(e.target.value)}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      You can paste multiple SMS alerts separated by blank lines. All OTPs are strictly dropped.
                    </p>
                  </div>

                  <Button
                    className="w-full"
                    onClick={handleSyncSms}
                    disabled={isSmsParsing || !smsText.trim()}
                  >
                    {isSmsParsing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Parse & Sync SMS
                  </Button>
                </TabsContent>

                {/* iOS Shortcuts Automation */}
                <TabsContent value="ios" className="space-y-3 mt-3">
                  {/* Localhost Warning Banner */}
                  {isLocalhost && !customBaseUrl.trim() && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-2 text-xs">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="font-semibold text-amber-500">iPhone cannot connect to &ldquo;localhost&rdquo;</p>
                          <p className="text-muted-foreground text-[11px] leading-relaxed">
                            On your iPhone, <code>localhost</code> points to the phone itself. That is why iOS says <em>&ldquo;Could not connect to the server&rdquo;</em>.
                          </p>
                          <div className="pt-1 space-y-1 text-muted-foreground text-[11px]">
                            <p className="font-medium text-foreground">How to fix in 10 seconds:</p>
                            <ol className="list-decimal list-inside space-y-1 pl-0.5">
                              <li>
                                Run this command in your computer terminal:
                                <div className="mt-1 flex items-center justify-between font-mono text-[10px] bg-background/80 p-1.5 rounded border border-amber-500/20">
                                  <span>npx localtunnel --port 3000</span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 px-1.5 text-[10px]"
                                    onClick={() => {
                                      navigator.clipboard.writeText("npx localtunnel --port 3000")
                                      toast.success("Command copied!")
                                    }}
                                  >
                                    <Copy className="h-2.5 w-2.5" />
                                  </Button>
                                </div>
                              </li>
                              <li>Copy the generated <code>https://...</code> URL and paste it below.</li>
                            </ol>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Custom URL / Tunnel input */}
                  <div className="space-y-1.5 rounded-xl border p-3 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Public / Tunnel URL for iPhone</Label>
                      {customBaseUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            setCustomBaseUrl("")
                            if (typeof window !== "undefined") {
                              localStorage.removeItem("artha_custom_webhook_base")
                            }
                          }}
                          className="text-[10px] text-muted-foreground hover:text-foreground underline"
                        >
                          Reset to localhost
                        </button>
                      )}
                    </div>
                    <Input
                      type="url"
                      placeholder="e.g. https://xyz.loca.lt or http://192.168.1.2:3000"
                      value={customBaseUrl}
                      onChange={(e) => {
                        setCustomBaseUrl(e.target.value)
                        if (typeof window !== "undefined") {
                          localStorage.setItem("artha_custom_webhook_base", e.target.value)
                        }
                      }}
                      className="h-7 text-xs font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Paste your tunnel URL or LAN IP so your iOS Shortcut connects from anywhere.
                    </p>
                  </div>

                  <div className="rounded-xl border p-3.5 bg-muted/30 space-y-3 text-xs">
                    <div>
                      <p className="font-semibold text-foreground flex items-center gap-1.5">
                        <Smartphone className="h-4 w-4 text-primary" />
                        Option A: Let Apple build it (fastest, needs iPhone 15 Pro or newer)
                      </p>
                    </div>

                    <ol className="list-decimal list-inside space-y-2 text-muted-foreground pt-0.5">
                      <li>
                        Open <strong>Shortcuts</strong> and tap the <strong>+</strong> (new shortcut).
                      </li>
                      <li className="space-y-1.5">
                        <span>On the <strong>&ldquo;Describe a Shortcut&rdquo;</strong> screen, paste this:</span>
                        <div className="rounded-lg border bg-background p-2.5 text-[11px] font-mono leading-relaxed text-foreground space-y-2">
                          <p className="select-all break-words">{appleShortcutsPrompt}</p>
                          <div className="pt-2 flex items-center justify-between border-t border-border/40">
                            <span className="text-[10px] text-muted-foreground font-sans">
                              (Real URL and secret are already inserted for you)
                            </span>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-6 px-2 text-[10px] gap-1 shrink-0"
                              onClick={copyPromptToClipboard}
                            >
                              {copiedPrompt ? (
                                <>
                                  <Check className="h-3 w-3 text-emerald-600" />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3" />
                                  <span>Copy Prompt</span>
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground italic">
                          Replace YOUR-WEBHOOK-URL and YOUR-SECRET with your real values before you send it if editing manually.
                        </p>
                      </li>
                      <li>
                        Open the shortcut it generates and check each item in the <strong>Verify checklist</strong> below.
                      </li>
                      <li>
                        <strong>Make a copy for credits:</strong> duplicate the shortcut and change <em>debited</em> to <em>credited</em>.
                      </li>
                    </ol>
                  </div>

                  {/* Verify Checklist */}
                  <div className="rounded-xl border p-3 bg-muted/20 space-y-2 text-xs">
                    <p className="font-semibold text-foreground flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                      Verify Checklist
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Check className="h-3 w-3 text-emerald-600 shrink-0" />
                        <span>Trigger: Message containing &quot;debited&quot;</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Check className="h-3 w-3 text-emerald-600 shrink-0" />
                        <span>Run automatically without asking</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Check className="h-3 w-3 text-emerald-600 shrink-0" />
                        <span>Don&apos;t notify me</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Check className="h-3 w-3 text-emerald-600 shrink-0" />
                        <span>POST request to webhook URL</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Check className="h-3 w-3 text-emerald-600 shrink-0" />
                        <span>Header: <code className="text-[10px]">x-secret</code></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Check className="h-3 w-3 text-emerald-600 shrink-0" />
                        <span>JSON fields: <code className="text-[10px]">text</code> &amp; <code className="text-[10px]">date</code></span>
                      </div>
                    </div>
                  </div>

                  {/* Reference Values */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        YOUR-WEBHOOK-URL
                      </Label>
                      <div className="flex items-center gap-1">
                        <Input
                          readOnly
                          value={smsEndpointUrl}
                          className="text-[11px] h-7 font-mono bg-muted/40"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 shrink-0 text-xs"
                          onClick={copyWebhookToClipboard}
                        >
                          {copiedWebhook ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        YOUR-SECRET
                      </Label>
                      <div className="flex items-center gap-1">
                        <Input
                          readOnly
                          value={secretToken}
                          className="text-[11px] h-7 font-mono bg-muted/40"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 shrink-0 text-xs"
                          onClick={copySecretToClipboard}
                        >
                          {copiedSecret ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="pt-1 flex items-center justify-between">
                    <a
                      href={`${smsEndpointUrl}?token=${secretToken}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-primary hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Test webhook in browser (should return status: ok)
                    </a>
                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex justify-between items-center pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => setStep("mail_idle")}
                >
                  &larr; Back to Email Sync
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => onOpenChange(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
