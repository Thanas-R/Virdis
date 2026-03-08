import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── GEE Auth helpers ──────────────────────────────────────────────

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

// ── GEE REST API: computePixels approach ─────────────────────────

const GEE_API = "https://earthengine.googleapis.com/v1";

async function geeComputePixels(
  token: string,
  expression: any,
  grid: any
): Promise<ArrayBuffer> {
  const projectId = Deno.env.get("GEE_PROJECT_ID") || "earthengine-legacy";
  const resp = await fetch(`${GEE_API}/projects/${projectId}/image:computePixels`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expression, fileFormat: "NPY", grid }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    console.error("GEE computePixels error:", resp.status, t);
    throw new Error(`GEE computePixels failed (${resp.status}): ${t.slice(0, 500)}`);
  }
  return resp.arrayBuffer();
}

// Parse NumPy .npy format (simple float32/float64 2D arrays)
function parseNpy(buffer: ArrayBuffer): { data: Float64Array | Float32Array; shape: number[] } {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  
  // Magic: \x93NUMPY
  const majorVersion = bytes[6];
  let headerLen: number;
  let headerOffset: number;
  
  if (majorVersion >= 2) {
    headerLen = view.getUint32(8, true);
    headerOffset = 12;
  } else {
    headerLen = view.getUint16(8, true);
    headerOffset = 10;
  }
  
  const headerStr = new TextDecoder().decode(new Uint8Array(buffer, headerOffset, headerLen));
  console.log("NPY header:", headerStr);
  
  // Parse shape
  const shapeMatch = headerStr.match(/shape['"]\s*:\s*\(([^)]+)\)/);
  const shape = shapeMatch ? shapeMatch[1].split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n)) : [];
  
  // Parse dtype
  const descrMatch = headerStr.match(/descr['"]\s*:\s*'([^']+)'/);
  const descr = descrMatch ? descrMatch[1] : "<f8";
  console.log("NPY dtype:", descr, "shape:", shape);
  
  const dataOffset = headerOffset + headerLen;
  
  let data: Float64Array | Float32Array;
  if (descr.includes("f4")) {
    data = new Float32Array(buffer, dataOffset);
  } else if (descr.includes("f8")) {
    data = new Float64Array(buffer, dataOffset);
  } else {
    // Might be int or other format - try float64
    console.warn("Unexpected dtype:", descr, "- attempting float64");
    data = new Float64Array(buffer, dataOffset);
  }
  
  // Log first few values for debugging
  const sample = Array.from(data.slice(0, 10));
  const nonZero = Array.from(data).filter(v => v !== 0).length;
  console.log(`NPY data: ${data.length} values, ${nonZero} non-zero, first 10:`, sample);
  console.log(`NPY min=${Math.min(...Array.from(data))}, max=${Math.max(...Array.from(data))}`);
  
  return { data, shape };
}

// ── Region growing on NDVI grid ───────────────────────────────────

function regionGrow(
  grid: number[][],
  startRow: number,
  startCol: number,
  threshold: number
): boolean[][] {
  const h = grid.length;
  const w = grid[0].length;
  const visited: boolean[][] = Array.from({ length: h }, () => new Array(w).fill(false));
  const seedVal = grid[startRow][startCol];

  const queue: [number, number][] = [[startRow, startCol]];
  visited[startRow][startCol] = true;

  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= h || nc < 0 || nc >= w) continue;
      if (visited[nr][nc]) continue;
      if (Math.abs(grid[nr][nc] - seedVal) <= threshold && grid[nr][nc] > 0) {
        visited[nr][nc] = true;
        queue.push([nr, nc]);
      }
    }
  }
  return visited;
}

