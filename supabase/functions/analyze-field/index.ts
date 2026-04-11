import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── GEE Auth ──────────────────────────────────────────────────────

function base64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function createJwt(email: string, privateKeyPem: string, scopes: string[]): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = { iss: email, scope: scopes.join(" "), aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 };
  const enc = new TextEncoder();
  const headerB64 = base64url(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64url(enc.encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;
  const pemBody = privateKeyPem.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s/g, "");
  const keyBytes = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", keyBytes, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(unsignedToken)));
  return `${unsignedToken}.${base64url(sig)}`;
}

async function getGeeAccessToken(): Promise<string> {
  const raw = Deno.env.get("GEE_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("GEE_SERVICE_ACCOUNT_JSON secret not configured");
  const sa = JSON.parse(raw);
  const jwt = await createJwt(sa.client_email, sa.private_key, ["https://www.googleapis.com/auth/earthengine"]);
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!resp.ok) { const t = await resp.text(); throw new Error(`OAuth failed: ${t}`); }
  return (await resp.json()).access_token;
}

// ── GEE Expression helpers ───────────────────────────────────────

function flattenExpression(nested: any): { values: Record<string, any>; result: string } {
  const values: Record<string, any> = {};
  let counter = 0;
  function flatten(node: any): string {
    if (node === null || node === undefined) {
      const k = `_${counter++}`; values[k] = { constantValue: null }; return k;
    }
    if (node.functionInvocationValue) {
      const fiv = node.functionInvocationValue;
      const flatArgs: Record<string, any> = {};
      for (const [argName, argVal] of Object.entries(fiv.arguments || {})) {
        flatArgs[argName] = { valueReference: flatten(argVal as any) };
      }
      const k = `_${counter++}`;
      values[k] = { functionInvocationValue: { functionName: fiv.functionName, arguments: flatArgs } };
      return k;
    }
    if ("constantValue" in node) {
      const k = `_${counter++}`; values[k] = { constantValue: node.constantValue }; return k;
    }
    const k = `_${counter++}`; values[k] = { constantValue: node }; return k;
  }
  return { values, result: flatten(nested) };
}

// ── GEE NDVI image builder ───────────────────────────────────────

function buildNdviImage(coords: [number, number][], startDate: string, endDate: string) {
  // Construct a proper GEE Geometry using GeometryConstructors.Polygon
  const geometry = {
    functionInvocationValue: {
      functionName: "GeometryConstructors.Polygon",
      arguments: {
        coordinates: { constantValue: [coords] },
        geodesic: { constantValue: false },
        evenOdd: { constantValue: true },
      },
    },
  };

  const collection = {
    functionInvocationValue: {
      functionName: "ImageCollection.load",
      arguments: { id: { constantValue: "COPERNICUS/S2_SR" } },
    },
  };

  // Filter by date
  const dateFiltered = {
    functionInvocationValue: {
      functionName: "Collection.filter",
      arguments: {
        collection,
        filter: {
          functionInvocationValue: {
            functionName: "Filter.dateRangeContains",
            arguments: {
              leftValue: {
                functionInvocationValue: {
                  functionName: "DateRange",
                  arguments: {
                    start: { constantValue: startDate },
                    end: { constantValue: endDate },
                  },
                },
              },
              rightField: { constantValue: "system:time_start" },
            },
          },
        },
      },
    },
  };

  // Filter by bounds using the polygon geometry
  const boundsFiltered = {
    functionInvocationValue: {
      functionName: "Collection.filter",
      arguments: {
        collection: dateFiltered,
        filter: {
          functionInvocationValue: {
            functionName: "Filter.intersects",
            arguments: {
              leftField: { constantValue: ".geo" },
              rightValue: geometry,
            },
          },
        },
      },
    },
  };

  // Filter by cloud cover < 20%
  const cloudFiltered = {
    functionInvocationValue: {
      functionName: "Collection.filter",
      arguments: {
        collection: boundsFiltered,
        filter: {
          functionInvocationValue: {
            functionName: "Filter.lessThan",
            arguments: {
              leftField: { constantValue: "CLOUDY_PIXEL_PERCENTAGE" },
              rightValue: { constantValue: 20 },
            },
          },
        },
      },
    },
  };

  // Sort by cloud cover ascending, take 1 (least cloudy)
  const limited = {
    functionInvocationValue: {
      functionName: "Collection.limit",
      arguments: {
        collection: cloudFiltered,
        limit: { constantValue: 1 },
        key: { constantValue: "CLOUDY_PIXEL_PERCENTAGE" },
        ascending: { constantValue: true },
      },
    },
  };

  // Mosaic the single-image collection to get an Image
  const image = {
    functionInvocationValue: {
      functionName: "ImageCollection.mosaic",
      arguments: { collection: limited },
    },
  };

  // NDVI = normalizedDifference(['B8', 'B4'])
  const ndvi = {
    functionInvocationValue: {
      functionName: "Image.normalizedDifference",
      arguments: {
        input: image,
        bandNames: { constantValue: ["B8", "B4"] },
      },
    },
  };

  // Clip to polygon
  const clipped = {
    functionInvocationValue: {
      functionName: "Image.clip",
      arguments: { input: ndvi, geometry },
    },
  };

  return { clipped, geometry };
}

