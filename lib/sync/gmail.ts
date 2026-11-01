import { buildGmailQuery, getAllBankEmailSenders } from "./config"
import type { ISyncConnection } from "@/models/sync-connection"

interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  scope: string
}

export function getRedirectUri(origin: string): string {
  // Use NEXTAUTH_URL if set, else origin
  const base = process.env.NEXTAUTH_URL || origin
  return `${base.replace(/\/+$/, "")}/api/sync/gmail/callback`
}

export function getGmailAuthUrl(origin: string, state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not configured")

  const redirectUri = getRedirectUri(origin)
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/gmail.readonly email",
    access_type: "offline",
    prompt: "consent",
    state,
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function exchangeGmailCode(code: string, origin: string): Promise<GoogleTokenResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error("Google OAuth credentials not configured")

  const redirectUri = getRedirectUri(origin)
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  })

  if (!res.ok) {
    const errorBody = await res.text()
    throw new Error(`Failed to exchange Google OAuth code: ${errorBody}`)
  }

  return (await res.json()) as GoogleTokenResponse
}

export async function getGmailUserEmail(accessToken: string): Promise<string | undefined> {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (res.ok) {
      const data = (await res.json()) as { email?: string }
      return data.email
    }
  } catch {
    // ignore
  }
  return undefined
}

export async function getValidAccessToken(connection: ISyncConnection): Promise<string> {
  const now = new Date()
  const isExpired = !connection.tokenExpiresAt || connection.tokenExpiresAt <= new Date(now.getTime() + 60000)

  if (!isExpired && connection.accessToken) {
    return connection.accessToken
  }

  if (!connection.refreshToken) {
    throw new Error("No refresh token available. Please reconnect Gmail.")
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error("Google OAuth credentials missing")

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: connection.refreshToken,
      grant_type: "refresh_token",
    }),
  })

  if (!res.ok) {
    throw new Error("Failed to refresh Gmail access token. Reconnection required.")
  }

  const data = (await res.json()) as GoogleTokenResponse
  connection.accessToken = data.access_token
  connection.tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000)
  if (data.refresh_token) {
    connection.refreshToken = data.refresh_token
  }
  await connection.save()

  return data.access_token
}

export async function revokeGmailToken(token?: string): Promise<void> {
  if (!token) return
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    })
  } catch {
    // Ignore revoke errors
  }
}

// Decode base64url encoded email body
function decodeBase64Url(data?: string): string {
  if (!data) return ""
  try {
    const base64 = data.replace(/-/g, "+").replace(/_/g, "/")
    return Buffer.from(base64, "base64").toString("utf-8")
  } catch {
    return ""
  }
}

interface GmailPart {
  mimeType: string
  body?: { data?: string }
  parts?: GmailPart[]
}

export function cleanHtmlToText(rawHtml: string): string {
  return rawHtml
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
}

function extractTextFromParts(parts?: GmailPart[]): string {
  if (!parts) return ""
  let text = ""
  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      text += " " + decodeBase64Url(part.body.data)
    } else if (part.mimeType === "text/html" && part.body?.data) {
      const rawHtml = decodeBase64Url(part.body.data)
      text += " " + cleanHtmlToText(rawHtml)
    } else if (part.parts) {
      text += " " + extractTextFromParts(part.parts)
    }
  }
  return text
}

export interface BankEmailItem {
  id: string
  subject: string
  snippet: string
  bodyText: string
  date: Date
}

/**
 * Fetch bank transaction alert emails from Gmail for the given date range.
 * Note: Body text is parsed in memory and NEVER stored in the database.
 */
export async function fetchBankEmails(
  accessToken: string,
  fromDate: Date,
  maxMessages = 300
): Promise<BankEmailItem[]> {
  const query = buildGmailQuery(fromDate, getAllBankEmailSenders())
  const messageRefs: Array<{ id: string }> = []
  let pageToken: string | undefined = undefined

  do {
    const pageParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=100${pageParam}`

    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!listRes.ok) {
      const errorText = await listRes.text()
      console.error("Gmail list error:", listRes.status, errorText)
      if (errorText.includes("SERVICE_DISABLED") || errorText.includes("accessNotConfigured")) {
        throw new Error("GMAIL_API_DISABLED: Gmail API is not enabled in your Google Cloud Console project.")
      }
      if (
        errorText.includes("insufficientPermissions") ||
        errorText.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT")
      ) {
        throw new Error("INSUFFICIENT_SCOPES: Gmail read permission has not been granted. Please connect Gmail.")
      }
      if (listRes.status === 401) {
        throw new Error("UNAUTHORIZED: Gmail session expired. Please reconnect Gmail.")
      }
      throw new Error(`Gmail API error (${listRes.status}): ${listRes.statusText || errorText}`)
    }

    const listData = (await listRes.json()) as { messages?: Array<{ id: string }>; nextPageToken?: string }
    if (listData.messages && listData.messages.length > 0) {
      messageRefs.push(...listData.messages)
    }
    pageToken = listData.nextPageToken
  } while (pageToken && messageRefs.length < maxMessages)

  if (messageRefs.length === 0) {
    return []
  }

  // Deduplicate message IDs if any overlap across pages
  const uniqueMessageRefs = Array.from(new Map(messageRefs.map((m) => [m.id, m])).values()).slice(0, maxMessages)

  // Fetch details for up to maxMessages in parallel chunks
  const items: BankEmailItem[] = []
  const CHUNK_SIZE = 15

  for (let i = 0; i < uniqueMessageRefs.length; i += CHUNK_SIZE) {
    const chunk = uniqueMessageRefs.slice(i, i + CHUNK_SIZE)
    const fetched = await Promise.all(
      chunk.map(async (msgRef) => {
        try {
          const detailRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgRef.id}?format=full`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          )
          if (!detailRes.ok) return null
          const data = (await detailRes.json()) as {
            id: string
            snippet?: string
            internalDate?: string
            payload?: {
              headers?: Array<{ name: string; value: string }>
              body?: { data?: string }
              parts?: GmailPart[]
            }
          }

          const headers = data.payload?.headers || []
          const subject = headers.find((h) => h.name.toLowerCase() === "subject")?.value || ""
          const dateHeader = headers.find((h) => h.name.toLowerCase() === "date")?.value

          let date = new Date()
          if (data.internalDate) {
            date = new Date(parseInt(data.internalDate, 10))
          } else if (dateHeader) {
            const parsed = new Date(dateHeader)
            if (!isNaN(parsed.getTime())) date = parsed
          }

          let bodyText = decodeBase64Url(data.payload?.body?.data)
          if (bodyText) {
            bodyText = cleanHtmlToText(bodyText)
          } else if (data.payload?.parts) {
            bodyText = extractTextFromParts(data.payload.parts)
          }

          // Do NOT prepend snippet before bodyText if bodyText exists!
          // Google snippets frequently truncate right before critical numbers
          // (e.g. "... UPI transaction reference no.:"), causing snippet words
          // to collide with the start of bodyText and corrupt regex matching.
          const textContent =
            bodyText && bodyText.trim().length > 0
              ? bodyText
              : (data.snippet || "")

          return {
            id: data.id,
            subject,
            snippet: data.snippet || "",
            bodyText: `${subject} ${textContent}`.replace(/\s+/g, " ").trim(),
            date,
          }
        } catch {
          return null
        }
      })
    )

    for (const item of fetched) {
      if (item) items.push(item)
    }
  }

  return items
}
