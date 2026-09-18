// Deterministic cropping-system planner.
//
// Pipeline (see docs/planner architecture):
//   farm state -> candidate crops -> compatibility -> water balance
//   -> yield + economics -> risk -> multi-objective utility -> ranked plans
//
// The AI never picks a crop here. It may only (a) supply a local-prevalence
// weight per candidate that this module blends into the score, and
// (b) rewrite the explanations. Every number below is computed.

import {
  CROPS,
  CROP_BY_NAME,
  type CropSpec,
  type SiteData,
  type ScoredCrop,
  type ClimateZone,
  rankCrops,
  clamp,
  allocateAreas,
} from "./agronomy.ts";

// ── Crop traits (agronomy layer the envelope model does not carry) ────────

export interface CropTraits {
  family: string;
  /** Days from sowing to harvest. */
  durationDays: number;
  rootDepthCm: number;
  heightCm: number;
  /** 0 = needs full sun, 1 = thrives in shade. */
  shadeTolerance: number;
  /** FAO mid-season crop coefficient. */
  kcMid: number;
  nDemandKgHa: number;
  nFixKgHa: number;
  rowSpacingCm: number;
  labourDaysHa: number;
  mechanised: boolean;
  /** Variable cost per hectare, INR. */
  costHaInr: number;
  /** Farm-gate price, INR per tonne. */
  priceInrT: number;
  /** 0-1 price volatility. */
  volatility: number;
  pests: string[];
}

type TraitOverride = Partial<CropTraits>;

const CATEGORY_DEFAULTS: Record<CropSpec["category"], CropTraits> = {
  cereal: { family: "Poaceae", durationDays: 115, rootDepthCm: 100, heightCm: 120, shadeTolerance: 0.15, kcMid: 1.15, nDemandKgHa: 120, nFixKgHa: 0, rowSpacingCm: 25, labourDaysHa: 35, mechanised: true, costHaInr: 32000, priceInrT: 22000, volatility: 0.18, pests: ["stem borer", "armyworm"] },
  pulse: { family: "Fabaceae", durationDays: 95, rootDepthCm: 70, heightCm: 60, shadeTolerance: 0.45, kcMid: 1.05, nDemandKgHa: 25, nFixKgHa: 55, rowSpacingCm: 30, labourDaysHa: 40, mechanised: false, costHaInr: 26000, priceInrT: 62000, volatility: 0.25, pests: ["pod borer", "aphid"] },
  oilseed: { family: "Asteraceae", durationDays: 105, rootDepthCm: 90, heightCm: 110, shadeTolerance: 0.2, kcMid: 1.0, nDemandKgHa: 80, nFixKgHa: 0, rowSpacingCm: 45, labourDaysHa: 38, mechanised: true, costHaInr: 30000, priceInrT: 55000, volatility: 0.28, pests: ["aphid", "leaf spot"] },
  vegetable: { family: "Mixed", durationDays: 90, rootDepthCm: 45, heightCm: 55, shadeTolerance: 0.4, kcMid: 1.05, nDemandKgHa: 150, nFixKgHa: 0, rowSpacingCm: 45, labourDaysHa: 120, mechanised: false, costHaInr: 85000, priceInrT: 14000, volatility: 0.45, pests: ["whitefly", "fruit borer"] },
  tuber: { family: "Solanaceae", durationDays: 100, rootDepthCm: 50, heightCm: 60, shadeTolerance: 0.25, kcMid: 1.1, nDemandKgHa: 170, nFixKgHa: 0, rowSpacingCm: 60, labourDaysHa: 110, mechanised: true, costHaInr: 95000, priceInrT: 12000, volatility: 0.4, pests: ["late blight", "tuber moth"] },
  fibre: { family: "Malvaceae", durationDays: 165, rootDepthCm: 120, heightCm: 140, shadeTolerance: 0.1, kcMid: 1.15, nDemandKgHa: 130, nFixKgHa: 0, rowSpacingCm: 75, labourDaysHa: 110, mechanised: false, costHaInr: 62000, priceInrT: 66000, volatility: 0.3, pests: ["pink bollworm", "whitefly"] },
  spice: { family: "Mixed", durationDays: 210, rootDepthCm: 40, heightCm: 80, shadeTolerance: 0.55, kcMid: 1.0, nDemandKgHa: 110, nFixKgHa: 0, rowSpacingCm: 40, labourDaysHa: 150, mechanised: false, costHaInr: 110000, priceInrT: 80000, volatility: 0.5, pests: ["rhizome rot", "thrips"] },
  forage: { family: "Fabaceae", durationDays: 300, rootDepthCm: 160, heightCm: 80, shadeTolerance: 0.35, kcMid: 1.05, nDemandKgHa: 30, nFixKgHa: 120, rowSpacingCm: 25, labourDaysHa: 45, mechanised: true, costHaInr: 35000, priceInrT: 9000, volatility: 0.15, pests: ["armyworm"] },
  fruit: { family: "Mixed", durationDays: 330, rootDepthCm: 150, heightCm: 300, shadeTolerance: 0.2, kcMid: 0.95, nDemandKgHa: 120, nFixKgHa: 0, rowSpacingCm: 400, labourDaysHa: 130, mechanised: false, costHaInr: 120000, priceInrT: 32000, volatility: 0.35, pests: ["fruit fly", "mealybug"] },
  tree: { family: "Mixed", durationDays: 365, rootDepthCm: 220, heightCm: 700, shadeTolerance: 0.3, kcMid: 0.9, nDemandKgHa: 60, nFixKgHa: 0, rowSpacingCm: 600, labourDaysHa: 40, mechanised: false, costHaInr: 45000, priceInrT: 18000, volatility: 0.25, pests: [] },
};

