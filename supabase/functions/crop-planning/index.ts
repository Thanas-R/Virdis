import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      fieldName, crop, area, location, coordinates,
      ndviData, soilData, weatherData, suitabilityData,
    } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

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
      "area_pct": 40,
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
- **ABSOLUTELY CRITICAL — NATIVE PLANTS ONLY**: You MUST only suggest crops, trees, and plants that are ACTUALLY grown and cultivated in the specific region of "${location}". Think carefully about the climate zone, latitude, and agricultural traditions of this EXACT location. For example: Do NOT suggest Coconut in Spain or Europe — Coconut is tropical. Do NOT suggest Rice in arid regions. Do NOT suggest Mango in cold climates. If it's a Mediterranean region, suggest Mediterranean crops (olive, almond, grape, fig, citrus, carob, etc.). If it's tropical, suggest tropical crops. VERIFY each plant is genuinely native or traditionally cultivated in "${location}" before including it.
- Include at least one NATIVE tree species appropriate for "${location}" (e.g. Olive in Mediterranean, Almond in Spain, Mango in tropical India, Neem in arid India, Apple in temperate hills). The tree density should be low (about 1 tree per 60 crop plants).
- Give the tree zone a small area_pct (5-12%) since trees are sparse
- Use VIBRANT, highly distinct colors for each zone — avoid similar shades (e.g. use #EF4444 red, #3B82F6 blue, #16A34A green, #EAB308 yellow, #7C3AED purple, #EC4899 pink — NOT orange/red/brown together)
- Position x,y are normalized 0-1 within the field bounds
- Consider intercropping opportunities (trees with ground crops)
- Include at least 2 intercropping suggestions using ONLY crops native to "${location}"
- Suggest a 3-season rotation plan appropriate for the climate of "${location}" with specific crop names that are ACTUALLY grown there (2-3 crops per season, first crop is highest priority). Use local season names if applicable (e.g. Spring/Summer/Winter for temperate, Kharif/Rabi/Zaid for India).
- Mark the current season based on today's date
- Be specific to the region, soil type, and climate
- ZERO TOLERANCE for non-native or climatically inappropriate species. Every single plant you suggest must be verifiably cultivated in "${location}".
- Return ONLY valid JSON, no markdown`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
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
      if (response.status === 402) return new Response(JSON.stringify({ error: "Usage limit reached" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
