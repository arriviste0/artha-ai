"use client"

import { use, useState } from "react"
import { ArrowLeft, Loader2, AlertTriangle, RefreshCw, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ReviewTable } from "@/components/statements/review-table"
import { useStatement, useParseStatement } from "@/hooks/use-statements"
import { toast } from "sonner"
import Link from "next/link"

interface Props {
  params: Promise<{ id: string }>
}

export default function StatementReviewPage({ params }: Props) {
  const { id } = use(params)
  const { data: upload, isLoading, error } = useStatement(id)
  const parseStatement = useParseStatement()
  const [showPasswordInput, setShowPasswordInput] = useState(false)
  const [password, setPassword] = useState("")

  const handleReparse = async (pwd?: string) => {
    try {
      await parseStatement.mutateAsync({ id, password: pwd || password || undefined })
      toast.success("Statement re-parsed successfully")
      setShowPasswordInput(false)
      setPassword("")
    } catch (err: any) {
      if (err?.message === "PASSWORD_REQUIRED") {
        setShowPasswordInput(true)
        toast.warning("Password required to open this PDF statement")
      } else {
        toast.error(err?.message || "Failed to re-parse statement")
      }
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !upload) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-muted-foreground">Statement not found</p>
        <Button variant="outline" asChild>
          <Link href="/statements">Back to statements</Link>
        </Button>
      </div>
    )
  }

  const needsReview = upload.draftTransactions.filter((d) => d.needsReview && d.status === "pending").length

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/statements">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{upload.fileName}</h1>
            <p className="text-sm text-muted-foreground">
              {upload.detectedRows} transactions detected
              {upload.parseMethod && ` · parsed via ${upload.parseMethod.replace("_", " ")}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {needsReview > 0 && (
            <Badge variant="secondary" className="text-amber-600">
              <AlertTriangle className="mr-1 h-3 w-3" />
              {needsReview} need review
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={parseStatement.isPending}
            onClick={() => handleReparse()}
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${parseStatement.isPending ? "animate-spin" : ""}`} />
            {parseStatement.isPending ? "Parsing…" : "Re-parse"}
          </Button>
        </div>
      </div>

      {showPasswordInput && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <Lock className="h-4 w-4" /> PDF Password Required
            </CardTitle>
            <CardDescription>
              This bank statement is encrypted. Enter the PDF password to decrypt and re-parse it.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2 max-w-md pt-2">
            <Input
              type="password"
              placeholder="Enter PDF password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-8 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && password) handleReparse(password)
              }}
            />
            <Button
              size="sm"
              className="h-8"
              disabled={!password || parseStatement.isPending}
              onClick={() => handleReparse(password)}
            >
              {parseStatement.isPending ? "Unlocking…" : "Unlock & Parse"}
            </Button>
          </CardContent>
        </Card>
      )}

      {upload.parseErrors.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-destructive">Parse warnings</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1">
              {upload.parseErrors.map((e, i) => (
                <li key={i} className="text-muted-foreground">• {e}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Review transactions</CardTitle>
          <CardDescription>
            Accept, edit, or reject each transaction before importing. Click the Type pill to quickly toggle between Debit and Credit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReviewTable uploadId={id} drafts={upload.draftTransactions} />
        </CardContent>
      </Card>
    </div>
  )
}
