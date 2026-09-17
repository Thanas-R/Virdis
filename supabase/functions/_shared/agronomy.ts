// Deterministic agronomy engine.
//
// Every crop recommendation starts here, from measured values (SoilGrids,
// CHIRPS rainfall, Open-Meteo, SRTM elevation/slope, Sentinel-2 NDVI,
// ESA WorldCover land cover). The AI never invents a crop: it only chooses
// among the candidates this module has already validated against the data.

export type ClimateZone =
  | "tropical"
  | "subtropical"
  | "mediterranean"
  | "temperate"
  | "continental"
  | "semiarid"
  | "arid"
  | "highland"
  | "boreal"
  | "polar";

export type WaterNeed = "low" | "medium" | "high";

/** Trapezoid envelope: [hardMin, optMin, optMax, hardMax]. */
export type Envelope = [number, number, number, number];

export interface CropSpec {
  name: string;
  emoji: string;
  category: "cereal" | "pulse" | "oilseed" | "vegetable" | "fruit" | "tree" | "fibre" | "spice" | "forage" | "tuber";
  color: string;
  /** Mean temperature of the growing season, °C. */
  temp: Envelope;
  /** Annual rainfall, mm. */
  rain: Envelope;
  ph: Envelope;
  /** Preferred clay fraction of the topsoil, %. */
  clay: Envelope;
  zones: ClimateZone[];
  /** Potential yield in t/ha under ideal conditions. */
  baseYield: number;
  water: WaterNeed;
  /** In-row plant spacing, metres. */
  spacing_m: number;
  /** Map dot size in px used by the planting-pattern preview. */
  dotSize: number;
  frostHardy: boolean;
  salinityTolerant?: boolean;
  maxElevationM?: number;
  maxSlopeDeg?: number;
  isTree?: boolean;
  nitrogenFixing?: boolean;
  /** Typical growing seasons, used for the rotation plan. */
  seasons: ("spring" | "summer" | "autumn" | "winter" | "kharif" | "rabi" | "zaid" | "perennial")[];
}

