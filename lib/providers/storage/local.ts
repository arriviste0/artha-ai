import fs from "fs/promises"
import path from "path"
import type { StorageProvider } from "./index"

const UPLOAD_DIR = path.join(process.cwd(), "uploads")

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
