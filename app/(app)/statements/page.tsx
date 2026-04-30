"use client"

import { useState } from "react"
import { FileText, Upload, CheckCircle, XCircle, Clock, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { UploadDropzone } from "@/components/statements/upload-dropzone"
import { useDeleteStatement, useStatements } from "@/hooks/use-statements"
import { useAccounts } from "@/hooks/use-accounts"
import Link from "next/link"
import { toast } from "sonner"

const STATUS_CONFIG = {
  uploaded: { label: "Uploaded", icon: Clock, color: "secondary" as const },
  parsing: { label: "Parsing…", icon: Loader2, color: "secondary" as const },
  parsed: { label: "Ready to review", icon: FileText, color: "secondary" as const },
  failed: { label: "Failed", icon: XCircle, color: "destructive" as const },
  reviewed: { label: "Imported", icon: CheckCircle, color: "default" as const },
}

export default function StatementsPage() {
  const [open, setOpen] = useState(false)
  const { data: statements, isLoading } = useStatements()
  const { data: accounts } = useAccounts()
  const deleteStatement = useDeleteStatement()

  async function handleDelete(id: string, fileName: string) {
    const ok = window.confirm(
      `Remove "${fileName}" from statement uploads? Imported transactions will stay in your account.`
    )
    if (!ok) return

    try {
      await deleteStatement.mutateAsync(id)
      toast.success("Statement removed")
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Statements</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload PDF or CSV bank statements to auto-import transactions
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Upload className="mr-2 h-4 w-4" />
              Upload statement
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Upload bank statement</DialogTitle>
              <DialogDescription>
                Select an account and upload a PDF or CSV statement to import transactions.
              </DialogDescription>
            </DialogHeader>
            <UploadDropzone
              accounts={accounts ?? []}
              onUploaded={() => setOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !statements?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-medium">No statements uploaded</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Upload your bank statement PDF or CSV and let AI categorize your transactions automatically.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {statements.map((stmt) => {
            const config = STATUS_CONFIG[stmt.status]
            const Icon = config.icon
            return (
              <Card key={stmt._id}>
                <CardContent className="flex items-center gap-4 py-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{stmt.fileName}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(stmt.uploadedAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                      {stmt.detectedRows > 0 && ` · ${stmt.detectedRows} rows detected`}
                      {stmt.importedTxnCount > 0 && ` · ${stmt.importedTxnCount} imported`}
                    </p>
                    {stmt.parseErrors.length > 0 && (
                      <p className="text-xs text-destructive mt-0.5">{stmt.parseErrors[0]}</p>
                    )}
                  </div>
                  <Badge variant={config.color} className="shrink-0">
                    <Icon className={`mr-1 h-3 w-3 ${stmt.status === "parsing" ? "animate-spin" : ""}`} />
                    {config.label}
                  </Badge>
                  {stmt.status === "parsed" && (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/statements/${stmt._id}`}>Review</Link>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    disabled={stmt.status === "parsing" || deleteStatement.isPending}
                    onClick={() => handleDelete(stmt._id, stmt.fileName)}
                    title="Remove statement"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
