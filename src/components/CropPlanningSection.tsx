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
// Region detection helpers
type RegionTag = "tropical" | "subtropical" | "mediterranean" | "temperate" | "continental" | "arid" | "humid" | "coastal" | "highland";

interface RegionMatch {
  region: RegionTag[];
  keywords: string[];
}

const REGION_MATCHERS: RegionMatch[] = [
  { region: ["mediterranean"], keywords: ["spain", "portugal", "italy", "greece", "turkey", "morocco", "tunisia", "algeria", "croatia", "cyprus", "malta", "provence", "sardinia", "sicily", "andalusia", "catalonia", "tarragona", "valencia", "murcia", "algarve", "puglia", "crete", "peloponnese", "aegean", "adriatic", "balearic", "corsica", "dalmatia", "languedoc", "california", "cape town", "chile central", "mediterranean"] },
  { region: ["temperate"], keywords: ["france", "germany", "uk", "england", "scotland", "ireland", "netherlands", "belgium", "poland", "czech", "austria", "switzerland", "denmark", "sweden", "norway", "finland", "hungary", "romania", "ukraine", "russia", "canada", "oregon", "washington", "new york", "pennsylvania", "ohio", "michigan", "wisconsin", "minnesota", "iowa", "illinois", "indiana", "missouri", "virginia", "north carolina", "new zealand", "tasmania", "hokkaido", "northern china", "manchuria", "korea", "japan", "baltic", "bavaria", "brittany", "normandy", "yorkshire", "midwest"] },
  { region: ["continental"], keywords: ["central europe", "siberia", "mongolia", "kazakhstan", "interior", "plains", "steppe", "prairie", "great plains", "dakota", "nebraska", "kansas", "montana", "wyoming", "colorado"] },
  { region: ["subtropical"], keywords: ["florida", "louisiana", "texas", "georgia", "south carolina", "mississippi", "alabama", "southern china", "guangdong", "fujian", "yunnan", "sichuan", "vietnam", "thailand north", "myanmar", "nepal terai", "bangladesh", "taiwan", "okinawa", "kyushu", "new south wales", "queensland", "sao paulo", "parana", "rio grande", "argentina", "uruguay", "natal"] },
  { region: ["tropical"], keywords: ["kerala", "tamil", "karnataka", "goa", "konkan", "andaman", "assam", "bengal", "odisha", "maharashtra coast", "indonesia", "malaysia", "philippines", "thailand", "cambodia", "laos", "sri lanka", "maldives", "hawaii", "caribbean", "cuba", "jamaica", "trinidad", "puerto rico", "dominican", "costa rica", "panama", "colombia", "ecuador", "peru amazon", "brazil amazon", "congo", "nigeria", "ghana", "cameroon", "ivory coast", "kenya coast", "tanzania", "mozambique", "madagascar", "fiji", "samoa", "borneo", "sumatra", "java", "bali"] },
  { region: ["arid"], keywords: ["rajasthan", "sahara", "sahel", "saudi", "emirates", "oman", "yemen", "iran", "iraq", "jordan", "israel", "palestine", "egypt", "libya", "namibia", "botswana", "arizona", "nevada", "new mexico", "utah", "atacama", "gobi", "thar", "negev", "sinai", "outback", "balochistan", "sindh", "punjab pakistan", "drought", "dry", "arid", "desert", "semi-arid"] },
  { region: ["highland"], keywords: ["himachal", "uttarakhand", "kashmir", "ladakh", "tibet", "nepal", "bhutan", "ethiopia", "kenya highlands", "rwanda", "burundi", "andes", "bogota", "quito", "cusco", "la paz", "hill", "mountain", "highland", "altitude", "alps", "pyrenees", "caucasus", "carpathian"] },
  { region: ["coastal"], keywords: ["coast", "shore", "beach", "port", "harbour", "harbor", "island", "bay", "gulf", "sea", "ocean", "littoral", "maritime"] },
  { region: ["humid"], keywords: ["monsoon", "rainforest", "humid", "wet", "rain"] },
];

function detectRegion(locationText: string): RegionTag[] {
  const loc = locationText.toLowerCase();
  const matched = new Set<RegionTag>();
  for (const matcher of REGION_MATCHERS) {
    if (matcher.keywords.some(kw => loc.includes(kw))) {
      matcher.region.forEach(r => matched.add(r));
    }
  }
  if (matched.size === 0) matched.add("temperate"); // safe default
  return Array.from(matched);
}