export const CROPS: CropSpec[] = [
  // ── Cereals ────────────────────────────────────────────────
  { name: "Wheat", emoji: "🌾", category: "cereal", color: "#EAB308", temp: [3, 12, 22, 30], rain: [250, 450, 900, 1400], ph: [5.0, 6.0, 7.5, 8.5], clay: [8, 18, 40, 55], zones: ["temperate", "continental", "mediterranean", "subtropical", "semiarid", "highland"], baseYield: 4.5, water: "medium", spacing_m: 0.15, dotSize: 4, frostHardy: true, maxElevationM: 3500, seasons: ["rabi", "winter", "spring"] },
  { name: "Rice", emoji: "🍚", category: "cereal", color: "#3B82F6", temp: [18, 24, 33, 40], rain: [900, 1200, 2500, 4000], ph: [4.5, 5.5, 7.0, 8.0], clay: [20, 30, 60, 70], zones: ["tropical", "subtropical"], baseYield: 5.5, water: "high", spacing_m: 0.2, dotSize: 4, frostHardy: false, maxElevationM: 2000, seasons: ["kharif", "summer"] },
  { name: "Maize", emoji: "🌽", category: "cereal", color: "#F59E0B", temp: [10, 18, 30, 38], rain: [400, 600, 1200, 1800], ph: [5.0, 5.8, 7.5, 8.2], clay: [10, 15, 40, 55], zones: ["tropical", "subtropical", "temperate", "continental", "mediterranean", "highland"], baseYield: 7.0, water: "medium", spacing_m: 0.25, dotSize: 6, frostHardy: false, maxElevationM: 3000, seasons: ["kharif", "summer", "spring"] },
  { name: "Barley", emoji: "🌾", category: "cereal", color: "#D4A017", temp: [2, 10, 20, 28], rain: [200, 300, 700, 1100], ph: [6.0, 6.5, 8.0, 8.8], clay: [8, 15, 40, 55], zones: ["temperate", "continental", "mediterranean", "semiarid", "highland", "boreal"], baseYield: 3.8, water: "low", spacing_m: 0.15, dotSize: 4, frostHardy: true, salinityTolerant: true, maxElevationM: 4000, seasons: ["rabi", "winter", "spring"] },
  { name: "Sorghum", emoji: "🌾", category: "cereal", color: "#B45309", temp: [15, 24, 34, 42], rain: [250, 400, 900, 1300], ph: [5.0, 6.0, 8.0, 8.8], clay: [10, 20, 50, 65], zones: ["tropical", "subtropical", "semiarid", "arid"], baseYield: 3.2, water: "low", spacing_m: 0.2, dotSize: 5, frostHardy: false, salinityTolerant: true, seasons: ["kharif", "summer"] },
  { name: "Pearl Millet", emoji: "🌾", category: "cereal", color: "#A16207", temp: [18, 25, 36, 45], rain: [150, 300, 700, 1000], ph: [5.5, 6.2, 8.2, 9.0], clay: [3, 8, 30, 45], zones: ["semiarid", "arid", "tropical", "subtropical"], baseYield: 2.4, water: "low", spacing_m: 0.15, dotSize: 4, frostHardy: false, salinityTolerant: true, seasons: ["kharif", "summer"] },
  { name: "Oats", emoji: "🌾", category: "cereal", color: "#CA8A04", temp: [2, 10, 20, 27], rain: [350, 500, 1000, 1500], ph: [5.0, 5.5, 7.0, 7.8], clay: [10, 15, 40, 55], zones: ["temperate", "continental", "boreal", "highland"], baseYield: 3.0, water: "medium", spacing_m: 0.15, dotSize: 4, frostHardy: true, seasons: ["spring", "winter"] },
  { name: "Rye", emoji: "🌾", category: "cereal", color: "#92400E", temp: [0, 8, 18, 26], rain: [300, 450, 900, 1300], ph: [4.5, 5.2, 7.0, 7.8], clay: [3, 8, 30, 45], zones: ["continental", "temperate", "boreal"], baseYield: 2.8, water: "low", spacing_m: 0.15, dotSize: 4, frostHardy: true, seasons: ["winter"] },

  // ── Pulses (nitrogen fixing) ───────────────────────────────
  { name: "Chickpea", emoji: "🫘", category: "pulse", color: "#CA8A04", temp: [8, 15, 28, 35], rain: [250, 350, 700, 1000], ph: [5.5, 6.2, 8.0, 8.8], clay: [10, 20, 45, 60], zones: ["semiarid", "subtropical", "mediterranean", "temperate"], baseYield: 1.5, water: "low", spacing_m: 0.3, dotSize: 5, frostHardy: false, nitrogenFixing: true, seasons: ["rabi", "winter"] },
  { name: "Lentil", emoji: "🫘", category: "pulse", color: "#9A6E3A", temp: [6, 14, 26, 32], rain: [250, 350, 650, 950], ph: [5.5, 6.0, 8.0, 8.5], clay: [10, 18, 40, 55], zones: ["temperate", "semiarid", "mediterranean", "continental", "highland"], baseYield: 1.3, water: "low", spacing_m: 0.25, dotSize: 4, frostHardy: true, nitrogenFixing: true, seasons: ["rabi", "winter"] },
  { name: "Soybean", emoji: "🌱", category: "pulse", color: "#65A30D", temp: [12, 20, 30, 38], rain: [450, 600, 1200, 1800], ph: [5.5, 6.0, 7.2, 8.0], clay: [12, 20, 45, 60], zones: ["subtropical", "temperate", "continental", "tropical"], baseYield: 2.8, water: "medium", spacing_m: 0.3, dotSize: 5, frostHardy: false, nitrogenFixing: true, seasons: ["kharif", "summer"] },
  { name: "Mung Bean", emoji: "🫛", category: "pulse", color: "#4D7C0F", temp: [18, 25, 35, 42], rain: [300, 450, 900, 1300], ph: [5.5, 6.2, 7.5, 8.2], clay: [8, 15, 40, 55], zones: ["tropical", "subtropical", "semiarid"], baseYield: 1.1, water: "low", spacing_m: 0.25, dotSize: 4, frostHardy: false, nitrogenFixing: true, seasons: ["zaid", "kharif", "summer"] },
  { name: "Pigeon Pea", emoji: "🫛", category: "pulse", color: "#3F6212", temp: [18, 24, 34, 40], rain: [400, 600, 1200, 1800], ph: [5.0, 6.0, 7.5, 8.2], clay: [10, 18, 45, 60], zones: ["tropical", "subtropical", "semiarid"], baseYield: 1.2, water: "low", spacing_m: 0.6, dotSize: 7, frostHardy: false, nitrogenFixing: true, seasons: ["kharif"] },
  { name: "Field Pea", emoji: "🫛", category: "pulse", color: "#84CC16", temp: [4, 12, 22, 29], rain: [350, 450, 900, 1300], ph: [5.5, 6.0, 7.5, 8.0], clay: [10, 18, 42, 55], zones: ["temperate", "continental", "mediterranean", "highland"], baseYield: 2.0, water: "medium", spacing_m: 0.2, dotSize: 4, frostHardy: true, nitrogenFixing: true, seasons: ["rabi", "spring", "winter"] },
  { name: "Faba Bean", emoji: "🫘", category: "pulse", color: "#4ADE80", temp: [4, 12, 24, 30], rain: [400, 550, 1000, 1500], ph: [6.0, 6.5, 8.0, 8.6], clay: [15, 25, 50, 62], zones: ["mediterranean", "temperate", "continental"], baseYield: 2.5, water: "medium", spacing_m: 0.25, dotSize: 5, frostHardy: true, nitrogenFixing: true, seasons: ["winter", "spring"] },

  // ── Oilseeds ───────────────────────────────────────────────
  { name: "Mustard", emoji: "🌼", category: "oilseed", color: "#FACC15", temp: [5, 12, 25, 32], rain: [250, 350, 700, 1100], ph: [5.5, 6.0, 7.8, 8.5], clay: [10, 18, 42, 55], zones: ["subtropical", "temperate", "semiarid", "continental"], baseYield: 1.4, water: "low", spacing_m: 0.15, dotSize: 4, frostHardy: true, seasons: ["rabi", "winter"] },
  { name: "Sunflower", emoji: "🌻", category: "oilseed", color: "#F59E0B", temp: [10, 18, 30, 38], rain: [300, 450, 900, 1300], ph: [5.7, 6.2, 8.0, 8.6], clay: [10, 18, 42, 55], zones: ["temperate", "continental", "mediterranean", "semiarid", "subtropical"], baseYield: 2.2, water: "low", spacing_m: 0.45, dotSize: 7, frostHardy: false, salinityTolerant: true, seasons: ["spring", "summer", "rabi"] },
  { name: "Groundnut", emoji: "🥜", category: "oilseed", color: "#D97706", temp: [18, 24, 33, 40], rain: [400, 600, 1200, 1600], ph: [5.0, 5.8, 7.2, 8.0], clay: [3, 8, 28, 40], zones: ["tropical", "subtropical", "semiarid"], baseYield: 2.0, water: "medium", spacing_m: 0.2, dotSize: 5, frostHardy: false, nitrogenFixing: true, seasons: ["kharif", "summer"] },
  { name: "Sesame", emoji: "🌱", category: "oilseed", color: "#EAB308", temp: [20, 25, 35, 42], rain: [250, 400, 800, 1100], ph: [5.5, 6.0, 8.0, 8.5], clay: [5, 10, 35, 50], zones: ["tropical", "subtropical", "semiarid", "arid"], baseYield: 0.9, water: "low", spacing_m: 0.15, dotSize: 4, frostHardy: false, seasons: ["kharif", "summer"] },
  { name: "Rapeseed", emoji: "🌼", category: "oilseed", color: "#FDE047", temp: [3, 10, 22, 29], rain: [350, 500, 1000, 1500], ph: [5.5, 6.0, 7.5, 8.2], clay: [12, 20, 45, 58], zones: ["temperate", "continental", "mediterranean"], baseYield: 3.0, water: "medium", spacing_m: 0.2, dotSize: 4, frostHardy: true, seasons: ["winter", "spring"] },

  // ── Fibre / industrial ─────────────────────────────────────
  { name: "Cotton", emoji: "🌿", category: "fibre", color: "#E5E7EB", temp: [18, 24, 34, 42], rain: [400, 600, 1100, 1600], ph: [5.8, 6.5, 8.0, 8.8], clay: [15, 25, 55, 68], zones: ["subtropical", "tropical", "semiarid"], baseYield: 2.5, water: "high", spacing_m: 0.5, dotSize: 7, frostHardy: false, salinityTolerant: true, seasons: ["kharif", "summer"] },
  { name: "Sugarcane", emoji: "🎋", category: "forage", color: "#16A34A", temp: [18, 24, 34, 40], rain: [900, 1200, 2200, 3000], ph: [5.5, 6.0, 7.5, 8.2], clay: [15, 25, 55, 68], zones: ["tropical", "subtropical"], baseYield: 75, water: "high", spacing_m: 0.75, dotSize: 8, frostHardy: false, seasons: ["perennial"] },
  { name: "Alfalfa", emoji: "🍀", category: "forage", color: "#22C55E", temp: [3, 15, 28, 36], rain: [300, 450, 1000, 1500], ph: [6.2, 6.8, 8.0, 8.8], clay: [10, 18, 45, 58], zones: ["temperate", "continental", "mediterranean", "semiarid", "highland"], baseYield: 12, water: "medium", spacing_m: 0.1, dotSize: 3, frostHardy: true, nitrogenFixing: true, salinityTolerant: true, seasons: ["perennial"] },

  // ── Tubers & vegetables ────────────────────────────────────
  { name: "Potato", emoji: "🥔", category: "tuber", color: "#A3A3A3", temp: [4, 12, 22, 29], rain: [400, 500, 1000, 1500], ph: [4.8, 5.5, 6.8, 7.5], clay: [5, 10, 32, 45], zones: ["temperate", "continental", "highland", "subtropical"], baseYield: 25, water: "medium", spacing_m: 0.3, dotSize: 6, frostHardy: false, maxElevationM: 4000, seasons: ["rabi", "spring", "winter"] },
  { name: "Onion", emoji: "🧅", category: "vegetable", color: "#C084FC", temp: [8, 15, 27, 34], rain: [300, 400, 800, 1200], ph: [5.8, 6.2, 7.5, 8.0], clay: [8, 12, 35, 48], zones: ["subtropical", "temperate", "mediterranean", "semiarid"], baseYield: 22, water: "medium", spacing_m: 0.12, dotSize: 4, frostHardy: false, seasons: ["rabi", "spring"] },
  { name: "Tomato", emoji: "🍅", category: "vegetable", color: "#EF4444", temp: [12, 18, 29, 36], rain: [350, 500, 1000, 1500], ph: [5.5, 6.0, 7.0, 7.8], clay: [8, 15, 38, 50], zones: ["tropical", "subtropical", "mediterranean", "temperate"], baseYield: 45, water: "medium", spacing_m: 0.5, dotSize: 7, frostHardy: false, seasons: ["rabi", "spring", "summer"] },
  { name: "Cabbage", emoji: "🥬", category: "vegetable", color: "#4ADE80", temp: [3, 12, 22, 28], rain: [400, 550, 1100, 1600], ph: [5.5, 6.0, 7.5, 8.0], clay: [12, 18, 45, 58], zones: ["temperate", "continental", "highland", "mediterranean"], baseYield: 35, water: "medium", spacing_m: 0.45, dotSize: 7, frostHardy: true, seasons: ["rabi", "winter", "autumn"] },
  { name: "Watermelon", emoji: "🍉", category: "vegetable", color: "#F472B6", temp: [18, 24, 34, 42], rain: [250, 400, 800, 1200], ph: [5.8, 6.2, 7.2, 8.0], clay: [3, 8, 28, 40], zones: ["tropical", "subtropical", "semiarid", "mediterranean"], baseYield: 30, water: "medium", spacing_m: 1.2, dotSize: 9, frostHardy: false, seasons: ["zaid", "summer"] },
  { name: "Cucumber", emoji: "🥒", category: "vegetable", color: "#34D399", temp: [15, 20, 30, 38], rain: [350, 500, 1000, 1500], ph: [5.8, 6.2, 7.2, 7.8], clay: [8, 12, 35, 48], zones: ["tropical", "subtropical", "temperate", "mediterranean"], baseYield: 28, water: "medium", spacing_m: 0.6, dotSize: 7, frostHardy: false, seasons: ["zaid", "summer", "spring"] },
  { name: "Cassava", emoji: "🍠", category: "tuber", color: "#B45309", temp: [18, 24, 34, 40], rain: [500, 800, 1800, 2800], ph: [4.5, 5.5, 7.0, 8.0], clay: [5, 10, 40, 55], zones: ["tropical"], baseYield: 18, water: "low", spacing_m: 1.0, dotSize: 8, frostHardy: false, seasons: ["perennial"] },
  { name: "Sugar Beet", emoji: "🫒", category: "tuber", color: "#9333EA", temp: [5, 14, 24, 30], rain: [400, 550, 1000, 1400], ph: [6.0, 6.5, 8.0, 8.6], clay: [12, 18, 45, 58], zones: ["temperate", "continental"], baseYield: 60, water: "medium", spacing_m: 0.2, dotSize: 5, frostHardy: true, salinityTolerant: true, seasons: ["spring"] },

  // ── Trees & perennials ─────────────────────────────────────
  { name: "Olive", emoji: "🫒", category: "tree", color: "#6B8E23", temp: [5, 15, 30, 40], rain: [200, 350, 800, 1200], ph: [6.0, 6.5, 8.2, 8.8], clay: [8, 15, 45, 60], zones: ["mediterranean", "semiarid", "subtropical"], baseYield: 4.0, water: "low", spacing_m: 7, dotSize: 13, frostHardy: false, isTree: true, salinityTolerant: true, seasons: ["perennial"] },
  { name: "Almond", emoji: "🌰", category: "tree", color: "#F59E0B", temp: [5, 15, 30, 38], rain: [250, 400, 800, 1200], ph: [6.0, 6.5, 8.0, 8.5], clay: [5, 10, 35, 48], zones: ["mediterranean", "semiarid", "subtropical"], baseYield: 2.2, water: "medium", spacing_m: 6, dotSize: 12, frostHardy: false, isTree: true, seasons: ["perennial"] },
  { name: "Grapevine", emoji: "🍇", category: "fruit", color: "#7C3AED", temp: [6, 15, 30, 38], rain: [250, 400, 900, 1300], ph: [5.5, 6.0, 7.8, 8.5], clay: [8, 12, 40, 55], zones: ["mediterranean", "temperate", "semiarid", "subtropical"], baseYield: 12, water: "low", spacing_m: 2.5, dotSize: 10, frostHardy: true, seasons: ["perennial"] },
  { name: "Citrus", emoji: "🍊", category: "tree", color: "#FB923C", temp: [12, 18, 32, 38], rain: [500, 800, 1600, 2200], ph: [5.5, 6.0, 7.5, 8.0], clay: [8, 12, 38, 50], zones: ["subtropical", "mediterranean", "tropical"], baseYield: 25, water: "high", spacing_m: 5, dotSize: 12, frostHardy: false, isTree: true, seasons: ["perennial"] },
  { name: "Apple", emoji: "🍎", category: "tree", color: "#DC2626", temp: [-2, 8, 22, 29], rain: [500, 700, 1300, 1800], ph: [5.5, 6.0, 7.0, 7.6], clay: [10, 15, 42, 55], zones: ["temperate", "continental", "highland"], baseYield: 30, water: "medium", spacing_m: 4, dotSize: 12, frostHardy: true, isTree: true, seasons: ["perennial"] },
  { name: "Mango", emoji: "🥭", category: "tree", color: "#F59E0B", temp: [18, 24, 35, 42], rain: [600, 900, 1800, 2600], ph: [5.5, 6.0, 7.5, 8.0], clay: [8, 15, 45, 58], zones: ["tropical", "subtropical"], baseYield: 12, water: "medium", spacing_m: 9, dotSize: 14, frostHardy: false, isTree: true, seasons: ["perennial"] },
  { name: "Coconut", emoji: "🥥", category: "tree", color: "#78716C", temp: [20, 25, 34, 40], rain: [1000, 1500, 2800, 4000], ph: [5.2, 5.8, 7.5, 8.2], clay: [3, 8, 35, 50], zones: ["tropical"], baseYield: 10, water: "high", spacing_m: 8, dotSize: 14, frostHardy: false, isTree: true, salinityTolerant: true, maxElevationM: 900, seasons: ["perennial"] },
  { name: "Date Palm", emoji: "🌴", category: "tree", color: "#CA8A04", temp: [15, 25, 40, 50], rain: [0, 50, 300, 600], ph: [6.5, 7.0, 8.5, 9.2], clay: [2, 5, 25, 40], zones: ["arid", "semiarid"], baseYield: 8, water: "medium", spacing_m: 9, dotSize: 14, frostHardy: false, isTree: true, salinityTolerant: true, seasons: ["perennial"] },
  { name: "Neem", emoji: "🌳", category: "tree", color: "#15803D", temp: [15, 22, 38, 48], rain: [150, 400, 1200, 2000], ph: [5.5, 6.2, 8.5, 9.0], clay: [3, 8, 40, 60], zones: ["semiarid", "arid", "tropical", "subtropical"], baseYield: 1.5, water: "low", spacing_m: 8, dotSize: 13, frostHardy: false, isTree: true, salinityTolerant: true, seasons: ["perennial"] },
  { name: "Poplar", emoji: "🌲", category: "tree", color: "#14B8A6", temp: [-5, 8, 24, 32], rain: [400, 600, 1400, 2000], ph: [5.5, 6.0, 7.8, 8.4], clay: [8, 15, 45, 58], zones: ["temperate", "continental", "boreal", "highland"], baseYield: 10, water: "medium", spacing_m: 5, dotSize: 12, frostHardy: true, isTree: true, seasons: ["perennial"] },
  { name: "Carob", emoji: "🌳", category: "tree", color: "#78350F", temp: [8, 16, 32, 42], rain: [200, 300, 700, 1100], ph: [6.2, 6.8, 8.4, 9.0], clay: [5, 10, 40, 55], zones: ["mediterranean", "semiarid", "arid"], baseYield: 3.0, water: "low", spacing_m: 8, dotSize: 13, frostHardy: false, isTree: true, salinityTolerant: true, seasons: ["perennial"] },

  // ── Spices ─────────────────────────────────────────────────
  { name: "Turmeric", emoji: "🟡", category: "spice", color: "#F59E0B", temp: [18, 22, 32, 38], rain: [800, 1200, 2200, 3000], ph: [5.0, 5.5, 7.0, 7.8], clay: [10, 18, 45, 58], zones: ["tropical", "subtropical"], baseYield: 6, water: "high", spacing_m: 0.3, dotSize: 5, frostHardy: false, seasons: ["kharif"] },
  { name: "Chilli", emoji: "🌶️", category: "spice", color: "#DC2626", temp: [15, 20, 32, 38], rain: [500, 650, 1300, 1900], ph: [5.5, 6.0, 7.2, 8.0], clay: [8, 15, 40, 52], zones: ["tropical", "subtropical", "mediterranean"], baseYield: 8, water: "medium", spacing_m: 0.5, dotSize: 6, frostHardy: false, seasons: ["kharif", "rabi"] },
  { name: "Coriander", emoji: "🌿", category: "spice", color: "#22C55E", temp: [8, 15, 27, 33], rain: [250, 350, 700, 1100], ph: [6.0, 6.5, 7.8, 8.4], clay: [10, 15, 40, 52], zones: ["subtropical", "temperate", "semiarid", "mediterranean"], baseYield: 1.2, water: "low", spacing_m: 0.15, dotSize: 3, frostHardy: true, seasons: ["rabi", "winter"] },
];