function maskToPolygon(
  mask: boolean[][],
  west: number,
  south: number,
  cellLng: number,
  cellLat: number
): [number, number][] {
  const boundaryPts: [number, number][] = [];
  const h = mask.length;
  const w = mask[0].length;

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (!mask[r][c]) continue;
      const isBoundary =
        r === 0 || r === h - 1 || c === 0 || c === w - 1 ||
        !mask[r - 1][c] || !mask[r + 1][c] || !mask[r][c - 1] || !mask[r][c + 1];
      if (isBoundary) {
        const lng = west + (c + 0.5) * cellLng;
        const lat = south + (h - r - 0.5) * cellLat;
        boundaryPts.push([lng, lat]);
      }
    }
  }

  if (boundaryPts.length < 3) return boundaryPts;

  // Convex hull (Graham scan)
  boundaryPts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (O: [number, number], A: [number, number], B: [number, number]) =>
    (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0]);

  const lower: [number, number][] = [];
  for (const p of boundaryPts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }

  const upper: [number, number][] = [];
  for (const p of [...boundaryPts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  const hull = [...lower, ...upper];
  if (hull.length > 0) hull.push(hull[0]);
  return hull;
}

function computeFieldStats(
  grid: number[][],
  mask: boolean[][]
): { meanNdvi: number; stdNdvi: number; healthScore: number; pixelCount: number } {
  const values: number[] = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[0].length; c++) {
      if (mask[r][c]) values.push(grid[r][c]);
    }
  }
  if (values.length === 0) return { meanNdvi: 0, stdNdvi: 0, healthScore: 0, pixelCount: 0 };

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  const healthScore = Math.min(100, Math.max(0, Math.round((mean / 0.8) * 100)));

  return {
    meanNdvi: Math.round(mean * 1000) / 1000,
    stdNdvi: Math.round(std * 1000) / 1000,
    healthScore,
    pixelCount: values.length,
  };
}

function computeAreaHectares(coords: [number, number][]): number {
  if (coords.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const j = (i + 1) % coords.length;
    area += coords[i][0] * coords[j][1];
    area -= coords[j][0] * coords[i][1];
  }
  area = Math.abs(area) / 2;
  const midLat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const m2 = area * (111320 * Math.cos((midLat * Math.PI) / 180)) * 111320;
  return Math.round((m2 / 10000) * 100) / 100;
}

// ── Build GEE expression using ee.serializer-compatible format ────
// The Expression must use { values: { key: ValueNode }, result: key } DAG format.
// ValueNodes use: constantValue, functionInvocationValue, arrayValue, valueReference, argumentReference

function buildNdviExpression(west: number, south: number, east: number, north: number, startDate: string, endDate: string) {
  // Simplified: skip bounds filter since computePixels clips to the grid region anyway
  return {
    values: {
      "0": { constantValue: "COPERNICUS/S2_SR_HARMONIZED" },
      "1": {
        functionInvocationValue: {
          functionName: "ImageCollection.load",
          arguments: { id: { valueReference: "0" } },
        },
      },
      // Date filter
      "2": { constantValue: startDate },
      "3": { constantValue: endDate },
      "4": {
        functionInvocationValue: {
          functionName: "DateRange",
          arguments: {
            start: { valueReference: "2" },
            end: { valueReference: "3" },
          },
        },
      },
      "5": { constantValue: "system:time_start" },
      "6": {
        functionInvocationValue: {
          functionName: "Filter.dateRangeContains",
          arguments: {
            leftValue: { valueReference: "4" },
            rightField: { valueReference: "5" },
          },
        },
      },
      "7": {
        functionInvocationValue: {
          functionName: "Collection.filter",
          arguments: {
            collection: { valueReference: "1" },
            filter: { valueReference: "6" },
          },
        },
      },
      // Cloud filter
      "8": { constantValue: "CLOUDY_PIXEL_PERCENTAGE" },
      "9": { constantValue: 30 },
      "10": {
        functionInvocationValue: {
          functionName: "Filter.lessThan",
          arguments: {
            leftField: { valueReference: "8" },
            rightValue: { valueReference: "9" },
          },
        },
      },
      "11": {
        functionInvocationValue: {
          functionName: "Collection.filter",
          arguments: {
            collection: { valueReference: "7" },
            filter: { valueReference: "10" },
          },
        },
      },
      // Median
      "12": {
        functionInvocationValue: {
          functionName: "Reducer.median",
          arguments: {},
        },
      },
      "13": {
        functionInvocationValue: {
          functionName: "ImageCollection.reduce",
          arguments: {
            collection: { valueReference: "11" },
            reducer: { valueReference: "12" },
          },
        },
      },
      // NDVI
      "14": { constantValue: ["B8_median", "B4_median"] },
      "15": {
        functionInvocationValue: {
          functionName: "Image.normalizedDifference",
          arguments: {
            input: { valueReference: "13" },
            bandNames: { valueReference: "14" },
          },
        },
      },
    },
    result: "15",
  };
}