const TRAIT_OVERRIDES: Record<string, TraitOverride> = {
  wheat: { durationDays: 130, rootDepthCm: 110, heightCm: 95, kcMid: 1.15, priceInrT: 24000, costHaInr: 34000, rowSpacingCm: 20, pests: ["rust", "aphid"] },
  rice: { durationDays: 135, rootDepthCm: 55, heightCm: 100, kcMid: 1.2, priceInrT: 21500, costHaInr: 48000, labourDaysHa: 90, rowSpacingCm: 20, pests: ["brown planthopper", "blast"] },
  maize: { durationDays: 110, rootDepthCm: 120, heightCm: 210, kcMid: 1.2, priceInrT: 21000, costHaInr: 36000, rowSpacingCm: 60, pests: ["fall armyworm", "stem borer"] },
  barley: { durationDays: 115, rootDepthCm: 100, heightCm: 90, kcMid: 1.05, priceInrT: 19000, costHaInr: 27000 },
  sorghum: { durationDays: 110, rootDepthCm: 140, heightCm: 180, kcMid: 1.0, priceInrT: 26000, costHaInr: 25000 },
  "pearl millet": { durationDays: 85, rootDepthCm: 130, heightCm: 190, kcMid: 0.95, priceInrT: 24000, costHaInr: 21000 },
  chickpea: { durationDays: 110, rootDepthCm: 90, heightCm: 55, kcMid: 1.0, nFixKgHa: 60, priceInrT: 58000, costHaInr: 27000, pests: ["pod borer", "wilt"] },
  lentil: { durationDays: 105, rootDepthCm: 70, heightCm: 40, nFixKgHa: 45, priceInrT: 62000, costHaInr: 25000 },
  soybean: { durationDays: 100, rootDepthCm: 100, heightCm: 80, nFixKgHa: 70, priceInrT: 46000, costHaInr: 30000 },
  "mung bean": { durationDays: 65, rootDepthCm: 60, heightCm: 45, nFixKgHa: 40, priceInrT: 78000, costHaInr: 22000, shadeTolerance: 0.55 },
  "pigeon pea": { durationDays: 175, rootDepthCm: 180, heightCm: 200, nFixKgHa: 80, priceInrT: 72000, costHaInr: 28000, rowSpacingCm: 90, shadeTolerance: 0.3 },
  "field pea": { durationDays: 100, rootDepthCm: 70, heightCm: 60, nFixKgHa: 50, priceInrT: 40000 },
  "faba bean": { durationDays: 130, rootDepthCm: 90, heightCm: 90, nFixKgHa: 90, priceInrT: 42000 },
  groundnut: { durationDays: 115, rootDepthCm: 65, heightCm: 45, nFixKgHa: 50, priceInrT: 62000, costHaInr: 42000, labourDaysHa: 75, family: "Fabaceae", shadeTolerance: 0.35 },
  mustard: { durationDays: 115, rootDepthCm: 90, heightCm: 130, priceInrT: 54000, costHaInr: 24000, family: "Brassicaceae" },
  rapeseed: { durationDays: 130, heightCm: 130, priceInrT: 52000, family: "Brassicaceae" },
  sunflower: { durationDays: 105, rootDepthCm: 130, heightCm: 170, priceInrT: 60000 },
  sesame: { durationDays: 90, rootDepthCm: 90, heightCm: 100, priceInrT: 105000, costHaInr: 20000 },
  cotton: { durationDays: 175, priceInrT: 68000, costHaInr: 65000 },
  sugarcane: { durationDays: 340, rootDepthCm: 150, heightCm: 300, kcMid: 1.25, priceInrT: 3400, costHaInr: 120000, volatility: 0.1, family: "Poaceae" },
  potato: { durationDays: 95, priceInrT: 12500 },
  onion: { durationDays: 120, rootDepthCm: 35, heightCm: 45, priceInrT: 16000, family: "Amaryllidaceae" },
  tomato: { durationDays: 110, priceInrT: 15000, family: "Solanaceae" },
  chilli: { durationDays: 160, priceInrT: 130000, family: "Solanaceae", costHaInr: 120000 },
  turmeric: { durationDays: 240, priceInrT: 85000 },
  alfalfa: { durationDays: 330, nFixKgHa: 150, priceInrT: 9000 },
  cabbage: { durationDays: 90, family: "Brassicaceae", priceInrT: 11000 },
  coriander: { durationDays: 100, family: "Apiaceae", priceInrT: 70000, heightCm: 50, shadeTolerance: 0.5 },
};

export function traitsFor(crop: CropSpec): CropTraits {
  const base = CATEGORY_DEFAULTS[crop.category];
  const over = TRAIT_OVERRIDES[crop.name.toLowerCase()] ?? {};
  const merged = { ...base, ...over };
  if (crop.nitrogenFixing && !over.nFixKgHa && !base.nFixKgHa) merged.nFixKgHa = 50;
  if (crop.nitrogenFixing) merged.family = over.family ?? "Fabaceae";
  return merged;
}

// ── Region + season ──────────────────────────────────────────────────────

export type Region = "india" | "world";
export type SeasonKey = "kharif" | "rabi" | "zaid" | "spring" | "summer" | "autumn" | "winter" | "perennial";

const INDIA_HINTS = /\b(india|bharat|karnataka|maharashtra|punjab|haryana|gujarat|rajasthan|kerala|tamil\s*nadu|telangana|andhra|odisha|bihar|assam|uttar\s*pradesh|madhya\s*pradesh|west\s*bengal|chhattisgarh|jharkhand|uttarakhand|himachal|goa)\b/i;

export function detectRegion(lat: number, lon: number, locationText = ""): Region {
  if (INDIA_HINTS.test(locationText)) return "india";
  const inBox = lat >= 6.5 && lat <= 35.7 && lon >= 68 && lon <= 97.5;
  return inBox ? "india" : "world";
}

export interface SeasonWindow {
  key: SeasonKey;
  label: string;
  months: string;
  /** Share of annual rainfall received in this window. */
  rainShare: number;
  startMonth: number; // 1-12
  lengthMonths: number;
}

