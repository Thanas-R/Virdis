// AUTO-GENERATED from supabase/functions/<name>/index.ts by scripts/gen-vercel-api.mjs
// Do not edit directly - edit the Supabase function and re-run the generator.
export const config = { runtime: "edge" };

type Handler = (req: Request) => Response | Promise<Response>;
let _handler: Handler = () => new Response("not ready", { status: 500 });
const serve = (fn: Handler) => {
  _handler = fn;
};
// Deno.env shim -> Vercel Environment Variables.
// Each variable is referenced STATICALLY: the Vercel Edge runtime only inlines
// env vars it can see at build time, so a dynamic process.env[key] lookup
// returns undefined in production.
const _ENV: Record<string, string | undefined> = {
  AI_API_KEY: process.env.AI_API_KEY,
  GEE_PROJECT_ID: process.env.GEE_PROJECT_ID,
  GEE_SERVICE_ACCOUNT_JSON: process.env.GEE_SERVICE_ACCOUNT_JSON,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  MAPBOX_TOKEN: process.env.MAPBOX_TOKEN,
  SUPABASE_URL: process.env.SUPABASE_URL,
};
const Deno = {
  env: {
    get: (key: string): string | undefined =>
      _ENV[key] ?? (process.env as Record<string, string | undefined>)[key],
  },
};
void Deno;

import { GoogleGenAI } from "@google/genai";

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

class AiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function getGeminiKey(): string | undefined {
  const direct = Deno.env.get("GEMINI_API_KEY")
    || Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY")
    || Deno.env.get("GOOGLE_API_KEY");
  if (direct) return direct.trim();
  const generic = Deno.env.get("AI_API_KEY");
  // Google API keys start with "AIza"; do not mistake a Groq key for one.
  if (generic && generic.startsWith("AIza")) return generic;
  return undefined;
}

function getGeminiModel(): string {
  return Deno.env.get("GEMINI_MODEL") || MODEL_FALLBACKS[0];
}

function hasAiProvider(): boolean {
  return Boolean(getGeminiKey());
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface GenerateOptions {
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

function parseJsonLoose<T = unknown>(raw: string): T {
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


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_CROPS = 250;

function clampStr(v: unknown, max = 500): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function clampCoord(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

function normalizeCrop(value: unknown, allowedCrops: string[]): string {
  const crop = clampStr(value, 80).trim();
  return allowedCrops.find((c) => c.toLowerCase() === crop.toLowerCase()) || "Wheat";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const location = clampStr(body.location, 500);
    const lng = clampCoord(body.lng, -180, 180);
    const lat = clampCoord(body.lat, -90, 90);
    const allowedCrops = Array.isArray(body.allowedCrops)
      ? body.allowedCrops.map((c: unknown) => clampStr(c, 80).trim()).filter(Boolean).slice(0, MAX_CROPS)
      : [];

    if (!allowedCrops.includes("Wheat")) allowedCrops.unshift("Wheat");

    const prompt = `Pick the single most likely suitable crop or agricultural land use for a newly drawn rural region. Use the exact crop name from this allowed list only. If uncertain, return Wheat.\n\nLocation: ${location || "Unknown"}\nCenter: ${lat ?? "unknown"}, ${lng ?? "unknown"}\nAllowed crops: ${allowedCrops.join(", ")}\n\nRespond as compact JSON only: {"crop":"Wheat"}`;
    const parsed = await generateJson<{ crop?: string }>(prompt, {
      system: "You are an agronomy assistant. Return only a valid JSON object and choose exactly one crop from the provided allowed list.",
      temperature: 0.2,
      maxOutputTokens: 256,
    });
    return new Response(JSON.stringify({ crop: normalizeCrop(parsed.crop, allowedCrops) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("guess-crop error:", e);
    return new Response(JSON.stringify({ crop: "Wheat", fallback: true, error: e instanceof Error ? e.message : "Unknown error" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

export default function handler(req: Request) {
  return _handler(req);
}