export const CROP_BY_NAME = new Map(CROPS.map((c) => [c.name.toLowerCase(), c]));

// ── Site model ───────────────────────────────────────────────

export interface SiteData {
  lat: number;
  lon: number;
  locationText?: string;
  elevationM?: number | null;
  slopeDeg?: number | null;
  annualRainfallMm?: number | null;
  temperatureC?: number | null;
  humidityPct?: number | null;
  ph?: number | null;
  sandPct?: number | null;
  siltPct?: number | null;
  clayPct?: number | null;
  socGPerKg?: number | null;
  nitrogenGPerKg?: number | null;
  cec?: number | null;
  availableWaterPct?: number | null;
  coarseFragmentsPct?: number | null;
  soilClass?: string | null;
  ndvi?: number | null;
  waterAccessScore?: number | null;
  landCover?: string | null;
  irrigated?: boolean;
}

export interface FactorScore {
  key: string;
  label: string;
  score: number; // 0-100
  detail: string;
}

export interface ScoredCrop {
  crop: CropSpec;
  score: number;
  factors: FactorScore[];
  limitingFactor: string;
  yieldTPerHa: number;
  confidence: "high" | "medium" | "low";
  rejected?: string;
}

// ── Helpers ──────────────────────────────────────────────────

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Trapezoid membership: 1 inside the optimum, decaying to 0 at the hard limits. */
export function envelopeScore(value: number, [hardMin, optMin, optMax, hardMax]: Envelope): number {
  if (!Number.isFinite(value)) return 0.6; // unknown -> neutral-ish
  if (value >= optMin && value <= optMax) return 1;
  if (value < optMin) {
    if (value <= hardMin) return 0;
    return (value - hardMin) / Math.max(1e-6, optMin - hardMin);
  }
  if (value >= hardMax) return 0;
  return (hardMax - value) / Math.max(1e-6, hardMax - optMax);
}