export function seasonCalendar(region: Region, zone: ClimateZone, lat: number): SeasonWindow[] {
  if (region === "india") {
    return [
      { key: "kharif", label: "Kharif", months: "Jun-Oct", rainShare: 0.74, startMonth: 6, lengthMonths: 5 },
      { key: "rabi", label: "Rabi", months: "Nov-Mar", rainShare: 0.13, startMonth: 11, lengthMonths: 5 },
      { key: "zaid", label: "Zaid (summer)", months: "Mar-Jun", rainShare: 0.13, startMonth: 3, lengthMonths: 3 },
    ];
  }
  const south = lat < 0;
  const medi = zone === "mediterranean";
  const shift = (m: number) => ((m - 1 + (south ? 6 : 0)) % 12) + 1;
  return [
    { key: "spring", label: "Spring", months: south ? "Sep-Nov" : "Mar-May", rainShare: medi ? 0.22 : 0.27, startMonth: shift(3), lengthMonths: 3 },
    { key: "summer", label: "Summer", months: south ? "Dec-Feb" : "Jun-Aug", rainShare: medi ? 0.07 : 0.35, startMonth: shift(6), lengthMonths: 3 },
    { key: "autumn", label: "Autumn", months: south ? "Mar-May" : "Sep-Nov", rainShare: medi ? 0.29 : 0.23, startMonth: shift(9), lengthMonths: 3 },
    { key: "winter", label: "Winter", months: south ? "Jun-Aug" : "Dec-Feb", rainShare: medi ? 0.42 : 0.15, startMonth: shift(12), lengthMonths: 3 },
  ];
}

function monthInWindow(month: number, w: SeasonWindow): boolean {
  for (let i = 0; i < w.lengthMonths; i++) {
    if (((w.startMonth - 1 + i) % 12) + 1 === month) return true;
  }
  return false;
}

export function currentSeason(cal: SeasonWindow[], month: number): SeasonWindow {
  return cal.find((w) => monthInWindow(month, w)) ?? cal[0];
}

function cropFitsSeason(crop: CropSpec, season: SeasonWindow, region: Region): boolean {
  if (crop.isTree || crop.seasons.includes("perennial")) return true;
  if (crop.seasons.includes(season.key as never)) return true;
  // Cross-map Indian and temperate season names so the crop table stays small.
  const map: Record<SeasonKey, SeasonKey[]> = {
    kharif: ["summer", "spring"],
    rabi: ["winter", "autumn"],
    zaid: ["summer", "spring"],
    spring: ["kharif", "zaid"],
    summer: ["kharif", "zaid"],
    autumn: ["rabi"],
    winter: ["rabi"],
    perennial: [],
  };
  return (map[season.key] ?? []).some((s) => crop.seasons.includes(s as never));
}

// ── Reference evapotranspiration (FAO Hargreaves) ────────────────────────

function extraterrestrialRadiation(lat: number, doy: number): number {
  const phi = (lat * Math.PI) / 180;
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * doy) / 365);
  const delta = 0.409 * Math.sin((2 * Math.PI * doy) / 365 - 1.39);
  const x = clamp(-Math.tan(phi) * Math.tan(delta), -1, 1);
  const ws = Math.acos(x);
  return (24 * 60 / Math.PI) * 0.082 * dr * (ws * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(ws));
}

/** Daily ETo in mm for the middle of a season window. */
export function etoMmPerDay(lat: number, meanTempC: number, season: SeasonWindow, humidityPct: number | null): number {
  const midMonth = ((season.startMonth - 1 + Math.floor(season.lengthMonths / 2)) % 12) + 1;
  const doy = Math.round((midMonth - 0.5) * 30.4);
  const ra = extraterrestrialRadiation(lat, doy);
  // Diurnal range shrinks with humidity; 8-16 °C is the usual field range.
  const dtr = humidityPct != null ? clamp(17 - humidityPct * 0.1, 7, 16) : 12;
  const eto = 0.0023 * (ra / 2.45) * (meanTempC + 17.8) * Math.sqrt(dtr);
  return clamp(eto, 1.2, 11);
}

// ── Farm state ───────────────────────────────────────────────────────────

export interface FarmStateInput {
  fieldName: string;
  areaHa: number;
  currentCrop?: string;
  previousCrop?: string;
  location?: string;
  lat: number;
  lon: number;
  site: SiteData;
  month?: number;
  waterBudgetM3?: number | null;
  priorities?: Partial<Priorities>;
}

export interface Priorities {
  profit: number;
  water: number;
  risk: number;
  soil: number;
}

const DEFAULT_PRIORITIES: Priorities = { profit: 0.4, water: 0.2, risk: 0.2, soil: 0.2 };

export interface FarmState {
  fieldName: string;
  areaHa: number;
  location: string;
  lat: number;
  lon: number;
  region: Region;
  currency: "INR" | "USD";
  fx: number; // INR per unit of currency
  zone: ClimateZone;
  meanTempC: number;
  annualRainfallMm: number | null;
  season: SeasonWindow;
  calendar: SeasonWindow[];
  etoMmDay: number;
  seasonRainMm: number;
  waterBudgetM3: number;
  waterBudgetAssumed: boolean;
  previousCrop: string | null;
  previousFamily: string | null;
  soil: {
    ph: number | null;
    clayPct: number | null;
    sandPct: number | null;
    socGPerKg: number | null;
    nitrogenGPerKg: number | null;
    availableWaterPct: number | null;
    soilClass: string | null;
    rootZoneMm: number | null;
  };
  ndvi: number | null;
  irrigated: boolean;
  priorities: Priorities;
  dataConfidence: "high" | "medium" | "low";
  evidence: string[];
}

