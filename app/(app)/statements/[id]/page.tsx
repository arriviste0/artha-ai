"use client"

import { use } from "react"
import { ArrowLeft, Loader2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ReviewTable } from "@/components/statements/review-table"
import { useStatement } from "@/hooks/use-statements"
import Link from "next/link"

interface Props {
  params: Promise<{ id: string }>
}

export default function StatementReviewPage({ params }: Props) {
  const { id } = use(params)
  const { data: upload, isLoading, error } = useStatement(id)

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
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/statements">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{upload.fileName}</h1>
          <p className="text-sm text-muted-foreground">
            {upload.detectedRows} transactions detected
            {upload.parseMethod && ` · parsed via ${upload.parseMethod.replace("_", " ")}`}
          </p>
        </div>
        {needsReview > 0 && (
          <Badge variant="secondary" className="text-amber-600">
            <AlertTriangle className="mr-1 h-3 w-3" />
            {needsReview} need review
          </Badge>
        )}
      </div>

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
            Accept, edit, or reject each transaction before importing. Flagged rows have low AI confidence.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReviewTable uploadId={id} drafts={upload.draftTransactions} />
        </CardContent>
      </Card>
    </div>
  )
}