/** Köppen-flavoured climate classification from the measured values. */
export function classifyClimate(site: SiteData): ClimateZone {
  const absLat = Math.abs(site.lat);
  const temp = site.temperatureC ?? estimateMeanTemp(site);
  const rain = site.annualRainfallMm ?? 800;
  const elev = site.elevationM ?? 0;

  if (absLat >= 66.5 || temp <= 0) return "polar";
  if (temp <= 5) return "boreal";
  if (elev >= 2200) return "highland";
  if (rain < 200) return "arid";
  if (rain < 450) return "semiarid";
  if (absLat < 23.5) return rain >= 700 ? "tropical" : "semiarid";
  if (absLat < 35) {
    // Mediterranean if mild and moderately dry, otherwise subtropical.
    return rain < 800 && temp >= 13 && temp <= 24 ? "mediterranean" : "subtropical";
  }
  if (absLat < 50) return temp >= 12 && rain < 800 ? "mediterranean" : "temperate";
  return "continental";
}

function estimateMeanTemp(site: SiteData): number {
  const absLat = Math.abs(site.lat);
  const base = 30 - absLat * 0.55;
  const lapse = ((site.elevationM ?? 0) / 1000) * 6.0;
  return base - lapse;
}

const ZONE_NEIGHBOURS: Record<ClimateZone, ClimateZone[]> = {
  tropical: ["subtropical"],
  subtropical: ["tropical", "mediterranean", "temperate", "semiarid"],
  mediterranean: ["subtropical", "temperate", "semiarid"],
  temperate: ["continental", "mediterranean", "subtropical", "highland"],
  continental: ["temperate", "boreal", "highland"],
  semiarid: ["arid", "subtropical", "mediterranean", "tropical"],
  arid: ["semiarid"],
  highland: ["temperate", "continental"],
  boreal: ["continental"],
  polar: ["boreal"],
};