export function buildFarmState(input: FarmStateInput): FarmState {
  const site = input.site;
  const region = detectRegion(input.lat, input.lon, input.location ?? "");
  const ranked = rankCrops(site, { limit: 1 });
  const zone = ranked.zone;
  const meanTempC = Math.round(ranked.meanTempC * 10) / 10;
  const calendar = seasonCalendar(region, zone, input.lat);
  const month = input.month ?? new Date().getUTCMonth() + 1;
  const season = currentSeason(calendar, month);
  const eto = etoMmPerDay(input.lat, meanTempC, season, site.humidityPct ?? null);
  const annual = site.annualRainfallMm ?? null;
  const seasonRain = annual != null ? Math.round(annual * season.rainShare) : Math.round(eto * 30 * season.lengthMonths * 0.4);

  const awc = site.availableWaterPct ?? null;
  const rootZoneMm = awc != null ? Math.round(awc * 10) : null; // mm per metre of soil

  // Water budget: rainfed unless the measured water-access score says otherwise.
  const access = site.waterAccessScore ?? 50;
  const irrigated = site.irrigated === true || access >= 60;
  const assumedBudget = Math.round(input.areaHa * (irrigated ? (access / 100) * 5500 : 900));
  const waterBudgetM3 = input.waterBudgetM3 && input.waterBudgetM3 > 0 ? input.waterBudgetM3 : assumedBudget;

  const prev = input.previousCrop ?? input.currentCrop ?? null;
  const prevSpec = prev ? CROP_BY_NAME.get(prev.toLowerCase()) : undefined;

  const known = [site.ph, site.clayPct, site.annualRainfallMm, site.temperatureC, site.availableWaterPct, site.ndvi].filter((v) => v != null).length;

  const evidence: string[] = [];
  if (site.ph != null) evidence.push("SoilGrids soil chemistry");
  if (site.annualRainfallMm != null) evidence.push("CHIRPS rainfall history");
  if (site.temperatureC != null) evidence.push("Open-Meteo weather");
  if (site.ndvi != null) evidence.push("Sentinel-2 NDVI");
  if (site.elevationM != null) evidence.push("SRTM terrain");
  evidence.push("FAO ETc water balance");

  return {
    fieldName: input.fieldName,
    areaHa: input.areaHa,
    location: input.location ?? "",
    lat: input.lat,
    lon: input.lon,
    region,
    currency: region === "india" ? "INR" : "USD",
    fx: region === "india" ? 1 : 83,
    zone,
    meanTempC,
    annualRainfallMm: annual,
    season,
    calendar,
    etoMmDay: Math.round(eto * 100) / 100,
    seasonRainMm: seasonRain,
    waterBudgetM3,
    waterBudgetAssumed: !(input.waterBudgetM3 && input.waterBudgetM3 > 0),
    previousCrop: prev,
    previousFamily: prevSpec ? traitsFor(prevSpec).family : null,
    soil: {
      ph: site.ph ?? null,
      clayPct: site.clayPct ?? null,
      sandPct: site.sandPct ?? null,
      socGPerKg: site.socGPerKg ?? null,
      nitrogenGPerKg: site.nitrogenGPerKg ?? null,
      availableWaterPct: awc,
      soilClass: site.soilClass ?? null,
      rootZoneMm,
    },
    ndvi: site.ndvi ?? null,
    irrigated,
    priorities: { ...DEFAULT_PRIORITIES, ...(input.priorities ?? {}) },
    dataConfidence: known >= 5 ? "high" : known >= 3 ? "medium" : "low",
    evidence,
  };
}

// ── Candidate crops ──────────────────────────────────────────────────────

export interface Candidate {
  spec: CropSpec;
  traits: CropTraits;
  /** Agronomic envelope score, 0-100. */
  suitability: number;
  /** Blended score used for ranking (envelope + rotation + local prevalence). */
  score: number;
  localPrevalence: number | null;
  rotationDelta: number;
  limitingFactor: string;
  yieldTPerHa: number;
  factors: ScoredCrop["factors"];
  notes: string[];
}

export interface CandidateOptions {
  /** AI-supplied 0-100 "actually grown around here" weight, by crop name. */
  localPrevalence?: Record<string, number>;
  limit?: number;
}

export function buildCandidates(farm: FarmState, site: SiteData, opts: CandidateOptions = {}): Candidate[] {
  const ranked = rankCrops(site, { limit: 40, threshold: 38 });
  const byName = new Map(ranked.all.map((s) => [s.crop.name.toLowerCase(), s]));
  const prevalence = opts.localPrevalence ?? {};

  const out: Candidate[] = [];
  for (const spec of CROPS) {
    const scored = byName.get(spec.name.toLowerCase());
    if (!scored) continue;
    if (scored.score < 30) continue;
    if (!cropFitsSeason(spec, farm.season, farm.region)) continue;

    const traits = traitsFor(spec);
    const notes: string[] = [];

    // Rotation effect against what was grown last.
    let rotationDelta = 0;
    if (farm.previousCrop && spec.name.toLowerCase() === farm.previousCrop.toLowerCase()) {
      rotationDelta -= 12;
      notes.push("same crop as last season - pest and nutrient carry-over");
    } else if (farm.previousFamily && farm.previousFamily === traits.family) {
      rotationDelta -= 6;
      notes.push(`same family as the previous crop (${traits.family})`);
    } else if (farm.previousFamily === "Poaceae" && traits.nFixKgHa > 0) {
      rotationDelta += 8;
      notes.push("legume after a cereal - fixes nitrogen and breaks the pest cycle");
    } else if (farm.previousFamily && farm.previousFamily !== traits.family) {
      rotationDelta += 3;
    }

    const local = prevalence[spec.name.toLowerCase()] ?? null;
    // Local prevalence is evidence, never a rule: capped at a 20-point nudge.
    const localAdj = local != null ? (local - 50) * 0.4 : 0;
    const score = clamp(scored.score + rotationDelta + localAdj, 0, 100);

    out.push({
      spec,
      traits,
      suitability: scored.score,
      score: Math.round(score),
      localPrevalence: local,
      rotationDelta,
      limitingFactor: scored.limitingFactor,
      yieldTPerHa: scored.yieldTPerHa,
      factors: scored.factors,
      notes,
    });
  }

  out.sort((a, b) => b.score - a.score);
  // Keep the pool diverse: at most 3 per category.
  const capped: Candidate[] = [];
  const perCat: Record<string, number> = {};
  for (const c of out) {
    const cap = c.spec.category === "cereal" ? 3 : 2;
    if ((perCat[c.spec.category] ?? 0) >= cap) continue;
    perCat[c.spec.category] = (perCat[c.spec.category] ?? 0) + 1;
    capped.push(c);
    if (capped.length >= (opts.limit ?? 10)) break;
  }
  return capped;
}

