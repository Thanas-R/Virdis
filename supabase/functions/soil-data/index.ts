import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SOILGRIDS_BASE = "https://rest.isric.org/soilgrids/v2.0";
const PROPERTIES = ["clay", "sand", "silt", "phh2o", "soc", "bdod", "nitrogen", "cec", "wv0033", "wv1500", "cfvo"];
const DEPTHS = ["0-5cm", "5-15cm", "15-30cm", "30-60cm"];

function getMean(layers: any[], name: string, depthIdx = 0): number | null {
  for (const layer of layers) {
    if (layer?.name === name) {
      const depths = layer?.depths || [];
      if (depthIdx < depths.length) {
        return depths[depthIdx]?.values?.mean ?? null;
      }
    }
  }
  return null;
}

function classifySoil(sand: number | null, clay: number | null, silt: number | null, ph: number | null, soc: number | null, wrb: string): string {
  if (wrb && wrb !== "Unknown" && wrb !== "None" && wrb !== "") return wrb;
  if (sand == null && clay == null) return "Unknown";
  if (sand != null && sand > 700) return "Arenosol";
  if (clay != null && clay > 450) return "Vertisol";
  if (soc != null && soc > 800) return "Histosol";
  if (ph != null && clay != null && ph < 50 && clay > 200) return "Acrisol";
  if (clay != null && clay > 200 && soc != null && soc > 200) return "Ferralsol";
  if (soc != null && soc > 300 && ph != null && ph > 60) return "Phaeozem";
  return "Cambisol";
}

function usdaTexture(sand: number | null, silt: number | null, clay: number | null): string | null {
  if (sand == null || silt == null || clay == null) return null;
  if (clay >= 40) return "Clay";
  if (clay >= 27 && silt >= 40) return "Silty Clay";
  if (clay >= 27 && sand <= 45) return "Clay";
  if (clay >= 20 && sand >= 45) return "Sandy Clay";
  if (clay >= 7 && silt >= 50) return "Silt Loam";
  if (silt >= 80 && clay < 12) return "Silt";
  if (clay >= 7 && sand <= 52) return "Loam";
  if (clay >= 7 && sand <= 70) return "Sandy Loam";
  if (sand >= 85) return "Sand";
  if (sand >= 70) return "Loamy Sand";
  return "Sandy Loam";
}

function phRating(ph: number | null): string {
  if (ph == null) return "Unknown";
  if (ph < 4.5) return "Very Acidic";
  if (ph < 5.5) return "Acidic";
  if (ph < 6.5) return "Slightly Acidic";
  if (ph < 7.5) return "Neutral (Optimal)";
  if (ph < 8.5) return "Slightly Alkaline";
  if (ph < 9.5) return "Alkaline";
  return "Highly Alkaline";
}

function socRating(soc: number | null): string {
  if (soc == null) return "Unknown";
  if (soc < 5) return "Low";
  if (soc < 7.5) return "Medium";
  return "High";
}

function nitrogenRating(n: number | null): string {
  if (n == null) return "Unknown";
  if (n < 2.8) return "Low";
  if (n < 5.6) return "Medium";
  return "High";
}

