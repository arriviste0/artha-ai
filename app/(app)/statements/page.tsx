"use client"

import { useState } from "react"
import { FileText, Upload, CheckCircle, XCircle, Clock, Loader2, Trash2, Sparkles } from "lucide-react"
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
import { EmptyState } from "@/components/ui/empty-state"
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Statements</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload PDF or CSV bank statements to auto-import transactions
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
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
        <EmptyState
          icon={FileText}
          title="No statements uploaded"
          description="Upload your bank statement PDF or CSV and let AI categorize your transactions automatically."
          action={{ label: "Upload statement", onClick: () => setOpen(true) }}
        />
      ) : (
        <div className="space-y-3">
          {statements.map((stmt) => {
            const config = STATUS_CONFIG[stmt.status]
            const Icon = config.icon

            if (stmt.status === "parsing") {
              return (
                <Card key={stmt._id} className="relative overflow-hidden border-primary/30 shadow-sm">
                  <div className="absolute inset-0 bg-primary/5 animate-pulse" />
                  <CardContent className="flex flex-col sm:flex-row items-center gap-6 py-6 relative z-10">
                    <div className="relative shrink-0">
                      <div className="absolute -inset-4 bg-primary/20 blur-xl rounded-full animate-pulse" />
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-primary relative">
                        <Sparkles className="h-6 w-6 animate-pulse" />
                      </div>
                    </div>
                    <div className="flex-1 text-center sm:text-left">
                      <h3 className="font-semibold text-lg text-primary">Letting AI do the work...</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Extracting and categorizing transactions from <span className="font-medium text-foreground inline-block max-w-[200px] align-bottom truncate">{stmt.fileName}</span>
                      </p>
                    </div>
                    <Badge variant="secondary" className="animate-pulse shadow-sm shrink-0">
                      <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                      Analyzing
                    </Badge>
                  </CardContent>
                </Card>
              )
            }

            return (
              <Card key={stmt._id}>
                <CardContent className="flex flex-col sm:flex-row sm:items-center gap-4 py-4">
                  <div className="flex items-start sm:items-center gap-4 flex-1 min-w-0 w-full">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{stmt.fileName}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {new Date(stmt.uploadedAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {stmt.detectedRows > 0 && ` · ${stmt.detectedRows} rows detected`}
                        {stmt.importedTxnCount > 0 && ` · ${stmt.importedTxnCount} imported`}
                      </p>
                      {stmt.parseErrors.length > 0 && (
                        <p className="text-xs text-destructive mt-0.5 truncate">{stmt.parseErrors[0]}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 mt-2 sm:mt-0">
                    <Badge variant={config.color} className="shrink-0">
                      <Icon className="mr-1 h-3 w-3" />
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
                      disabled={deleteStatement.isPending}
                      onClick={() => handleDelete(stmt._id, stmt.fileName)}
                      title="Remove statement"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