export function isFarmableZone(zone: ClimateZone): boolean {
  return zone !== "polar";
}

// ── Scoring ──────────────────────────────────────────────────

export function scoreCrop(crop: CropSpec, site: SiteData, zone: ClimateZone): ScoredCrop {
  const temp = site.temperatureC ?? estimateMeanTemp(site);
  const rain = site.annualRainfallMm;
  const effectiveRain = site.irrigated && rain != null ? Math.max(rain, crop.rain[1]) : rain;
  const factors: FactorScore[] = [];

  // Climate zone gate
  let zoneScore = 0;
  if (crop.zones.includes(zone)) zoneScore = 100;
  else if (crop.zones.some((z) => ZONE_NEIGHBOURS[zone]?.includes(z))) zoneScore = 55;
  else zoneScore = 5;
  factors.push({ key: "zone", label: "Climate zone", score: zoneScore, detail: `${zone} vs ${crop.zones.join("/")}` });

  const tempScore = Math.round(envelopeScore(temp, crop.temp) * 100);
  factors.push({ key: "temperature", label: "Temperature", score: tempScore, detail: `${temp.toFixed(1)}°C (optimum ${crop.temp[1]}–${crop.temp[2]}°C)` });

  const rainScore = Math.round(envelopeScore(effectiveRain ?? NaN, crop.rain) * 100);
  factors.push({ key: "rainfall", label: "Rainfall", score: rainScore, detail: effectiveRain != null ? `${Math.round(effectiveRain)} mm/yr (needs ${crop.rain[1]}–${crop.rain[2]} mm)` : "rainfall unknown" });

  const phScore = Math.round(envelopeScore(site.ph ?? NaN, crop.ph) * 100);
  factors.push({ key: "ph", label: "Soil pH", score: phScore, detail: site.ph != null ? `pH ${site.ph} (prefers ${crop.ph[1]}–${crop.ph[2]})` : "pH unknown" });

  const textureScore = Math.round(envelopeScore(site.clayPct ?? NaN, crop.clay) * 100);
  factors.push({ key: "texture", label: "Soil texture", score: textureScore, detail: site.clayPct != null ? `${site.clayPct}% clay (prefers ${crop.clay[1]}–${crop.clay[2]}%)` : "texture unknown" });

  // Fertility: organic carbon + nitrogen + CEC
  const soc = site.socGPerKg;
  const n = site.nitrogenGPerKg;
  const cec = site.cec;
  const fertilityParts: number[] = [];
  if (soc != null) fertilityParts.push(clamp(soc / 20, 0, 1));
  if (n != null) fertilityParts.push(clamp(n / 3, 0, 1));
  if (cec != null) fertilityParts.push(clamp(cec / 25, 0, 1));
  const fertility = fertilityParts.length ? fertilityParts.reduce((a, b) => a + b, 0) / fertilityParts.length : 0.6;
  // Legumes are far less sensitive to low nitrogen.
  const fertilityScore = Math.round((crop.nitrogenFixing ? 0.4 + fertility * 0.6 : fertility) * 100);
  factors.push({ key: "fertility", label: "Fertility", score: fertilityScore, detail: `SOC ${soc ?? "?"} g/kg, N ${n ?? "?"} g/kg, CEC ${cec ?? "?"}` });

  // Plant-available water: soil AWC + rainfall adequacy + measured water access
  const awc = site.availableWaterPct;
  const need = crop.water === "high" ? 16 : crop.water === "medium" ? 11 : 7;
  let waterScore = awc != null ? Math.round(clamp(awc / need, 0, 1.15) * 100) : 65;
  if (site.waterAccessScore != null) waterScore = Math.round(waterScore * 0.6 + site.waterAccessScore * 0.4);
  waterScore = clamp(waterScore, 0, 100);
  factors.push({ key: "water", label: "Water availability", score: waterScore, detail: awc != null ? `${awc}% available water (crop needs ~${need}%)` : "soil water unknown" });

  // Topography
  const slope = site.slopeDeg ?? 2;
  const maxSlope = crop.maxSlopeDeg ?? (crop.isTree ? 25 : 12);
  const slopeScore = Math.round(clamp(1 - slope / maxSlope, 0, 1) * 100);
  factors.push({ key: "slope", label: "Slope", score: slopeScore, detail: `${slope.toFixed(1)}° (workable up to ${maxSlope}°)` });

  // Stoniness
  const cf = site.coarseFragmentsPct;
  const stoneScore = cf != null ? Math.round(clamp(1 - cf / 40, 0, 1) * 100) : 85;
  factors.push({ key: "stones", label: "Stoniness", score: stoneScore, detail: cf != null ? `${cf}% coarse fragments` : "unknown" });

  // Frost risk
  const frostRisk = Math.abs(site.lat) > 40 || (site.elevationM ?? 0) > 1800;
  const frostScore = frostRisk && !crop.frostHardy ? 35 : 100;
  factors.push({ key: "frost", label: "Frost risk", score: frostScore, detail: frostRisk ? (crop.frostHardy ? "frost-hardy crop" : "frost-sensitive in this latitude/elevation") : "low frost risk" });

  // Elevation ceiling
  const elevOk = crop.maxElevationM == null || (site.elevationM ?? 0) <= crop.maxElevationM;
  if (!elevOk) factors.push({ key: "elevation", label: "Elevation", score: 10, detail: `above the ${crop.maxElevationM} m ceiling for this crop` });

  const weights: Record<string, number> = {
    zone: 3.0, temperature: 2.4, rainfall: 2.2, ph: 1.4, texture: 1.2,
    fertility: 1.1, water: 1.6, slope: 0.9, stones: 0.5, frost: 1.3, elevation: 2.0,
  };
  let weighted = 0;
  let totalWeight = 0;
  for (const f of factors) {
    const w = weights[f.key] ?? 1;
    weighted += f.score * w;
    totalWeight += w;
  }
  let score = Math.round(weighted / totalWeight);

  // Hard vetoes: a crop that cannot physically grow here must never be offered.
  const vetoed =
    zoneScore <= 5 ||
    tempScore === 0 ||
    (rainScore === 0 && !site.irrigated) ||
    phScore === 0 ||
    !elevOk;
  if (vetoed) score = Math.min(score, 18);

  const limiting = [...factors].sort((a, b) => a.score - b.score)[0];
  const known = [site.ph, site.clayPct, site.annualRainfallMm, site.temperatureC, site.availableWaterPct].filter((v) => v != null).length;
  const confidence: ScoredCrop["confidence"] = known >= 4 ? "high" : known >= 2 ? "medium" : "low";

  const vigour = site.ndvi != null ? clamp(0.75 + site.ndvi * 0.5, 0.7, 1.15) : 1;
  const yieldTPerHa = Math.round(crop.baseYield * Math.pow(score / 100, 0.75) * (waterScore / 100 * 0.35 + 0.65) * vigour * 100) / 100;

  return {
    crop,
    score,
    factors,
    limitingFactor: `${limiting.label}: ${limiting.detail}`,
    yieldTPerHa,
    confidence,
    rejected: vetoed ? `Not viable here - ${limiting.label.toLowerCase()} (${limiting.detail})` : undefined,
  };
}

