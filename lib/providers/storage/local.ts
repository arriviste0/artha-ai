import fs from "fs/promises"
import path from "path"
import os from "os"
import type { StorageProvider } from "./index"

export const getUploadDir = () => {
  if (process.env.VERCEL || process.env.AWS_REGION) { // AWS_REGION is set in lambda/vercel
    return path.join(os.tmpdir(), "uploads")
  }
  return path.join(process.cwd(), "uploads")
}

const UPLOAD_DIR = getUploadDir()

export class LocalStorageProvider implements StorageProvider {
  async upload(key: string, buffer: Buffer): Promise<string> {
    const filePath = path.join(UPLOAD_DIR, key)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, buffer)
    return `/api/statements/file/${key}`
  }

  async getSignedUrl(key: string): Promise<string> {
    return `/api/statements/file/${key}`
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(UPLOAD_DIR, key)
    await fs.unlink(filePath).catch(() => {})
  }
}
