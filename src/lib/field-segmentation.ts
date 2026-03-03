/**
 * Deterministic field boundary detection via RGB-based vegetation index segmentation.
 * Runs entirely client-side on the map canvas.
 */

export interface DetectedPolygon {
  /** Pixel coordinates of the boundary */
  pixelBoundary: [number, number][];
  /** Geo coordinates [lng, lat][] */
  coordinates: [number, number][];
  /** Area in hectares */
  areaHa: number;
  /** Mean vegetation index of the region */
  meanVegIndex: number;
}

export interface SegmentationResult {
  polygons: DetectedPolygon[];
  processingTimeMs: number;
}

export interface SegmentationOptions {
  /** Vegetation index threshold (default 0.08) */
  vegThreshold?: number;
  /** Morphological kernel radius in pixels (default 3) */
  morphKernel?: number;
  /** Minimum region area in hectares (default 0.5) */
  minAreaHa?: number;
  /** Downscale factor for performance (default 2) */
  downscale?: number;
}

interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/**
 * Main entry: run full segmentation pipeline on a canvas.
 */
export function detectFieldBoundaries(
  canvas: HTMLCanvasElement,
  bounds: Bounds,
  options: SegmentationOptions = {}
): SegmentationResult {
  const t0 = performance.now();
  const {
    vegThreshold = 0.08,
    morphKernel = 3,
    minAreaHa = 0.5,
    downscale = 2,
  } = options;

  // 1. Extract pixels (downscaled for perf)
  const w = Math.floor(canvas.width / downscale);
  const h = Math.floor(canvas.height / downscale);
  const offscreen = document.createElement("canvas");
  offscreen.width = w;
  offscreen.height = h;
  const ctx = offscreen.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const pixels = imageData.data;

  // 2. Compute vegetation index: (G - R) / (G + R), threshold to binary mask
  const mask = new Uint8Array(w * h);
  const vegValues = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const sum = g + r;
    const vi = sum > 0 ? (g - r) / sum : 0;
    vegValues[i] = vi;
    mask[i] = vi > vegThreshold ? 1 : 0;
  }

  // 3. Morphological closing (dilate then erode) to clean noise
  const dilated = morphDilate(mask, w, h, morphKernel);
  const closed = morphErode(dilated, w, h, morphKernel);

  // 4. Connected component labeling
  const { labels, numComponents } = connectedComponents(closed, w, h);

  // 5. For each component, compute area, filter, extract boundary
  const metersPerPixelX = haversineDistance(bounds.west, bounds.south, bounds.east, bounds.south) / w;
  const metersPerPixelY = haversineDistance(bounds.west, bounds.south, bounds.west, bounds.north) / h;
  const pixelAreaM2 = metersPerPixelX * metersPerPixelY;
  const minAreaPixels = (minAreaHa * 10000) / pixelAreaM2;

  const polygons: DetectedPolygon[] = [];

  for (let comp = 1; comp <= numComponents; comp++) {
    // Collect pixels for this component
    let count = 0;
    let sumVeg = 0;
    let minX = w, maxX = 0, minY = h, maxY = 0;

    for (let i = 0; i < w * h; i++) {
      if (labels[i] === comp) {
        count++;
        sumVeg += vegValues[i];
        const x = i % w;
        const y = Math.floor(i / w);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }

    if (count < minAreaPixels) continue;

    // Extract boundary via contour tracing
    const boundary = traceContour(labels, w, h, comp, minX, minY, maxX, maxY);
    if (boundary.length < 4) continue;

    // Simplify boundary (Ramer-Douglas-Peucker)
    const simplified = rdpSimplify(boundary, 2.0);
    if (simplified.length < 4) continue;

    // Convert pixel coords to geo coords
    const geoCoords = simplified.map(([px, py]): [number, number] => {
      const lng = bounds.west + (px * downscale / canvas.width) * (bounds.east - bounds.west);
      const lat = bounds.north - (py * downscale / canvas.height) * (bounds.north - bounds.south);
      return [lng, lat];
    });

    const areaHa = (count * pixelAreaM2) / 10000;
    const meanVegIndex = sumVeg / count;

    polygons.push({
      pixelBoundary: simplified,
      coordinates: geoCoords,
      areaHa: Math.round(areaHa * 100) / 100,
      meanVegIndex: Math.round(meanVegIndex * 1000) / 1000,
    });
  }

  // Sort by area descending
  polygons.sort((a, b) => b.areaHa - a.areaHa);

  return {
    polygons,
    processingTimeMs: Math.round(performance.now() - t0),
  };
}