export interface RankOptions {
  currentCrop?: string;
  limit?: number;
  /** Minimum score to be considered growable. */
  threshold?: number;
}

export interface RankResult {
  zone: ClimateZone;
  meanTempC: number;
  candidates: ScoredCrop[];
  /** Everything scored, including rejects - used for diagnostics. */
  all: ScoredCrop[];
  currentCropScore: ScoredCrop | null;
}

export function rankCrops(site: SiteData, opts: RankOptions = {}): RankResult {
  const zone = classifyClimate(site);
  const meanTempC = site.temperatureC ?? estimateMeanTemp(site);
  const all = CROPS.map((c) => scoreCrop(c, site, zone)).sort((a, b) => b.score - a.score);
  const threshold = opts.threshold ?? 42;

  const viable = all.filter((s) => !s.rejected && s.score >= threshold);
  const pool = viable.length >= 4 ? viable : all.filter((s) => !s.rejected).slice(0, 8);

  // Diversity: avoid returning five near-identical cereals.
  const picked: ScoredCrop[] = [];
  const perCategory: Record<string, number> = {};
  for (const s of pool) {
    const cat = s.crop.category;
    const cap = cat === "cereal" ? 3 : cat === "tree" ? 2 : 2;
    if ((perCategory[cat] ?? 0) >= cap) continue;
    perCategory[cat] = (perCategory[cat] ?? 0) + 1;
    picked.push(s);
    if (picked.length >= (opts.limit ?? 10)) break;
  }
  // Top up if diversity filtering was too aggressive.
  for (const s of pool) {
    if (picked.length >= (opts.limit ?? 10)) break;
    if (!picked.includes(s)) picked.push(s);
  }

  const currentCropScore = opts.currentCrop
    ? all.find((s) => s.crop.name.toLowerCase() === opts.currentCrop!.toLowerCase()) ?? null
    : null;

  return { zone, meanTempC, candidates: picked, all, currentCropScore };
}