const SOIL_INFO: Record<string, { icon: string; description: string; color: string }> = {
  Ferralsol: { icon: "🔴", description: "Deeply weathered tropical soils rich in iron oxides. Low natural fertility.", color: "#D85A30" },
  Vertisol: { icon: "🟫", description: "Dark clay-rich soils that crack when dry. Naturally fertile, common in semi-arid regions.", color: "#854F0B" },
  Cambisol: { icon: "🟤", description: "Moderately developed, versatile soils. Generally fertile for agriculture.", color: "#BA7517" },
  Luvisol: { icon: "🌾", description: "Clay-enriched soils common in temperate forests. Moderately fertile.", color: "#639922" },
  Arenosol: { icon: "🏜️", description: "Sandy soils with very low nutrient and water retention.", color: "#EF9F27" },
  Gleysol: { icon: "💧", description: "Waterlogged soils found in floodplains and deltas.", color: "#378ADD" },
  Histosol: { icon: "🌿", description: "Organic peat soils with high carbon storage.", color: "#3B6D11" },
  Phaeozem: { icon: "🌻", description: "Dark, humus-rich grassland soils. Among the most fertile.", color: "#533400" },
  Acrisol: { icon: "🔶", description: "Strongly leached tropical soils with low base saturation.", color: "#993C1D" },
  Regosol: { icon: "⛰️", description: "Weakly developed soils on unconsolidated material.", color: "#888780" },
  Unknown: { icon: "🌍", description: "Soil classification could not be determined.", color: "#5F5E5A" },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { lat, lon } = await req.json();
    if (lat == null || lon == null) throw new Error("lat and lon required");

    const propParams = PROPERTIES.map(p => `property=${p}`).join("&");
    const depthParams = DEPTHS.map(d => `depth=${d}`).join("&");

    const propsUrl = `${SOILGRIDS_BASE}/properties/query?lon=${lon}&lat=${lat}&${propParams}&${depthParams}&value=mean`;
    const classUrl = `${SOILGRIDS_BASE}/classification/query?lon=${lon}&lat=${lat}&number_classes=3`;

    const [propsRes, classRes] = await Promise.all([
      fetch(propsUrl),
      fetch(classUrl),
    ]);

    if (!propsRes.ok) {
      const t = await propsRes.text();
      console.error("SoilGrids properties error:", propsRes.status, t);
      throw new Error(`SoilGrids unavailable (${propsRes.status})`);
    }

    const propsData = await propsRes.json();
    const layers = propsData?.properties?.layers || [];

    let wrb = "Unknown";
    if (classRes.ok) {
      try {
        const classData = await classRes.json();
        wrb = classData?.properties?.["most probable classification"]?.wrb_class_name || "Unknown";
      } catch {}
    }

    // Extract raw values (SoilGrids units)
    const raw: Record<string, number | null> = {};
    for (const p of PROPERTIES) {
      raw[p] = getMean(layers, p, 0);
    }

    // Convert to human-readable
    const toPct = (v: number | null) => v != null ? Math.round(v / 10 * 10) / 10 : null;
    let sandPct = toPct(raw.sand);
    let siltPct = toPct(raw.silt);
    let clayPct = toPct(raw.clay);

    // Normalize to 100%
    if (sandPct != null && siltPct != null && clayPct != null) {
      const total = sandPct + siltPct + clayPct;
      if (total > 0) {
        sandPct = Math.round(sandPct / total * 1000) / 10;
        siltPct = Math.round(siltPct / total * 1000) / 10;
        clayPct = Math.round(clayPct / total * 1000) / 10;
      }
    }

    const phVal = raw.phh2o != null ? Math.round(raw.phh2o / 10 * 10) / 10 : null;
    const socVal = raw.soc != null ? Math.round(raw.soc / 10 * 10) / 10 : null;
    const bdVal = raw.bdod != null ? Math.round(raw.bdod / 100 * 100) / 100 : null;
    const nVal = raw.nitrogen != null ? Math.round(raw.nitrogen / 100 * 100) / 100 : null;
    const cecVal = raw.cec != null ? Math.round(raw.cec / 10 * 10) / 10 : null;

    // Water retention
    const fieldCapacity = raw.wv0033 != null ? Math.round(raw.wv0033) / 10 : null; // %
    const wiltingPoint = raw.wv1500 != null ? Math.round(raw.wv1500) / 10 : null; // %
    const availableWater = (fieldCapacity != null && wiltingPoint != null) ? Math.round((fieldCapacity - wiltingPoint) * 10) / 10 : null;

    // Coarse fragments
    const coarseFragments = raw.cfvo != null ? Math.round(raw.cfvo / 10 * 10) / 10 : null;

    const soilClass = classifySoil(raw.sand, raw.clay, raw.silt, raw.phh2o, raw.soc, wrb);
    const info = SOIL_INFO[soilClass] || SOIL_INFO.Unknown;

    // Build depth profiles for key properties
    const depthProfiles: Record<string, { depth: string; value: number | null }[]> = {};
    for (const prop of ["phh2o", "soc", "nitrogen", "clay", "sand"]) {
      const profiles: { depth: string; value: number | null }[] = [];
      for (let i = 0; i < DEPTHS.length; i++) {
        const val = getMean(layers, prop, i);
        profiles.push({ depth: DEPTHS[i], value: val });
      }
      depthProfiles[prop] = profiles;
    }

    return new Response(JSON.stringify({
      classification: {
        soil_class: soilClass,
        wrb_name: wrb,
        icon: info.icon,
        description: info.description,
        color: info.color,
      },
      metrics: {
        ph: phVal,
        ph_rating: phRating(phVal),
        soc_g_per_kg: socVal,
        soc_rating: socRating(socVal),
        bulk_density: bdVal,
        nitrogen_g_per_kg: nVal,
        nitrogen_rating: nitrogenRating(nVal),
        cec: cecVal,
        coarse_fragments_pct: coarseFragments,
      },
      texture: {
        sand_pct: sandPct,
        silt_pct: siltPct,
        clay_pct: clayPct,
        usda_class: usdaTexture(sandPct, siltPct, clayPct),
      },
      water_retention: {
        field_capacity_pct: fieldCapacity,
        wilting_point_pct: wiltingPoint,
        available_water_pct: availableWater,
      },
      depth_profiles: depthProfiles,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("soil-data error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
