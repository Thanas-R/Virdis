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

    const prompt = `You are an expert agricultural analyst. Analyze this field and provide actionable insights.

**Field Data:**
- Name: ${fieldName}
- Crop: ${crop}
- Area: ${area} acres
- Location: ${location}
- Current Temperature: ${temperature}°C
- Humidity: ${humidity}%
- Wind Speed: ${windSpeed} km/h
- Estimated Soil Moisture: ${soilMoisture || "N/A"}%
- Estimated NDVI: ${ndviEstimate || "0.55"}

Provide analysis in this EXACT markdown format:

## Vegetation Health (NDVI/EVI Analysis)
[2-3 sentences about vegetation health based on NDVI estimate, what the value means for ${crop}]

## Water Stress Assessment
[2-3 sentences about water stress risk based on humidity, temperature, soil moisture]

## Growth Stage Classification
[Estimate current growth stage for ${crop} based on season and conditions]

## Land Suitability Score
**Score: X/10**
[Brief justification. Consider soil, climate, crop match]

## Alternative Crop Recommendations
[List 3-4 crops that could also thrive in this region with brief reasoning]

## Risk Factors
- [Risk 1]
- [Risk 2]
- [Risk 3]

## Opportunities
- [Opportunity 1]
- [Opportunity 2]

## Key Metrics Summary
| Metric | Value | Status |
|--------|-------|--------|
| NDVI | ${ndviEstimate || "0.55"} | [Good/Fair/Poor] |
| Water Stress | [Low/Medium/High] | [emoji] |
| Growth Rate | [estimate] | [status] |
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