// ── Pair compatibility ──────────────────────────────────────────────────

export interface CompatComponent {
  key: string;
  label: string;
  score: number; // 0-100
  note: string;
}

export interface Compatibility {
  a: string;
  b: string;
  score: number; // 0-100
  components: CompatComponent[];
  blocking: string | null;
}

export function compatibility(a: Candidate, b: Candidate): Compatibility {
  const ta = a.traits, tb = b.traits;
  const comps: CompatComponent[] = [];

  const rootGap = Math.abs(ta.rootDepthCm - tb.rootDepthCm);
  comps.push({ key: "root", label: "Root zones", score: Math.round(clamp(rootGap / 70, 0, 1) * 100), note: `${ta.rootDepthCm} cm vs ${tb.rootDepthCm} cm rooting depth` });

  const tall = Math.max(ta.heightCm, tb.heightCm);
  const shortT = tall === ta.heightCm ? tb : ta;
  const heightRatio = Math.min(ta.heightCm, tb.heightCm) / tall;
  const light = heightRatio < 0.65 ? 55 + shortT.shadeTolerance * 45 : 45 - (1 - heightRatio) * 20;
  comps.push({ key: "light", label: "Canopy and light", score: Math.round(clamp(light, 0, 100)), note: heightRatio < 0.65 ? `${tall} cm canopy over a ${Math.min(ta.heightCm, tb.heightCm)} cm crop` : "both crops reach a similar height" });

  const durGap = Math.abs(ta.durationDays - tb.durationDays);
  comps.push({ key: "duration", label: "Growth duration", score: Math.round(clamp(durGap / 55, 0, 1) * 90 + 10), note: `${ta.durationDays} d vs ${tb.durationDays} d to harvest` });

  const waterPeakGap = Math.abs(ta.durationDays * 0.55 - tb.durationDays * 0.55);
  const waterPair = (a.spec.water === "high" && b.spec.water === "high") ? 25 : 60 + clamp(waterPeakGap / 40, 0, 1) * 40;
  comps.push({ key: "water", label: "Water timing", score: Math.round(clamp(waterPair, 0, 100)), note: `peak demand about ${Math.round(waterPeakGap)} days apart` });

  const nut = ta.nFixKgHa > 0 || tb.nFixKgHa > 0 ? 88 : 100 - clamp((ta.nDemandKgHa + tb.nDemandKgHa) / 320, 0, 1) * 70;
  comps.push({ key: "nutrient", label: "Nutrients", score: Math.round(clamp(nut, 0, 100)), note: ta.nFixKgHa > 0 || tb.nFixKgHa > 0 ? `legume fixes about ${Math.max(ta.nFixKgHa, tb.nFixKgHa)} kg N/ha` : `combined N demand ${ta.nDemandKgHa + tb.nDemandKgHa} kg/ha` });

  const sharedPests = ta.pests.filter((p) => tb.pests.includes(p));
  const sameFamily = ta.family === tb.family && ta.family !== "Mixed";
  const pestScore = sameFamily ? 25 : sharedPests.length ? 55 : 90;
  comps.push({ key: "pest", label: "Pest and disease", score: pestScore, note: sameFamily ? `same family (${ta.family}) - shares soil-borne disease` : sharedPests.length ? `shared pests: ${sharedPests.join(", ")}` : "no major shared pest or pathogen" });

  const harvestClash = durGap < 12 && !ta.mechanised && !tb.mechanised;
  comps.push({ key: "harvest", label: "Harvest and labour", score: harvestClash ? 35 : durGap < 12 ? 60 : 88, note: harvestClash ? "both hand-harvested in the same week" : `harvests ${durGap} days apart` });

  const spacingOk = Math.max(ta.rowSpacingCm, tb.rowSpacingCm) / Math.min(ta.rowSpacingCm, tb.rowSpacingCm);
  comps.push({ key: "spacing", label: "Row geometry", score: Math.round(clamp(1.6 / spacingOk, 0, 1) * 100), note: `${ta.rowSpacingCm} cm vs ${tb.rowSpacingCm} cm rows` });

  const weights: Record<string, number> = { root: 1.3, light: 1.6, duration: 1.4, water: 1.5, nutrient: 1.2, pest: 1.6, harvest: 1.0, spacing: 0.8 };
  let sum = 0, wsum = 0;
  for (const c of comps) { const w = weights[c.key] ?? 1; sum += c.score * w; wsum += w; }
  let score = Math.round(sum / wsum);

  let blocking: string | null = null;
  if (sameFamily) { blocking = `${a.spec.name} and ${b.spec.name} are in the same family (${ta.family})`; score = Math.min(score, 40); }
  if (a.spec.water === "high" && b.spec.water === "high") { blocking = blocking ?? "both crops are heavy water users"; score = Math.min(score, 45); }

  return { a: a.spec.name, b: b.spec.name, score, components: comps, blocking };
}

// ── Water balance + economics per system ────────────────────────────────

interface ZoneSim {
  crop: Candidate;
  areaPct: number;
  areaHa: number;
  densityPct: number;
  cropWaterMm: number;
  irrigationMm: number;
  irrigationM3: number;
  yieldT: number;
  revenue: number;
  cost: number;
}

function simulateZone(farm: FarmState, crop: Candidate, areaPct: number, densityPct: number, intercropPenalty: number): ZoneSim {
  const areaHa = (farm.areaHa * areaPct) / 100;
  const t = crop.traits;
  // ETc = Kc x ETo over the crop cycle (initial/mid/late weighting).
  const cropWaterMm = Math.round(farm.etoMmDay * t.durationDays * (0.45 + t.kcMid * 0.55));
  const seasonRainForCrop = Math.round(farm.seasonRainMm * clamp(t.durationDays / (farm.season.lengthMonths * 30), 0.4, 1.2) * 0.8);
  const irrigationMm = Math.max(0, cropWaterMm - seasonRainForCrop);
  const irrigationM3 = Math.round(irrigationMm * 10 * areaHa);

  const densityFactor = densityPct / 100;
  const yieldT = Math.round(crop.yieldTPerHa * areaHa * densityFactor * (1 - intercropPenalty) * 100) / 100;
  const revenue = Math.round((yieldT * t.priceInrT) / farm.fx);
  const cost = Math.round((t.costHaInr * areaHa * (0.35 + densityFactor * 0.65) + irrigationM3 * 4) / farm.fx);

  return { crop, areaPct, areaHa: Math.round(areaHa * 100) / 100, densityPct, cropWaterMm, irrigationMm, irrigationM3, yieldT, revenue, cost };
}

