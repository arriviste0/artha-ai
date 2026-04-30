"use client"

import { useCallback, useRef, useState } from "react"
import { Upload, FileText, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import type { AccountDTO } from "@/hooks/use-accounts"
import { useUploadStatement, useParseStatement } from "@/hooks/use-statements"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface Props {
  accounts: AccountDTO[]
  onUploaded?: (id: string) => void
}

export function UploadDropzone({ accounts, onUploaded }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [accountId, setAccountId] = useState(accounts[0]?._id ?? "")
  const [pdfPassword, setPdfPassword] = useState("")
  const [passwordRequired, setPasswordRequired] = useState(false)
  const [pendingUploadId, setPendingUploadId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const upload = useUploadStatement()
  const parse = useParseStatement()

  const accept = (file: File) => {
    if (!file.name.endsWith(".pdf") && !file.name.endsWith(".csv")) {
      toast.error("Only PDF and CSV files are supported")
      return
    }
    setSelectedFile(file)
    setPdfPassword("")
    setPasswordRequired(false)
    setPendingUploadId(null)
  }

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) accept(file)
    },
    []
  )

  const handleSubmit = async () => {
    if (!selectedFile || !accountId) return

    // If we already uploaded but got PASSWORD_REQUIRED, just retry parse
    if (pendingUploadId) {
      await doParse(pendingUploadId)
      return
    }

    try {
      const result = await upload.mutateAsync({ file: selectedFile, accountId })
      const uploadId = result.upload._id
      setPendingUploadId(uploadId)

      toast.info("File uploaded, parsing statement…")

      await doParse(uploadId)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const doParse = async (uploadId: string) => {
    try {
      const parseResult = await parse.mutateAsync({
        id: uploadId,
        password: pdfPassword || undefined,
      })

      if (parseResult.upload.status === "failed") {
        toast.error("Parsing failed: " + (parseResult.upload.parseErrors[0] ?? "Unknown error"))
        return
      }

      toast.success(`Parsed ${parseResult.upload.detectedRows} transactions`)
      onUploaded?.(uploadId)
      router.push(`/statements/${uploadId}`)
    } catch (err) {
      if ((err as Error).message === "PASSWORD_REQUIRED") {
        setPasswordRequired(true)
        toast.warning("This PDF is password-protected. Enter the password below and retry.")
        return
      }
      toast.error((err as Error).message)
    }
  }

  const isLoading = upload.isPending || parse.isPending

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Account</Label>
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger>
            <SelectValue placeholder="Select account" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a._id} value={a._id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
          dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && accept(e.target.files[0])}
        />
        {selectedFile ? (
          <div className="flex items-center justify-center gap-3">
            <FileText className="h-8 w-8 text-primary" />
            <div className="text-left">
              <p className="font-medium">{selectedFile.name}</p>
              <p className="text-sm text-muted-foreground">
                {(selectedFile.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setSelectedFile(null) }}
              className="ml-2 text-muted-foreground hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="font-medium">Drop your bank statement here</p>
            <p className="text-sm text-muted-foreground">
              PDF or CSV · HDFC, ICICI, SBI, Axis supported · Max 10 MB
            </p>
          </div>
        )}
      </div>

      {selectedFile?.name.endsWith(".pdf") && (
        <div className="space-y-1.5">
          <Label htmlFor="pdf-password">
            PDF Password
            {!passwordRequired && (
              <span className="ml-1 text-xs text-muted-foreground font-normal">(leave blank if none)</span>
            )}
          </Label>
          <Input
            id="pdf-password"
            type="password"
            placeholder={passwordRequired ? "Password required to open this PDF" : "Enter password if protected"}
            value={pdfPassword}
            onChange={(e) => setPdfPassword(e.target.value)}
            className={passwordRequired ? "border-destructive" : ""}
            autoComplete="off"
          />
        </div>
      )}

      <Button
        className="w-full"
        disabled={!selectedFile || !accountId || isLoading || (passwordRequired && !pdfPassword)}
        onClick={handleSubmit}
      >
        {isLoading
          ? upload.isPending
            ? "Uploading…"
            : "Parsing with AI…"
          : passwordRequired
            ? "Retry with Password"
            : "Upload & Parse"}
      </Button>
    </div>
  )
}
