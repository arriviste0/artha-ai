import mongoose, { Schema, type Document, type Model } from "mongoose"

export interface IAuditLog extends Document {
  userId: mongoose.Types.ObjectId
  entity: string
  entityId: mongoose.Types.ObjectId | string
  action: "create" | "update" | "delete"
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  at: Date
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    entity: { type: String, required: true },
    entityId: { type: Schema.Types.Mixed, required: true },
    action: { type: String, enum: ["create", "update", "delete"], required: true },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
)

const AuditLog: Model<IAuditLog> =
  (mongoose.models.AuditLog as Model<IAuditLog>) ??
  mongoose.model<IAuditLog>("AuditLog", AuditLogSchema)

export default AuditLog
