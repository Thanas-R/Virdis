import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

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

    const FALLBACK_AI_KEY = Deno.env.get("AI_API_KEY");
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") ?? (FALLBACK_AI_KEY?.startsWith("gsk_") ? FALLBACK_AI_KEY : undefined);
    if (!GROQ_API_KEY) return new Response(JSON.stringify({ crop: "Wheat", fallback: true, error: "GROQ_API_KEY not configured" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const prompt = `Pick the single most likely suitable crop or agricultural land use for a newly drawn rural region. Use the exact crop name from this allowed list only. If uncertain, return Wheat.\n\nLocation: ${location || "Unknown"}\nCenter: ${lat ?? "unknown"}, ${lng ?? "unknown"}\nAllowed crops: ${allowedCrops.join(", ")}\n\nRespond as compact JSON only: {"crop":"Wheat"}`;

    const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("GROQ_MODEL") || "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: "You are an agronomy assistant. Return only valid JSON and choose exactly one crop from the provided allowed list." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 80,
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) throw new Error(`Groq HTTP ${aiRes.status}`);
    const aiJson = await aiRes.json();
    const content = aiJson?.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    return new Response(JSON.stringify({ crop: normalizeCrop(parsed.crop, allowedCrops) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("guess-crop error:", e);
    return new Response(JSON.stringify({ crop: "Wheat", fallback: true, error: e instanceof Error ? e.message : "Unknown error" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
