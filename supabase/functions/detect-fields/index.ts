import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageBase64, bounds, zoom } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    if (!imageBase64 || !bounds) {
      throw new Error("Missing imageBase64 or bounds");
    }

    const { north, south, east, west } = bounds;

    const prompt = `You are a precision agriculture GIS expert. Analyze this satellite image and detect all agricultural field boundaries visible.

The image covers this bounding box:
- North: ${north}°, South: ${south}°, East: ${east}°, West: ${west}°
- Zoom level: ${zoom || 15}

TASK: Identify every distinct agricultural field/parcel in this image. For each field:
1. Trace the boundary as a polygon
2. Estimate what crop/land use it contains
3. Estimate NDVI health (0-1 scale)

Return ONLY valid JSON (no markdown, no code blocks) in this exact format:
{
  "fields": [
    {
      "name": "Field 1",
      "crop": "wheat",
      "cropEmoji": "🌾",
      "ndviEstimate": 0.65,
      "color": "#4CAF50",
      "coordinates": [[lng1, lat1], [lng2, lat2], [lng3, lat3], [lng4, lat4]]
    }
  ],
  "summary": "Brief description of what was detected"
}

CRITICAL coordinate rules:
- Coordinates must be [longitude, latitude] pairs
- All coordinates must fall within the bounding box: lng between ${west} and ${east}, lat between ${south} and ${north}
- Each field must have at least 4 coordinate pairs forming a closed polygon
- Make polygons follow the actual field edges visible in the image
- Assign distinct colors to each field: use greens (#2E7D32, #4CAF50, #8BC34A), golds (#F9A825, #FFB300), browns (#8D6E63, #A1887F)

If no fields are clearly visible, return {"fields": [], "summary": "No clear field boundaries detected"}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: { url: `data:image/png;base64,${imageBase64}` },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || "";

    // Strip markdown code blocks if present
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response:", content);
      parsed = { fields: [], summary: "Failed to parse detection results" };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("detect-fields error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
