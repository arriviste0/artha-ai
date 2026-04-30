import mongoose from "mongoose"

const MONGODB_URI = process.env.MONGODB_URI!

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI environment variable is not set")
}

interface MongooseCache {
  conn: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

// Next.js hot-reload safe global cache
const globalWithCache = global as typeof globalThis & { _mongoose?: MongooseCache }

const cached: MongooseCache = globalWithCache._mongoose ?? { conn: null, promise: null }
globalWithCache._mongoose = cached

export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    })
  }

  cached.conn = await cached.promise
  return cached.conn
}

export default connectDB
