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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({ 
      status: "alive", 
      timestamp: new Date().toISOString(),
      service: "virdis-keepalive"
    }),
    { 
      status: 200, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    }
  );
});

export default function handler(req: Request) {
  return _handler(req);
}
