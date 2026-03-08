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

// ── Expression helpers ───────────────────────────────────────────

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
    console.error("GEE value:compute error:", resp.status, t);
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

function reduceRegion(image: any, geometry: any, reducerName: string, scale = 10) {
  return {
    functionInvocationValue: {
      functionName: "Image.reduceRegion",
      arguments: {
        image,
        reducer: { functionInvocationValue: { functionName: reducerName, arguments: {} } },
        geometry,
        scale: { constantValue: scale },
        maxPixels: { constantValue: 1000000000 },
      },
    },
  };
}

// ── Land Use (ESA WorldCover) ────────────────────────────────────

async function computeLandUse(token: string, projectId: string, coords: [number, number][]) {
  const geometry = makeGeometry(coords);

  // Load ESA WorldCover v200
  const collection = {
    functionInvocationValue: {
      functionName: "ImageCollection.load",
      arguments: { id: { constantValue: "ESA/WorldCover/v200" } },
    },
  };
  const image = {
    functionInvocationValue: {
      functionName: "ImageCollection.mosaic",
      arguments: { collection },
    },
  };
  const clipped = {
    functionInvocationValue: {
      functionName: "Image.clip",
      arguments: { input: image, geometry },
    },
  };

  // Use frequencyHistogram reducer to get pixel counts per class
  const histResult = await computeValue(token, projectId, reduceRegion(clipped, geometry, "Reducer.frequencyHistogram", 10));
  console.log("Land use histogram:", JSON.stringify(histResult));

  // ESA WorldCover class codes
  const classNames: Record<string, string> = {
    "10": "Tree cover",
    "20": "Shrubland",
    "30": "Grassland",
    "40": "Cropland",
    "50": "Built-up",
    "60": "Bare/sparse",
    "70": "Snow/ice",
    "80": "Water",
    "90": "Wetland",
    "95": "Mangroves",
    "100": "Moss/lichen",
  };

  // The histogram is in result.Map (the band name)
  const hist = histResult?.result?.Map || histResult?.result?.map || {};
  let total = 0;
  const counts: Record<string, number> = {};
  for (const [classCode, count] of Object.entries(hist)) {
    const n = Number(count);
    total += n;
    const name = classNames[classCode] || `Class ${classCode}`;
    counts[name] = (counts[name] || 0) + n;
  }

  if (total === 0) return null;

  const landUse: Record<string, number> = {};
  for (const [name, count] of Object.entries(counts)) {
    landUse[name] = Math.round((count / total) * 1000) / 10;
  }
  return landUse;
}

// ── Vegetation Indices (NDVI + EVI) ──────────────────────────────