const CROP_PROFILES: CropProfile[] = [
  // === TROPICAL TREES ===
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
    name: "Mango",
    color: "#F59E0B",
    spacing_m: 10,
    waterNeeds: "medium",
    tempRange: [24, 37],
    rainfallRange: [600, 2500],
    phRange: [5.5, 7.5],
    humidityMin: 50,
    baseYield: 8,
    season: "Perennial (Year-round)",
    tags: ["tree", "tropical", "subtropical"],
    dotSize: 16,
  },
  {
    name: "Neem",
    color: "#065F46",
    spacing_m: 10,
    waterNeeds: "low",
    tempRange: [21, 38],
    rainfallRange: [350, 1400],
    phRange: [5.0, 8.5],
    humidityMin: 30,
    baseYield: 2,
    season: "Perennial (Year-round)",
    tags: ["tree", "tropical", "arid", "subtropical"],
    dotSize: 16,
  },
  // === MEDITERRANEAN TREES ===
  {
    name: "Olive",
    color: "#4D7C0F",
    spacing_m: 7,
    waterNeeds: "low",
    tempRange: [10, 35],
    rainfallRange: [300, 900],
    phRange: [6.0, 8.5],
    humidityMin: 30,
    baseYield: 4.5,
    season: "Perennial (Year-round)",
    tags: ["tree", "mediterranean", "arid"],
    dotSize: 16,
  },
  {
    name: "Almond",
    color: "#D4A574",
    spacing_m: 6,
    waterNeeds: "low",
    tempRange: [8, 35],
    rainfallRange: [300, 800],
    phRange: [6.0, 8.0],
    humidityMin: 25,
    baseYield: 2.8,
    season: "Perennial (Feb-Sep harvest)",
    tags: ["tree", "mediterranean", "temperate"],
    dotSize: 16,
  },
  {
    name: "Carob",
    color: "#78350F",
    spacing_m: 8,
    waterNeeds: "low",
    tempRange: [10, 36],
    rainfallRange: [250, 700],
    phRange: [6.5, 8.5],
    humidityMin: 25,
    baseYield: 3,
    season: "Perennial (Year-round)",
    tags: ["tree", "mediterranean"],
    dotSize: 16,
  },
  {
    name: "Fig",
    color: "#7E22CE",
    spacing_m: 5,
    waterNeeds: "low",
    tempRange: [10, 38],
    rainfallRange: [250, 900],
    phRange: [6.0, 8.0],
    humidityMin: 25,
    baseYield: 5,
    season: "Perennial (Jun-Oct)",
    tags: ["tree", "mediterranean", "subtropical"],
    dotSize: 14,
  },
  {
    name: "Citrus",
    color: "#FB923C",
    spacing_m: 5,
    waterNeeds: "medium",
    tempRange: [13, 36],
    rainfallRange: [500, 1500],
    phRange: [5.5, 7.5],
    humidityMin: 40,
    baseYield: 20,
    season: "Perennial (Nov-May harvest)",
    tags: ["tree", "mediterranean", "subtropical"],
    dotSize: 14,
  },
  // === TEMPERATE TREES ===
  {
    name: "Apple",
    color: "#DC2626",
    spacing_m: 4,
    waterNeeds: "medium",
    tempRange: [4, 24],
    rainfallRange: [600, 1200],
    phRange: [5.5, 7.0],
    humidityMin: 45,
    baseYield: 25,
    season: "Perennial (Sep-Oct harvest)",
    tags: ["tree", "temperate", "continental", "highland"],
    dotSize: 14,
  },
  {
    name: "Walnut",
    color: "#92400E",
    spacing_m: 10,
    waterNeeds: "medium",
    tempRange: [5, 28],
    rainfallRange: [600, 1200],
    phRange: [6.0, 7.5],
    humidityMin: 40,
    baseYield: 3,
    season: "Perennial (Sep-Oct harvest)",
    tags: ["tree", "temperate", "mediterranean", "continental"],
    dotSize: 16,
  },
  {
    name: "Cherry",
    color: "#BE123C",
    spacing_m: 5,
    waterNeeds: "medium",
    tempRange: [5, 26],
    rainfallRange: [600, 1100],
    phRange: [6.0, 7.5],
    humidityMin: 45,
    baseYield: 8,
    season: "Perennial (Jun-Jul harvest)",
    tags: ["tree", "temperate"],
    dotSize: 14,
  },
  {
    name: "Pear",
    color: "#65A30D",
    spacing_m: 4,
    waterNeeds: "medium",
    tempRange: [5, 26],
    rainfallRange: [600, 1100],
    phRange: [6.0, 7.5],
    humidityMin: 45,
    baseYield: 18,
    season: "Perennial (Aug-Oct harvest)",
    tags: ["tree", "temperate", "continental"],
    dotSize: 14,
  },
  // === TROPICAL/SUBTROPICAL CROPS ===
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
    tags: ["spice", "shade-friendly", "tropical", "humid"],
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
    tags: ["spice", "vine", "tropical", "humid", "intercrop"],
    dotSize: 12,
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
    tags: ["industrial", "tropical", "subtropical"],
    dotSize: 12,
  },
  // === GRAINS (global) ===
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
    tags: ["grain", "tropical", "subtropical", "humid"],
    dotSize: 7,
  },
  {
    name: "Wheat",
    color: "#F59E0B",
    spacing_m: 0.22,
    waterNeeds: "medium",
    tempRange: [5, 25],
    rainfallRange: [350, 1100],
    phRange: [6.0, 7.8],
    humidityMin: 30,
    baseYield: 3.4,
    season: "Winter (Oct-Jun)",
    tags: ["grain", "temperate", "continental", "mediterranean", "arid"],
    dotSize: 7,
  },
  {
    name: "Barley",
    color: "#CA8A04",
    spacing_m: 0.2,
    waterNeeds: "low",
    tempRange: [4, 24],
    rainfallRange: [250, 900],
    phRange: [6.0, 8.5],
    humidityMin: 25,
    baseYield: 3.0,
    season: "Winter (Oct-Jun)",
    tags: ["grain", "temperate", "continental", "mediterranean", "arid", "highland"],
    dotSize: 7,
  },
  {
    name: "Oats",
    color: "#A3A3A3",
    spacing_m: 0.2,
    waterNeeds: "medium",
    tempRange: [3, 22],
    rainfallRange: [450, 1100],
    phRange: [5.5, 7.5],
    humidityMin: 40,
    baseYield: 2.8,
    season: "Spring (Mar-Aug)",
    tags: ["grain", "temperate", "continental"],
    dotSize: 7,
  },
  {
    name: "Rye",
    color: "#78716C",
    spacing_m: 0.2,
    waterNeeds: "low",
    tempRange: [1, 22],
    rainfallRange: [350, 900],
    phRange: [5.0, 7.5],
    humidityMin: 30,
    baseYield: 2.5,
    season: "Winter (Sep-Jul)",
    tags: ["grain", "temperate", "continental", "highland"],
    dotSize: 7,
  },
  {
    name: "Maize",
    color: "#FACC15",
    spacing_m: 0.3,
    waterNeeds: "medium",
    tempRange: [15, 32],
    rainfallRange: [500, 1200],
    phRange: [5.5, 7.8],
    humidityMin: 40,
    baseYield: 5.6,
    season: "Summer (Apr-Oct)",
    tags: ["grain", "temperate", "subtropical", "tropical", "continental", "mediterranean"],
    dotSize: 9,
  },
  {
    name: "Sorghum",
    color: "#B45309",
    spacing_m: 0.25,
    waterNeeds: "low",
    tempRange: [20, 37],
    rainfallRange: [350, 900],
    phRange: [5.5, 8.5],
    humidityMin: 30,
    baseYield: 3.0,
    season: "Summer (Jun-Oct)",
    tags: ["grain", "arid", "tropical", "subtropical"],
    dotSize: 7,
  },
  {
    name: "Millet",
    color: "#D4D4D4",
    spacing_m: 0.25,
    waterNeeds: "low",
    tempRange: [20, 34],
    rainfallRange: [350, 850],
    phRange: [5.5, 8.0],
    humidityMin: 30,
    baseYield: 2.1,
    season: "Summer (Jun-Sep)",
    tags: ["grain", "arid", "tropical"],
    dotSize: 7,
  },
  // === PULSES & LEGUMES ===
  {
    name: "Chickpea",
    color: "#EC4899",
    spacing_m: 0.3,
    waterNeeds: "low",
    tempRange: [10, 28],
    rainfallRange: [300, 900],
    phRange: [6.0, 8.5],
    humidityMin: 30,
    baseYield: 1.8,
    season: "Winter (Oct-Mar)",
    tags: ["pulse", "mediterranean", "arid", "subtropical", "temperate"],
    dotSize: 8,
  },
  {
    name: "Lentil",
    color: "#A855F7",
    spacing_m: 0.25,
    waterNeeds: "low",
    tempRange: [8, 25],
    rainfallRange: [300, 800],
    phRange: [6.0, 8.0],
    humidityMin: 30,
    baseYield: 1.4,
    season: "Winter (Oct-Mar)",
    tags: ["pulse", "mediterranean", "temperate", "arid"],
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
    season: "Summer (Jun-Oct)",
    tags: ["legume", "tropical", "subtropical", "arid"],
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
    season: "Summer (Mar-Jun)",
    tags: ["pulse", "tropical", "subtropical"],
    dotSize: 7,
  },
  {
    name: "Fava Bean",
    color: "#15803D",
    spacing_m: 0.3,
    waterNeeds: "medium",
    tempRange: [5, 22],
    rainfallRange: [400, 1000],
    phRange: [6.0, 8.0],
    humidityMin: 40,
    baseYield: 3.0,
    season: "Winter (Oct-May)",
    tags: ["pulse", "mediterranean", "temperate"],
    dotSize: 8,
  },
  {
    name: "Field Pea",
    color: "#22D3EE",
    spacing_m: 0.2,
    waterNeeds: "medium",
    tempRange: [5, 22],
    rainfallRange: [400, 900],
    phRange: [6.0, 7.5],
    humidityMin: 40,
    baseYield: 2.5,
    season: "Spring (Feb-Jun)",
    tags: ["pulse", "temperate", "continental"],
    dotSize: 7,
  },
  // === OILSEEDS ===
  {
    name: "Sunflower",
    color: "#FCD34D",
    spacing_m: 0.6,
    waterNeeds: "low",
    tempRange: [14, 32],
    rainfallRange: [400, 1000],
    phRange: [6.0, 8.0],
    humidityMin: 30,
    baseYield: 2.5,
    season: "Summer (Apr-Sep)",
    tags: ["oilseed", "temperate", "continental", "mediterranean", "subtropical"],
    dotSize: 10,
  },
  {
    name: "Canola",
    color: "#FDE047",
    spacing_m: 0.25,
    waterNeeds: "medium",
    tempRange: [5, 24],
    rainfallRange: [400, 900],
    phRange: [5.5, 7.5],
    humidityMin: 35,
    baseYield: 2.0,
    season: "Spring/Winter (Sep-Jun)",
    tags: ["oilseed", "temperate", "continental"],
    dotSize: 7,
  },
  {
    name: "Mustard",
    color: "#FDE047",
    spacing_m: 0.3,
    waterNeeds: "low",
    tempRange: [8, 26],
    rainfallRange: [350, 800],
    phRange: [6.0, 7.8],
    humidityMin: 30,
    baseYield: 1.4,
    season: "Winter (Oct-Feb)",
    tags: ["oilseed", "temperate", "mediterranean", "subtropical", "arid"],
    dotSize: 8,
  },
  {
    name: "Sesame",
    color: "#F5DEB3",
    spacing_m: 0.3,
    waterNeeds: "low",
    tempRange: [22, 35],
    rainfallRange: [300, 800],
    phRange: [5.5, 8.0],
    humidityMin: 30,
    baseYield: 0.8,
    season: "Summer (May-Oct)",
    tags: ["oilseed", "tropical", "arid", "subtropical"],
    dotSize: 7,
  },
  // === VEGETABLES ===
  {
    name: "Tomato",
    color: "#EF4444",
    spacing_m: 0.6,
    waterNeeds: "medium",
    tempRange: [15, 32],
    rainfallRange: [400, 1400],
    phRange: [5.5, 7.5],
    humidityMin: 40,
    baseYield: 18,
    season: "Summer (Mar-Sep)",
    tags: ["vegetable", "mediterranean", "subtropical", "temperate", "tropical"],
    dotSize: 9,
  },
  {
    name: "Potato",
    color: "#A16207",
    spacing_m: 0.35,
    waterNeeds: "medium",
    tempRange: [8, 24],
    rainfallRange: [450, 1100],
    phRange: [5.0, 7.0],
    humidityMin: 40,
    baseYield: 22,
    season: "Spring (Mar-Sep)",
    tags: ["vegetable", "temperate", "continental", "highland", "subtropical"],
    dotSize: 8,
  },
  {
    name: "Onion",
    color: "#C084FC",
    spacing_m: 0.15,
    waterNeeds: "low",
    tempRange: [10, 30],
    rainfallRange: [350, 900],
    phRange: [6.0, 7.5],
    humidityMin: 35,
    baseYield: 20,
    season: "Winter/Spring (Oct-May)",
    tags: ["vegetable", "mediterranean", "temperate", "subtropical", "arid"],
    dotSize: 7,
  },
  {
    name: "Garlic",
    color: "#E2E8F0",
    spacing_m: 0.15,
    waterNeeds: "low",
    tempRange: [8, 28],
    rainfallRange: [300, 800],
    phRange: [6.0, 7.5],
    humidityMin: 30,
    baseYield: 8,
    season: "Winter (Oct-Jun)",
    tags: ["vegetable", "mediterranean", "temperate", "subtropical"],
    dotSize: 7,
  },
  {
    name: "Artichoke",
    color: "#6366F1",
    spacing_m: 1.0,
    waterNeeds: "medium",
    tempRange: [10, 28],
    rainfallRange: [400, 900],
    phRange: [6.5, 8.0],
    humidityMin: 40,
    baseYield: 10,
    season: "Perennial (Oct-May harvest)",
    tags: ["vegetable", "mediterranean"],
    dotSize: 10,
  },
  {
    name: "Asparagus",
    color: "#059669",
    spacing_m: 0.35,
    waterNeeds: "medium",
    tempRange: [10, 26],
    rainfallRange: [400, 1000],
    phRange: [6.0, 7.5],
    humidityMin: 40,
    baseYield: 5,
    season: "Perennial (Apr-Jun harvest)",
    tags: ["vegetable", "mediterranean", "temperate"],
    dotSize: 8,
  },
  {
    name: "Sugar Beet",
    color: "#BE185D",
    spacing_m: 0.22,
    waterNeeds: "medium",
    tempRange: [6, 24],
    rainfallRange: [500, 1000],
    phRange: [6.5, 8.0],
    humidityMin: 40,
    baseYield: 55,
    season: "Spring (Mar-Oct)",
    tags: ["industrial", "temperate", "continental"],
    dotSize: 8,
  },
  // === FRUITS ===
  {
    name: "Grape",
    color: "#7C3AED",
    spacing_m: 2.5,
    waterNeeds: "low",
    tempRange: [10, 35],
    rainfallRange: [350, 900],
    phRange: [5.5, 8.0],
    humidityMin: 30,
    baseYield: 10,
    season: "Perennial (Aug-Oct harvest)",
    tags: ["fruit", "mediterranean", "temperate", "subtropical"],
    dotSize: 12,
  },
  {
    name: "Pomegranate",
    color: "#E11D48",
    spacing_m: 4,
    waterNeeds: "low",
    tempRange: [12, 38],
    rainfallRange: [250, 800],
    phRange: [5.5, 8.0],
    humidityMin: 25,
    baseYield: 12,
    season: "Perennial (Sep-Nov harvest)",
    tags: ["fruit", "mediterranean", "arid", "subtropical"],
    dotSize: 13,
  },
  {
    name: "Strawberry",
    color: "#F43F5E",
    spacing_m: 0.3,
    waterNeeds: "medium",
    tempRange: [10, 26],
    rainfallRange: [500, 1100],
    phRange: [5.5, 7.0],
    humidityMin: 45,
    baseYield: 15,
    season: "Spring (Mar-Jun)",
    tags: ["fruit", "temperate", "mediterranean", "subtropical"],
    dotSize: 8,
  },
  // === FIBER ===
  {
    name: "Cotton",
    color: "#F8FAFC",
    spacing_m: 0.8,
    waterNeeds: "medium",
    tempRange: [20, 35],
    rainfallRange: [500, 1200],
    phRange: [5.5, 8.0],
    humidityMin: 40,
    baseYield: 2.5,
    season: "Summer (Apr-Nov)",
    tags: ["fiber", "subtropical", "tropical", "arid", "mediterranean"],
    dotSize: 10,
  },
  // === COVER/FORAGE ===
  {
    name: "Alfalfa",
    color: "#4ADE80",
    spacing_m: 0.15,
    waterNeeds: "medium",
    tempRange: [8, 32],
    rainfallRange: [400, 1200],
    phRange: [6.5, 8.0],
    humidityMin: 30,
    baseYield: 10,
    season: "Perennial (Year-round)",
    tags: ["fodder", "temperate", "continental", "mediterranean", "subtropical", "arid"],
    dotSize: 7,
  },
  {
    name: "Clover",
    color: "#34D399",
    spacing_m: 0.1,
    waterNeeds: "medium",
    tempRange: [5, 24],
    rainfallRange: [500, 1200],
    phRange: [6.0, 7.5],
    humidityMin: 45,
    baseYield: 6,
    season: "Spring/Autumn cover",
    tags: ["fodder", "temperate", "continental"],
    dotSize: 6,
  },
  // === SPICES (Mediterranean/global) ===
  {
    name: "Lavender",
    color: "#A78BFA",
    spacing_m: 1.0,
    waterNeeds: "low",
    tempRange: [8, 32],
    rainfallRange: [300, 800],
    phRange: [6.5, 8.5],
    humidityMin: 25,
    baseYield: 3,
    season: "Perennial (Jun-Aug harvest)",
    tags: ["herb", "mediterranean"],
    dotSize: 9,
  },
  {
    name: "Rosemary",
    color: "#0D9488",
    spacing_m: 0.8,
    waterNeeds: "low",
    tempRange: [8, 30],
    rainfallRange: [300, 800],
    phRange: [6.0, 8.0],
    humidityMin: 25,
    baseYield: 4,
    season: "Perennial (Year-round)",
    tags: ["herb", "mediterranean"],
    dotSize: 8,
  },
  {
    name: "Saffron",
    color: "#F97316",
    spacing_m: 0.15,
    waterNeeds: "low",
    tempRange: [8, 28],
    rainfallRange: [300, 700],
    phRange: [6.0, 8.0],
    humidityMin: 30,
    baseYield: 0.005,
    season: "Autumn (Oct-Nov harvest)",
    tags: ["spice", "mediterranean", "arid", "highland"],
    dotSize: 7,
  },
  // === DATE PALM (arid) ===
  {
    name: "Date Palm",
    color: "#92400E",
    spacing_m: 8,
    waterNeeds: "low",
    tempRange: [20, 45],
    rainfallRange: [50, 400],
    phRange: [7.0, 8.5],
    humidityMin: 15,
    baseYield: 8,
    season: "Perennial (Aug-Nov harvest)",
    tags: ["tree", "arid"],
    dotSize: 16,
  },
  // === EUCALYPTUS (subtropical/temperate) ===
  {
    name: "Eucalyptus",
    color: "#0EA5E9",
    spacing_m: 6,
    waterNeeds: "medium",
    tempRange: [10, 35],
    rainfallRange: [500, 1500],
    phRange: [5.0, 7.5],
    humidityMin: 35,
    baseYield: 15,
    season: "Perennial (Year-round)",
    tags: ["tree", "subtropical", "temperate", "mediterranean"],
    dotSize: 16,
  },
  // === CORK OAK ===
  {
    name: "Cork Oak",
    color: "#6B7280",
    spacing_m: 10,
    waterNeeds: "low",
    tempRange: [8, 32],
    rainfallRange: [400, 900],
    phRange: [5.0, 7.5],
    humidityMin: 30,
    baseYield: 0.3,
    season: "Perennial (Year-round)",
    tags: ["tree", "mediterranean"],
    dotSize: 16,
  },
  // === PINE NUT ===
  {
    name: "Stone Pine",
    color: "#1E3A2F",
    spacing_m: 8,
    waterNeeds: "low",
    tempRange: [8, 32],
    rainfallRange: [350, 900],
    phRange: [5.5, 8.0],
    humidityMin: 25,
    baseYield: 0.6,
    season: "Perennial (Year-round)",
    tags: ["tree", "mediterranean"],
    dotSize: 16,
  },
  // === BIRCH (temperate/continental) ===
  {
    name: "Birch",
    color: "#D1D5DB",
    spacing_m: 6,
    waterNeeds: "medium",
    tempRange: [0, 22],
    rainfallRange: [500, 1200],
    phRange: [4.5, 7.0],
    humidityMin: 45,
    baseYield: 5,
    season: "Perennial (Year-round)",
    tags: ["tree", "temperate", "continental"],
    dotSize: 16,
  },
  // === OAK (temperate) ===
  {
    name: "Oak",
    color: "#4B5563",
    spacing_m: 10,
    waterNeeds: "medium",
    tempRange: [3, 28],
    rainfallRange: [500, 1400],
    phRange: [4.5, 7.5],
    humidityMin: 40,
    baseYield: 2,
    season: "Perennial (Year-round)",
    tags: ["tree", "temperate", "continental", "mediterranean"],
    dotSize: 16,
  },
  // === HAZELNUT ===
  {
    name: "Hazelnut",
    color: "#A16207",
    spacing_m: 4,
    waterNeeds: "medium",
    tempRange: [5, 26],
    rainfallRange: [600, 1200],
    phRange: [5.5, 7.5],
    humidityMin: 40,
    baseYield: 2.5,
    season: "Perennial (Sep-Oct harvest)",
    tags: ["tree", "temperate", "mediterranean"],
    dotSize: 14,
  },
  // === PISTACHIO ===
  {
    name: "Pistachio",
    color: "#84CC16",
    spacing_m: 6,
    waterNeeds: "low",
    tempRange: [10, 38],
    rainfallRange: [200, 600],
    phRange: [7.0, 8.5],
    humidityMin: 20,
    baseYield: 2.5,
    season: "Perennial (Sep-Oct harvest)",
    tags: ["tree", "mediterranean", "arid"],
    dotSize: 14,
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
  Spring: "#22D3EE",
  Summer: "#EAB308",
  Autumn: "#F97316",
  Winter: "#3B82F6",
  Fall: "#F97316",
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
  const detectedRegions = detectRegion(locationText);
  // Boost crops that share region tags with the detected location
  let boost = 0;
  for (const tag of profile.tags) {
    if (detectedRegions.includes(tag as RegionTag)) {
      boost += 0.15;
      break; // one match is enough for a strong boost
    }
  }
  // Penalize crops that DON'T match any detected region
  if (boost === 0) {
    const profileRegionTags = profile.tags.filter(t =>
      ["tropical", "subtropical", "mediterranean", "temperate", "continental", "arid", "highland"].includes(t)
    );
    if (profileRegionTags.length > 0) {
      // Strong penalty for wrong-region crops
      boost = -0.25;
    }
  }
  return boost;
}