export type PlanType = "monocrop" | "intercrop" | "mosaic" | "sequential";

export interface PlanZone {
  id: string;
  crop: string;
  emoji: string;
  color: string;
  category: string;
  area_pct: number;
  area_ha: number;
  density_pct: number;
  rows: number;
  row_spacing_cm: number;
  plant_spacing_m: number;
  root_depth_cm: number;
  height_cm: number;
  duration_days: number;
  water_m3: number;
  crop_water_mm: number;
  yield_t: number;
  revenue: number;
  suitability: number;
  limiting_factor: string;
  reason: string;
  position: { x: number; y: number };
}

export interface Plan {
  id: string;
  type: PlanType;
  title: string;
  crops: string[];
  zones: PlanZone[];
  arrangement: { pattern: string; row_ratio: string; description: string };
  water: {
    crop_water_mm: number;
    season_rain_mm: number;
    irrigation_mm: number;
    irrigation_m3: number;
    budget_m3: number;
    budget_assumed: boolean;
    within_budget: boolean;
    litres_per_kg: number;
  };
  economics: { currency: string; revenue: number; cost: number; profit: number; profit_low: number; profit_high: number };
  yield_total_t: number;
  scores: { suitability: number; water_efficiency: number; soil_health: number; resilience: number; risk: number; utility: number };
  compatibility: Compatibility[];
  sequence: { season: string; months: string; crop: string; emoji: string; note: string }[];
  reasons: string[];
  warnings: string[];
  confidence: "high" | "medium" | "low";
}

function rowRatio(a: Candidate, b: Candidate, aPct: number): string {
  const ratio = aPct / Math.max(1, 100 - aPct);
  const rowsA = clamp(Math.round(ratio * 2), 1, 6);
  const rowsB = clamp(Math.round((rowsA / Math.max(ratio, 0.2)) / 2), 1, 4);
  return `${rowsA} row${rowsA > 1 ? "s" : ""} ${a.spec.name} : ${rowsB} row${rowsB > 1 ? "s" : ""} ${b.spec.name}`;
}

function positions(n: number): { x: number; y: number }[] {
  const grid = [
    [{ x: 50, y: 50 }],
    [{ x: 32, y: 45 }, { x: 70, y: 58 }],
    [{ x: 30, y: 35 }, { x: 68, y: 42 }, { x: 48, y: 74 }],
    [{ x: 28, y: 32 }, { x: 66, y: 34 }, { x: 34, y: 70 }, { x: 72, y: 70 }],
  ];
  return grid[Math.min(n, 4) - 1] ?? grid[3];
}

