// AUTO-GENERATED from supabase/functions/<name>/index.ts by scripts/gen-vercel-api.mjs
// Do not edit directly - edit the Supabase function and re-run the generator.
export const config = { runtime: "edge" };

type Handler = (req: Request) => Response | Promise<Response>;
let _handler: Handler = () => new Response("not ready", { status: 500 });
const serve = (fn: Handler) => {
  _handler = fn;
};
// Deno.env shim -> Vercel Environment Variables.
// Each variable is referenced STATICALLY: the Vercel Edge runtime only inlines
// env vars it can see at build time, so a dynamic process.env[key] lookup
// returns undefined in production.
const _ENV: Record<string, string | undefined> = {
  AI_API_KEY: process.env.AI_API_KEY,
  GEE_PROJECT_ID: process.env.GEE_PROJECT_ID,
  GEE_SERVICE_ACCOUNT_JSON: process.env.GEE_SERVICE_ACCOUNT_JSON,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  MAPBOX_TOKEN: process.env.MAPBOX_TOKEN,
  SUPABASE_URL: process.env.SUPABASE_URL,
};
const Deno = {
  env: {
    get: (key: string): string | undefined =>
      _ENV[key] ?? (process.env as Record<string, string | undefined>)[key],
  },
};
void Deno;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const token = Deno.env.get("MAPBOX_TOKEN");
  if (!token) {
    return new Response(JSON.stringify({ error: "MAPBOX_TOKEN not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ token }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

export default function handler(req: Request) {
  return _handler(req);
}
