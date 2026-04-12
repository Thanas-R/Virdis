import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Field, haToAcres } from "@/data/fields";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import mapboxgl from "mapbox-gl";
import {
  Loader2,
  Sprout,
  TreePine,
  Droplets,
  TrendingUp,
  RotateCw,
  Lightbulb,
  Layers,
  ArrowRight,
  Zap,
  CalendarDays,
  Download,
} from "lucide-react";
import {
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import jsPDF from "jspdf";

interface CropZone {
  id: string;
  name: string;
  crop: string;
  emoji?: string;
  color: string;
  area_pct: number;
  reason: string;
  spacing_m: number;
  water_needs: string;
  season: string;
  yield_estimate: string;
  position: { x: number; y: number };
}

interface IntercroppingPair {
  primary: string;
  secondary: string;
  emoji?: string;
  benefit: string;
  spacing: string;
}

interface RotationStep {
  season: string;
  months: string;
  crops: string[];
}

interface CropPlan {
  zones: CropZone[];
  intercropping: IntercroppingPair[];
  rotation_plan: RotationStep[];
  summary: string;
  tips: string[];
  overall_score: number;
  water_saving_pct: number;
  expected_revenue_increase_pct: number;
  planner_source?: string;
  generated_from?: "edge" | "local";
}

interface CropPlanningSectionProps {
  field: Field;
  ndviData?: any;
  soilData?: any;
  weatherData?: any;
  suitabilityData?: any;
  mapToken: string;
}

interface CropProfile {
  name: string;
  color: string;
  spacing_m: number;
  waterNeeds: "low" | "medium" | "high";
  tempRange: [number, number];
  rainfallRange: [number, number];
  phRange: [number, number];
  humidityMin: number;
  baseYield: number;
  season: string;
  tags: string[];
  dotSize: number; // px size for map dot
}

interface PlanningSignals {
  ndvi: number;
  healthScore: number;
  soilPH: number;
  annualRainfall: number;
  temperature: number;
  humidity: number;
  waterIndex: number;
  soilQuality: number;
  climateQuality: number;
  topographyQuality: number;
  locationText: string;
  soilClass: string;
}

interface ZonePlacementMetrics {
  zoneAreaSqM: number;
  exactSpacing: number;
  visualSpacing: number;
  exactPlantCount: number;
  visualPlantCount: number;
  sampled: boolean;
}

const CROP_PLAN_CACHE_KEY = "crop-plan-cache";
const MAX_GRID_MARKERS_TOTAL = 500;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Vibrant, distinct colors for each crop
const CROP_PROFILES: CropProfile[] = [
  {
    name: "Coconut",
    color: "#16A34A",
    spacing_m: 8,
    waterNeeds: "medium",
    tempRange: [24, 33],
    rainfallRange: [1400, 3500],
    phRange: [5.2, 7.8],
    humidityMin: 68,
    baseYield: 6.4,
    season: "Perennial (Year-round)",
    tags: ["tree", "tropical", "humid", "coastal"],
    dotSize: 16,
  },
  {
    name: "Banana",
    color: "#EAB308",
    spacing_m: 3,
    waterNeeds: "high",
    tempRange: [23, 34],
    rainfallRange: [1200, 2800],
    phRange: [5.5, 7.5],
    humidityMin: 65,
    baseYield: 24,
    season: "Perennial (Year-round)",
    tags: ["fruit", "tropical", "humid"],
    dotSize: 14,
  },
  {
    name: "Turmeric",
    color: "#F97316",
    spacing_m: 0.45,
    waterNeeds: "medium",
    tempRange: [20, 32],
    rainfallRange: [1000, 2500],
    phRange: [5.0, 7.5],
    humidityMin: 58,
    baseYield: 8.5,
    season: "Kharif (Jun-Feb)",
    tags: ["spice", "shade-friendly", "tropical"],
    dotSize: 8,
  },
  {
    name: "Ginger",
    color: "#D97706",
    spacing_m: 0.35,
    waterNeeds: "medium",
    tempRange: [20, 30],
    rainfallRange: [1100, 2200],
    phRange: [5.0, 7.2],
    humidityMin: 55,
    baseYield: 7.2,
    season: "Kharif (May-Jan)",
    tags: ["spice", "shade-friendly", "humid"],
    dotSize: 8,
  },
  {
    name: "Black Pepper",
    color: "#7C3AED",
    spacing_m: 2,
    waterNeeds: "medium",
    tempRange: [21, 31],
    rainfallRange: [1500, 3000],
    phRange: [5.0, 6.8],
    humidityMin: 65,
    baseYield: 3.2,
    season: "Perennial (Year-round)",
    tags: ["spice", "vine", "humid", "intercrop"],
    dotSize: 12,
  },
  {
    name: "Rice",
    color: "#22C55E",
    spacing_m: 0.2,
    waterNeeds: "high",
    tempRange: [21, 34],
    rainfallRange: [1100, 3000],
    phRange: [5.0, 7.5],
    humidityMin: 60,
    baseYield: 4.8,
    season: "Kharif (Jun-Nov)",
    tags: ["grain", "high-water", "monsoon"],
    dotSize: 7,
  },
  {
    name: "Sugarcane",
    color: "#84CC16",
    spacing_m: 1.4,
    waterNeeds: "high",
    tempRange: [21, 35],
    rainfallRange: [1000, 2500],
    phRange: [6.0, 8.0],
    humidityMin: 55,
    baseYield: 78,
    season: "Annual (Feb-Mar planting)",
    tags: ["industrial", "high-water", "warm"],
    dotSize: 12,
  },
  {
    name: "Maize",
    color: "#FACC15",
    spacing_m: 0.3,
    waterNeeds: "medium",
    tempRange: [18, 32],
    rainfallRange: [500, 1200],
    phRange: [5.5, 7.8],
    humidityMin: 45,
    baseYield: 5.6,
    season: "Kharif (Jun-Oct)",
    tags: ["grain", "moderate-water", "warm"],
    dotSize: 9,
  },
  {
    name: "Millet",
    color: "#A3A3A3",
    spacing_m: 0.25,
    waterNeeds: "low",
    tempRange: [20, 34],
    rainfallRange: [350, 850],
    phRange: [5.5, 8.0],
    humidityMin: 35,
    baseYield: 2.1,
    season: "Kharif (Jun-Sep)",
    tags: ["grain", "drought-tolerant", "dry"],
    dotSize: 7,
  },
  {
    name: "Groundnut",
    color: "#DC2626",
    spacing_m: 0.25,
    waterNeeds: "low",
    tempRange: [22, 31],
    rainfallRange: [500, 1200],
    phRange: [5.8, 7.5],
    humidityMin: 40,
    baseYield: 2.6,
    season: "Kharif (Jun-Oct)",
    tags: ["legume", "dry", "intercrop"],
    dotSize: 8,
  },
  {
    name: "Chickpea",
    color: "#EC4899",
    spacing_m: 0.3,
    waterNeeds: "low",
    tempRange: [15, 28],
    rainfallRange: [400, 900],
    phRange: [6.0, 8.0],
    humidityMin: 35,
    baseYield: 1.8,
    season: "Rabi (Oct-Mar)",
    tags: ["pulse", "low-water", "rotation"],
    dotSize: 8,
  },
  {
    name: "Mung Bean",
    color: "#14B8A6",
    spacing_m: 0.22,
    waterNeeds: "low",
    tempRange: [22, 34],
    rainfallRange: [400, 1000],
    phRange: [6.0, 7.5],
    humidityMin: 40,
    baseYield: 1.5,
    season: "Zaid (Mar-Jun)",
    tags: ["pulse", "soil-builder", "rotation"],
    dotSize: 7,
  },
  {
    name: "Mustard",
    color: "#FDE047",
    spacing_m: 0.3,
    waterNeeds: "low",
    tempRange: [12, 26],
    rainfallRange: [350, 800],
    phRange: [6.0, 7.8],
    humidityMin: 35,
    baseYield: 1.4,
    season: "Rabi (Oct-Feb)",
    tags: ["oilseed", "cool", "rotation"],
    dotSize: 8,
  },
  {
    name: "Tomato",
    color: "#EF4444",
    spacing_m: 0.6,
    waterNeeds: "medium",
    tempRange: [18, 30],
    rainfallRange: [500, 1400],
    phRange: [5.5, 7.5],
    humidityMin: 45,
    baseYield: 18,
    season: "Zaid (Jan-May)",
    tags: ["vegetable", "market", "moderate-water"],
    dotSize: 9,
  },
  {
    name: "Wheat",
    color: "#F59E0B",
    spacing_m: 0.22,
    waterNeeds: "medium",
    tempRange: [12, 25],
    rainfallRange: [450, 1100],
    phRange: [6.0, 7.8],
    humidityMin: 35,
    baseYield: 3.4,
    season: "Rabi (Nov-Apr)",
    tags: ["grain", "cool", "rotation"],
    dotSize: 7,
  },
];

const ZONE_POSITION_PRESETS: Record<number, { x: number; y: number }[]> = {
  3: [
    { x: 0.28, y: 0.34 },
    { x: 0.72, y: 0.36 },
    { x: 0.5, y: 0.72 },
  ],
  4: [
    { x: 0.28, y: 0.3 },
    { x: 0.72, y: 0.32 },
    { x: 0.32, y: 0.72 },
    { x: 0.72, y: 0.68 },
  ],
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function getPlanCache(): Record<string, { data: CropPlan; timestamp: number }> {
  try {
    const cached = localStorage.getItem(CROP_PLAN_CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch {
    return {};
  }
}

function setPlanCache(fieldId: string, data: CropPlan) {
  const cache = getPlanCache();
  cache[fieldId] = { data, timestamp: Date.now() };
  localStorage.setItem(CROP_PLAN_CACHE_KEY, JSON.stringify(cache));
}

function parseMonthRange(monthsStr: string): number[] {
  const parts = monthsStr.split("-").map((s) => s.trim().substring(0, 3));
  if (parts.length !== 2) return [];
  const startIdx = MONTHS.findIndex((m) => m.toLowerCase() === parts[0].toLowerCase());
  const endIdx = MONTHS.findIndex((m) => m.toLowerCase() === parts[1].toLowerCase());
  if (startIdx === -1 || endIdx === -1) return [];

  const indices: number[] = [];
  if (startIdx <= endIdx) {
    for (let i = startIdx; i <= endIdx; i += 1) indices.push(i);
  } else {
    for (let i = startIdx; i < 12; i += 1) indices.push(i);
    for (let i = 0; i <= endIdx; i += 1) indices.push(i);
  }
  return indices;
}

const SEASON_COLORS: Record<string, string> = {
  Kharif: "#22C55E",
  Rabi: "#F97316",
  Zaid: "#3B82F6",
  Perennial: "#16A34A",
};

function getSeasonColor(season: string): string {
  for (const [key, color] of Object.entries(SEASON_COLORS)) {
    if (season.toLowerCase().includes(key.toLowerCase())) return color;
  }
  const hash = season.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return `hsl(${hash % 360}, 55%, 50%)`;
}

function rangeScore(value: number, [min, max]: [number, number], tolerance = 0) {
  if (value >= min && value <= max) return 1;
  if (value < min) {
    const gap = min - value;
    return clamp(1 - gap / Math.max(1, tolerance || min), 0, 1);
  }
  const gap = value - max;
  return clamp(1 - gap / Math.max(1, tolerance || max), 0, 1);
}

function normalizeLocation(location: string) {
  return location.toLowerCase();
}

function getWaterNeedIndex(waterNeeds: string) {
  if (waterNeeds === "high") return 0.82;
  if (waterNeeds === "low") return 0.28;
  return 0.55;
}

function buildPlanningSignals({ ndviData, soilData, weatherData, suitabilityData, field }: Omit<CropPlanningSectionProps, "mapToken">): PlanningSignals {
  const annualRainfall = suitabilityData?.raw?.annual_rainfall_mm ?? (weatherData?.humidity ? weatherData.humidity * 24 : 1100);
  const availableWater = soilData?.water_retention?.available_water_pct ?? 12;
  const waterAccess = suitabilityData?.water_access ?? 6;
  const ndvi = clamp(ndviData?.mean_ndvi ?? 0.58, 0.18, 0.92);
  const healthScore = clamp((ndviData?.vegetation_health_score ?? 70) / 100, 0.35, 0.95);

  const waterIndex = clamp(
    (availableWater / 25) * 0.45 +
      (waterAccess / 10) * 0.35 +
      clamp(annualRainfall / 2600, 0, 1) * 0.2,
    0.15,
    0.95,
  );

  return {
    ndvi,
    healthScore,
    soilPH: soilData?.metrics?.ph ?? 6.7,
    annualRainfall,
    temperature: weatherData?.temperature ?? 27,
    humidity: weatherData?.humidity ?? 65,
    waterIndex,
    soilQuality: clamp((suitabilityData?.soil_quality ?? 7) / 10, 0.35, 0.95),
    climateQuality: clamp((suitabilityData?.climate ?? 7) / 10, 0.35, 0.95),
    topographyQuality: clamp((suitabilityData?.topography ?? 8) / 10, 0.35, 0.95),
    locationText: normalizeLocation(field.location),
    soilClass: soilData?.classification?.soil_class || soilData?.texture?.usda_class || "loam",
  };
}

function getLocationBoost(profile: CropProfile, locationText: string) {
  const tropicalLocations = ["kerala", "coastal", "goa", "tamil", "konkan", "andaman", "assam"];
  const dryLocations = ["rajasthan", "dry", "arid", "plateau"];
  const coolLocations = ["himachal", "uttarakhand", "kashmir", "hill", "mountain"];

  if (profile.tags.includes("tropical") && tropicalLocations.some((keyword) => locationText.includes(keyword))) return 0.12;
  if (profile.tags.includes("dry") && dryLocations.some((keyword) => locationText.includes(keyword))) return 0.12;
  if (profile.tags.includes("cool") && coolLocations.some((keyword) => locationText.includes(keyword))) return 0.12;
  if (profile.tags.includes("coastal") && locationText.includes("coast")) return 0.1;
  return 0;
}

function scoreCropProfile(profile: CropProfile, signals: PlanningSignals, currentCrop: string) {
  const waterFit = 1 - Math.abs(getWaterNeedIndex(profile.waterNeeds) - signals.waterIndex);
  const humidityFit = clamp((signals.humidity - profile.humidityMin + 20) / 40, 0, 1);
  const locationBoost = getLocationBoost(profile, signals.locationText);
  const currentBoost = currentCrop.toLowerCase() === profile.name.toLowerCase() ? 0.14 : 0;
  const tropicalBoost = signals.annualRainfall > 1500 && signals.humidity > 68 && profile.tags.includes("tropical") ? 0.08 : 0;
  const dryBoost = signals.annualRainfall < 850 && profile.tags.includes("dry") ? 0.08 : 0;

  return (
    rangeScore(signals.temperature, profile.tempRange, 6) * 0.22 +
    rangeScore(signals.annualRainfall, profile.rainfallRange, 500) * 0.22 +
    rangeScore(signals.soilPH, profile.phRange, 0.8) * 0.14 +
    clamp(waterFit, 0, 1) * 0.14 +
    humidityFit * 0.08 +
    signals.healthScore * 0.08 +
    signals.soilQuality * 0.06 +
    signals.climateQuality * 0.04 +
    signals.topographyQuality * 0.02 +
    locationBoost +
    currentBoost +
    tropicalBoost +
    dryBoost
  );
}

function formatYield(profile: CropProfile, suitabilityScore: number, healthScore: number) {
  const multiplier = clamp(0.78 + suitabilityScore * 0.22 + healthScore * 0.12, 0.75, 1.25);
  return `${roundTo(profile.baseYield * multiplier)} t/ha`;
}

function getZoneReason(profile: CropProfile, signals: PlanningSignals, index: number) {
  const moistureLabel = signals.waterIndex > 0.72 ? "strong" : signals.waterIndex > 0.46 ? "balanced" : "careful";
  const ndviLabel = signals.ndvi > 0.65 ? "vigorous" : signals.ndvi > 0.5 ? "stable" : "recovering";
  const priority = index === 0 ? "primary production zone" : index === 1 ? "support zone" : "rotation zone";

  return `${profile.name} fits this ${priority} because the ${signals.soilClass.toLowerCase()} profile and pH ${roundTo(signals.soilPH)} align well with its rooting needs. Current NDVI is ${ndviLabel}, rainfall is ~${Math.round(signals.annualRainfall)}mm/year, and the field shows ${moistureLabel} water availability for ${profile.waterNeeds}-water cropping.`;
}

function chooseRotationPlan(chosenProfiles: CropProfile[], signals: PlanningSignals): RotationStep[] {
  const names = new Set(chosenProfiles.map((profile) => profile.name));

  // Determine current season based on month
  const currentMonth = new Date().getMonth(); // 0-11
  const isKharif = currentMonth >= 5 && currentMonth <= 9;
  const isRabi = currentMonth >= 10 || currentMonth <= 2;

  const kharif = signals.annualRainfall > 1400 ? (names.has("Rice") ? "Rice" : names.has("Turmeric") ? "Turmeric" : "Maize") : names.has("Millet") ? "Millet" : "Groundnut";
  const rabi = signals.temperature < 22 ? (names.has("Wheat") ? "Wheat" : "Chickpea") : names.has("Chickpea") ? "Chickpea" : "Mustard";
  const zaid = names.has("Mung Bean") ? "Mung Bean" : names.has("Tomato") ? "Tomato" : "Groundnut";

  // Order rotation starting from current season
  const seasons: RotationStep[] = [
    { season: `Kharif${isKharif ? " (Current)" : ""}`, months: "Jun-Oct", crops: [kharif, names.has("Black Pepper") ? "Black Pepper" : "Cover crop"] },
    { season: `Rabi${isRabi ? " (Current)" : ""}`, months: "Nov-Mar", crops: [rabi, names.has("Mustard") ? "Mustard" : "Mulch recovery"] },
    { season: `Zaid${!isKharif && !isRabi ? " (Current)" : ""}`, months: "Mar-Jun", crops: [zaid, "Mung Bean"] },
  ];

  return seasons;
}

function chooseIntercropping(chosenProfiles: CropProfile[], signals: PlanningSignals): IntercroppingPair[] {
  const chosenNames = chosenProfiles.map((profile) => profile.name);
  const pairs: IntercroppingPair[] = [];

  if (chosenNames.includes("Coconut")) {
    pairs.push({
      primary: "Coconut",
      secondary: chosenNames.includes("Turmeric") ? "Turmeric" : "Ginger",
      benefit: "Use the tree spacing as the long-cycle canopy layer and fill the filtered-light lanes with a lower-water intercrop for better land use and weed suppression.",
      spacing: "Coconut at 8m centres, intercrop beds at 0.4m-0.6m between tree rows",
    });
  }

  if (chosenNames.includes("Banana")) {
    pairs.push({
      primary: "Banana",
      secondary: chosenNames.includes("Groundnut") ? "Groundnut" : "Mung Bean",
      benefit: "Short-cycle legumes improve soil cover and nitrogen cycling while the banana block establishes canopy and retains humidity.",
      spacing: "Banana at 3m centres, legumes in 0.25m rows between alleys",
    });
  }

  if (pairs.length < 2) {
    pairs.push({
      primary: chosenNames[0] || "Maize",
      secondary: chosenNames.includes("Mung Bean") ? "Mung Bean" : chosenNames[1] || "Groundnut",
      benefit: `Blend a structural crop with a quick low-water companion to stabilize moisture use and reduce bare soil in ${signals.locationText || "the region"}.`,
      spacing: `Primary rows at ${chosenProfiles[0]?.spacing_m ?? 0.4}m, companion rows every 0.25m-0.4m where access lanes permit`,
    });
  }

  return pairs.slice(0, 2);
}

function normalizeAreaPercents(rawWeights: number[]) {
  const total = rawWeights.reduce((sum, value) => sum + value, 0) || 1;
  let normalized = rawWeights.map((value) => Math.max(12, Math.round((value / total) * 100)));
  let current = normalized.reduce((sum, value) => sum + value, 0);

  while (current > 100) {
    const index = normalized.findIndex((value) => value > 12);
    if (index === -1) break;
    normalized[index] -= 1;
    current -= 1;
  }

  while (current < 100) {
    normalized[normalized.indexOf(Math.max(...normalized))] += 1;
    current += 1;
  }

  return normalized;
}

function isValidPlan(data: any): data is CropPlan {
  return Boolean(
    data &&
      Array.isArray(data.zones) &&
      Array.isArray(data.intercropping) &&
      Array.isArray(data.rotation_plan) &&
      typeof data.summary === "string",
  );
}

function buildLocalCropPlan({ field, ndviData, soilData, weatherData, suitabilityData }: Omit<CropPlanningSectionProps, "mapToken">): CropPlan {
  const signals = buildPlanningSignals({ field, ndviData, soilData, weatherData, suitabilityData });
  const scoredProfiles = CROP_PROFILES.map((profile) => ({
    profile,
    score: scoreCropProfile(profile, signals, field.crop),
  })).sort((left, right) => right.score - left.score);

  // Max 3-4 crops, ensure current crop is included, and ensure at least one tree if reasonable
  const zoneCount = clamp(field.area > 5 ? 4 : 3, 3, 4);
  let chosen = scoredProfiles.slice(0, zoneCount);

  // Ensure current crop is in the plan
  const currentCropInPlan = chosen.some(c => c.profile.name.toLowerCase() === field.crop.toLowerCase());
  if (!currentCropInPlan) {
    const currentProfile = scoredProfiles.find(c => c.profile.name.toLowerCase() === field.crop.toLowerCase());
    if (currentProfile) {
      chosen[chosen.length - 1] = currentProfile;
    }
  }

  // Ensure at least one tree-type crop (1 in ~80 dots minimum)
  const hasTree = chosen.some(c => c.profile.tags.includes("tree"));
  if (!hasTree) {
    const bestTree = scoredProfiles.find(c => c.profile.tags.includes("tree"));
    if (bestTree) {
      // Replace lowest-scored non-current crop
      const replaceIdx = chosen.length - 1;
      chosen[replaceIdx] = bestTree;
    }
  }

  const weights = normalizeAreaPercents(chosen.map((item) => item.score));
  const positions = ZONE_POSITION_PRESETS[chosen.length] || ZONE_POSITION_PRESETS[4] || ZONE_POSITION_PRESETS[3];

  const zones: CropZone[] = chosen.map(({ profile, score }, index) => ({
    id: `zone-${index + 1}`,
    name: `${String.fromCharCode(65 + index)} Zone`,
    crop: profile.name,
    color: profile.color,
    area_pct: weights[index],
    reason: getZoneReason(profile, signals, index),
    spacing_m: profile.spacing_m,
    water_needs: profile.waterNeeds,
    season: profile.season,
    yield_estimate: formatYield(profile, clamp(score, 0.45, 1.25), signals.healthScore),
    position: positions[index] || { x: 0.5, y: 0.5 },
  }));

  const chosenProfiles = chosen.map((item) => item.profile);
  const intercropping = chooseIntercropping(chosenProfiles, signals);
  const rotation_plan = chooseRotationPlan(chosenProfiles, signals);
  const overallScore = roundTo(clamp((chosen.reduce((sum, item) => sum + item.score, 0) / chosen.length) * 10, 6.4, 9.6), 1);
  const avgWaterNeed = chosenProfiles.reduce((sum, profile) => sum + getWaterNeedIndex(profile.waterNeeds), 0) / chosenProfiles.length;
  const water_saving_pct = Math.round(clamp((1 - avgWaterNeed) * 28 + (1 - signals.waterIndex) * 12 + 8, 10, 36));
  const expected_revenue_increase_pct = Math.round(clamp(overallScore * 2.8 + signals.healthScore * 8, 14, 34));

  const tips = [
    `Prioritize irrigation and fertigation in the ${zones[0].name.toLowerCase()} where ${zones[0].crop.toLowerCase()} has the strongest fit with current NDVI and soil moisture signals.`,
    `Use ${zones[0].spacing_m}m-${zones[Math.min(1, zones.length - 1)].spacing_m}m planting geometry to keep airflow consistent and reduce random crowding inside the field boundary.`,
    signals.waterIndex > 0.7
      ? "Rainfall and available water are strong enough to support a tree-plus-intercrop structure; keep drainage channels open near the wettest edge of the field."
      : "Because water availability is moderate, reserve the most drought-tolerant crops for the outer bands and keep the denser rows closer to your easiest irrigation access.",
  ];

  const summary = `This regional agronomy plan splits ${field.name} into ${zones.length} recommendation zones using NDVI health, soil response, rainfall, water access, and field geometry. The layout favors ${zones[0].crop.toLowerCase()} and ${zones[1]?.crop.toLowerCase() || zones[0].crop.toLowerCase()} in the strongest production pockets while reserving lower-water companion zones to improve rotation flexibility and field health.`;

  return {
    zones,
    intercropping,
    rotation_plan,
    summary,
    tips,
    overall_score: overallScore,
    water_saving_pct,
    expected_revenue_increase_pct,
    planner_source: "Regional agronomy model",
    generated_from: "local",
  };
}

function getMetersPerLng(latitude: number) {
  return 111320 * Math.cos((latitude * Math.PI) / 180);
}

function pointInPolygon(point: [number, number], polygon: [number, number][]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersect = yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function getZonePlacementMetrics(field: Field, zone: CropZone): ZonePlacementMetrics {
  const zoneAreaSqM = Math.max(field.area * 10000 * (zone.area_pct / 100), 90);
  const exactSpacing = Math.max(zone.spacing_m, 0.2);
  const exactPlantCount = Math.max(1, Math.round(zoneAreaSqM / (exactSpacing * exactSpacing)));
  const maxForZone = Math.round(MAX_GRID_MARKERS_TOTAL * (zone.area_pct / 100));
  const visualSpacing = exactPlantCount > maxForZone ? Math.sqrt(zoneAreaSqM / maxForZone) : exactSpacing;
  const visualPlantCount = Math.max(1, Math.round(zoneAreaSqM / (visualSpacing * visualSpacing)));

  return {
    zoneAreaSqM,
    exactSpacing,
    visualSpacing: roundTo(visualSpacing, 1),
    exactPlantCount,
    visualPlantCount,
    sampled: visualSpacing > exactSpacing,
  };
}

// Generate grid with spatial clustering so zones are somewhat localized but with mixing
function generateFullFieldGrid(
  field: Field,
  fieldBounds: { minLng: number; maxLng: number; minLat: number; maxLat: number },
  zones: CropZone[],
): Array<{ lng: number; lat: number; zoneIndex: number }> {
  const polygon = field.coordinates[0] as [number, number][];
  const centerLat = (fieldBounds.minLat + fieldBounds.maxLat) / 2;
  const metersPerLng = Math.max(getMetersPerLng(centerLat), 1);
  const metersPerLat = 111320;
  const fieldAreaSqM = field.area * 10000;

  const baseSpacing = Math.sqrt(fieldAreaSqM / MAX_GRID_MARKERS_TOTAL);
  const spacingLng = baseSpacing / metersPerLng;
  const spacingLat = baseSpacing / metersPerLat;

  const allPoints: Array<{ lng: number; lat: number; zoneIndex: number }> = [];
  const pad = 0.0001;

  // Build cumulative area thresholds for zone assignment
  const cumPct: number[] = [];
  let running = 0;
  for (const z of zones) {
    running += z.area_pct;
    cumPct.push(running);
  }

  // Create zone centers for spatial clustering
  const fieldCenterLng = (fieldBounds.minLng + fieldBounds.maxLng) / 2;
  const fieldCenterLat = (fieldBounds.minLat + fieldBounds.maxLat) / 2;
  const fieldWidth = fieldBounds.maxLng - fieldBounds.minLng;
  const fieldHeight = fieldBounds.maxLat - fieldBounds.minLat;

  // Assign zone centers at different positions in the field
  const zoneCenters = zones.map((_, i) => {
    const angle = (i / zones.length) * Math.PI * 2 + Math.PI / 4;
    return {
      lng: fieldCenterLng + Math.cos(angle) * fieldWidth * 0.25,
      lat: fieldCenterLat + Math.sin(angle) * fieldHeight * 0.25,
    };
  });

  let idx = 0;
  for (let lat = fieldBounds.minLat - pad; lat <= fieldBounds.maxLat + pad; lat += spacingLat) {
    const rowNum = Math.round((lat - fieldBounds.minLat) / spacingLat);
    const offset = rowNum % 2 === 0 ? 0 : spacingLng * 0.5;
    for (let lng = fieldBounds.minLng - pad + offset; lng <= fieldBounds.maxLng + pad; lng += spacingLng) {
      if (!pointInPolygon([lng, lat], polygon)) continue;

      // Assign zone based on distance to zone centers (with some randomness for mixing)
      const hash = Math.abs(Math.sin(lng * 73856093 + lat * 19349663) * 100);
      const mixFactor = 0.3; // 30% random mixing

      if (hash % 100 < mixFactor * 100) {
        // Random assignment for mixing
        const randomHash = hash % 100;
        let zoneIndex = 0;
        for (let z = 0; z < cumPct.length; z++) {
          if (randomHash < cumPct[z]) { zoneIndex = z; break; }
        }
        allPoints.push({ lng, lat, zoneIndex });
      } else {
        // Distance-based assignment for clustering
        let minDist = Infinity;
        let zoneIndex = 0;
        zoneCenters.forEach((center, z) => {
          const dLng = (lng - center.lng) * metersPerLng;
          const dLat = (lat - center.lat) * metersPerLat;
          // Weight by area percentage (larger zones pull more)
          const dist = Math.sqrt(dLng * dLng + dLat * dLat) / Math.sqrt(zones[z].area_pct / 100 + 0.1);
          if (dist < minDist) { minDist = dist; zoneIndex = z; }
        });
        allPoints.push({ lng, lat, zoneIndex });
      }

      idx++;
      if (idx >= MAX_GRID_MARKERS_TOTAL) return allPoints;
    }
  }
  return allPoints;
}

const formatter = new Intl.NumberFormat();

const CustomTooltipContent = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;

  return (
    <div className="rounded-lg px-3 py-2 shadow-xl border border-border/50" style={{ background: "hsl(150, 18%, 12%)" }}>
      <div className="text-xs font-semibold text-foreground">{data.name || data.crop}</div>
      <div className="text-sm font-bold" style={{ color: data.color }}>
        {data.value || data.area_pct}%
      </div>
    </div>
  );
};

// Get dot size from profile by crop name
function getDotSize(cropName: string): number {
  const profile = CROP_PROFILES.find(p => p.name.toLowerCase() === cropName.toLowerCase());
  return profile?.dotSize || 10;
}

const CropPlanningSection = ({ field, ndviData, soilData, weatherData, suitabilityData, mapToken }: CropPlanningSectionProps) => {
  const isMobile = useIsMobile();
  const [plan, setPlan] = useState<CropPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plannerNotice, setPlannerNotice] = useState<string | null>(null);
  const [selectedZone, setSelectedZone] = useState<CropZone | null>(null);
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const popupsRef = useRef<mapboxgl.Popup[]>([]);

  const fieldCenter = useMemo(() => {
    const coords = field.coordinates[0];
    return {
      lat: coords.reduce((sum, coord) => sum + coord[1], 0) / coords.length,
      lng: coords.reduce((sum, coord) => sum + coord[0], 0) / coords.length,
    };
  }, [field]);

  const fieldBounds = useMemo(() => {
    const coords = field.coordinates[0];
    const lngs = coords.map((coord) => coord[0]);
    const lats = coords.map((coord) => coord[1]);
    return {
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
    };
  }, [field]);

  const placementMetrics = useMemo(() => {
    if (!plan) return {} as Record<string, ZonePlacementMetrics>;
    return Object.fromEntries(plan.zones.map((zone) => [zone.id, getZonePlacementMetrics(field, zone)]));
  }, [plan, field]);

  const calendarRows = useMemo(() => {
    if (!plan?.rotation_plan) return [];
    return plan.rotation_plan.map((step) => ({
      season: step.season,
      months: step.months,
      crops: step.crops,
      activeMonths: parseMonthRange(step.months),
      color: getSeasonColor(step.season),
    }));
  }, [plan]);

  const zoneChartData = useMemo(
    () =>
      plan?.zones.map((zone) => ({
        name: zone.crop,
        value: zone.area_pct,
        color: zone.color,
      })) || [],
    [plan],
  );

  const buildFallbackPlan = useCallback(
    () =>
      buildLocalCropPlan({
        field,
        ndviData,
        soilData,
        weatherData,
        suitabilityData,
      }),
    [field, ndviData, soilData, weatherData, suitabilityData],
  );

  const fetchPlan = useCallback(async () => {
    setLoading(true);
    setError(null);

    const fallbackPlan = buildFallbackPlan();
    setPlan(fallbackPlan);
    setPlanCache(field.id, fallbackPlan);
    setSelectedZone(fallbackPlan.zones[0] || null);
    setPlannerNotice("Regional crop layout generated from NDVI, soil, rainfall, and water signals while live AI refinement runs in the background.");

    let timeoutId: number | undefined;

    try {
      const invocation = supabase.functions.invoke("crop-planning", {
        body: {
          fieldName: field.name,
          crop: field.crop,
          area: haToAcres(field.area),
          location: field.location,
          coordinates: field.coordinates,
          ndviData,
          soilData,
          weatherData,
          suitabilityData,
        },
      });

      const timeout = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error("Crop planning request timed out")), 15000);
      });

      const { data, error: fnError } = await Promise.race([invocation, timeout]);

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      if (!isValidPlan(data)) throw new Error("Planner returned an invalid plan");

      // Limit to 3-4 zones max
      const limitedZones = data.zones.slice(0, 4);
      const edgePlan: CropPlan = {
        ...data,
        zones: limitedZones,
        planner_source: data.planner_source || "AI planner",
        generated_from: "edge",
      };
      setPlan(edgePlan);
      setPlanCache(field.id, edgePlan);
      setSelectedZone(edgePlan.zones[0] || null);
      setPlannerNotice("Live AI analysis completed and updated this crop plan.");
    } catch (invokeError) {
      console.error("Crop planning invoke failed, keeping regional model:", invokeError);
      setPlannerNotice("Live planner is unavailable right now, so this view is using the regional agronomy model with NDVI, soil, rainfall, and water signals.");
      setError(null);
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [buildFallbackPlan, field, ndviData, soilData, suitabilityData, weatherData]);

  useEffect(() => {
    const cache = getPlanCache();
    const cached = cache[field.id];
    if (cached && Date.now() - cached.timestamp < 3600000) {
      setPlan(cached.data);
      setSelectedZone(cached.data.zones[0] || null);
      setPlannerNotice(
        cached.data.generated_from === "local"
          ? "Showing a cached regional agronomy plan for this field."
          : null,
      );
    } else {
      setPlan(null);
      setSelectedZone(null);
      setPlannerNotice(null);
    }
  }, [field.id]);

  const addZoneMarkers = useCallback(
    (map: mapboxgl.Map, cropPlan: CropPlan) => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      popupsRef.current.forEach((popup) => popup.remove());
      popupsRef.current = [];

      const allPoints = generateFullFieldGrid(field, fieldBounds, cropPlan.zones);

      allPoints.forEach((point) => {
        const zone = cropPlan.zones[point.zoneIndex];
        if (!zone) return;

        const dotSize = getDotSize(zone.crop);
        const dot = document.createElement("div");
        dot.style.cssText = `
          width: ${dotSize}px;
          height: ${dotSize}px;
          border-radius: 9999px;
          background: ${zone.color};
          border: 1.5px solid rgba(255,255,255,0.7);
          opacity: 0.9;
          box-shadow: 0 1px 4px rgba(0,0,0,0.3);
          pointer-events: none;
        `;

        const gridMarker = new mapboxgl.Marker({ element: dot, anchor: "center" })
          .setLngLat([point.lng, point.lat])
          .addTo(map);
        markersRef.current.push(gridMarker);
      });
    },
    [field, fieldBounds],
  );

  useEffect(() => {
    if (!mapContainer.current || !mapToken) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    popupsRef.current.forEach((popup) => popup.remove());
    popupsRef.current = [];

    mapboxgl.accessToken = mapToken;

    const bounds = new mapboxgl.LngLatBounds();
    field.coordinates[0].forEach((coord) => bounds.extend(coord as [number, number]));

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [fieldCenter.lng, fieldCenter.lat],
      zoom: 16,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });

    map.scrollZoom.enable();
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("plan-field", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "Polygon", coordinates: field.coordinates },
        },
      });

      map.addLayer({
        id: "plan-field-fill",
        type: "fill",
        source: "plan-field",
        paint: { "fill-color": "#ffffff", "fill-opacity": 0.08 },
      });

      map.addLayer({
        id: "plan-field-line",
        type: "line",
        source: "plan-field",
        paint: { "line-color": "#ffffff", "line-width": 2.25, "line-dasharray": [3, 2] },
      });

      // Fit to field bounds and show entire field
      map.fitBounds(bounds, { padding: 40, duration: 0 });

      if (plan) addZoneMarkers(map, plan);
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      popupsRef.current.forEach((popup) => popup.remove());
      popupsRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [addZoneMarkers, field, fieldBounds, fieldCenter, mapToken, plan]);

  useEffect(() => {
    if (!mapRef.current || !plan) return;
    const map = mapRef.current;
    if (!map.isStyleLoaded()) {
      map.once("load", () => addZoneMarkers(map, plan));
      return;
    }
    addZoneMarkers(map, plan);
  }, [addZoneMarkers, plan]);

  const exportPDF = useCallback(() => {
    if (!plan) return;

    const doc = new jsPDF();
    const width = doc.internal.pageSize.getWidth();
    let y = 20;

    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(`Crop Plan: ${field.name}`, 14, y);
    y += 8;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Location: ${field.location} | Area: ${haToAcres(field.area).toFixed(1)} acres | Crop: ${field.crop}`, 14, y);
    y += 5;
    doc.text(`Planner: ${plan.planner_source || "AI planner"}`, 14, y);
    y += 5;
    doc.text(`Water Saved: ${plan.water_saving_pct}% | Revenue Boost: +${plan.expected_revenue_increase_pct}%`, 14, y);
    y += 10;

    doc.setDrawColor(200);
    doc.line(14, y, width - 14, y);
    y += 8;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Summary", 14, y);
    y += 6;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const summaryLines = doc.splitTextToSize(plan.summary, width - 28);
    doc.text(summaryLines, 14, y);
    y += summaryLines.length * 4.5 + 6;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Crop Zones", 14, y);
    y += 6;

    plan.zones.forEach((zone) => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(`${zone.name} — ${zone.crop}`, 14, y);
      y += 5;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(`Area: ${zone.area_pct}% | Spacing: ${zone.spacing_m}m | Water: ${zone.water_needs} | Yield: ${zone.yield_estimate}`, 18, y);
      y += 4;
      const reasonLines = doc.splitTextToSize(zone.reason, width - 32);
      doc.text(reasonLines, 18, y);
      y += reasonLines.length * 3.5 + 4;
    });

    if (plan.intercropping.length > 0) {
      if (y > 250) { doc.addPage(); y = 20; }
      y += 4;
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Intercropping Suggestions", 14, y);
      y += 6;
      plan.intercropping.forEach((pair) => {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text(`${pair.primary} + ${pair.secondary}`, 14, y);
        y += 4;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        const lines = doc.splitTextToSize(pair.benefit, width - 28);
        doc.text(lines, 18, y);
        y += lines.length * 3.5 + 5;
      });
    }

    if (plan.rotation_plan.length > 0) {
      if (y > 250) { doc.addPage(); y = 20; }
      y += 4;
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Crop Rotation Plan", 14, y);
      y += 6;
      plan.rotation_plan.forEach((step) => {
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text(`${step.season} (${step.months}): ${step.crops.join(", ")}`, 18, y);
        y += 5;
      });
    }

    doc.save(`crop-plan-${field.name.replace(/\s+/g, "-").toLowerCase()}.pdf`);
  }, [field, plan]);

  return (
    <div className="animate-fade-in space-y-5" style={{ animationDelay: "450ms" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Sprout className="w-4 h-4" /> Crop Planning
          </h3>
          {plannerNotice && <p className="text-[11px] text-muted-foreground max-w-[560px]">{plannerNotice}</p>}
        </div>

        <div className="flex items-center gap-2">
          {plan && (
            <>
              <button
                onClick={exportPDF}
                className="p-1.5 rounded-lg hover:bg-accent/30 transition-colors text-muted-foreground hover:text-foreground"
                title="Export as PDF"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={fetchPlan}
                disabled={loading}
                className="p-1.5 rounded-lg hover:bg-accent/30 transition-colors text-muted-foreground hover:text-foreground"
                title="Regenerate plan"
              >
                <RotateCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="relative">
        <div
          ref={mapContainer}
          className="rounded-2xl border border-border overflow-hidden"
          style={{ height: isMobile ? 300 : 420, background: "hsl(150, 18%, 12%)" }}
        />

        {!plan && !loading && (
          <div className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm">
            <Sprout className="w-8 h-8 text-primary mb-3" />
            <p className="text-sm text-foreground/80 mb-3 text-center px-4">
              Analyze field data to generate crop placement recommendations.
            </p>
            <button
              onClick={fetchPlan}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Zap className="w-4 h-4" /> Generate Crop Plan
            </button>
            {error && <p className="text-xs text-destructive mt-2">{error}</p>}
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm">
            <Loader2 className="w-6 h-6 animate-spin text-primary mb-2" />
            <p className="text-sm text-foreground/80">Analyzing field data...</p>
            <p className="text-[10px] text-muted-foreground mt-1">Using NDVI, soil, weather, water access, and terrain signals</p>
          </div>
        )}

        {/* Legend overlay */}
        {plan && (
          <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 flex flex-wrap gap-x-3 gap-y-1">
            {plan.zones.map((zone) => (
              <div key={zone.id} className="flex items-center gap-1.5 text-[10px]">
                <span className="rounded-full flex-shrink-0" style={{ backgroundColor: zone.color, width: getDotSize(zone.crop), height: getDotSize(zone.crop) }} />
                <span className="text-white/80">{zone.crop}</span>
                <span className="text-white/50">{zone.area_pct}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {plan && (
        <>
          <div className="p-3 rounded-xl border border-border bg-accent/15 text-xs text-muted-foreground leading-relaxed">
            {plan.summary}
          </div>

          <div className={`grid ${isMobile ? "grid-cols-2 gap-2" : "grid-cols-2 gap-3"}`}>
            <div className="p-3 rounded-xl border border-border bg-accent/15 text-center">
              <Droplets className="w-4 h-4 mx-auto mb-1 text-primary" />
              <div className="text-lg font-semibold text-foreground">{plan.water_saving_pct}%</div>
              <div className="text-[10px] text-muted-foreground">Water Saved</div>
            </div>
            <div className="p-3 rounded-xl border border-border bg-accent/15 text-center">
              <TrendingUp className="w-4 h-4 mx-auto mb-1 text-primary" />
              <div className="text-lg font-semibold text-foreground">+{plan.expected_revenue_increase_pct}%</div>
              <div className="text-[10px] text-muted-foreground">Revenue Boost</div>
            </div>
          </div>

          {/* Zone Allocation Pie */}
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Zone Allocation</h4>
            <div className="rounded-2xl border border-border/40 p-4 flex flex-col items-center justify-center" style={{ height: isMobile ? 200 : 240, background: "hsla(150, 18%, 14%, 0.6)" }}>
              <ResponsiveContainer width="100%" height={isMobile ? 130 : 160}>
                <PieChart>
                  <Pie
                    data={zoneChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={isMobile ? 30 : 40}
                    outerRadius={isMobile ? 55 : 70}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {zoneChartData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltipContent />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-2">
                {zoneChartData.map((zone, index) => (
                  <div key={index} className="flex items-center gap-1 text-[10px]">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: zone.color }} />
                    <span className="text-muted-foreground">{zone.name}</span>
                    <span className="text-foreground font-semibold">{zone.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Zone details */}
          {selectedZone && (
            <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 animate-fade-in space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedZone.color }} />
                  {selectedZone.crop} — {selectedZone.name}
                </h4>
                <button onClick={() => setSelectedZone(null)} className="text-xs text-muted-foreground hover:text-foreground">
                  Close
                </button>
              </div>
              <p className="text-xs text-muted-foreground">{selectedZone.reason}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">
                <div className="p-2 rounded-lg bg-accent/20"><span className="text-muted-foreground">Area:</span> <span className="text-foreground font-medium">{selectedZone.area_pct}%</span></div>
                <div className="p-2 rounded-lg bg-accent/20"><span className="text-muted-foreground">Spacing:</span> <span className="text-foreground font-medium">{selectedZone.spacing_m}m</span></div>
                <div className="p-2 rounded-lg bg-accent/20"><span className="text-muted-foreground">Water:</span> <span className="text-foreground font-medium capitalize">{selectedZone.water_needs}</span></div>
                <div className="p-2 rounded-lg bg-accent/20"><span className="text-muted-foreground">Yield:</span> <span className="text-foreground font-medium">{selectedZone.yield_estimate}</span></div>
              </div>
              <div className="text-[10px] text-muted-foreground">Season: {selectedZone.season}</div>
            </div>
          )}

          {/* Intercropping + Rotation in same row */}
          <div className={`grid ${isMobile ? "grid-cols-1" : "grid-cols-2"} gap-4`}>
            {/* Intercropping Pairs */}
            {plan.intercropping.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <TreePine className="w-3.5 h-3.5" /> Intercropping Pairs
                </h4>
                <div className="space-y-3">
                  {plan.intercropping.map((pair, index) => (
                    <div key={index} className="p-3 rounded-xl border border-border bg-accent/15 space-y-1.5">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <span>{pair.primary}</span>
                        <ArrowRight className="w-3 h-3 text-muted-foreground" />
                        <span>{pair.secondary}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{pair.benefit}</p>
                      <p className="text-[10px] text-primary/80 italic">{pair.spacing}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Crop Rotation Plan */}
            {plan.rotation_plan.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <RotateCw className="w-3.5 h-3.5" /> Crop Rotation Plan
                </h4>
                <div className="space-y-2">
                  {plan.rotation_plan.map((step, index) => {
                    const isCurrent = step.season.includes("(Current)");
                    return (
                      <div key={index} className={`p-3 rounded-xl border bg-accent/15 space-y-1 ${isCurrent ? "border-primary/50 bg-primary/5" : "border-border"}`}>
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-semibold text-foreground">{step.season}</div>
                          <div className="text-[10px] text-muted-foreground">{step.months}</div>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {step.crops.map((crop, cropIndex) => (
                            <span key={cropIndex} className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${
                              cropIndex === 0
                                ? "bg-primary/20 text-primary"
                                : "bg-accent/30 text-foreground"
                            }`}>
                              {crop}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Crop Calendar - always expanded */}
          <div>
            <h4 className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              <CalendarDays className="w-3.5 h-3.5" />
              Crop Calendar
            </h4>
            {calendarRows.length > 0 && (
              <div className="rounded-2xl border border-border overflow-hidden" style={{ background: "hsla(150, 18%, 14%, 0.6)" }}>
                <div className="grid grid-cols-[90px_repeat(12,1fr)] text-[10px] border-b border-border/50">
                  <div className="p-2 text-muted-foreground font-medium">Season</div>
                  {MONTHS.map((month) => (
                    <div key={month} className="p-1.5 text-center text-muted-foreground">
                      {month}
                    </div>
                  ))}
                </div>

                {calendarRows.map((row, index) => (
                  <div key={index} className="grid grid-cols-[90px_repeat(12,1fr)] text-[10px] border-b border-border/30 last:border-b-0">
                    <div className="p-2 flex flex-col justify-center">
                      <span className="font-semibold text-foreground text-[11px]">{row.season.replace(" (Current)", "")}</span>
                      <span className="text-muted-foreground text-[9px] leading-tight">{row.crops[0]}</span>
                      {row.crops[1] && <span className="text-muted-foreground/60 text-[9px] leading-tight">{row.crops[1]}</span>}
                    </div>
                    {MONTHS.map((_, monthIndex) => {
                      const active = row.activeMonths.includes(monthIndex);
                      const currentMonthIdx = new Date().getMonth();
                      const isCurrentMonth = monthIndex === currentMonthIdx && active;
                      return (
                        <UITooltip key={monthIndex}>
                          <TooltipTrigger asChild>
                            <div className="p-0.5 flex items-center justify-center">
                              <div
                                className="w-full h-7 rounded-sm transition-all relative"
                                style={{
                                  backgroundColor: active ? row.color : "transparent",
                                  opacity: active ? 0.75 : 0.08,
                                  border: isCurrentMonth ? "2px solid white" : active ? "none" : "1px solid rgba(255,255,255,0.05)",
                                }}
                              />
                            </div>
                          </TooltipTrigger>
                          {active && (
                            <TooltipContent side="top">
                              <p className="text-xs font-semibold">{row.season.replace(" (Current)", "")}: {MONTHS[monthIndex]}</p>
                              <p className="text-[10px] text-muted-foreground">{row.crops.join(", ")}</p>
                              {isCurrentMonth && <p className="text-[10px] text-primary font-medium">← Current month</p>}
                            </TooltipContent>
                          )}
                        </UITooltip>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          {plan.tips.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5" /> Expert Tips
              </h4>
              <div className="space-y-1.5">
                {plan.tips.map((tip, index) => (
                  <div key={index} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CropPlanningSection;
