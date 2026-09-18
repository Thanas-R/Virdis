import { GoogleGenAI } from "npm:@google/genai";

// Shared AI client. Google Gemini is the primary (and only required) provider.
//
// Environment variables (Vercel Environment Variables / edge secrets):
//   GEMINI_API_KEY  - required for every AI feature
//   GEMINI_MODEL    - optional, defaults to Gemini 2.5 Pro
//
/** Model aliases tried in order when the configured model returns 404. */
const MODEL_FALLBACKS = [
  "gemini-3.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
];

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
  const ai = new GoogleGenAI({ apiKey });
  const configured = getGeminiModel();
  const models = [configured, ...MODEL_FALLBACKS.filter((m) => m !== configured)];
  let lastError: AiError | null = null;

  for (const model of models) {
    const delays = [600, 1800, 4000];

    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            ...(opts.system ? { systemInstruction: opts.system } : {}),
            temperature: opts.temperature ?? 0.4,
            maxOutputTokens: opts.maxOutputTokens ?? 8192,
            ...(opts.json || opts.schema ? { responseMimeType: "application/json" } : {}),
            ...(opts.schema ? { responseJsonSchema: opts.schema } : {}),
          },
        });
        const text = response.text?.trim();
        if (text) return text;
        lastError = new AiError("Gemini returned no content", 502);
        break;
      } catch (err) {
        const sdkError = err as { status?: number; code?: number; message?: string };
        const status = Number(sdkError?.status ?? sdkError?.code) || 502;
        const message = sdkError?.message || "Gemini request failed";
        if (status === 404) {
          lastError = new AiError(message, 404);
          break;
        }
        if (status === 401 || status === 403 || status === 400) {
          throw new AiError(message, status);
        }
        lastError = new AiError(message, status === 429 ? 429 : 502);
        if ((status === 429 || status >= 500) && attempt < delays.length) {
          await sleep(delays[attempt]);
          continue;
        }
        break;
      }
    }
  }

  throw lastError ?? new AiError("Gemini request failed", 502);
}

