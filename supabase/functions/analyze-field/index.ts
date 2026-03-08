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

// ── GEE Expression builder ───────────────────────────────────────

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

// ── Main handler ──────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();

    // ── Mode 1: GEE NDVI analysis for a polygon ──────────────────
    if (body.polygon) {
      const { polygon } = body;
      // Accept GeoJSON Polygon object or raw coordinate array
      let coords: [number, number][];
      if (polygon.type === "Polygon" && Array.isArray(polygon.coordinates)) {
        // Standard GeoJSON: { type: "Polygon", coordinates: [[[lng,lat], ...]] }
        coords = polygon.coordinates[0];
      } else if (Array.isArray(polygon) && polygon.length >= 3) {
        // Raw array: [[lng,lat], ...]
        coords = polygon;
      } else {
        throw new Error("Invalid polygon: provide GeoJSON Polygon or array of [lng,lat] with >= 3 points");
      }

      const token = await getGeeAccessToken();
      const projectId = Deno.env.get("GEE_PROJECT_ID") || "earthengine-legacy";

      // Compute bounding box
      let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
      for (const [lng, lat] of coords) {
        if (lng < west) west = lng;
        if (lng > east) east = lng;
        if (lat < south) south = lat;
        if (lat > north) north = lat;
      }

      // Date range: last 30 days
      const now = new Date();
      const endDate = now.toISOString().split("T")[0];
      const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      // Build GEE expression: S2 median → select B8, B4 → clip to polygon → compute stats
      // We use computePixels to get a grid, then compute NDVI stats server-side
      const gridSize = 64;

      // Build NDVI expression clipped to polygon bounding box
      const ndviExpression = {
        functionInvocationValue: {
          functionName: "Image.normalizedDifference",
          arguments: {
            input: {
              functionInvocationValue: {
                functionName: "Collection.reduce",
                arguments: {
                  collection: {
                    functionInvocationValue: {
                      functionName: "Collection.filter",
                      arguments: {
                        collection: {
                          functionInvocationValue: {
                            functionName: "Collection.filter",
                            arguments: {
                              collection: {
                                functionInvocationValue: {
                                  functionName: "ImageCollection.load",
                                  arguments: { id: { constantValue: "COPERNICUS/S2_SR_HARMONIZED" } },
                                },
                              },
                              filter: {
                                functionInvocationValue: {
                                  functionName: "Filter.dateRangeContains",
                                  arguments: {
                                    leftValue: {
                                      functionInvocationValue: {
                                        functionName: "DateRange",
                                        arguments: { start: { constantValue: startDate }, end: { constantValue: endDate } },
                                      },
                                    },
                                    rightField: { constantValue: "system:time_start" },
                                  },
                                },
                              },
                            },
                          },
                        },
                        filter: {
                          functionInvocationValue: {
                            functionName: "Filter.lessThan",
                            arguments: { leftField: { constantValue: "CLOUDY_PIXEL_PERCENTAGE" }, rightValue: { constantValue: 30 } },
                          },
                        },
                      },
                    },
                  },
                  reducer: {
                    functionInvocationValue: { functionName: "Reducer.median", arguments: {} },
                  },
                },
              },
            },
            bandNames: { constantValue: ["B8_median", "B4_median"] },
          },
        },
      };

      const expression = flattenExpression(ndviExpression);

      const scaleX = (east - west) / gridSize;
      const scaleY = (north - south) / gridSize;

      console.log(`Analyzing field polygon: ${coords.length} vertices, bbox: ${west.toFixed(4)},${south.toFixed(4)} to ${east.toFixed(4)},${north.toFixed(4)}`);

      const pixelResp = await fetch(`https://earthengine.googleapis.com/v1/projects/${projectId}/image:computePixels`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          expression,
          fileFormat: "NPY",
          grid: {
            dimensions: { width: gridSize, height: gridSize },
            affineTransform: { scaleX, shearX: 0, translateX: west, shearY: 0, scaleY: -scaleY, translateY: north },
            crsCode: "EPSG:4326",
          },
        }),
      });

      if (!pixelResp.ok) {
        const t = await pixelResp.text();
        console.error("GEE computePixels error:", pixelResp.status, t);
        throw new Error(`GEE analysis failed (${pixelResp.status})`);
      }

      const buffer = await pixelResp.arrayBuffer();

      // Parse NPY
      const bytes = new Uint8Array(buffer);
      const view = new DataView(buffer);
      const majorVer = bytes[6];
      const hdrLen = majorVer >= 2 ? view.getUint32(8, true) : view.getUint16(8, true);
      const hdrOff = majorVer >= 2 ? 12 : 10;
      const hdrStr = new TextDecoder().decode(new Uint8Array(buffer, hdrOff, hdrLen));
      const descrMatch = hdrStr.match(/descr['"]\s*:\s*'([^']+)'/);
      const descr = descrMatch ? descrMatch[1] : "<f8";
      const dataOff = hdrOff + hdrLen;
      const data = descr.includes("f4") ? new Float32Array(buffer, dataOff) : new Float64Array(buffer, dataOff);

      // Point-in-polygon check to only include pixels inside the drawn field
      const cellLng = (east - west) / gridSize;
      const cellLat = (north - south) / gridSize;
      const ndviValues: number[] = [];

      for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
          const px = west + (c + 0.5) * cellLng;
          const py = north - (r + 0.5) * cellLat;
          if (pointInPolygon(px, py, coords)) {
            const val = data[r * gridSize + c];
            if (!isNaN(val)) ndviValues.push(val);
          }
        }
      }

      if (ndviValues.length === 0) {
        return new Response(JSON.stringify({
          mean_ndvi: 0, min_ndvi: 0, max_ndvi: 0,
          vegetation_health_score: 0,
          acquisition_date: `${startDate} to ${endDate}`,
          pixel_count: 0,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const mean = ndviValues.reduce((a, b) => a + b, 0) / ndviValues.length;
      const min = Math.min(...ndviValues);
      const max = Math.max(...ndviValues);
      const healthScore = Math.min(100, Math.max(0, Math.round((mean / 0.8) * 100)));

      console.log(`NDVI analysis complete: mean=${mean.toFixed(3)}, min=${min.toFixed(3)}, max=${max.toFixed(3)}, health=${healthScore}, pixels=${ndviValues.length}`);

      return new Response(JSON.stringify({
        mean_ndvi: Math.round(mean * 1000) / 1000,
        min_ndvi: Math.round(min * 1000) / 1000,
        max_ndvi: Math.round(max * 1000) / 1000,
        vegetation_health_score: healthScore,
        acquisition_date: `${startDate} to ${endDate}`,
        pixel_count: ndviValues.length,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Mode 2: AI-powered agronomic analysis (existing) ─────────
    const { fieldName, crop, area, location, temperature, humidity, windSpeed, soilMoisture, ndviEstimate } = body;

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
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a precision agriculture expert. Provide data-driven, actionable insights. Use markdown formatting. Be specific with numbers and recommendations." },
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

// Point-in-polygon (ray casting)
function pointInPolygon(x: number, y: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
