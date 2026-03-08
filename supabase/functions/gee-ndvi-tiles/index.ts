import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── GEE Auth (same as detect-field) ───────────────────────────────

function base64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function createJwt(
  email: string,
  privateKeyPem: string,
  scopes: string[]
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: email,
    scope: scopes.join(" "),
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const enc = new TextEncoder();
  const headerB64 = base64url(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64url(enc.encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const pemBody = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const keyBytes = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(unsignedToken))
  );

  return `${unsignedToken}.${base64url(sig)}`;
}

async function getGeeAccessToken(): Promise<string> {
  const raw = Deno.env.get("GEE_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("GEE_SERVICE_ACCOUNT_JSON secret not configured");

  const sa = JSON.parse(raw);
  const jwt = await createJwt(sa.client_email, sa.private_key, [
    "https://www.googleapis.com/auth/earthengine",
  ]);

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OAuth token exchange failed (${resp.status}): ${text}`);
  }

  const { access_token } = await resp.json();
  return access_token;
}

// ── Main handler ──────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = await getGeeAccessToken();
    const projectId = Deno.env.get("GEE_PROJECT_ID") || "earthengine-legacy";

    // Build date range (last 3 months)
    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const startDate = threeMonthsAgo.toISOString().split("T")[0];
    const endDate = now.toISOString().split("T")[0];

    // Build the NDVI visualization expression for map tiles
    // Sentinel-2 → cloud filter → median → NDVI → color map
    const expression = {
      function_invocation_value: {
        function_name: "Image.visualize",
        arguments: {
          image: {
            function_invocation_value: {
              function_name: "Image.normalizedDifference",
              arguments: {
                input: {
                  function_invocation_value: {
                    function_name: "Collection.reduce",
                    arguments: {
                      collection: {
                        function_invocation_value: {
                          function_name: "Collection.filter",
                          arguments: {
                            collection: {
                              function_invocation_value: {
                                function_name: "Collection.filter",
                                arguments: {
                                  collection: {
                                    function_invocation_value: {
                                      function_name: "ImageCollection.load",
                                      arguments: {
                                        id: { constant_value: "COPERNICUS/S2_SR_HARMONIZED" },
                                      },
                                    },
                                  },
                                  filter: {
                                    function_invocation_value: {
                                      function_name: "Filter.dateRangeContains",
                                      arguments: {
                                        leftValue: {
                                          function_invocation_value: {
                                            function_name: "DateRange",
                                            arguments: {
                                              start: { constant_value: startDate },
                                              end: { constant_value: endDate },
                                            },
                                          },
                                        },
                                        rightField: { constant_value: "system:time_start" },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                            filter: {
                              function_invocation_value: {
                                function_name: "Filter.lessThan",
                                arguments: {
                                  leftField: { constant_value: "CLOUDY_PIXEL_PERCENTAGE" },
                                  rightValue: { constant_value: 20 },
                                },
                              },
                            },
                          },
                        },
                      },
                      reducer: {
                        function_invocation_value: {
                          function_name: "Reducer.median",
                          arguments: {},
                        },
                      },
                    },
                  },
                },
                bandNames: { constant_value: ["B8_median", "B4_median"] },
              },
            },
          },
          bands: { constant_value: ["nd"] },
          min: { constant_value: -0.1 },
          max: { constant_value: 0.8 },
          palette: {
            constant_value: [
              "#d73027", "#f46d43", "#fdae61", "#fee08b",
              "#d9ef8b", "#a6d96a", "#66bd63", "#1a9850", "#006837",
            ],
          },
        },
      },
    };

    // Request map tiles from GEE
    const mapResp = await fetch(
      `https://earthengine.googleapis.com/v1/projects/${projectId}/maps`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expression,
          fileFormat: "PNG",
        }),
      }
    );

    if (!mapResp.ok) {
      const t = await mapResp.text();
      console.error("GEE maps error:", mapResp.status, t);
      throw new Error(`GEE map tiles failed (${mapResp.status}): ${t.slice(0, 500)}`);
    }

    const mapData = await mapResp.json();
    // mapData should contain { name, tilesets: [{ id, tileInfo: { zoom, bbox } }] }
    // The tile URL pattern is: https://earthengine.googleapis.com/v1/{name}/tiles/{z}/{x}/{y}

    const tileUrl = `https://earthengine.googleapis.com/v1/${mapData.name}/tiles/{z}/{x}/{y}`;

    return new Response(
      JSON.stringify({
        tileUrl,
        token, // Frontend needs the token for authenticated tile requests
      }),
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