async function computeVegetationIndices(token: string, projectId: string, coords: [number, number][]) {
  const geometry = makeGeometry(coords);
  const now = new Date();
  const endDate = now.toISOString().split("T")[0];
  const startDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

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

  // Median composite
  const image = {
    functionInvocationValue: {
      functionName: "ImageCollection.reduce",
      arguments: {
        collection: cloudFiltered,
        reducer: { functionInvocationValue: { functionName: "Reducer.median", arguments: {} } },
      },
    },
  };

  // NDVI = (B8_median - B4_median) / (B8_median + B4_median)
  const ndvi = {
    functionInvocationValue: {
      functionName: "Image.normalizedDifference",
      arguments: {
        input: image,
        bandNames: { constantValue: ["B8_median", "B4_median"] },
      },
    },
  };

  const ndviClipped = {
    functionInvocationValue: {
      functionName: "Image.clip",
      arguments: { input: ndvi, geometry },
    },
  };

  // EVI = 2.5 * (B8 - B4) / (B8 + 6*B4 - 7.5*B2 + 1)
  // Using expression approach: select bands, do math
  // Simpler: use normalizedDifference for approximate EVI proxy
  // For a proper EVI we'd need Image.expression which is complex in REST API
  // Use a simplified approach: select B8, B4, B2 and compute via band math
  const b8 = {
    functionInvocationValue: {
      functionName: "Image.select",
      arguments: { input: image, bandSelectors: { constantValue: ["B8_median"] } },
    },
  };
  const b4 = {
    functionInvocationValue: {
      functionName: "Image.select",
      arguments: { input: image, bandSelectors: { constantValue: ["B4_median"] } },
    },
  };
  const b2 = {
    functionInvocationValue: {
      functionName: "Image.select",
      arguments: { input: image, bandSelectors: { constantValue: ["B2_median"] } },
    },
  };

  // EVI numerator: 2.5 * (B8 - B4)
  const diff84 = {
    functionInvocationValue: {
      functionName: "Image.subtract",
      arguments: { image1: b8, image2: b4 },
    },
  };
  const eviNumerator = {
    functionInvocationValue: {
      functionName: "Image.multiply",
      arguments: {
        image1: diff84,
        image2: { functionInvocationValue: { functionName: "Image.constant", arguments: { value: { constantValue: 2.5 } } } },
      },
    },
  };

  // EVI denominator: B8 + 6*B4 - 7.5*B2 + 1
  const sixB4 = {
    functionInvocationValue: {
      functionName: "Image.multiply",
      arguments: {
        image1: b4,
        image2: { functionInvocationValue: { functionName: "Image.constant", arguments: { value: { constantValue: 6 } } } },
      },
    },
  };
  const sevenFiveB2 = {
    functionInvocationValue: {
      functionName: "Image.multiply",
      arguments: {
        image1: b2,
        image2: { functionInvocationValue: { functionName: "Image.constant", arguments: { value: { constantValue: 7.5 } } } },
      },
    },
  };
  const denomPart1 = {
    functionInvocationValue: {
      functionName: "Image.add",
      arguments: { image1: b8, image2: sixB4 },
    },
  };
  const denomPart2 = {
    functionInvocationValue: {
      functionName: "Image.subtract",
      arguments: { image1: denomPart1, image2: sevenFiveB2 },
    },
  };
  const eviDenom = {
    functionInvocationValue: {
      functionName: "Image.add",
      arguments: {
        image1: denomPart2,
        image2: { functionInvocationValue: { functionName: "Image.constant", arguments: { value: { constantValue: 10000 } } } },
        // S2 SR values are in DN (0-10000 scale), so +10000 for the +1 in reflectance scale
      },
    },
  };
  const evi = {
    functionInvocationValue: {
      functionName: "Image.divide",
      arguments: { image1: eviNumerator, image2: eviDenom },
    },
  };
  const eviClipped = {
    functionInvocationValue: {
      functionName: "Image.clip",
      arguments: { input: evi, geometry },
    },
  };

  // Canopy cover: count pixels where NDVI > 0.5
  // Use gt threshold then reduceMean to get fraction
  const ndviGt = {
    functionInvocationValue: {
      functionName: "Image.gt",
      arguments: {
        image1: ndviClipped,
        image2: { functionInvocationValue: { functionName: "Image.constant", arguments: { value: { constantValue: 0.5 } } } },
      },
    },
  };

  const [ndviMean, eviMean, canopyMean] = await Promise.all([
    computeValue(token, projectId, reduceRegion(ndviClipped, geometry, "Reducer.mean")),
    computeValue(token, projectId, reduceRegion(eviClipped, geometry, "Reducer.mean")),
    computeValue(token, projectId, reduceRegion(ndviGt, geometry, "Reducer.mean")),
  ]);

  console.log("Vegetation indices:", JSON.stringify({ ndviMean, eviMean, canopyMean }));

  const meanNdvi = ndviMean?.result?.nd ?? null;
  const meanEvi = eviMean?.result?.B8_median ?? null;
  const canopyCover = canopyMean?.result?.nd ?? null;

  if (meanNdvi === null) return null;

  return {
    mean_ndvi: Math.round(meanNdvi * 1000) / 1000,
    mean_evi: meanEvi !== null ? Math.round(meanEvi * 1000) / 1000 : null,
    canopy_cover_pct: canopyCover !== null ? Math.round(canopyCover * 100) : null,
    // Biomass estimate: simple empirical model based on NDVI
    biomass_estimate_kg_ha: Math.round(Math.max(0, (meanNdvi * 12000 - 1000))),
    date_range: `${startDate} to ${endDate}`,
  };
}

// ── Land Suitability (SRTM + CHIRPS) ────────────────────────────