// ── Main handler ──────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { lat, lng } = await req.json();
    if (typeof lat !== "number" || typeof lng !== "number") {
      throw new Error("Missing lat/lng");
    }

    console.log(`Detecting field at ${lat}, ${lng}`);

    const token = await getGeeAccessToken();

    // Buffer ~500m around click point
    const bufferDeg = 500 / 111320;
    const cosLat = Math.cos((lat * Math.PI) / 180);
    const west = lng - bufferDeg / cosLat;
    const east = lng + bufferDeg / cosLat;
    const south = lat - bufferDeg;
    const north = lat + bufferDeg;

    const gridSize = 64;
    const cellLng = (east - west) / gridSize;
    const cellLat = (north - south) / gridSize;

    // Date range: use a known period with Sentinel-2 data
    // Go back further to ensure we get data (S2 archive may not cover very recent dates)
    const endDate = "2024-09-30";
    const startDate = "2024-06-01";

    const expression = buildNdviExpression(west, south, east, north, startDate, endDate);

    // Scale: degrees per pixel
    const scaleX = (east - west) / gridSize;
    const scaleY = (north - south) / gridSize;

    console.log("Computing NDVI grid via GEE computePixels...");
    
    const pixelData = await geeComputePixels(token, expression, {
      dimensions: { width: gridSize, height: gridSize },
      affineTransform: {
        scaleX: scaleX,
        shearX: 0,
        translateX: west,
        shearY: 0,
        scaleY: -scaleY,
        translateY: north,
      },
      crsCode: "EPSG:4326",
    });

    // Parse NPY data into 2D grid
    const { data, shape } = parseNpy(pixelData);
    const h = shape[0] || gridSize;
    const w = shape[1] || gridSize;
    
    const ndviGrid: number[][] = [];
    for (let r = 0; r < h; r++) {
      const row: number[] = [];
      for (let c = 0; c < w; c++) {
        const val = data[r * w + c];
        row.push(isNaN(val) ? 0 : val);
      }
      ndviGrid.push(row);
    }

    console.log(`Grid size: ${w}x${h}, center NDVI=${ndviGrid[Math.floor(h/2)]?.[Math.floor(w/2)]}`);

    if (ndviGrid.length === 0) {
      return new Response(
        JSON.stringify({ error: "No NDVI data returned from GEE" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Region growing from click point (center of grid)
    const clickRow = Math.floor(h / 2);
    const clickCol = Math.floor(w / 2);
    const mask = regionGrow(ndviGrid, clickRow, clickCol, 0.12);

    // Convert mask to polygon
    const polygonCoords = maskToPolygon(mask, west, south, cellLng, cellLat);

    if (polygonCoords.length < 4) {
      return new Response(
        JSON.stringify({ error: "Could not detect a clear field boundary at this location" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Compute statistics
    const stats = computeFieldStats(ndviGrid, mask);
    const areaHectares = computeAreaHectares(polygonCoords);

    // Determine crop type from NDVI
    let crop = "Bare Soil";
    let cropEmoji = "🟤";
    if (stats.meanNdvi > 0.5) { crop = "Dense Vegetation"; cropEmoji = "🌳"; }
    else if (stats.meanNdvi > 0.35) { crop = "Active Crop"; cropEmoji = "🌾"; }
    else if (stats.meanNdvi > 0.2) { crop = "Moderate Vegetation"; cropEmoji = "🌿"; }
    else if (stats.meanNdvi > 0.1) { crop = "Sparse Vegetation"; cropEmoji = "🌱"; }

    console.log(`Detected field: ${areaHectares} ha, NDVI=${stats.meanNdvi}, health=${stats.healthScore}`);

    return new Response(
      JSON.stringify({
        _debug,
        field: {
          coordinates: polygonCoords,
          stats: {
            areaHectares,
            meanNdvi: stats.meanNdvi,
            stdNdvi: stats.stdNdvi,
            healthScore: stats.healthScore,
            pixelCount: stats.pixelCount,
          },
          crop,
          cropEmoji,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("gee-detect-field error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
