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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEE_RETRY_DELAYS_MS = [800, 1800, 4000];
const TOKEN_REFRESH_SKEW_MS = 60_000;
const TIMESERIES_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let cachedToken: { token: string; expiresAt: number } | null = null;
const timeseriesCache = new Map<string, { data: any; expiresAt: number }>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildCacheKey(coords: [number, number][]) {
  return JSON.stringify(coords.map(([lon, lat]) => [Number(lon.toFixed(5)), Number(lat.toFixed(5))]));
}

function getCachedTimeseries(key: string, allowStale = false) {
  const cached = timeseriesCache.get(key);
  if (!cached) return null;
  if (!allowStale && cached.expiresAt < Date.now()) return null;
  return cached.data;
}

function setCachedTimeseries(key: string, data: any) {
  timeseriesCache.set(key, { data, expiresAt: Date.now() + TIMESERIES_CACHE_TTL_MS });
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
  if (cachedToken && cachedToken.expiresAt > Date.now() + TOKEN_REFRESH_SKEW_MS) {
    return cachedToken.token;
  }
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
  const json = await resp.json();
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

// ── Expression flattener ─────────────────────────────────────────

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

async function computeValue(token: string, projectId: string, expr: any): Promise<any> {
  const flat = flattenExpression(expr);
  let lastError = "";
  for (let attempt = 0; attempt <= GEE_RETRY_DELAYS_MS.length; attempt++) {
    const resp = await fetch(
      `https://earthengine.googleapis.com/v1/projects/${projectId}/value:compute`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ expression: flat }),
        signal: AbortSignal.timeout(15_000),
      }
    );

    if (resp.ok) {
      return resp.json();
    }

    lastError = await resp.text();
    const retryable = resp.status === 429 || resp.status >= 500 || lastError.includes("RESOURCE_EXHAUSTED");
    if (retryable && attempt < GEE_RETRY_DELAYS_MS.length) {
      await sleep(GEE_RETRY_DELAYS_MS[attempt] + Math.floor(Math.random() * 300));
      continue;
    }

    if (retryable) {
      throw new Error(`GEE_RATE_LIMITED: ${lastError}`);
    }

    console.error("GEE compute error:", resp.status, lastError);
    throw new Error(`GEE compute failed (${resp.status}): ${lastError}`);
  }

  throw new Error(`GEE_RATE_LIMITED: ${lastError || "GEE compute failed after retries"}`);
}

function makeGeometry(coords: [number, number][]) {
  return {
    functionInvocationValue: {
      functionName: "GeometryConstructors.Polygon",
      arguments: {
        coordinates: { constantValue: [coords] },
        geodesic: { constantValue: false },
        evenOdd: { constantValue: true },
      },
    },
  };
}

// ── Build filtered collection ────────────────────────────────────

function buildFilteredCollection(coords: [number, number][], startDate: string, endDate: string) {
  const geometry = makeGeometry(coords);

  const collection = {
    functionInvocationValue: {
      functionName: "ImageCollection.load",
      arguments: { id: { constantValue: "COPERNICUS/S2_SR" } },
    },
  };

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
                  arguments: { start: { constantValue: startDate }, end: { constantValue: endDate } },
                },
              },
              rightField: { constantValue: "system:time_start" },
            },
          },
        },
      },
    },
  };

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

  // Sort by date, limit to 20
  const sorted = {
    functionInvocationValue: {
      functionName: "Collection.limit",
      arguments: {
        collection: cloudFiltered,
        limit: { constantValue: 20 },
        key: { constantValue: "system:time_start" },
        ascending: { constantValue: true },
      },
    },
  };

  return { sorted, geometry };
}

// Build expression for a single image at index i in the list
function buildImageNdviAtIndex(list: any, index: number, geometry: any) {
  const image = {
    functionInvocationValue: {
      functionName: "List.get",
      arguments: {
        list,
        index: { constantValue: index },
      },
    },
  };

  // Get timestamp
  const timestamp = {
    functionInvocationValue: {
      functionName: "Element.get",
      arguments: {
        object: image,
        property: { constantValue: "system:time_start" },
      },
    },
  };

  // Compute NDVI
  const ndvi = {
    functionInvocationValue: {
      functionName: "Image.normalizedDifference",
      arguments: {
        input: image,
        bandNames: { constantValue: ["B8", "B4"] },
      },
    },
  };

  const clipped = {
    functionInvocationValue: {
      functionName: "Image.clip",
      arguments: { input: ndvi, geometry },
    },
  };

  // Reduce to mean
  const stats = {
    functionInvocationValue: {
      functionName: "Image.reduceRegion",
      arguments: {
        image: clipped,
        reducer: { functionInvocationValue: { functionName: "Reducer.mean", arguments: {} } },
        geometry,
        scale: { constantValue: 10 },
        maxPixels: { constantValue: 1000000000 },
      },
    },
  };

  // Return dict with timestamp and ndvi_mean
  const ndviVal = {
    functionInvocationValue: {
      functionName: "Dictionary.get",
      arguments: {
        dictionary: stats,
        key: { constantValue: "nd" },
      },
    },
  };

  return { timestamp, ndviVal };
}

