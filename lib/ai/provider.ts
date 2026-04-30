import { GoogleGenerativeAI } from "@google/generative-ai"

interface GenerateOpts {
  prompt: string
  json: boolean
  provider?: AIProviderName
}

export type AIProviderName = "gemini" | "ollama"

function parseProviderList(value: string | undefined): string[] {
  const withoutComment = (value ?? "gemini")
    .split("#", 1)[0]
    .trim()

  return withoutComment
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function getAIProviderChain(): AIProviderName[] {
  return parseProviderList(process.env.AI_DEFAULT_PROVIDER).filter(
    (name): name is AIProviderName => name === "gemini" || name === "ollama"
  )
}

export function getAIAvailability() {
  const providers = getAIProviderChain()
  return {
    providers,
    geminiReady: providers.includes("gemini") && !!process.env.GEMINI_API_KEY,
    ollamaReady: providers.includes("ollama"),
    available: providers.some((provider) =>
      provider === "gemini" ? !!process.env.GEMINI_API_KEY : true
    ),
  }
}

export function isAIProviderAvailable(provider: AIProviderName): boolean {
  if (provider === "gemini") return !!process.env.GEMINI_API_KEY
  return true
}

async function geminiGenerate({ prompt, json }: GenerateOpts): Promise<string> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error("GEMINI_API_KEY not set")
  const genAI = new GoogleGenerativeAI(key)
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_CHAT_MODEL ?? "gemini-2.0-flash",
    generationConfig: json ? { responseMimeType: "application/json" } : undefined,
  })
  const result = await model.generateContent(prompt)
  return result.response.text()
}

async function ollamaGenerate({ prompt, json }: GenerateOpts): Promise<string> {
  const base = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434"
  const model = process.env.OLLAMA_MODEL ?? "qwen2.5-coder:7b"
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      ...(json ? { format: "json" } : {}),
      stream: false,
    }),
  })
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as { message: { content: string } }
  return data.message.content
}

// Tries each provider in AI_DEFAULT_PROVIDER order, falling back on error.
// Format: "gemini" | "ollama" | "gemini,ollama" | "ollama,gemini"
export async function aiGenerate(opts: GenerateOpts): Promise<string> {
  const chain = opts.provider ? [opts.provider] : getAIProviderChain()

  let lastError: Error | undefined
  for (const name of chain) {
    try {
      if (name === "gemini") return await geminiGenerate(opts)
      if (name === "ollama") return await ollamaGenerate(opts)
    } catch (err) {
      lastError = err as Error
    }
  }
  throw lastError ?? new Error("No AI provider available — check AI_DEFAULT_PROVIDER in .env")
}