function assemble(
  farm: FarmState,
  id: string,
  type: PlanType,
  title: string,
  sims: ZoneSim[],
  compat: Compatibility[],
  extraReasons: string[],
  sequence: Plan["sequence"] = [],
): Plan {
  const pos = positions(sims.length);
  const zones: PlanZone[] = sims.map((s, i) => ({
    id: `${id}-${i + 1}`,
    crop: s.crop.spec.name,
    emoji: s.crop.spec.emoji,
    color: s.crop.spec.color,
    category: s.crop.spec.category,
    area_pct: s.areaPct,
    area_ha: s.areaHa,
    density_pct: s.densityPct,
    rows: clamp(Math.round(s.areaPct / 12), 1, 8),
    row_spacing_cm: s.crop.traits.rowSpacingCm,
    plant_spacing_m: s.crop.spec.spacing_m,
    root_depth_cm: s.crop.traits.rootDepthCm,
    height_cm: s.crop.traits.heightCm,
    duration_days: s.crop.traits.durationDays,
    water_m3: s.irrigationM3,
    crop_water_mm: s.cropWaterMm,
    yield_t: s.yieldT,
    revenue: s.revenue,
    suitability: s.crop.suitability,
    limiting_factor: s.crop.limitingFactor,
    reason: [
      `${s.crop.suitability}/100 agronomic fit here`,
      s.crop.localPrevalence != null ? `locally grown score ${Math.round(s.crop.localPrevalence)}/100` : null,
      s.crop.notes[0] ?? null,
      `limited mainly by ${s.crop.limitingFactor.toLowerCase()}`,
    ].filter(Boolean).join(" · "),
    position: pos[i],
  }));

  const irrigationM3 = sims.reduce((a, s) => a + s.irrigationM3, 0);
  const cropWaterMm = Math.round(sims.reduce((a, s) => a + s.cropWaterMm * s.areaPct, 0) / 100);
  const irrigationMm = Math.round(sims.reduce((a, s) => a + s.irrigationMm * s.areaPct, 0) / 100);
  const revenue = sims.reduce((a, s) => a + s.revenue, 0);
  const cost = sims.reduce((a, s) => a + s.cost, 0);
  const profit = revenue - cost;
  const yieldTotal = Math.round(sims.reduce((a, s) => a + s.yieldT, 0) * 100) / 100;

  const suitability = Math.round(sims.reduce((a, s) => a + s.crop.score * s.areaPct, 0) / 100);
  const waterEff = yieldTotal > 0 ? clamp(100 - (irrigationM3 / Math.max(yieldTotal * 1000, 1)) * 25, 0, 100) : 20;
  const nFix = sims.reduce((a, s) => a + s.crop.traits.nFixKgHa * s.areaHa, 0);
  const families = new Set(sims.map((s) => s.crop.traits.family));
  const soilHealth = clamp(35 + (nFix / Math.max(farm.areaHa, 0.1)) * 0.35 + (families.size - 1) * 12 + (sims.length > 1 ? 10 : 0), 0, 100);
  const volatility = sims.reduce((a, s) => a + s.crop.traits.volatility * s.areaPct, 0) / 100;
  const budgetGap = irrigationM3 / Math.max(farm.waterBudgetM3, 1);
  const resilience = clamp(100 - volatility * 90 + (sims.length - 1) * 12 - clamp(budgetGap - 1, 0, 1) * 40, 0, 100);
  const dataPenalty = farm.dataConfidence === "high" ? 0 : farm.dataConfidence === "medium" ? 8 : 18;
  const risk = clamp(volatility * 55 + clamp(budgetGap - 0.9, 0, 1) * 45 + (100 - suitability) * 0.35 + dataPenalty, 0, 100);

  const p = farm.priorities;
  const wsum = p.profit + p.water + p.risk + p.soil || 1;
  const profitNorm = clamp((profit / Math.max(farm.areaHa, 0.1)) / (farm.currency === "INR" ? 900 : 11), 0, 100);
  const utility = Math.round(
    ((p.profit * profitNorm + p.water * waterEff + p.soil * soilHealth + p.risk * (100 - risk)) / wsum) * 0.7 +
    suitability * 0.3,
  );

  const warnings: string[] = [];
  if (irrigationM3 > farm.waterBudgetM3) {
    warnings.push(`Needs about ${irrigationM3.toLocaleString()} m³ of irrigation but only ${farm.waterBudgetM3.toLocaleString()} m³ looks available - cut area, switch to a shorter-duration crop, or add drip.`);
  }
  for (const c of compat) if (c.blocking) warnings.push(c.blocking);
  if (farm.dataConfidence === "low") warnings.push("Soil and weather coverage for this field is thin, so the numbers are indicative.");

  const reasons = [
    ...extraReasons,
    `Season: ${farm.season.label} (${farm.season.months}); ETo ${farm.etoMmDay} mm/day, expected rain ${farm.seasonRainMm} mm.`,
    `Water balance: crop demand ${cropWaterMm} mm, rainfall covers ${Math.max(0, cropWaterMm - irrigationMm)} mm, irrigation ${irrigationMm} mm (${irrigationM3.toLocaleString()} m³).`,
    farm.previousCrop ? `Previous crop ${farm.previousCrop}${farm.previousFamily ? ` (${farm.previousFamily})` : ""} taken into account for rotation.` : "No previous-crop record, so rotation is scored neutrally.",
  ];

  return {
    id,
    type,
    title,
    crops: sims.map((s) => s.crop.spec.name),
    zones,
    arrangement: { pattern: "", row_ratio: "", description: "" },
    water: {
      crop_water_mm: cropWaterMm,
      season_rain_mm: farm.seasonRainMm,
      irrigation_mm: irrigationMm,
      irrigation_m3: irrigationM3,
      budget_m3: farm.waterBudgetM3,
      budget_assumed: farm.waterBudgetAssumed,
      within_budget: irrigationM3 <= farm.waterBudgetM3,
      litres_per_kg: yieldTotal > 0 ? Math.round(irrigationM3 / (yieldTotal * 1000) * 1000) : 0,
    },
    economics: {
      currency: farm.currency,
      revenue,
      cost,
      profit,
      profit_low: Math.round(profit - Math.abs(revenue) * (volatility * 0.6 + 0.12)),
      profit_high: Math.round(profit + Math.abs(revenue) * (volatility * 0.5 + 0.1)),
    },
    yield_total_t: yieldTotal,
    scores: {
      suitability,
      water_efficiency: Math.round(waterEff),
      soil_health: Math.round(soilHealth),
      resilience: Math.round(resilience),
      risk: Math.round(risk),
      utility,
    },
    compatibility: compat,
    sequence,
    reasons,
    warnings,
    confidence: farm.dataConfidence,
  };
}

// ── Plan generation ─────────────────────────────────────────────────────