// ── Main handler ──────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { polygon } = body;

    if (!polygon) throw new Error("polygon is required");

    let coords: [number, number][];
    if (polygon.type === "Polygon" && Array.isArray(polygon.coordinates)) {
      coords = polygon.coordinates[0];
    } else if (Array.isArray(polygon) && polygon.length >= 3) {
      coords = polygon;
    } else {
      throw new Error("Invalid polygon");
    }
    const polyError = validatePolygon(coords);
    if (polyError) {
      return new Response(JSON.stringify({ error: polyError }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const cacheKey = buildCacheKey(coords);
    const cached = getCachedTimeseries(cacheKey);
    if (cached) {
      return new Response(JSON.stringify({ ...cached, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
      });
    }

    const token = await getGeeAccessToken();
    const projectId = Deno.env.get("GEE_PROJECT_ID") || "earthengine-legacy";

    const now = new Date();
    const endDate = now.toISOString().split("T")[0];
    const startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    console.log(`NDVI time-series: ${coords.length} vertices, ${startDate} to ${endDate}`);

    const { sorted, geometry } = buildFilteredCollection(coords, startDate, endDate);

    // Step 1: Get collection size
    const sizeExpr = {
      functionInvocationValue: {
        functionName: "Collection.size",
        arguments: { collection: sorted },
      },
    };
    const sizeResult = await computeValue(token, projectId, sizeExpr);
    const count = sizeResult?.result ?? 0;
    console.log(`Found ${count} images`);

    if (count === 0) {
      return new Response(JSON.stringify({
        timeseries: [],
        growth_rate: null,
        canopy_cover: null,
        biomass_estimate: null,
        growth_stage: null,
        error: "No valid Sentinel-2 imagery found for this area in the last 90 days",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Step 2: Convert to list
    const listExpr = {
      functionInvocationValue: {
        functionName: "Collection.toList",
        arguments: {
          collection: sorted,
          count: { constantValue: Math.min(count, 20) },
        },
      },
    };

    // Step 3: For each image, compute NDVI mean and get timestamp in parallel
    const imageCount = Math.min(count, 20);
    const rawTimeseries: { date: string; ndvi: number | null }[] = [];
    for (let i = 0; i < imageCount; i++) {
      const { timestamp, ndviVal } = buildImageNdviAtIndex(listExpr, i, geometry);

      try {
        const tsResult = await computeValue(token, projectId, timestamp);
        const ndviResult = await computeValue(token, projectId, ndviVal);
        const ts = tsResult?.result;
        const ndvi = ndviResult?.result;
        const dateStr = ts ? new Date(ts).toISOString().split("T")[0] : null;
        rawTimeseries.push({
          date: dateStr || "unknown",
          ndvi: ndvi != null ? Math.round(ndvi * 1000) / 1000 : null,
        });
      } catch (e) {
        console.error(`Image ${i} error:`, e instanceof Error ? e.message : e);
        rawTimeseries.push({ date: "unknown", ndvi: null });
      }
    }
    const timeseries = rawTimeseries
      .filter((p) => p.date !== "unknown" && p.ndvi !== null)
      .sort((a, b) => a.date.localeCompare(b.date));

    console.log(`Time-series: ${timeseries.length} valid observations`);

    if (timeseries.length === 0) {
      const emptyPayload = {
        timeseries: [],
        growth_rate: null,
        canopy_cover: null,
        biomass_estimate: null,
        growth_stage: null,
        error: "NDVI computation returned no valid results",
        fallback: true,
      };
      const stale = getCachedTimeseries(cacheKey, true);
      return new Response(JSON.stringify(stale ? { ...stale, stale: true, error: emptyPayload.error, fallback: true } : emptyPayload), { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
    }

    // Compute derived indicators
    const latestNdvi = timeseries[timeseries.length - 1].ndvi!;
    const earliestNdvi = timeseries[0].ndvi!;

    // Growth rate: NDVI change per day
    let growth_rate: number | null = null;
    if (timeseries.length >= 2) {
      const daysDiff = (new Date(timeseries[timeseries.length - 1].date).getTime() - new Date(timeseries[0].date).getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > 0) {
        growth_rate = Math.round(((latestNdvi - earliestNdvi) / daysDiff) * 10000) / 10000;
      }
    }

    // Canopy cover: fraction of observations where NDVI > 0.5
    const canopy_cover = Math.round((timeseries.filter((p) => p.ndvi! > 0.5).length / timeseries.length) * 100);

    // Biomass estimate
    const meanNdvi = timeseries.reduce((s, p) => s + p.ndvi!, 0) / timeseries.length;
    const biomass_estimate = Math.round(meanNdvi * 8 * 1000) / 1000;

    // Growth stage from latest NDVI
    let growth_stage: string;
    let growth_progress: number;
    if (latestNdvi < 0.2) { growth_stage = "Germination"; growth_progress = 15; }
    else if (latestNdvi < 0.4) { growth_stage = "Tillering"; growth_progress = 30; }
    else if (latestNdvi < 0.6) { growth_stage = "Stem Extension"; growth_progress = 50; }
    else if (latestNdvi < 0.75) { growth_stage = "Heading"; growth_progress = 70; }
    else { growth_stage = "Grain Fill"; growth_progress = 90; }

    console.log(`Results: ${timeseries.length} obs, latest=${latestNdvi}, stage=${growth_stage}, rate=${growth_rate}`);

    const payload = {
      timeseries,
      growth_rate,
      canopy_cover,
      biomass_estimate,
      growth_stage,
      growth_progress,
      latest_ndvi: latestNdvi,
      mean_ndvi: Math.round(meanNdvi * 1000) / 1000,
      date_range: `${startDate} to ${endDate}`,
    };
    setCachedTimeseries(cacheKey, payload);

    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } });

  } catch (e) {
    console.error("ndvi-timeseries error:", e);
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({
      timeseries: [],
      growth_rate: null,
      canopy_cover: null,
      biomass_estimate: null,
      growth_stage: null,
      error: message.includes("GEE_RATE_LIMITED") ? "RATE_LIMITED" : "SERVICE_UNAVAILABLE",
      fallback: true,
      message: "Satellite time-series are temporarily busy. Please retry shortly.",
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
});

export default function handler(req: Request) {
  return _handler(req);
}