// --- Morphological operations ---

function morphDilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let found = false;
      for (let dy = -r; dy <= r && !found; dy++) {
        for (let dx = -r; dx <= r && !found; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h && mask[ny * w + nx]) found = true;
        }
      }
      out[y * w + x] = found ? 1 : 0;
    }
  }
  return out;
}

function morphErode(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let allSet = true;
      for (let dy = -r; dy <= r && allSet; dy++) {
        for (let dx = -r; dx <= r && allSet; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h || !mask[ny * w + nx]) allSet = false;
        }
      }
      out[y * w + x] = allSet ? 1 : 0;
    }
  }
  return out;
}

// --- Connected component labeling (two-pass) ---

function connectedComponents(mask: Uint8Array, w: number, h: number): { labels: Int32Array; numComponents: number } {
  const labels = new Int32Array(w * h);
  let nextLabel = 1;
  const parent = new Int32Array(w * h + 1);
  for (let i = 0; i < parent.length; i++) parent[i] = i;

  const find = (x: number): number => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  // First pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      const above = y > 0 ? labels[(y - 1) * w + x] : 0;
      const left = x > 0 ? labels[y * w + x - 1] : 0;
      if (above && left) {
        labels[i] = above;
        union(above, left);
      } else if (above) {
        labels[i] = above;
      } else if (left) {
        labels[i] = left;
      } else {
        labels[i] = nextLabel++;
      }
    }
  }

  // Second pass: flatten
  const remap = new Map<number, number>();
  let finalCount = 0;
  for (let i = 0; i < w * h; i++) {
    if (!labels[i]) continue;
    const root = find(labels[i]);
    if (!remap.has(root)) remap.set(root, ++finalCount);
    labels[i] = remap.get(root)!;
  }

  return { labels, numComponents: finalCount };
}

// --- Contour tracing (simple boundary walk) ---

function traceContour(
  labels: Int32Array, w: number, h: number, comp: number,
  minX: number, minY: number, maxX: number, maxY: number
): [number, number][] {
  // Collect boundary pixels (pixels of comp adjacent to non-comp)
  const boundary: [number, number][] = [];
  const dx = [0, 1, 0, -1, 1, 1, -1, -1];
  const dy = [-1, 0, 1, 0, -1, 1, 1, -1];

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (labels[y * w + x] !== comp) continue;
      let isBoundary = false;
      for (let d = 0; d < 8; d++) {
        const nx = x + dx[d], ny = y + dy[d];
        if (nx < 0 || nx >= w || ny < 0 || ny >= h || labels[ny * w + nx] !== comp) {
          isBoundary = true;
          break;
        }
      }
      if (isBoundary) boundary.push([x, y]);
    }
  }

  if (boundary.length === 0) return [];

  // Order boundary points by angle from centroid
  const cx = boundary.reduce((s, p) => s + p[0], 0) / boundary.length;
  const cy = boundary.reduce((s, p) => s + p[1], 0) / boundary.length;
  boundary.sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));

  // Subsample for performance (keep ~200 points max)
  if (boundary.length > 200) {
    const step = Math.ceil(boundary.length / 200);
    const sampled: [number, number][] = [];
    for (let i = 0; i < boundary.length; i += step) sampled.push(boundary[i]);
    return sampled;
  }

  return boundary;
}

// --- Ramer-Douglas-Peucker simplification ---

function rdpSimplify(points: [number, number][], epsilon: number): [number, number][] {
  if (points.length <= 2) return points;

  let maxDist = 0, maxIdx = 0;
  const [sx, sy] = points[0];
  const [ex, ey] = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = pointLineDistance(points[i][0], points[i][1], sx, sy, ex, ey);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }

  if (maxDist > epsilon) {
    const left = rdpSimplify(points.slice(0, maxIdx + 1), epsilon);
    const right = rdpSimplify(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [points[0], points[points.length - 1]];
}

function pointLineDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// --- Haversine distance ---

function haversineDistance(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// --- Helper to assign colors by vegetation index ---

const FIELD_COLORS = ["#2E7D32", "#4CAF50", "#8BC34A", "#F9A825", "#FFB300", "#8D6E63", "#A1887F", "#66BB6A", "#43A047"];

export function assignFieldColor(index: number): string {
  return FIELD_COLORS[index % FIELD_COLORS.length];
}
