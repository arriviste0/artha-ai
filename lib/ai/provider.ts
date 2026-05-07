import Groq from "groq-sdk"

interface GenerateOpts {
  prompt: string
  json: boolean
  provider?: AIProviderName
}

export type AIProviderName = "groq" | "ollama"

function parseProviderList(value: string | undefined): string[] {
  const withoutComment = (value ?? "groq")
    .split("#", 1)[0]
    .trim()

  return withoutComment
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function getAIProviderChain(): AIProviderName[] {
  return parseProviderList(process.env.AI_DEFAULT_PROVIDER).filter(
    (name): name is AIProviderName => name === "groq" || name === "ollama"
  )
}

export function getAIAvailability() {
  const providers = getAIProviderChain()
  return {
    providers,
    groqReady: providers.includes("groq") && !!process.env.GROQ_API_KEY,
    ollamaReady: providers.includes("ollama"),
    available: providers.some((provider) =>
      provider === "groq" ? !!process.env.GROQ_API_KEY : true
    ),
  }
}

export function isAIProviderAvailable(provider: AIProviderName): boolean {
  if (provider === "groq") return !!process.env.GROQ_API_KEY
  return true
}

async function groqGenerate({ prompt, json }: GenerateOpts): Promise<string> {
  const key = process.env.GROQ_API_KEY
  if (!key) throw new Error("GROQ_API_KEY not set")
  const groq = new Groq({ apiKey: key })

  const completion = await groq.chat.completions.create({
    model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    ...(json ? { response_format: { type: "json_object" } } : {}),
  })

  return completion.choices[0]?.message?.content ?? ""
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
// Format: "groq" | "ollama" | "groq,ollama" | "ollama,groq"
export async function aiGenerate(opts: GenerateOpts): Promise<string> {
  const chain = opts.provider ? [opts.provider] : getAIProviderChain()

  let lastError: Error | undefined
  for (const name of chain) {
    try {
      if (name === "groq") return await groqGenerate(opts)
      if (name === "ollama") return await ollamaGenerate(opts)
    } catch (err) {
      lastError = err as Error
    }
  }
  throw lastError ?? new Error("No AI provider available — check AI_DEFAULT_PROVIDER in .env")
}
