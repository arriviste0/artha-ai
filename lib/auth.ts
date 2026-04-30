import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import bcrypt from "bcryptjs"
import { connectDB } from "@/lib/db"
import User from "@/models/user"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        await connectDB()
        const user = await User.findOne({ email: (credentials.email as string).toLowerCase() })
        if (!user || !user.passwordHash) return null

        const valid = await bcrypt.compare(credentials.password as string, user.passwordHash)
        if (!valid) return null

        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name ?? user.email,
          image: user.image,
        }
      },
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        await connectDB()
        const existing = await User.findOne({ email: user.email!.toLowerCase() })
        if (!existing) {
          await User.create({
            email: user.email!.toLowerCase(),
            name: user.name ?? undefined,
            image: user.image ?? undefined,
            onboardingCompleted: false,
          })
        }
      }
      return true
    },

    async jwt({ token, user, trigger }) {
      if (user?.email) {
        // Always resolve MongoDB _id on sign-in — user.id from Google is a UUID, not an ObjectId
        await connectDB()
        const dbUser = await User.findOne({ email: user.email.toLowerCase() })
        if (dbUser) {
          token.userId = dbUser._id.toString()
          token.onboardingCompleted = dbUser.onboardingCompleted
        }
      } else if (trigger === "update" || (!token.userId && token.email)) {
        await connectDB()
        const dbUser = await User.findOne({ email: token.email })
        if (dbUser) {
          token.userId = dbUser._id.toString()
          token.onboardingCompleted = dbUser.onboardingCompleted
        }
      }
      return token
    },

    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId as string
        session.user.onboardingCompleted = token.onboardingCompleted as boolean | undefined
      }
      return session
    },
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  session: { strategy: "jwt" },
})