async function computeLandSuitability(token: string, projectId: string, coords: [number, number][]) {
  const geometry = makeGeometry(coords);

  // 1. Elevation from SRTM
  const srtm = {
    functionInvocationValue: {
      functionName: "Image.load",
      arguments: { id: { constantValue: "USGS/SRTMGL1_003" } },
    },
  };
  const srtmClipped = {
    functionInvocationValue: {
      functionName: "Image.clip",
      arguments: { input: srtm, geometry },
    },
  };

  // Slope
  const slope = {
    functionInvocationValue: {
      functionName: "Terrain.slope",
      arguments: { input: srtmClipped },
    },
  };

  // 2. Rainfall from CHIRPS (last 365 days)
  const now = new Date();
  const endDate = now.toISOString().split("T")[0];
  const startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const chirps = {
    functionInvocationValue: {
      functionName: "ImageCollection.load",
      arguments: { id: { constantValue: "UCSB-CHG/CHIRPS/DAILY" } },
    },
  };
  const chirpsFiltered = {
    functionInvocationValue: {
      functionName: "Collection.filter",
      arguments: {
        collection: chirps,
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
  const totalRainfall = {
    functionInvocationValue: {
      functionName: "ImageCollection.reduce",
      arguments: {
        collection: chirpsFiltered,
        reducer: { functionInvocationValue: { functionName: "Reducer.sum", arguments: {} } },
      },
    },
  };
  const rainfallClipped = {
    functionInvocationValue: {
      functionName: "Image.clip",
      arguments: { input: totalRainfall, geometry },
    },
  };

  // 3. Soil data from OpenLandMap (SoilGrids via GEE)
  const soilOC = {
    functionInvocationValue: {
      functionName: "Image.load",
      arguments: { id: { constantValue: "OpenLandMap/SOL/SOL_ORGANIC-CARBON_USDA-6A1C_M/v02" } },
    },
  };
  const soilOCClipped = {
    functionInvocationValue: {
      functionName: "Image.clip",
      arguments: { input: soilOC, geometry },
    },
  };
  // Select surface layer band (b0 = 0cm)
  const soilOCSurface = {
    functionInvocationValue: {
      functionName: "Image.select",
      arguments: { input: soilOCClipped, bandSelectors: { constantValue: ["b0"] } },
    },
  };

  const [elevResult, slopeResult, rainfallResult, soilResult] = await Promise.all([
    computeValue(token, projectId, reduceRegion(srtmClipped, geometry, "Reducer.mean", 30)),
    computeValue(token, projectId, reduceRegion(slope, geometry, "Reducer.mean", 30)),
    computeValue(token, projectId, reduceRegion(rainfallClipped, geometry, "Reducer.mean", 5000)),
    computeValue(token, projectId, reduceRegion(soilOCSurface, geometry, "Reducer.mean", 250)),
  ]);

  console.log("Suitability raw:", JSON.stringify({ elevResult, slopeResult, rainfallResult, soilResult }));

  const elevation = elevResult?.result?.elevation ?? null;
  const slopeVal = slopeResult?.result?.slope ?? null;
  const rainfall = rainfallResult?.result?.precipitation_sum ?? null;
  const soilOCVal = soilResult?.result?.b0 ?? null;

  // Normalize to 0-100 scores
  // Topography: flat is best. Score decreases with slope.
  const topography = slopeVal !== null ? Math.max(0, Math.round(100 - slopeVal * 5)) : null;
  
  // Water access: optimal rainfall ~800-1200mm/year
  let water_access: number | null = null;
  if (rainfall !== null) {
    if (rainfall >= 600 && rainfall <= 1500) water_access = Math.round(80 + (20 * (1 - Math.abs(rainfall - 1000) / 500)));
    else if (rainfall < 600) water_access = Math.round((rainfall / 600) * 70);
    else water_access = Math.round(Math.max(30, 100 - (rainfall - 1500) / 20));
    water_access = Math.min(100, Math.max(0, water_access));
  }

  // Climate: based on rainfall variability and total — simplified
  const climate = water_access !== null ? Math.min(100, Math.max(0, Math.round(water_access * 0.9 + 10))) : null;

  // Soil quality: based on organic carbon content (g/kg). Higher = better.
  // Typical range: 5-60 g/kg. Normalize.
  const soil_quality = soilOCVal !== null ? Math.min(100, Math.max(0, Math.round((soilOCVal / 50) * 100))) : null;

  // Drainage: inverse of slope flatness + soil organic content
  const drainage = topography !== null ? Math.min(100, Math.max(0, Math.round(topography * 0.7 + (soil_quality || 50) * 0.3))) : null;

  // Nutrient level: derived from soil organic carbon
  const nutrient_level = soil_quality !== null ? Math.min(100, Math.max(0, Math.round(soil_quality * 1.1))) : null;

  return {
    soil_quality, water_access, climate, topography, drainage, nutrient_level,
    raw: {
      elevation_m: elevation !== null ? Math.round(elevation) : null,
      slope_deg: slopeVal !== null ? Math.round(slopeVal * 10) / 10 : null,
      annual_rainfall_mm: rainfall !== null ? Math.round(rainfall) : null,
      soil_organic_carbon: soilOCVal !== null ? Math.round(soilOCVal * 10) / 10 : null,
    },
  };
}

// ── Growth Stage (NDVI time-series) ──────────────────────────────

async function computeGrowthStage(token: string, projectId: string, coords: [number, number][]) {
  const geometry = makeGeometry(coords);
  const now = new Date();
  const endDate = now.toISOString().split("T")[0];
  const startDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

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
            arguments: { leftField: { constantValue: ".geo" }, rightValue: geometry },
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
            arguments: { leftField: { constantValue: "CLOUDY_PIXEL_PERCENTAGE" }, rightValue: { constantValue: 20 } },
          },
        },
      },
    },
  };

  // Get most recent image
  const latest = {
    functionInvocationValue: {
      functionName: "Collection.limit",
      arguments: {
        collection: cloudFiltered,
        limit: { constantValue: 1 },
        key: { constantValue: "system:time_start" },
        ascending: { constantValue: false },
      },
    },
  };
  const latestImage = {
    functionInvocationValue: {
      functionName: "ImageCollection.mosaic",
      arguments: { collection: latest },
    },
  };
  const ndvi = {
    functionInvocationValue: {
      functionName: "Image.normalizedDifference",
      arguments: { input: latestImage, bandNames: { constantValue: ["B8", "B4"] } },
    },
  };
  const clipped = {
    functionInvocationValue: {
      functionName: "Image.clip",
      arguments: { input: ndvi, geometry },
    },
  };

  const result = await computeValue(token, projectId, reduceRegion(clipped, geometry, "Reducer.mean"));
  const meanNdvi = result?.result?.nd ?? null;

  if (meanNdvi === null) return null;

  let stage: string;
  let progress: number;
  if (meanNdvi < 0.2) { stage = "Germination"; progress = 15; }
  else if (meanNdvi < 0.4) { stage = "Tillering"; progress = 30; }
  else if (meanNdvi < 0.6) { stage = "Stem Extension"; progress = 50; }
  else if (meanNdvi < 0.75) { stage = "Heading"; progress = 70; }
  else { stage = "Grain Fill"; progress = 90; }

  return { stage, progress, current_ndvi: Math.round(meanNdvi * 1000) / 1000, date_range: `${startDate} to ${endDate}` };
}