/**
 * Area split proportional to suitability, never equal.
 * Scores are sharpened so a clearly better crop really does get more land.
 */
export function allocateAreas(scores: number[], opts: { minPct?: number; treeFlags?: boolean[] } = {}): number[] {
  const minPct = opts.minPct ?? 5;
  const weights = scores.map((s, i) => {
    const w = Math.pow(Math.max(s, 1) / 100, 2.2);
    // Trees are sparse: they never dominate the layout.
    return opts.treeFlags?.[i] ? w * 0.25 : w;
  });
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let pcts = weights.map((w) => (w / total) * 100);

  // Apply the floor, then rescale the rest so the total stays 100.
  const floored = pcts.map((p) => Math.max(p, minPct));
  const overflow = floored.reduce((a, b) => a + b, 0) - 100;
  if (overflow > 0) {
    const slack = floored.map((p) => Math.max(0, p - minPct));
    const slackTotal = slack.reduce((a, b) => a + b, 0) || 1;
    pcts = floored.map((p, i) => p - (slack[i] / slackTotal) * overflow);
  } else {
    pcts = floored;
  }

  const rounded = pcts.map((p) => Math.round(p));
  const diff = 100 - rounded.reduce((a, b) => a + b, 0);
  if (rounded.length) {
    const maxIdx = rounded.indexOf(Math.max(...rounded));
    rounded[maxIdx] += diff;
  }
  return rounded;
}

