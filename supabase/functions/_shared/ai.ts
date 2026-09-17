// Shared AI client. Google Gemini is the primary (and only required) provider.
//
// Environment variables (Vercel Environment Variables / edge secrets):
//   GEMINI_API_KEY  - required for every AI feature
//   GEMINI_MODEL    - optional, defaults to Gemini 2.5 Pro
//
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Model aliases tried in order when the configured model returns 404. */
const MODEL_FALLBACKS = ["gemini-3.5-flash", "gemini-2.5-pro", "gemini-2.5-flash"];

export class AiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function getGeminiKey(): string | undefined {
  const direct = Deno.env.get("GEMINI_API_KEY")
    || Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY")
    || Deno.env.get("GOOGLE_API_KEY");
  if (direct) return direct.trim();
  const generic = Deno.env.get("AI_API_KEY");
  // Google API keys start with "AIza"; do not mistake a Groq key for one.
  if (generic && generic.startsWith("AIza")) return generic;
  return undefined;
}

export function getGeminiModel(): string {
  return Deno.env.get("GEMINI_MODEL") || MODEL_FALLBACKS[0];
}

export function hasAiProvider(): boolean {
  return Boolean(getGeminiKey());
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface GenerateOptions {
  system?: string;
  /** JSON Schema subset supported by Gemini's responseSchema. */
  schema?: Record<string, unknown>;
  json?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
}

/**
 * Calls Gemini and returns raw text.
 * Retries 429/500/503 with exponential backoff. Never uses an artificial
 * request timeout - generation is allowed to take as long as it needs.
 */
export async function generateText(prompt: string, opts: GenerateOptions = {}): Promise<string> {
  const geminiKey = getGeminiKey();
  if (geminiKey) return await callGemini(geminiKey, prompt, opts);

  throw new AiError("Gemini is not configured. Add GEMINI_API_KEY to the Vercel environment and redeploy.", 401);
}

/** Calls the model and parses a JSON object out of the reply. */
export async function generateJson<T = unknown>(prompt: string, opts: GenerateOptions = {}): Promise<T> {
  const raw = await generateText(prompt, { ...opts, json: true });
  return parseJsonLoose<T>(raw);
}

export function parseJsonLoose<T = unknown>(raw: string): T {
  let text = (raw || "").trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(text) as T;
  } catch {
    // Salvage the outermost JSON object / array from surrounding prose.
    const start = text.search(/[[{]/);
    const endObj = text.lastIndexOf("}");
    const endArr = text.lastIndexOf("]");
    const end = Math.max(endObj, endArr);
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1)) as T;
    }
    throw new AiError("The AI returned a response that could not be read as JSON", 502);
  }
}

async function callGemini(apiKey: string, prompt: string, opts: GenerateOptions): Promise<string> {
  const configured = getGeminiModel();
  const models = [configured, ...MODEL_FALLBACKS.filter((m) => m !== configured)];

  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature ?? 0.4,
    maxOutputTokens: opts.maxOutputTokens ?? 8192,
  };
  if (opts.json || opts.schema) {
    generationConfig.responseMimeType = "application/json";
    if (opts.schema) generationConfig.responseSchema = opts.schema;
  }

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig,
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };

  let lastError: AiError | null = null;

  for (const model of models) {
    const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`;
    const delays = [600, 1800, 4000];

    for (let attempt = 0; attempt <= delays.length; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify(body),
        });
      } catch (err) {
        lastError = new AiError(`Could not reach the Gemini API: ${(err as Error)?.message ?? "network error"}`, 503);
        if (attempt < delays.length) { await sleep(delays[attempt]); continue; }
        break;
      }

      if (res.ok) {
        const data = await res.json();
        const candidate = data?.candidates?.[0];
        const text = (candidate?.content?.parts ?? [])
          .map((p: { text?: string }) => p?.text ?? "")
          .join("")
          .trim();
        if (text) return text;
        const reason = candidate?.finishReason || data?.promptFeedback?.blockReason || "empty response";
        lastError = new AiError(`Gemini returned no content (${reason})`, 502);
        break;
      }

      const errText = await res.text().catch(() => "");
      if (res.status === 404) {
        // Model alias not available on this key - try the next alias.
        lastError = new AiError(`Model "${model}" is not available for this API key`, 404);
        break;
      }
      if (res.status === 401 || res.status === 403) {
        throw new AiError("The Gemini API key was rejected. Check the Gemini key in Vercel and redeploy.", 401);
      }
      if (res.status === 400) {
        throw new AiError(`Gemini rejected the request: ${errText.slice(0, 300)}`, 400);
      }
      if (res.status === 429 || res.status >= 500) {
        lastError = new AiError(
          res.status === 429
            ? "Gemini rate limit reached. Please try again in a moment."
            : `Gemini service error (${res.status})`,
          res.status === 429 ? 429 : 502,
        );
        if (attempt < delays.length) { await sleep(delays[attempt]); continue; }
        break;
      }
      lastError = new AiError(`Gemini error ${res.status}: ${errText.slice(0, 200)}`, 502);
      break;
    }
  }

  throw lastError ?? new AiError("Gemini request failed", 502);
}