// ── Main handler ──────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { polygon, analyses } = body;

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

    // analyses is an array of: "land_use", "vegetation", "suitability", "growth_stage"
    const requested = analyses || ["land_use", "vegetation", "suitability", "growth_stage"];

    const results: Record<string, any> = {};

    const promises: Promise<void>[] = [];

    if (requested.includes("land_use")) {
      promises.push(
        computeLandUse(token, projectId, coords)
          .then((r) => { results.land_use = r; })
          .catch((e) => { console.error("Land use error:", e); results.land_use = null; })
      );
    }
    if (requested.includes("vegetation")) {
      promises.push(
        computeVegetationIndices(token, projectId, coords)
          .then((r) => { results.vegetation = r; })
          .catch((e) => { console.error("Vegetation error:", e); results.vegetation = null; })
      );
    }
    if (requested.includes("suitability")) {
      promises.push(
        computeLandSuitability(token, projectId, coords)
          .then((r) => { results.suitability = r; })
          .catch((e) => { console.error("Suitability error:", e); results.suitability = null; })
      );
    }
    if (requested.includes("growth_stage")) {
      promises.push(
        computeGrowthStage(token, projectId, coords)
          .then((r) => { results.growth_stage = r; })
          .catch((e) => { console.error("Growth stage error:", e); results.growth_stage = null; })
      );
    }

    await Promise.all(promises);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("gee-analytics error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