/** Layout pattern for a zone, derived from the crop and the terrain. */
export function distributionPattern(crop: CropSpec, site: SiteData): { pattern: string; description: string } {
  const slope = site.slopeDeg ?? 0;
  if (crop.isTree) {
    return slope > 8
      ? { pattern: "contour rows", description: "Trees along contour lines to hold soil on the slope" }
      : { pattern: "scattered grid", description: "Widely spaced grid so canopies never overlap" };
  }
  if (slope > 8) return { pattern: "contour strips", description: "Strips across the slope to slow runoff" };
  if (crop.water === "high") return { pattern: "block", description: "Solid block so irrigation can be zoned efficiently" };
  if (crop.nitrogenFixing) return { pattern: "alley strips", description: "Strips between the main crop to feed nitrogen back into the soil" };
  return { pattern: "row block", description: "Even rows across the widest axis of the field" };
}

export function seasonLabels(zone: ClimateZone): { season: string; months: string }[] {
  const indian = ["tropical", "subtropical", "semiarid"].includes(zone);
  if (indian) {
    return [
      { season: "Kharif", months: "Jun-Oct" },
      { season: "Rabi", months: "Nov-Mar" },
      { season: "Zaid", months: "Mar-Jun" },
    ];
  }
  return [
    { season: "Spring", months: "Mar-Jun" },
    { season: "Summer", months: "Jun-Sep" },
    { season: "Winter", months: "Oct-Feb" },
  ];
}
