import { LocalStorageProvider } from "./local"
import { S3StorageProvider } from "./s3"

export interface StorageProvider {
  upload(key: string, buffer: Buffer, contentType: string): Promise<string>
  getSignedUrl(key: string, expiresIn?: number): Promise<string>
  delete(key: string): Promise<void>
}

export { LocalStorageProvider } from "./local"
export { S3StorageProvider } from "./s3"

export function getStorageProvider(): StorageProvider {
  if (process.env.AWS_S3_BUCKET) {
    return new S3StorageProvider()
  }
  return new LocalStorageProvider()
}
