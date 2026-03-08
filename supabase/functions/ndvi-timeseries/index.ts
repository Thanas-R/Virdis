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
    console.error("GEE compute error:", resp.status, t);
    throw new Error(`GEE compute failed (${resp.status}): ${t}`);
  }
  return resp.json();
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
    const promises: Promise<{ date: string; ndvi: number | null }>[] = [];

    for (let i = 0; i < imageCount; i++) {
      const { timestamp, ndviVal } = buildImageNdviAtIndex(listExpr, i, geometry);

      promises.push(
        Promise.all([
          computeValue(token, projectId, timestamp),
          computeValue(token, projectId, ndviVal),
        ]).then(([tsResult, ndviResult]) => {
          const ts = tsResult?.result;
          const ndvi = ndviResult?.result;
          const dateStr = ts ? new Date(ts).toISOString().split("T")[0] : null;
          return {
            date: dateStr || "unknown",
            ndvi: ndvi != null ? Math.round(ndvi * 1000) / 1000 : null,
          };
        }).catch((e) => {
          console.error(`Image ${i} error:`, e.message);
          return { date: "unknown", ndvi: null };
        })
      );
    }

    const rawTimeseries = await Promise.all(promises);
    const timeseries = rawTimeseries
      .filter((p) => p.date !== "unknown" && p.ndvi !== null)
      .sort((a, b) => a.date.localeCompare(b.date));

    console.log(`Time-series: ${timeseries.length} valid observations`);

    if (timeseries.length === 0) {
      return new Response(JSON.stringify({
        timeseries: [],
        growth_rate: null,
        canopy_cover: null,
        biomass_estimate: null,
        growth_stage: null,
        error: "NDVI computation returned no valid results",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    return new Response(JSON.stringify({
      timeseries,
      growth_rate,
      canopy_cover,
      biomass_estimate,
      growth_stage,
      growth_progress,
      latest_ndvi: latestNdvi,
      mean_ndvi: Math.round(meanNdvi * 1000) / 1000,
      date_range: `${startDate} to ${endDate}`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("ndvi-timeseries error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
