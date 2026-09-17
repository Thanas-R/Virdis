// AUTO-GENERATED from supabase/functions/<name>/index.ts by scripts/gen-vercel-api.mjs
// Do not edit directly - edit the Supabase function and re-run the generator.
export const config = { runtime: "edge" };

type Handler = (req: Request) => Response | Promise<Response>;
let _handler: Handler = () => new Response("not ready", { status: 500 });
const serve = (fn: Handler) => {
  _handler = fn;
};
// Deno.env shim -> Vercel Environment Variables
const Deno = {
  env: {
    get: (key: string): string | undefined => (process.env as Record<string, string | undefined>)[key],
  },
};
void Deno;

// Shared AI client. Google Gemini is the primary (and only required) provider.
//
// Environment variables (Vercel Environment Variables / edge secrets):
//   GEMINI_API_KEY  - required for every AI feature
//   GEMINI_MODEL    - optional, defaults to Gemini 2.5 Pro
//
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Model aliases tried in order when the configured model returns 404. */
const MODEL_FALLBACKS = ["gemini-3.5-flash", "gemini-2.5-pro", "gemini-2.5-flash"];

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


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_STR = 200;
const LANGUAGE_NAMES: Record<string, string> = { en: "English", hi: "Hindi (हिन्दी)", kn: "Kannada (ಕನ್ನಡ)", te: "Telugu (తెలుగు)", ta: "Tamil (தமிழ்)" };
function sanitizeLanguage(v: unknown): string {
  const value = clampStr(v).toLowerCase();
  if (LANGUAGE_NAMES[value]) return LANGUAGE_NAMES[value];
  const allowed = Object.values(LANGUAGE_NAMES);
  return allowed.includes(clampStr(v)) ? clampStr(v) : "English";
}
function validatePolygon(coords: any): string | null {
  if (!Array.isArray(coords) || coords.length < 3) return "Polygon must have at least 3 vertices";
  if (coords.length > 500) return "Polygon exceeds maximum 500 vertices";
  for (const c of coords) {
    if (!Array.isArray(c) || c.length < 2) return "Invalid coordinate pair";
    const [lon, lat] = c;
    if (typeof lon !== "number" || typeof lat !== "number" || !isFinite(lon) || !isFinite(lat)) return "Coordinates must be finite numbers";
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return "Coordinates out of geographic range";
  }
  return null;
}
const clampStr = (v: unknown) => typeof v === "string" ? v.slice(0, MAX_STR) : "";
const clampNum = (v: unknown, min = -1e9, max = 1e9): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
};
function sanitizeNdvi(n: any) {
  if (!n || typeof n !== "object") return null;
  return {
    mean_ndvi: clampNum(n.mean_ndvi, -1, 1),
    min_ndvi: clampNum(n.min_ndvi, -1, 1),
    max_ndvi: clampNum(n.max_ndvi, -1, 1),
    vegetation_health_score: clampNum(n.vegetation_health_score, 0, 100),
  };
}
function sanitizeSoil(s: any) {
  if (!s || typeof s !== "object") return null;
  const cls = s.classification && typeof s.classification === "object"
    ? { soil_class: clampStr(s.classification.soil_class) } : null;
  const tex = s.texture && typeof s.texture === "object" ? {
    usda_class: clampStr(s.texture.usda_class),
    sand_pct: clampNum(s.texture.sand_pct, 0, 100),
    silt_pct: clampNum(s.texture.silt_pct, 0, 100),
    clay_pct: clampNum(s.texture.clay_pct, 0, 100),
  } : null;
  const met = s.metrics && typeof s.metrics === "object" ? {
    ph: clampNum(s.metrics.ph, 0, 14),
    soc_g_per_kg: clampNum(s.metrics.soc_g_per_kg, 0, 1000),
    nitrogen_g_per_kg: clampNum(s.metrics.nitrogen_g_per_kg, 0, 1000),
    cec: clampNum(s.metrics.cec, 0, 10000),
  } : null;
  const wr = s.water_retention && typeof s.water_retention === "object" ? {
    field_capacity_pct: clampNum(s.water_retention.field_capacity_pct, 0, 100),
    wilting_point_pct: clampNum(s.water_retention.wilting_point_pct, 0, 100),
    available_water_pct: clampNum(s.water_retention.available_water_pct, 0, 100),
  } : null;
  return { classification: cls, texture: tex, metrics: met, water_retention: wr };
}
function sanitizeWeather(w: any) {
  if (!w || typeof w !== "object") return null;
  return {
    temperature: clampNum(w.temperature, -100, 100),
    humidity: clampNum(w.humidity, 0, 100),
    windSpeed: clampNum(w.windSpeed, 0, 1000),
  };
}
function sanitizeSuitability(s: any) {
  if (!s || typeof s !== "object") return null;
  const raw = s.raw && typeof s.raw === "object" ? {
    elevation_m: clampNum(s.raw.elevation_m, -500, 10000),
    slope_deg: clampNum(s.raw.slope_deg, 0, 90),
    annual_rainfall_mm: clampNum(s.raw.annual_rainfall_mm, 0, 20000),
  } : null;
  return {
    soil_quality: clampNum(s.soil_quality, 0, 100),
    water_access: clampNum(s.water_access, 0, 100),
    climate: clampNum(s.climate, 0, 100),
    topography: clampNum(s.topography, 0, 100),
    raw,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let {
      fieldName, crop, area, location, coordinates,
      ndviData, soilData, weatherData, suitabilityData, responseLanguage,
    } = await req.json();
    fieldName = clampStr(fieldName);
    crop = clampStr(crop);
    location = clampStr(location);
    area = clampNum(area, 0, 1e7);
    ndviData = sanitizeNdvi(ndviData);
    soilData = sanitizeSoil(soilData);
    weatherData = sanitizeWeather(weatherData);
    suitabilityData = sanitizeSuitability(suitabilityData);
    responseLanguage = sanitizeLanguage(responseLanguage);

    // Validate coordinates if provided
    const coordRing = coordinates?.[0];
    if (coordRing) {
      const polyError = validatePolygon(coordRing);
      if (polyError) {
        return new Response(JSON.stringify({ error: polyError }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Build context for AI
    let context = `**Field:** ${fieldName}\n**Current Crop:** ${crop}\n**Area:** ${area} acres\n**Location:** ${location}\n`;

    if (ndviData) {
      context += `**NDVI:** Mean=${ndviData.mean_ndvi}, Min=${ndviData.min_ndvi}, Max=${ndviData.max_ndvi}, Health=${ndviData.vegetation_health_score}/100\n`;
    }
    if (soilData) {
      context += `**Soil:** Type=${soilData.classification?.soil_class || "Unknown"}, pH=${soilData.metrics?.ph ?? "N/A"}, `;
      context += `Texture=${soilData.texture?.usda_class || "Unknown"} (Sand ${soilData.texture?.sand_pct}%, Silt ${soilData.texture?.silt_pct}%, Clay ${soilData.texture?.clay_pct}%)\n`;
      context += `Organic Carbon=${soilData.metrics?.soc_g_per_kg ?? "N/A"} g/kg, Nitrogen=${soilData.metrics?.nitrogen_g_per_kg ?? "N/A"} g/kg, CEC=${soilData.metrics?.cec ?? "N/A"}\n`;
      if (soilData.water_retention) {
        context += `Water Retention: Field Capacity=${soilData.water_retention.field_capacity_pct}%, Wilting Point=${soilData.water_retention.wilting_point_pct}%, Available Water=${soilData.water_retention.available_water_pct}%\n`;
      }
    }
    if (weatherData) {
      context += `**Weather:** ${weatherData.temperature}°C, ${weatherData.humidity}% humidity, ${weatherData.windSpeed} km/h wind\n`;
    }
    if (suitabilityData) {
      context += `**Suitability Scores:** Soil=${suitabilityData.soil_quality}, Water=${suitabilityData.water_access}, Climate=${suitabilityData.climate}, Topography=${suitabilityData.topography}\n`;
      if (suitabilityData.raw) {
        context += `Elevation=${suitabilityData.raw.elevation_m}m, Slope=${suitabilityData.raw.slope_deg}°, Annual Rainfall=${suitabilityData.raw.annual_rainfall_mm}mm\n`;
      }
    }

    // Calculate field bounding box for zone placement
    const coords = coordinates?.[0] || [];
    const lats = coords.map((c: number[]) => c[1]);
    const lngs = coords.map((c: number[]) => c[0]);
    const bounds = {
      minLat: Math.min(...lats), maxLat: Math.max(...lats),
      minLng: Math.min(...lngs), maxLng: Math.max(...lngs),
    };
    const fieldWidth = bounds.maxLng - bounds.minLng;
    const fieldHeight = bounds.maxLat - bounds.minLat;

    const prompt = `You are an expert agricultural planner. Based on the field data below, create an optimal crop planning layout that splits the field into zones for maximum yield and sustainability.

${context}

**Field Bounds:** ${fieldWidth.toFixed(6)}° wide × ${fieldHeight.toFixed(6)}° tall

Create a JSON response with this EXACT structure (no markdown, pure JSON):
{
  "zones": [
    {
      "id": "zone-1",
      "name": "Zone A - Primary Crop",
      "crop": "Wheat",
      "emoji": "🌾",
      "color": "#22C55E",
      "area_pct": 45,
      "reason": "Best suited for the soil type and pH",
      "spacing_m": 0.15,
      "water_needs": "medium",
      "season": "Rabi (Oct-Mar)",
      "yield_estimate": "3.5 tonnes/ha",
      "position": { "x": 0.25, "y": 0.5 }
    }
  ],
  "intercropping": [
    {
      "primary": "Coconut",
      "secondary": "Turmeric",
      "emoji": "🥥+🟡",
      "benefit": "Coconut shade protects turmeric; turmeric repels pests",
      "spacing": "Coconut 8m apart, turmeric in 1m rows between"
    }
  ],
  "rotation_plan": [
    { "season": "Kharif", "months": "Jun-Oct", "crops": ["Rice", "Mung Bean"] },
    { "season": "Rabi", "months": "Nov-Mar", "crops": ["Wheat", "Mustard"] },
    { "season": "Zaid", "months": "Mar-Jun", "crops": ["Watermelon", "Cucumber"] }
  ],
  "summary": "Brief 2-sentence summary of the plan",
  "tips": ["tip 1", "tip 2", "tip 3"],
  "overall_score": 8.5,
  "water_saving_pct": 25,
  "expected_revenue_increase_pct": 15
}

RULES:
- Create EXACTLY 3 or 4 zones (no more, no less)
- The current crop "${crop}" MUST be one of the zones
- **CRITICAL — AREA ALLOCATION**: Do NOT split equally. The most suitable crop for this specific region should get the LARGEST area (40-55%). The second best gets 20-30%. The third gets 10-20%. A tree zone should be smallest (5-12%). Base area allocation on how well each crop fits the soil, climate, and rainfall of "${location}".
- **ABSOLUTELY CRITICAL — NATIVE PLANTS ONLY**: You MUST only suggest crops, trees, and plants that are ACTUALLY grown and cultivated in the specific region of "${location}". Think carefully about the climate zone, latitude, and agricultural traditions of this EXACT location. For example: Do NOT suggest Coconut in Spain or Europe — Coconut is tropical. Do NOT suggest Rice in arid regions. Do NOT suggest Mango in cold climates. If it's a Mediterranean region, suggest Mediterranean crops (olive, almond, grape, fig, citrus, carob, etc.). If it's tropical, suggest tropical crops. VERIFY each plant is genuinely native or traditionally cultivated in "${location}" before including it.
- Include at least one NATIVE tree species appropriate for "${location}" (e.g. Olive in Mediterranean, Almond in Spain, Mango in tropical India, Neem in arid India, Apple in temperate hills). The tree density should be low (about 1 tree per 60 crop plants).
- Give the tree zone a small area_pct (5-12%) since trees are sparse
- Use VIBRANT, highly distinct colors for each zone — avoid similar shades (e.g. use #EF4444 red, #3B82F6 blue, #16A34A green, #EAB308 yellow, #7C3AED purple, #EC4899 pink — NOT orange/red/brown together)
- Position x,y are normalized 0-1 within the field bounds
- Consider intercropping opportunities (trees with ground crops)
- Include at least 2 intercropping suggestions using ONLY crops native to "${location}"
- Suggest a 3-season rotation plan appropriate for the climate of "${location}" with specific crop names that are ACTUALLY grown there (2-3 crops per season, first crop is highest priority and gets more area). Use local season names if applicable (e.g. Spring/Summer/Winter for temperate, Kharif/Rabi/Zaid for India).
- Mark the current season based on today's date
- Be specific to the region, soil type, and climate
- ZERO TOLERANCE for non-native or climatically inappropriate species. Every single plant you suggest must be verifiably cultivated in "${location}".
- Return ONLY valid JSON, no markdown
- Write every human-facing JSON string (zone names, reasons, benefits, spacing, seasons, summary, tips, and crop explanations) in ${responseLanguage} only. Keep crop names understandable in that language.`;

    const plan = await generateJson(prompt, {
      system: `You are a precision agriculture expert. Return only a valid JSON object matching the requested structure. Do not use markdown, code blocks, or explanation outside JSON. Write all user-facing strings in ${responseLanguage} only. Ground every recommendation in the supplied field measurements and location; never invent a measurement that was not supplied.`,
      temperature: 0.35,
      maxOutputTokens: 4096,
    });

    return new Response(JSON.stringify(plan), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("crop-planning error:", e);
    const aiError = e as AiError;
    const status = typeof aiError?.status === "number" ? aiError.status : 500;
    return new Response(JSON.stringify({ error: aiError?.message || "Crop planning is temporarily unavailable" }), {
      status: status === 404 ? 502 : status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

export default function handler(req: Request) {
  return _handler(req);
}
