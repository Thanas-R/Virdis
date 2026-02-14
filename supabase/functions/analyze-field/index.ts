import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { fieldName, crop, area, location, temperature, humidity, windSpeed, soilMoisture, ndviEstimate } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const prompt = `You are a concise agricultural analyst. Give a SHORT, pin-point analysis for this field. Use simple language.

**Field:** ${fieldName} | **Crop:** ${crop} | **Area:** ${area} acres | **Location:** ${location}
**Weather:** ${temperature}°C, ${humidity}% humidity, ${windSpeed} km/h wind
**Soil Moisture:** ${soilMoisture || "N/A"}% | **NDVI Estimate:** ${ndviEstimate || "0.55"}

Respond in this EXACT format (keep each section to 1-2 sentences max):

## Vegetation Health
[Quick assessment of NDVI ${ndviEstimate || "0.55"} for ${crop}. Is it healthy or concerning?]

## Water Stress
[Low/Medium/High risk? One sentence why.]

## Growth Stage
[Estimated current stage for ${crop} this time of year]

## Land Suitability
**Score: X/10** — [One line justification]

## Alternative Crops
- [Crop 1] — [why]
- [Crop 2] — [why]
- [Crop 3] — [why]

## Rainfall Forecast Risk
[Which days this week have highest rain probability? Any extreme weather alerts? Tips for farmers to prevent crop loss.]

## Key Risks
- [Risk 1]
- [Risk 2]

## Summary Table
| Metric | Value | Status |
|--------|-------|--------|
| NDVI | ${ndviEstimate || "0.55"} | [Good/Fair/Poor] |
| Water Stress | [Low/Med/High] | [emoji] |
| Yield Potential | [estimate] | [status] |`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a precision agriculture expert. Provide data-driven, actionable insights. Use markdown formatting. Be specific with numbers and recommendations." },
          { role: "user", content: prompt },
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
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const analysis = data.choices?.[0]?.message?.content || "Analysis unavailable.";

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-field error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