function scoreCropProfile(profile: CropProfile, signals: PlanningSignals, currentCrop: string) {
  const waterFit = 1 - Math.abs(getWaterNeedIndex(profile.waterNeeds) - signals.waterIndex);
  const humidityFit = clamp((signals.humidity - profile.humidityMin + 20) / 40, 0, 1);
  const locationBoost = getLocationBoost(profile, signals.locationText);
  const currentBoost = currentCrop.toLowerCase() === profile.name.toLowerCase() ? 0.14 : 0;

  return (
    rangeScore(signals.temperature, profile.tempRange, 6) * 0.20 +
    rangeScore(signals.annualRainfall, profile.rainfallRange, 500) * 0.18 +
    rangeScore(signals.soilPH, profile.phRange, 0.8) * 0.12 +
    clamp(waterFit, 0, 1) * 0.10 +
    humidityFit * 0.06 +
    signals.healthScore * 0.06 +
    signals.soilQuality * 0.04 +
    signals.climateQuality * 0.03 +
    signals.topographyQuality * 0.02 +
    locationBoost * 0.19 + // region match is heavily weighted
    currentBoost
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
  const detectedRegions = detectRegion(signals.locationText);
  const isTropical = detectedRegions.includes("tropical");
  const isMediterranean = detectedRegions.includes("mediterranean");
  const isTemplateOrCont = detectedRegions.includes("temperate") || detectedRegions.includes("continental");

  const currentMonth = new Date().getMonth();

  if (isTropical) {
    const isKharif = currentMonth >= 5 && currentMonth <= 9;
    const isRabi = currentMonth >= 10 || currentMonth <= 2;
    const kharif = signals.annualRainfall > 1400 ? (names.has("Rice") ? "Rice" : names.has("Turmeric") ? "Turmeric" : "Maize") : names.has("Millet") ? "Millet" : "Groundnut";
    const rabi = signals.temperature < 22 ? (names.has("Wheat") ? "Wheat" : "Chickpea") : names.has("Chickpea") ? "Chickpea" : "Mustard";
    const zaid = names.has("Mung Bean") ? "Mung Bean" : names.has("Tomato") ? "Tomato" : "Groundnut";
    return [
      { season: `Kharif${isKharif ? " (Current)" : ""}`, months: "Jun-Oct", crops: [kharif, names.has("Black Pepper") ? "Black Pepper" : "Cover crop", "Mung Bean"] },
      { season: `Rabi${isRabi ? " (Current)" : ""}`, months: "Nov-Mar", crops: [rabi, names.has("Mustard") ? "Mustard" : "Lentil"] },
      { season: `Zaid${!isKharif && !isRabi ? " (Current)" : ""}`, months: "Mar-Jun", crops: [zaid, "Mung Bean"] },
    ];
  }

  if (isMediterranean) {
    const isWinter = currentMonth >= 10 || currentMonth <= 2;
    const isSpring = currentMonth >= 3 && currentMonth <= 5;
    const isSummer = currentMonth >= 6 && currentMonth <= 9;
    const winter = names.has("Wheat") ? "Wheat" : names.has("Barley") ? "Barley" : "Fava Bean";
    const spring = names.has("Chickpea") ? "Chickpea" : names.has("Lentil") ? "Lentil" : "Onion";
    const summer = names.has("Tomato") ? "Tomato" : names.has("Sunflower") ? "Sunflower" : names.has("Maize") ? "Maize" : "Grape";
    return [
      { season: `Winter${isWinter ? " (Current)" : ""}`, months: "Nov-Feb", crops: [winter, names.has("Fava Bean") ? "Fava Bean" : "Barley", "Garlic"] },
      { season: `Spring${isSpring ? " (Current)" : ""}`, months: "Mar-May", crops: [spring, names.has("Artichoke") ? "Artichoke" : "Onion"] },
      { season: `Summer${isSummer ? " (Current)" : ""}`, months: "Jun-Oct", crops: [summer, names.has("Grape") ? "Grape" : "Alfalfa"] },
    ];
  }

  // Temperate / Continental / default
  const isSpring = currentMonth >= 2 && currentMonth <= 4;
  const isSummer = currentMonth >= 5 && currentMonth <= 8;
  const isAutumn = currentMonth >= 9 && currentMonth <= 11;
  const spring = names.has("Wheat") ? "Wheat" : names.has("Barley") ? "Barley" : names.has("Oats") ? "Oats" : "Canola";
  const summer = names.has("Maize") ? "Maize" : names.has("Sunflower") ? "Sunflower" : names.has("Potato") ? "Potato" : "Sugar Beet";
  const autumn = names.has("Rye") ? "Rye" : names.has("Clover") ? "Clover" : "Field Pea";
  return [
    { season: `Spring${isSpring ? " (Current)" : ""}`, months: "Mar-May", crops: [spring, names.has("Field Pea") ? "Field Pea" : "Clover", "Oats"] },
    { season: `Summer${isSummer ? " (Current)" : ""}`, months: "Jun-Sep", crops: [summer, names.has("Potato") ? "Potato" : "Alfalfa"] },
    { season: `Autumn/Winter${isAutumn ? " (Current)" : ""}`, months: "Oct-Feb", crops: [autumn, "Cover crop"] },
  ];
}

function chooseIntercropping(chosenProfiles: CropProfile[], signals: PlanningSignals): IntercroppingPair[] {
  const chosenNames = chosenProfiles.map((profile) => profile.name);
  const detectedRegions = detectRegion(signals.locationText);
  const pairs: IntercroppingPair[] = [];

  // Find tree crops in the plan
  const treeCrops = chosenProfiles.filter(p => p.tags.includes("tree"));
  const nonTreeCrops = chosenProfiles.filter(p => !p.tags.includes("tree"));

  // Pair each tree with a ground crop
  if (treeCrops.length > 0 && nonTreeCrops.length > 0) {
    pairs.push({
      primary: treeCrops[0].name,
      secondary: nonTreeCrops[0].name,
      benefit: `${treeCrops[0].name} trees provide structural canopy while ${nonTreeCrops[0].name} fills the understory, improving land use efficiency and reducing bare soil erosion.`,
      spacing: `${treeCrops[0].name} at ${treeCrops[0].spacing_m}m centres, ${nonTreeCrops[0].name} in ${nonTreeCrops[0].spacing_m}m rows between tree alleys`,
    });
  }

  // Region-aware second pair
  if (pairs.length < 2 && nonTreeCrops.length >= 2) {
    pairs.push({
      primary: nonTreeCrops[0].name,
      secondary: nonTreeCrops[1].name,
      benefit: `Alternate rows of ${nonTreeCrops[0].name} and ${nonTreeCrops[1].name} balance nutrient uptake and water use across the field in ${signals.locationText || "this region"}.`,
      spacing: `${nonTreeCrops[0].name} at ${nonTreeCrops[0].spacing_m}m, ${nonTreeCrops[1].name} every ${nonTreeCrops[1].spacing_m}m in companion rows`,
    });
  }

  if (pairs.length < 2) {
    const fallbackPrimary = chosenNames[0] || "Wheat";
    const fallbackSecondary = chosenNames[1] || (detectedRegions.includes("mediterranean") ? "Chickpea" : detectedRegions.includes("tropical") ? "Mung Bean" : "Clover");
    pairs.push({
      primary: fallbackPrimary,
      secondary: fallbackSecondary,
      benefit: `Combine a structural crop with a companion to stabilize moisture and build soil health.`,
      spacing: `Primary at ${chosenProfiles[0]?.spacing_m ?? 0.4}m, companion at 0.25m-0.4m where access lanes permit`,
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
  const detectedRegions = detectRegion(signals.locationText);

  // Pre-filter profiles: only keep crops that share at least one region tag with the location
  const regionFiltered = CROP_PROFILES.filter(profile => {
    const profileRegionTags = profile.tags.filter(t =>
      ["tropical", "subtropical", "mediterranean", "temperate", "continental", "arid", "highland"].includes(t)
    );
    // If profile has no region tags, allow it (generic crop)
    if (profileRegionTags.length === 0) return true;
    return profileRegionTags.some(tag => detectedRegions.includes(tag as RegionTag));
  });

  const scoredProfiles = regionFiltered.map((profile) => ({
    profile,
    score: scoreCropProfile(profile, signals, field.crop),
  })).sort((left, right) => right.score - left.score);

  const zoneCount = clamp(field.area > 5 ? 4 : 3, 3, 4);
  let chosen = scoredProfiles.slice(0, zoneCount);

  // Ensure current crop is in the plan (if it's region-appropriate)
  const currentCropInPlan = chosen.some(c => c.profile.name.toLowerCase() === field.crop.toLowerCase());
  if (!currentCropInPlan) {
    const currentProfile = scoredProfiles.find(c => c.profile.name.toLowerCase() === field.crop.toLowerCase());
    if (currentProfile) {
      chosen[chosen.length - 1] = currentProfile;
    }
  }

  // Ensure at least one tree-type crop from the region-filtered list
  const hasTree = chosen.some(c => c.profile.tags.includes("tree"));
  if (!hasTree) {
    const bestTree = scoredProfiles.find(c => c.profile.tags.includes("tree") && !chosen.includes(c));
    if (bestTree) {
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

// Generate grid: trees spread uniformly across entire field at ~1/60 density, non-tree crops clustered
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

  // Identify tree zones vs non-tree zones
  const treeZoneIndices = zones.map((z, i) => {
    const profile = CROP_PROFILES.find(p => p.name.toLowerCase() === z.crop.toLowerCase());
    return profile?.tags.includes("tree") ? i : -1;
  }).filter(i => i >= 0);

  const nonTreeZoneIndices = zones.map((_, i) => i).filter(i => !treeZoneIndices.includes(i));

  // Build cumulative area thresholds for non-tree zone assignment
  const nonTreePcts = nonTreeZoneIndices.map(i => zones[i].area_pct);
  const nonTreeTotal = nonTreePcts.reduce((s, v) => s + v, 0) || 1;
  const nonTreeCum: number[] = [];
  let running = 0;
  for (const pct of nonTreePcts) {
    running += (pct / nonTreeTotal) * 100;
    nonTreeCum.push(running);
  }

  // Zone centers for non-tree clustering
  const fieldCenterLng = (fieldBounds.minLng + fieldBounds.maxLng) / 2;
  const fieldCenterLat = (fieldBounds.minLat + fieldBounds.maxLat) / 2;
  const fieldWidth = fieldBounds.maxLng - fieldBounds.minLng;
  const fieldHeight = fieldBounds.maxLat - fieldBounds.minLat;

  const nonTreeCenters = nonTreeZoneIndices.map((_, i) => {
    const angle = (i / Math.max(nonTreeZoneIndices.length, 1)) * Math.PI * 2 + Math.PI / 4;
    return {
      lng: fieldCenterLng + Math.cos(angle) * fieldWidth * 0.25,
      lat: fieldCenterLat + Math.sin(angle) * fieldHeight * 0.25,
    };
  });

  const TREE_FREQUENCY = 60; // 1 tree per ~60 points
  let idx = 0;

  for (let lat = fieldBounds.minLat - pad; lat <= fieldBounds.maxLat + pad; lat += spacingLat) {
    const rowNum = Math.round((lat - fieldBounds.minLat) / spacingLat);
    const offset = rowNum % 2 === 0 ? 0 : spacingLng * 0.5;
    for (let lng = fieldBounds.minLng - pad + offset; lng <= fieldBounds.maxLng + pad; lng += spacingLng) {
      if (!pointInPolygon([lng, lat], polygon)) continue;

      const hash = Math.abs(Math.sin(lng * 73856093 + lat * 19349663) * 100);

      // Uniformly spread trees across entire field at 1/TREE_FREQUENCY
      if (treeZoneIndices.length > 0 && idx % TREE_FREQUENCY === 0) {
        // Pick a tree zone (round-robin if multiple)
        const treeIdx = treeZoneIndices[Math.floor(hash) % treeZoneIndices.length];
        allPoints.push({ lng, lat, zoneIndex: treeIdx });
      } else if (nonTreeZoneIndices.length > 0) {
        // Non-tree: cluster with 25% mixing
        const mixFactor = 0.25;
        if (hash % 100 < mixFactor * 100) {
          const randomHash = hash % 100;
          let localIdx = 0;
          for (let z = 0; z < nonTreeCum.length; z++) {
            if (randomHash < nonTreeCum[z]) { localIdx = z; break; }
          }
          allPoints.push({ lng, lat, zoneIndex: nonTreeZoneIndices[localIdx] });
        } else {
          let minDist = Infinity;
          let localIdx = 0;
          nonTreeCenters.forEach((center, z) => {
            const dLng = (lng - center.lng) * metersPerLng;
            const dLat = (lat - center.lat) * metersPerLat;
            const dist = Math.sqrt(dLng * dLng + dLat * dLat) / Math.sqrt(zones[nonTreeZoneIndices[z]].area_pct / 100 + 0.1);
            if (dist < minDist) { minDist = dist; localIdx = z; }
          });
          allPoints.push({ lng, lat, zoneIndex: nonTreeZoneIndices[localIdx] });
        }
      } else {
        // Fallback: all zones are trees, just assign round-robin
        allPoints.push({ lng, lat, zoneIndex: treeZoneIndices[idx % treeZoneIndices.length] });
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
  const [filterCrop, setFilterCrop] = useState<string | null>(null); // null = show all
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
        // Skip if filtering to a specific crop
        if (filterCrop && zone.crop !== filterCrop) return;

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
    [field, fieldBounds, filterCrop],
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

        {/* Filter + Legend overlay */}
        {plan && (
          <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm rounded-lg px-2.5 py-2 flex flex-wrap gap-1.5">
            <button
              onClick={() => setFilterCrop(null)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                filterCrop === null ? "bg-white/20 text-white" : "text-white/60 hover:text-white/90"
              }`}
            >
              <Layers className="w-3 h-3" /> All
            </button>
            {plan.zones.map((zone) => (
              <button
                key={zone.id}
                onClick={() => setFilterCrop(filterCrop === zone.crop ? null : zone.crop)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                  filterCrop === zone.crop ? "bg-white/20 text-white" : "text-white/60 hover:text-white/90"
                }`}
              >
                <span className="rounded-full flex-shrink-0" style={{ backgroundColor: zone.color, width: 8, height: 8 }} />
                {zone.crop}
              </button>
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