export function buildPlans(farm: FarmState, candidates: Candidate[]): Plan[] {
  if (!candidates.length) return [];
  const plans: Plan[] = [];
  const top = candidates.slice(0, 7);

  // 1. Monocrops for the two strongest candidates.
  for (const c of top.slice(0, 2)) {
    const sim = simulateZone(farm, c, 100, 100, 0);
    const plan = assemble(farm, `mono-${c.spec.name}`, "monocrop", `${c.spec.name} across the whole field`, [sim], [], [
      `${c.spec.name} scores ${c.suitability}/100 on this field's soil, rainfall and temperature envelope.`,
      c.rotationDelta >= 0 ? "Fits the rotation after the previous crop." : "Rotation penalty applied for repeating the same family.",
    ]);
    plan.arrangement = {
      pattern: c.spec.isTree ? "wide grid" : "solid block",
      row_ratio: `rows every ${c.traits.rowSpacingCm} cm`,
      description: `Single crop, ${c.traits.rowSpacingCm} cm rows, plants ${c.spec.spacing_m} m apart in the row.`,
    };
    plans.push(plan);
  }

  // 2. Intercrops: every viable pair, best kept.
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      const a = top[i], b = top[j];
      const comp = compatibility(a, b);
      if (comp.score < 52) continue;
      const tallFirst = a.traits.heightCm >= b.traits.heightCm ? [a, b] : [b, a];
      const [main, minor] = tallFirst;
      const split = allocateAreas([main.score * 1.15, minor.score * (comp.score / 100)], { minPct: 20, treeFlags: [!!main.spec.isTree, !!minor.spec.isTree] });
      // Intercropped rows never carry full monocrop density.
      const mainSim = simulateZone(farm, main, split[0], 75, 0.08);
      const minorSim = simulateZone(farm, minor, split[1], 60, 0.12);
      const plan = assemble(farm, `inter-${main.spec.name}-${minor.spec.name}`, "intercrop", `${main.spec.name} intercropped with ${minor.spec.name}`, [mainSim, minorSim], [comp], [
        `Compatibility ${comp.score}/100: ${comp.components.slice().sort((x, y) => y.score - x.score)[0].note}.`,
        `${minor.spec.name} uses the ${minor.traits.rootDepthCm} cm root zone while ${main.spec.name} works at ${main.traits.rootDepthCm} cm.`,
        minor.traits.nFixKgHa > 0 ? `${minor.spec.name} returns roughly ${minor.traits.nFixKgHa} kg N/ha to the soil.` : `Harvests are ${Math.abs(main.traits.durationDays - minor.traits.durationDays)} days apart, spreading labour.`,
      ]);
      plan.arrangement = {
        pattern: "strip intercrop",
        row_ratio: rowRatio(main, minor, split[0]),
        description: `${main.spec.name} on ${split[0]}% of the field in ${main.traits.rowSpacingCm} cm rows, ${minor.spec.name} on ${split[1]}% between the strips at ${minor.traits.rowSpacingCm} cm.`,
      };
      plans.push(plan);
    }
  }

  // 3. Three-crop mosaic from the best compatible triple.
  if (top.length >= 3) {
    const legume = top.find((c) => c.traits.nFixKgHa > 0);
    const main = top[0];
    const third = top.find((c) => c !== main && c !== legume);
    const trio = [main, legume, third].filter(Boolean) as Candidate[];
    if (trio.length === 3) {
      const comps = [compatibility(trio[0], trio[1]), compatibility(trio[0], trio[2]), compatibility(trio[1], trio[2])];
      const split = allocateAreas(trio.map((c, idx) => c.score * (idx === 0 ? 1.25 : 1)), { minPct: 15, treeFlags: trio.map((c) => !!c.spec.isTree) });
      const sims = trio.map((c, idx) => simulateZone(farm, c, split[idx], idx === 0 ? 80 : 60, 0.12));
      const plan = assemble(farm, "mosaic", "mosaic", `${trio.map((c) => c.spec.name).join(" + ")} block mosaic`, sims, comps, [
        "Three blocks spread weather and market risk across different crop families.",
        `Average pair compatibility ${Math.round(comps.reduce((a, c) => a + c.score, 0) / comps.length)}/100.`,
      ]);
      plan.arrangement = {
        pattern: "block mosaic",
        row_ratio: split.map((p, idx) => `${trio[idx].spec.name} ${p}%`).join(" | "),
        description: `Unequal blocks sized by suitability: ${split.map((p, idx) => `${trio[idx].spec.name} ${p}%`).join(", ")}.`,
      };
      plans.push(plan);
    }
  }

  // 4. Sequential cropping: this season's best, then next season's best.
  const nextIdx = (farm.calendar.findIndex((s) => s.key === farm.season.key) + 1) % farm.calendar.length;
  const nextSeason = farm.calendar[nextIdx];
  const nextFarm: FarmState = { ...farm, season: nextSeason, seasonRainMm: farm.annualRainfallMm != null ? Math.round(farm.annualRainfallMm * nextSeason.rainShare) : farm.seasonRainMm, etoMmDay: etoMmMid(farm, nextSeason) };
  const nextPool = CROPS
    .filter((s) => cropFitsSeason(s, nextSeason, farm.region))
    .map((s) => candidates.find((c) => c.spec.name === s.name))
    .filter(Boolean) as Candidate[];
  const first = top[0];
  const second = nextPool.find((c) => c.traits.family !== first.traits.family && c.spec.name !== first.spec.name)
    ?? candidates.find((c) => c.traits.family !== first.traits.family);
  if (second && first.traits.durationDays + second.traits.durationDays <= 330) {
    const simA = simulateZone(farm, first, 100, 100, 0);
    const simB = simulateZone(nextFarm, second, 100, 100, 0.05);
    const merged = assemble(farm, "sequence", "sequential", `${first.spec.name} then ${second.spec.name}`, [simA, simB], [], [
      `Two harvests in one year: ${first.traits.durationDays} + ${second.traits.durationDays} days fits inside the calendar.`,
      `${second.spec.name} follows a different family (${second.traits.family} after ${first.traits.family}), which breaks the disease cycle.`,
    ], [
      { season: farm.season.label, months: farm.season.months, crop: first.spec.name, emoji: first.spec.emoji, note: `${first.traits.durationDays} days, ${simA.irrigationMm} mm irrigation` },
      { season: nextSeason.label, months: nextSeason.months, crop: second.spec.name, emoji: second.spec.emoji, note: `${second.traits.durationDays} days, ${simB.irrigationMm} mm irrigation` },
    ]);
    // Sequential zones are the same land used twice, so show full area for each.
    merged.zones = merged.zones.map((z) => ({ ...z, area_pct: 100, area_ha: farm.areaHa, position: { x: 50, y: 50 } }));
    merged.arrangement = {
      pattern: "sequential",
      row_ratio: `${first.spec.name} -> ${second.spec.name}`,
      description: `Whole field in ${first.spec.name} for ${farm.season.label}, then ${second.spec.name} in ${nextSeason.label}.`,
    };
    plans.push(merged);
  }

  plans.sort((a, b) => b.scores.utility - a.scores.utility);

  // Keep the shortlist genuinely different: no two plans with the same crop set.
  const picked: Plan[] = [];
  const seen = new Set<string>();
  for (const p of plans) {
    const key = [...p.crops].sort().join("|") + p.type;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(p);
    if (picked.length >= 3) break;
  }
  return picked.map((p, i) => ({ ...p, id: ["A", "B", "C"][i] ?? p.id }));
}

function etoMmMid(farm: FarmState, season: SeasonWindow): number {
  return etoMmPerDay(farm.lat, farm.meanTempC, season, null);
}

/** Three most likely crops for this location, engine-ranked. */
export function topCrops(farm: FarmState, candidates: Candidate[]) {
  return candidates.slice(0, 3).map((c) => ({
    crop: c.spec.name,
    emoji: c.spec.emoji,
    confidence_pct: c.score,
    season: farm.season.label,
    suitability: c.suitability,
    local_prevalence: c.localPrevalence,
    duration_days: c.traits.durationDays,
    water_need: c.spec.water,
    reason: `Fit ${c.suitability}/100${c.localPrevalence != null ? `, locally grown ${Math.round(c.localPrevalence)}/100` : ""}; limited by ${c.limitingFactor.toLowerCase()}.`,
  }));
}
