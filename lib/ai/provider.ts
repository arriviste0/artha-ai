import Groq from "groq-sdk"

export interface GenerateOpts {
  prompt: string
  systemPrompt?: string
  temperature?: number
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

function cleanConfig(val?: string): string {
  if (!val) return ""
  return val.split("#", 1)[0].trim()
}

export function isAIProviderAvailable(provider: AIProviderName): boolean {
  if (provider === "groq") return !!cleanConfig(process.env.GROQ_API_KEY)
  return true
}

async function groqGenerate(opts: GenerateOpts): Promise<string> {
  const key = cleanConfig(process.env.GROQ_API_KEY)
  if (!key) throw new Error("GROQ_API_KEY not set")
  const groq = new Groq({ apiKey: key })

  const model = cleanConfig(process.env.GROQ_MODEL) || "openai/gpt-oss-120b"

  const messages: Array<{ role: "system" | "user"; content: string }> = []
  const systemPrompt =
    opts.systemPrompt ||
    (opts.json
      ? "You are a financial AI assistant. You must respond strictly with valid JSON only. Do not include markdown codeblocks or conversational text."
      : undefined)

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt })
  }
  messages.push({ role: "user", content: opts.prompt })

  try {
    const completion = await groq.chat.completions.create({
      model,
      messages,
      temperature: opts.temperature ?? 0,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    })

    const content = completion.choices[0]?.message?.content ?? ""
    if (opts.json && !content.trim()) {
      throw new Error("Empty response from Groq JSON mode")
    }
    return content
  } catch (err: unknown) {
    const errStr = String(err)
    // If Groq JSON mode validation failed (common with reasoning models like openai/gpt-oss-120b when outputting reasoning tokens),
    // retry once without response_format constraint and parse JSON from the response text
    if (
      opts.json &&
      (errStr.includes("json_validate_failed") ||
        errStr.includes("Failed to validate JSON") ||
        errStr.includes("Empty response"))
    ) {
      try {
        const retryCompletion = await groq.chat.completions.create({
          model,
          messages: [
            {
              role: "system",
              content:
                "You are a financial AI. Output MUST be a valid JSON object only. No markdown formatting, no conversational text.",
            },
            {
              role: "user",
              content: opts.prompt + "\n\nCRITICAL: Respond with a pure JSON object only.",
            },
          ],
          temperature: 0,
        })
        const text = retryCompletion.choices[0]?.message?.content ?? ""
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          return jsonMatch[0]
        }
        return text
      } catch (retryErr) {
        throw retryErr
      }
    }
    throw err
  }
}

async function ollamaGenerate(opts: GenerateOpts): Promise<string> {
  const base = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434"
  const model = process.env.OLLAMA_MODEL ?? "qwen2.5-coder:7b"
  const messages: Array<{ role: "system" | "user"; content: string }> = []
  if (opts.systemPrompt) {
    messages.push({ role: "system", content: opts.systemPrompt })
  }
  messages.push({ role: "user", content: opts.prompt })

  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      options: opts.temperature !== undefined ? { temperature: opts.temperature } : undefined,
      ...(opts.json ? { format: "json" } : {}),
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

  const errors: string[] = []
  for (const name of chain) {
    try {
      if (name === "groq") return await groqGenerate(opts)
      if (name === "ollama") return await ollamaGenerate(opts)
    } catch (err) {
      errors.push(`${name}: ${(err as Error).message}`)
    }
  }
  throw new Error(`AI generation failed. Errors: ${errors.join(" | ")}`)
}
