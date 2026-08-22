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

function base64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getGeeAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const raw = Deno.env.get("GEE_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("GEE_SERVICE_ACCOUNT_JSON secret not configured");
  const sa = JSON.parse(raw);
  const jwt = await createJwt(sa.client_email, sa.private_key, ["https://www.googleapis.com/auth/earthengine"]);
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!resp.ok) throw new Error(`OAuth failed: ${await resp.text()}`);
  const json = await resp.json();
  cachedToken = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return cachedToken.token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const name = url.searchParams.get("name");
    const z = url.searchParams.get("z");
    const x = url.searchParams.get("x");
    const y = url.searchParams.get("y");

    if (!name || z === null || x === null || y === null) {
      return new Response(JSON.stringify({ error: "Missing required params: name, z, x, y" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // Restrict to GEE map name format: projects/{project}/maps/{id}
    if (!/^projects\/[A-Za-z0-9_\-]+\/maps\/[A-Za-z0-9_\-]+$/.test(name)) {
      return new Response(JSON.stringify({ error: "Invalid map name" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!/^\d+$/.test(z) || !/^\d+$/.test(x) || !/^\d+$/.test(y)) {
      return new Response(JSON.stringify({ error: "Invalid tile coords" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const token = await getGeeAccessToken();
    const tileResp = await fetch(
      `https://earthengine.googleapis.com/v1/${name}/tiles/${z}/${x}/${y}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!tileResp.ok) {
      return new Response(null, { status: tileResp.status, headers: corsHeaders });
    }

    const buf = await tileResp.arrayBuffer();
    return new Response(buf, {
      headers: {
        ...corsHeaders,
        "Content-Type": tileResp.headers.get("Content-Type") || "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    console.error("gee-tile-proxy error:", e);
    return new Response(JSON.stringify({ error: "An internal error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

export default function handler(req: Request) {
  return _handler(req);
}
