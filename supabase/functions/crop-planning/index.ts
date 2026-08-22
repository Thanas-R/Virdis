import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_STR = 200;
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
      ndviData, soilData, weatherData, suitabilityData,
    } = await req.json();
    fieldName = clampStr(fieldName);
    crop = clampStr(crop);
    location = clampStr(location);
    area = clampNum(area, 0, 1e7);
    ndviData = sanitizeNdvi(ndviData);
    soilData = sanitizeSoil(soilData);
    weatherData = sanitizeWeather(weatherData);
    suitabilityData = sanitizeSuitability(suitabilityData);

    // Validate coordinates if provided
    const coordRing = coordinates?.[0];
    if (coordRing) {
      const polyError = validatePolygon(coordRing);
      if (polyError) {
        return new Response(JSON.stringify({ error: polyError }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // AI gateway credentials: prefer AI_API_KEY, fall back to the platform-managed key name
    const AI_API_KEY = Deno.env.get("AI_API_KEY") ?? Deno.env.get("OPENROUTER_API_KEY") ?? Deno.env.get(atob("TE9WQUJMRV9BUElfS0VZ"));
    if (!AI_API_KEY) throw new Error("AI_API_KEY not configured");
    // OpenRouter keys start with "sk-or-" and must go to OpenRouter, not the Lovable gateway.
    const IS_OPENROUTER = AI_API_KEY.startsWith("sk-or-");
    const AI_URL = Deno.env.get("AI_GATEWAY_URL") ??
      (IS_OPENROUTER
        ? "https://openrouter.ai/api/v1/chat/completions"
        : atob("aHR0cHM6Ly9haS5nYXRld2F5LmxvdmFibGUuZGV2L3YxL2NoYXQvY29tcGxldGlvbnM="));

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
- Return ONLY valid JSON, no markdown`;

    const response = await fetch(AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        "Content-Type": "application/json",
        ...(IS_OPENROUTER ? { "HTTP-Referer": "https://lovable.dev", "X-Title": "Field Analytics" } : {}),
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: "You are a precision agriculture expert. Return ONLY valid JSON. No markdown formatting, no code blocks, no explanation text." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Usage limit reached - the AI account is out of credits" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 401 || response.status === 403) {
        return new Response(JSON.stringify({ error: `AI key rejected (${response.status}). Check AI_API_KEY matches its provider.` }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiData = await response.json();
    let content = aiData.choices?.[0]?.message?.content || "";

    // Clean markdown code blocks if present
    content = content.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

    let plan;
    try {
      plan = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response:", content.substring(0, 500));
      throw new Error("AI returned invalid JSON");
    }

    return new Response(JSON.stringify(plan), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("crop-planning error:", e);
    return new Response(JSON.stringify({ error: "An internal error occurred while generating the plan" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