// Build reduceRegion expression
function buildReduceRegion(image: any, geometry: any, reducerName: string) {
  return {
    functionInvocationValue: {
      functionName: "Image.reduceRegion",
      arguments: {
        image,
        reducer: {
          functionInvocationValue: { functionName: reducerName, arguments: {} },
        },
        geometry,
        scale: { constantValue: 10 },
        maxPixels: { constantValue: 1000000000 },
      },
    },
  };
}

// ── Main handler ──────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();

    // ── Mode 1: GEE NDVI analysis for a polygon ──────────────────
    if (body.polygon) {
      const { polygon } = body;
      let coords: [number, number][];
      if (polygon.type === "Polygon" && Array.isArray(polygon.coordinates)) {
        coords = polygon.coordinates[0];
      } else if (Array.isArray(polygon) && polygon.length >= 3) {
        coords = polygon;
      } else {
        throw new Error("Invalid polygon: provide GeoJSON Polygon or array of [lng,lat] with >= 3 points");
      }

      const token = await getGeeAccessToken();
      const projectId = Deno.env.get("GEE_PROJECT_ID") || "earthengine-legacy";

      // Date range: last 30 days
      const now = new Date();
      const endDate = now.toISOString().split("T")[0];
      const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      console.log(`Analyzing field: ${coords.length} vertices, date range: ${startDate} to ${endDate}`);

      // Helper to call GEE value:compute
      async function computeValue(expr: any): Promise<any> {
        const flat = flattenExpression(expr);
        const resp = await fetch(
          `https://earthengine.googleapis.com/v1/projects/${projectId}/value:compute`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ expression: flat }),
          }
        );
        if (!resp.ok) {
          const t = await resp.text();
          console.error("GEE value:compute error:", resp.status, t);
          throw new Error(`GEE value:compute failed (${resp.status}): ${t}`);
        }
        return resp.json();
      }

      // Try with primary date range, fallback to 90 days if no data
      async function tryComputeNdvi(start: string, end: string) {
        const { clipped, geometry } = buildNdviImage(coords, start, end);

        // 3 parallel reduceRegion calls: mean, min, max
        const [meanResult, minResult, maxResult] = await Promise.all([
          computeValue(buildReduceRegion(clipped, geometry, "Reducer.mean")),
          computeValue(buildReduceRegion(clipped, geometry, "Reducer.min")),
          computeValue(buildReduceRegion(clipped, geometry, "Reducer.max")),
        ]);

        console.log("GEE mean result:", JSON.stringify(meanResult));
        console.log("GEE min result:", JSON.stringify(minResult));
        console.log("GEE max result:", JSON.stringify(maxResult));

        // normalizedDifference produces band named 'nd'
        const meanNdvi = meanResult?.result?.nd ?? null;
        const minNdvi = minResult?.result?.nd ?? null;
        const maxNdvi = maxResult?.result?.nd ?? null;

        return { meanNdvi, minNdvi, maxNdvi, start, end };
      }

      let result = await tryComputeNdvi(startDate, endDate);

      // Fallback: if all null, try 90-day window
      if (result.meanNdvi === null && result.minNdvi === null && result.maxNdvi === null) {
        console.log("No data in 30-day window, trying 90-day fallback...");
        const fallbackStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        result = await tryComputeNdvi(fallbackStart, endDate);
      }

      // If still null, return zeros
      if (result.meanNdvi === null && result.minNdvi === null && result.maxNdvi === null) {
        console.error("NDVI reduceRegion returned null for both 30-day and 90-day windows");
        return new Response(JSON.stringify({
          mean_ndvi: 0, min_ndvi: 0, max_ndvi: 0,
          vegetation_health_score: 0,
          acquisition_date: `${startDate} to ${endDate}`,
          error: "No valid Sentinel-2 imagery found for this area",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const mean = result.meanNdvi ?? 0;
      const min = result.minNdvi ?? 0;
      const max = result.maxNdvi ?? 0;
      const healthScore = Math.min(100, Math.max(0, Math.round((mean / 0.8) * 100)));

      console.log(`NDVI analysis complete: mean=${mean.toFixed(3)}, min=${min.toFixed(3)}, max=${max.toFixed(3)}, health=${healthScore}`);

      return new Response(JSON.stringify({
        mean_ndvi: Math.round(mean * 1000) / 1000,
        min_ndvi: Math.round(min * 1000) / 1000,
        max_ndvi: Math.round(max * 1000) / 1000,
        vegetation_health_score: healthScore,
        acquisition_date: `${result.start} to ${result.end}`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Mode 2: AI-powered analysis (rural or urban) ─────────
    const { fieldName, crop, area, location, temperature, humidity, windSpeed, soilMoisture, ndviEstimate, isUrban } = body;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const prompt = isUrban
      ? `You are a concise urban sustainability analyst. Give a SHORT, data-driven analysis for this urban region. Focus on sustainability, environmental quality, and livability.

**Region:** ${fieldName} | **Land Use:** ${crop} | **Area:** ${area} acres | **Location:** ${location}
**Weather:** ${temperature}°C, ${humidity}% humidity, ${windSpeed} km/h wind
**NDVI (Green Cover):** ${ndviEstimate || "0.30"}

Respond in this EXACT format (keep each section to 1-2 sentences max):

## Green Infrastructure Assessment
[Assess green cover NDVI ${ndviEstimate || "0.30"} for an urban ${crop} area. Is it adequate?]

## Heat Island Risk
[Low/Medium/High risk based on green cover and temperature. One sentence recommendation.]

## Air Quality & Health
[Assessment based on temperature, humidity, and urban density]

## Sustainability Score
**Score: X/10** — [One line justification based on green cover, density, and environmental factors]

## Improvement Recommendations
- [Recommendation 1 — specific to this land use type]
- [Recommendation 2 — actionable sustainability improvement]
- [Recommendation 3 — community/infrastructure suggestion]

## Stormwater & Drainage
[Assessment of impervious surface risk and green infrastructure for water management]

## Key Environmental Risks
- [Risk 1]
- [Risk 2]

## Summary Table
| Metric | Value | Status |
|--------|-------|--------|
| Green Cover | ${ndviEstimate || "0.30"} | [Good/Fair/Poor] |
| Heat Island Risk | [Low/Med/High] | [emoji] |
| Sustainability | [score] | [status] |`
      : `You are a concise agricultural analyst. Give a SHORT, pin-point analysis for this field. Use simple language.

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
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: isUrban ? "You are an urban sustainability and environmental expert. Provide data-driven, actionable insights for improving urban environments. Use markdown formatting. Focus on sustainability, green infrastructure, and livability." : "You are a precision agriculture expert. Provide data-driven, actionable insights. Use markdown formatting. Be specific with numbers and recommendations." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Usage limit reached." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const aiData = await response.json();
    const analysis = aiData.choices?.[0]?.message?.content || "Analysis unavailable.";

    return new Response(JSON.stringify({ analysis }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("analyze-field error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
