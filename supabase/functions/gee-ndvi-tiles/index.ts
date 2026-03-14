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

// ── Flatten nested expression to GEE DAG format ──────────────────

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
    const token = await getGeeAccessToken();
    const projectId = Deno.env.get("GEE_PROJECT_ID") || "earthengine-legacy";

    // No clipping — NDVI is rendered globally

    // Build date range (last 3 months)
    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const startDate = threeMonthsAgo.toISOString().split("T")[0];
    const endDate = now.toISOString().split("T")[0];

    // Base collection: Sentinel-2 SR, filtered by date and cloud
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

    const cloudFiltered = {
      functionInvocationValue: {
        functionName: "Collection.filter",
        arguments: {
          collection: dateFiltered,
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

    // Median composite
    const median = {
      functionInvocationValue: {
        functionName: "ImageCollection.reduce",
        arguments: {
          collection: cloudFiltered,
          reducer: {
            functionInvocationValue: { functionName: "Reducer.median", arguments: {} },
          },
        },
      },
    };

    // NDVI from median composite
    const ndvi = {
      functionInvocationValue: {
        functionName: "Image.normalizedDifference",
        arguments: {
          input: median,
          bandNames: { constantValue: ["B8_median", "B4_median"] },
        },
      },
    };

    // Optionally clip to a union of field polygons
    let ndviToVisualize = ndvi;

    if (coordinates && coordinates.length > 0) {
      // Build a GEE MultiPolygon geometry from all field coordinate rings
      const allRings = coordinates.map(ring => ring);
      const unionGeometry = {
        functionInvocationValue: {
          functionName: "GeometryConstructors.MultiPolygon",
          arguments: {
            coordinates: { constantValue: allRings },
            geodesic: { constantValue: false },
            evenOdd: { constantValue: true },
          },
        },
      };

      ndviToVisualize = {
        functionInvocationValue: {
          functionName: "Image.clip",
          arguments: {
            input: ndvi,
            geometry: unionGeometry,
          },
        },
      };
    }

    // Visualize with NDVI palette
    const visualized = {
      functionInvocationValue: {
        functionName: "Image.visualize",
        arguments: {
          image: ndviToVisualize,
          bands: { constantValue: ["nd"] },
          min: { constantValue: -0.1 },
          max: { constantValue: 0.8 },
          palette: {
            constantValue: [
              "#d73027", "#f46d43", "#fdae61", "#fee08b",
              "#d9ef8b", "#a6d96a", "#66bd63", "#1a9850", "#006837",
            ],
          },
        },
      },
    };

    const expression = flattenExpression(visualized);

    // Request map tiles from GEE
    const mapResp = await fetch(
      `https://earthengine.googleapis.com/v1/projects/${projectId}/maps`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expression, fileFormat: "PNG" }),
      }
    );

    if (!mapResp.ok) {
      const t = await mapResp.text();
      console.error("GEE maps error:", mapResp.status, t);
      throw new Error(`GEE map tiles failed (${mapResp.status}): ${t.slice(0, 500)}`);
    }

    const mapData = await mapResp.json();
    const tileUrl = `https://earthengine.googleapis.com/v1/${mapData.name}/tiles/{z}/{x}/{y}`;

    return new Response(
      JSON.stringify({ tileUrl, token }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("gee-ndvi-tiles error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
