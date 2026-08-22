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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = Deno.env.get("MAPBOX_TOKEN");
    if (!token) return json({ error: "Mapbox not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const mode = body.mode === "reverse" ? "reverse" : "forward";
    const limit = Math.min(Math.max(parseInt(String(body.limit ?? 4), 10) || 4, 1), 10);

    let url: string;
    if (mode === "reverse") {
      const lng = Number(body.lng);
      const lat = Number(body.lat);
      if (!isFinite(lng) || !isFinite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        return json({ error: "Invalid coordinates" }, 400);
      }
      url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&limit=${limit}`;
    } else {
      const q = typeof body.query === "string" ? body.query.trim().slice(0, 200) : "";
      if (q.length < 2) return json({ features: [] });
      url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${token}&autocomplete=true&limit=${limit}`;
    }

    const resp = await fetch(url);
    if (!resp.ok) {
      console.error("Mapbox geocoding failed:", resp.status);
      return json({ error: "Geocoding service error" }, 502);
    }
    const data = await resp.json();
    // Strip to minimal needed fields
    const features = (data.features || []).map((f: any) => ({
      id: f.id,
      place_name: f.place_name,
      place_type: f.place_type,
      center: f.center,
    }));
    return json({ features });
  } catch (e) {
    console.error("mapbox-geocode error:", e);
    return json({ error: "An internal error occurred" }, 500);
  }
});

export default function handler(req: Request) {
  return _handler(req);
}
