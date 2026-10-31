import mongoose, { Schema, type Document, type Model } from "mongoose"

export interface ISyncConnection extends Document {
  userId: mongoose.Types.ObjectId
  provider: "gmail"
  email?: string
  accessToken?: string
  refreshToken?: string
  tokenExpiresAt?: Date
  hasGmailScope?: boolean
  lastSyncedAt?: Date
  webhookToken?: string
  createdAt: Date
  updatedAt: Date
}

const SyncConnectionSchema = new Schema<ISyncConnection>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    provider: { type: String, enum: ["gmail"], default: "gmail" },
    email: { type: String, trim: true },
    accessToken: { type: String },
    refreshToken: { type: String },
    tokenExpiresAt: { type: Date },
    hasGmailScope: { type: Boolean, default: false },
    lastSyncedAt: { type: Date },
    webhookToken: { type: String, index: true },
  },
  { timestamps: true }
)

SyncConnectionSchema.index({ userId: 1, provider: 1 }, { unique: true })

const SyncConnection: Model<ISyncConnection> =
  (mongoose.models.SyncConnection as Model<ISyncConnection>) ??
  mongoose.model<ISyncConnection>("SyncConnection", SyncConnectionSchema)

export default SyncConnection
