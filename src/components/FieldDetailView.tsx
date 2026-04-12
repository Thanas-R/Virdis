import { useState, useEffect, useMemo } from "react";
import {
  ArrowLeft, Droplets, Wind, Sprout, MapPin,
  Leaf, Move, Brain, Loader2, Satellite, Building2, AlertTriangle, Factory,
  Beaker, FlaskConical, Layers, TrendingDown, Gauge, Thermometer,
} from "lucide-react";
import { Field, haToAcres } from "@/data/fields";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

const URBAN_CROPS = ["Residential", "Commercial", "Park / Garden", "Industrial", "Mixed Use", "Rooftop / Terrace", "Community Garden"];

function isUrbanField(field: Field): boolean {
  return URBAN_CROPS.includes(field.crop);
}

interface FieldDetailViewProps {
  field: Field;
  onBack: () => void;
  onEditBoundary?: () => void;
}

interface FieldWeather {
  temperature_2m: number;
  relative_humidity_2m: number;
  wind_speed_10m: number;
  weather_code: number;
}

interface NdviStats {
  mean_ndvi: number;
  min_ndvi: number;
  max_ndvi: number;
  vegetation_health_score: number;
  acquisition_date: string;
  pixel_count: number;
}

interface SoilData {
  classification: { soil_class: string; wrb_name: string; icon: string; description: string; color: string };
  metrics: { ph: number | null; ph_rating: string; soc_g_per_kg: number | null; soc_rating: string; bulk_density: number | null; nitrogen_g_per_kg: number | null; nitrogen_rating: string; cec: number | null; coarse_fragments_pct: number | null };
  texture: { sand_pct: number | null; silt_pct: number | null; clay_pct: number | null; usda_class: string | null };
  water_retention: { field_capacity_pct: number | null; wilting_point_pct: number | null; available_water_pct: number | null };
}

interface AqiData {
  pm2_5: number;
  pm10: number;
  european_aqi: number;
  us_aqi: number;
}

const weatherCodes: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Rime fog", 51: "Light drizzle", 53: "Moderate drizzle",
  55: "Dense drizzle", 61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
  71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
  80: "Slight showers", 81: "Moderate showers", 82: "Violent showers", 95: "Thunderstorm",
};

const ANALYSIS_CACHE_KEY = "region-ai-analysis-cache";
const NDVI_CACHE_KEY = "region-ndvi-cache";
const SOIL_CACHE_KEY = "region-soil-cache";

type AnalysisBlock =
  | { type: "markdown"; content: string }
  | { type: "table"; rows: string[][] };

const isTableRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const parseTableRow = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
const isSeparatorCell = (cell: string) => /^:?-{3,}:?$/.test(cell.trim());

function splitAnalysisBlocks(rawText: string): AnalysisBlock[] {
  const text = rawText.replace(/\\n/g, "\n");
  const lines = text.split("\n");
  const blocks: AnalysisBlock[] = [];
  let markdownBuffer: string[] = [];
  const flushMarkdown = () => { if (markdownBuffer.length) { blocks.push({ type: "markdown", content: markdownBuffer.join("\n") }); markdownBuffer = []; } };
  for (let i = 0; i < lines.length; i += 1) {
    if (!isTableRow(lines[i])) { markdownBuffer.push(lines[i]); continue; }
    flushMarkdown();
    const tableRows: string[][] = [];
    while (i < lines.length && isTableRow(lines[i])) { tableRows.push(parseTableRow(lines[i])); i += 1; }
    const hasSeparator = tableRows[1]?.every(isSeparatorCell);
    if (hasSeparator) tableRows.splice(1, 1);
    if (tableRows.length >= 2) blocks.push({ type: "table", rows: tableRows });
    else markdownBuffer.push(...tableRows.map((row) => `| ${row.join(" | ")} |`));
    i -= 1;
  }
  flushMarkdown();
  return blocks;
}

function getCache<T>(key: string): Record<string, { data: T; timestamp: number }> {
  try { const c = localStorage.getItem(key); return c ? JSON.parse(c) : {}; } catch { return {}; }
}
function setCache<T>(key: string, id: string, data: T) {
  const cache = getCache<T>(key);
  (cache as any)[id] = { data, timestamp: Date.now() };
  localStorage.setItem(key, JSON.stringify(cache));
}

function ndviColor(val: number): string {
  if (val > 0.6) return "hsl(var(--field-green, 140 40% 40%))";
  if (val > 0.4) return "#66bd63";
  if (val > 0.2) return "#fee08b";
  return "#d73027";
}

function ndviLabel(val: number): string {
  if (val > 0.6) return "Healthy";
  if (val > 0.4) return "Moderate";
  if (val > 0.2) return "Stressed";
  return "Critical";
}

function getAqiLabel(aqi: number): { label: string; color: string } {
  if (aqi <= 20) return { label: "Good", color: "#7BC75B" };
  if (aqi <= 40) return { label: "Fair", color: "#CDDC39" };
  if (aqi <= 60) return { label: "Moderate", color: "#C6B77E" };
  if (aqi <= 80) return { label: "Poor", color: "#FF9800" };
  if (aqi <= 100) return { label: "Very Poor", color: "#d73027" };
  return { label: "Hazardous", color: "#7B1FA2" };
}

function waterStressLabel(soilMoisture: number | null, rainfall: number | null): { label: string; color: string; detail: string } {
  if (soilMoisture == null) return { label: "N/A", color: "hsl(150, 10%, 55%)", detail: "Insufficient data" };
  if (soilMoisture < 15) return { label: "High Stress", color: "#d73027", detail: "Under-irrigated — soil moisture critically low" };
  if (soilMoisture < 25) return { label: "Moderate", color: "#C6B77E", detail: "Monitor closely — may need supplemental irrigation" };
  if (soilMoisture > 45) return { label: "Over-irrigated", color: "#61AFEF", detail: "Excess moisture — risk of waterlogging and root rot" };
  return { label: "Adequate", color: "#7BC75B", detail: "Soil moisture is within optimal range" };
}

const GROWTH_STAGE_CACHE_KEY = "region-growth-stage-cache";

function GrowthStageSection({ polygon, fieldId }: { polygon: [number, number][]; fieldId: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const cache = getCache<any>(GROWTH_STAGE_CACHE_KEY);
    const cached = cache[fieldId];
    if (cached && Date.now() - cached.timestamp < 3600000) { setData(cached.data); return; }
    const fetchGrowthStage = async () => {
      setLoading(true);
      try {
        const { data: result, error } = await supabase.functions.invoke("ndvi-timeseries", { body: { polygon } });
        if (error) throw error;
        const gs = result?.growth_stage ? {
          stage: result.growth_stage, progress: result.growth_progress,
          current_ndvi: result.latest_ndvi, date_range: result.date_range,
        } : null;
        setData(gs);
        if (gs) setCache(GROWTH_STAGE_CACHE_KEY, fieldId, gs);
      } catch (e) { console.error("Growth stage error:", e); setData(null); }
      finally { setLoading(false); }
    };
    fetchGrowthStage();
  }, [fieldId]);

  return (
    <div>
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <Leaf className="w-3.5 h-3.5" /> Growth Stage
      </h3>
      {loading ? (
        <div className="p-4 rounded-xl border border-border bg-accent/15 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Detecting growth stage…
        </div>
      ) : data ? (
        <div className="p-4 rounded-xl border border-border bg-accent/15 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold text-foreground">{data.stage}</span>
            <span className="text-xs text-muted-foreground">NDVI: {data.current_ndvi}</span>
          </div>
          <div className="w-full h-2 rounded-full bg-muted/30 overflow-hidden">
            <div className="h-full rounded-full bg-[#7BC75B] transition-all duration-500" style={{ width: `${data.progress}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Germination</span><span>Tillering</span><span>Extension</span><span>Heading</span><span>Grain Fill</span>
          </div>
          <div className="text-[10px] text-muted-foreground">{data.date_range}</div>
        </div>
      ) : (
        <div className="p-4 rounded-xl border border-border bg-accent/10 text-sm text-muted-foreground">
          No satellite data available for this region.
        </div>
      )}
    </div>
  );
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0].payload;
  return (
    <div className="rounded-lg px-3 py-2 shadow-xl border border-border/50" style={{ background: "hsl(150, 18%, 12%)", color: "hsl(60, 20%, 90%)" }}>
      <div className="text-xs font-semibold">{name}</div>
      <div className="text-sm font-bold">{typeof value === 'number' ? value.toFixed(1) : value}%</div>
    </div>
  );
};

const TEXTURE_COLORS = { sand: "#EAB947", silt: "#A0785A", clay: "#854F0B" };

const FieldDetailView = ({ field, onBack, onEditBoundary }: FieldDetailViewProps) => {
  const [weather, setWeather] = useState<FieldWeather | null>(null);
  const [loading, setLoading] = useState(true);
  const [ndviStats, setNdviStats] = useState<NdviStats | null>(null);
  const [ndviLoading, setNdviLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [soilData, setSoilData] = useState<SoilData | null>(null);
  const [soilLoading, setSoilLoading] = useState(false);
  const [aqiData, setAqiData] = useState<AqiData | null>(null);
  const [soilMoisture, setSoilMoisture] = useState<number | null>(null);

  const areaAcres = haToAcres(field.area);
  const urban = isUrbanField(field);

  const fieldCenter = useMemo(() => {
    const coords = field.coordinates[0];
    return {
      lat: coords.reduce((s, c) => s + c[1], 0) / coords.length,
      lng: coords.reduce((s, c) => s + c[0], 0) / coords.length,
    };
  }, [field]);

  // Fetch weather + AQI + soil moisture
  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      const { lat, lng } = fieldCenter;
      try {
        const [weatherRes, aqiRes, soilMoistRes] = await Promise.all([
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`),
          fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=pm2_5,pm10,european_aqi,us_aqi`),
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=soil_moisture_0_to_7cm&forecast_days=1`),
        ]);
        const [wData, aqData, smData] = await Promise.all([weatherRes.json(), aqiRes.json(), soilMoistRes.json()]);
        setWeather(wData.current || null);
        if (aqData.current) setAqiData(aqData.current);
        if (smData.hourly?.soil_moisture_0_to_7cm) {
          const vals = smData.hourly.soil_moisture_0_to_7cm.filter((v: any) => v != null);
          if (vals.length) setSoilMoisture(Math.round(vals[vals.length - 1] * 1000) / 10);
        }
      } catch { setWeather(null); }
      finally { setLoading(false); }
    };
    fetchAll();
  }, [field, fieldCenter]);

  // Fetch soil data
  useEffect(() => {
    const cache = getCache<SoilData>(SOIL_CACHE_KEY);
    const cached = cache[field.id];
    if (cached && Date.now() - cached.timestamp < 3600000) { setSoilData(cached.data); return; }
    const fetchSoil = async () => {
      setSoilLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("soil-data", {
          body: { lat: fieldCenter.lat, lon: fieldCenter.lng },
        });
        if (error) throw error;
        setSoilData(data);
        setCache(SOIL_CACHE_KEY, field.id, data);
      } catch (e) { console.error("Soil data error:", e); setSoilData(null); }
      finally { setSoilLoading(false); }
    };
    fetchSoil();
  }, [field.id, fieldCenter]);

  // Load cached NDVI or fetch
  useEffect(() => {
    const cache = getCache<NdviStats>(NDVI_CACHE_KEY);
    const cached = cache[field.id];
    if (cached && Date.now() - cached.timestamp < 3600000) { setNdviStats(cached.data); }
    else { setNdviStats(null); fetchNdviStats(); }
  }, [field.id]);

  const fetchNdviStats = async () => {
    setNdviLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-field", { body: { polygon: field.coordinates[0] } });
      if (error) throw error;
      if (data?.mean_ndvi !== undefined) { setNdviStats(data); setCache(NDVI_CACHE_KEY, field.id, data); }
    } catch (e) { console.error("NDVI analysis error:", e); }
    finally { setNdviLoading(false); }
  };

  // Load cached AI analysis
  useEffect(() => {
    const cache = getCache<string>(ANALYSIS_CACHE_KEY);
    const cached = cache[field.id];
    if (cached && Date.now() - cached.timestamp < 3600000) { setAiAnalysis(cached.data); setShowAnalysis(true); }
    else { setAiAnalysis(""); setShowAnalysis(false); }
  }, [field.id]);

  const fetchAiAnalysis = async () => {
    setAiLoading(true);
    setShowAnalysis(true);
    try {
      const ndviEstimate = ndviStats?.mean_ndvi?.toFixed(2) || "0.55";
      const { data, error } = await supabase.functions.invoke("analyze-field", {
        body: {
          fieldName: field.name, crop: field.crop, area: areaAcres, location: field.location,
          temperature: weather?.temperature_2m ?? 25, humidity: weather?.relative_humidity_2m ?? 60,
          windSpeed: weather?.wind_speed_10m ?? 10, soilMoisture: soilMoisture ?? 45, ndviEstimate,
          isUrban: urban,
          soilData: soilData ? {
            type: soilData.classification.soil_class,
            ph: soilData.metrics.ph,
            soc: soilData.metrics.soc_g_per_kg,
            nitrogen: soilData.metrics.nitrogen_g_per_kg,
            texture: soilData.texture.usda_class,
            waterRetention: soilData.water_retention,
            cec: soilData.metrics.cec,
          } : undefined,
          aqiData: aqiData ? { pm2_5: aqiData.pm2_5, pm10: aqiData.pm10, aqi: aqiData.european_aqi } : undefined,
        },
      });
      if (error) throw error;
      setAiAnalysis(data.analysis);
      setCache(ANALYSIS_CACHE_KEY, field.id, data.analysis);
    } catch (e) {
      console.error("AI analysis error:", e);
      setAiAnalysis("Analysis temporarily unavailable. Please try again.");
    } finally { setAiLoading(false); }
  };

  const analysisBlocks = useMemo(() => splitAnalysisBlocks(aiAnalysis), [aiAnalysis]);

  const waterStress = waterStressLabel(soilMoisture, null);

  // Soil texture pie data
  const textureData = soilData?.texture && soilData.texture.sand_pct != null ? [
    { name: "Sand", value: soilData.texture.sand_pct, color: TEXTURE_COLORS.sand },
    { name: "Silt", value: soilData.texture.silt_pct!, color: TEXTURE_COLORS.silt },
    { name: "Clay", value: soilData.texture.clay_pct!, color: TEXTURE_COLORS.clay },
  ] : null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-4 border-b border-border">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: field.color + "20" }}>
            {urban ? <Building2 className="w-5 h-5" style={{ color: field.color }} /> :
              <div className="w-5 h-5 rounded" style={{ backgroundColor: field.color + "66", border: `2px solid ${field.color}` }} />}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{field.name}</h2>
            <p className="text-xs text-muted-foreground">
              {field.crop} · {areaAcres} acres
              {urban && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-destructive/20 text-destructive text-[10px] font-medium">Urban</span>}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Region Info */}
        <div className="p-4 rounded-xl border border-border bg-accent/15">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            {urban ? "Urban Region Info" : "Region Info"}
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">Area</span>
              <div className="text-foreground font-medium">{areaAcres} acres</div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">{urban ? "Land Use" : "Crop"}</span>
              <div className="text-foreground font-medium">{field.crop}</div>
            </div>
            <div className="col-span-2">
              <span className="text-xs text-muted-foreground">Location</span>
              <div className="text-foreground font-medium text-xs flex items-start gap-1 mt-0.5">
                <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5" />
                <span className="break-words">{field.location}</span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 font-mono">
                {fieldCenter.lat.toFixed(5)}°N, {fieldCenter.lng.toFixed(5)}°E
              </div>
            </div>
          </div>
          {onEditBoundary && (
            <button onClick={onEditBoundary} className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Move className="w-3.5 h-3.5" /> Edit boundary
            </button>
          )}
        </div>

        {/* Weather + AQI */}
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Current Conditions</h3>
          {loading ? (
            <div className="p-4 rounded-xl border border-border bg-accent/10 text-sm text-muted-foreground animate-pulse">Loading…</div>
          ) : weather ? (
            <div className="p-4 rounded-xl border border-border bg-accent/15 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-light text-foreground">{Math.round(weather.temperature_2m)}°C</span>
                <span className="text-xs text-muted-foreground">{weatherCodes[weather.weather_code] || "Unknown"}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><Droplets className="w-3.5 h-3.5" />{weather.relative_humidity_2m}%</span>
                <span className="flex items-center gap-1.5"><Wind className="w-3.5 h-3.5" />{Math.round(weather.wind_speed_10m)} km/h</span>
                {aqiData && (
                  <span className="flex items-center gap-1.5" style={{ color: getAqiLabel(aqiData.european_aqi).color }}>
                    <Factory className="w-3.5 h-3.5" />AQI {aqiData.european_aqi}
                  </span>
                )}
                {soilMoisture != null && (
                  <span className="flex items-center gap-1.5"><Droplets className="w-3.5 h-3.5" />Soil {soilMoisture}%</span>
                )}
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-border bg-accent/10 text-sm text-muted-foreground">Weather unavailable</div>
          )}
        </div>

        {/* Water Stress Index */}
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Droplets className="w-3.5 h-3.5" /> Water Stress Index
          </h3>
          <div className="p-4 rounded-xl border border-border bg-accent/15 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold" style={{ color: waterStress.color }}>{waterStress.label}</span>
              {soilMoisture != null && <span className="text-xs text-muted-foreground">VWC: {soilMoisture}%</span>}
            </div>
            <p className="text-xs text-muted-foreground">{waterStress.detail}</p>
            {soilData?.water_retention && (
              <div className="grid grid-cols-3 gap-2 mt-2">
                {soilData.water_retention.field_capacity_pct != null && (
                  <div className="p-2 rounded-lg bg-muted/20 text-center">
                    <div className="text-[10px] text-muted-foreground">Field Capacity</div>
                    <div className="text-sm font-semibold text-foreground">{soilData.water_retention.field_capacity_pct}%</div>
                  </div>
                )}
                {soilData.water_retention.wilting_point_pct != null && (
                  <div className="p-2 rounded-lg bg-muted/20 text-center">
                    <div className="text-[10px] text-muted-foreground">Wilting Pt</div>
                    <div className="text-sm font-semibold text-foreground">{soilData.water_retention.wilting_point_pct}%</div>
                  </div>
                )}
                {soilData.water_retention.available_water_pct != null && (
                  <div className="p-2 rounded-lg bg-muted/20 text-center">
                    <div className="text-[10px] text-muted-foreground">Avail. Water</div>
                    <div className="text-sm font-semibold text-foreground">{soilData.water_retention.available_water_pct}%</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Satellite Analysis */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Satellite className="w-3.5 h-3.5" /> {urban ? "Green Cover Analysis" : "Satellite NDVI Analysis"}
            </h3>
            <button onClick={fetchNdviStats} disabled={ndviLoading}
              className="text-xs px-3 py-1 rounded-md border border-border text-foreground hover:bg-accent transition-colors disabled:opacity-50">
              {ndviLoading ? "Analyzing…" : "Refresh"}
            </button>
          </div>
          {ndviLoading ? (
            <div className="p-4 rounded-xl border border-border bg-accent/15 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Querying Sentinel-2 imagery…
            </div>
          ) : ndviStats ? (
            <div className="p-4 rounded-xl border border-border bg-accent/15 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-light text-foreground">{ndviStats.vegetation_health_score}<span className="text-sm text-muted-foreground">/100</span></span>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: ndviColor(ndviStats.mean_ndvi) + "30", color: ndviColor(ndviStats.mean_ndvi) }}>
                  {urban ? (ndviStats.mean_ndvi > 0.4 ? "Good Green Cover" : "Low Green Cover") : ndviLabel(ndviStats.mean_ndvi)}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-muted/30 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${ndviStats.vegetation_health_score}%`, background: `linear-gradient(90deg, #d73027, #fee08b, #66bd63, #006837)` }} />
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-2 rounded-lg bg-muted/20">
                  <div className="text-[10px] text-muted-foreground uppercase">Mean</div>
                  <div className="text-sm font-semibold text-foreground">{ndviStats.mean_ndvi.toFixed(3)}</div>
                </div>
                <div className="p-2 rounded-lg bg-muted/20">
                  <div className="text-[10px] text-muted-foreground uppercase">Min</div>
                  <div className="text-sm font-semibold text-foreground">{ndviStats.min_ndvi.toFixed(3)}</div>
                </div>
                <div className="p-2 rounded-lg bg-muted/20">
                  <div className="text-[10px] text-muted-foreground uppercase">Max</div>
                  <div className="text-sm font-semibold text-foreground">{ndviStats.max_ndvi.toFixed(3)}</div>
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground flex items-center justify-between">
                <span>Sentinel-2 · {ndviStats.pixel_count} pixels</span>
                <span className="flex items-center gap-1" style={{ color: "#C6B77E" }}>
                  <AlertTriangle className="w-3 h-3" /> May not be fully accurate
                </span>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-border bg-accent/10 text-sm text-muted-foreground">
              No satellite data available. Click Refresh to analyze.
            </div>
          )}
        </div>

        {/* Soil Health */}
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" /> Soil Health
          </h3>
          {soilLoading ? (
            <div className="p-4 rounded-xl border border-border bg-accent/15 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Fetching SoilGrids data…
            </div>
          ) : soilData ? (
            <div className="space-y-3">
              {/* Soil Classification */}
              <div className="p-4 rounded-xl border border-border bg-accent/15">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{soilData.classification.icon}</span>
                  <div>
                    <div className="text-sm font-semibold text-foreground">{soilData.classification.soil_class}</div>
                    <div className="text-[10px] text-muted-foreground">{soilData.classification.description}</div>
                  </div>
                </div>
                {soilData.texture.usda_class && (
                  <div className="text-xs text-muted-foreground mt-1">
                    USDA Texture: <span className="text-foreground font-medium">{soilData.texture.usda_class}</span>
                  </div>
                )}
              </div>

              {/* Key Metrics Grid */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "pH", value: soilData.metrics.ph?.toFixed(1) || "N/A", sub: soilData.metrics.ph_rating, icon: Beaker, color: soilData.metrics.ph != null ? (soilData.metrics.ph < 6.5 || soilData.metrics.ph > 7.5 ? "#C6B77E" : "#7BC75B") : undefined },
                  { label: "Organic Carbon", value: soilData.metrics.soc_g_per_kg != null ? `${soilData.metrics.soc_g_per_kg} g/kg` : "N/A", sub: soilData.metrics.soc_rating, icon: Leaf, color: soilData.metrics.soc_rating === "High" ? "#7BC75B" : soilData.metrics.soc_rating === "Medium" ? "#C6B77E" : "#d73027" },
                  { label: "Nitrogen", value: soilData.metrics.nitrogen_g_per_kg != null ? `${soilData.metrics.nitrogen_g_per_kg} g/kg` : "N/A", sub: soilData.metrics.nitrogen_rating, icon: FlaskConical },
                  { label: "CEC", value: soilData.metrics.cec != null ? `${soilData.metrics.cec} mmol/kg` : "N/A", sub: "Ion exchange capacity", icon: Gauge },
                  { label: "Bulk Density", value: soilData.metrics.bulk_density != null ? `${soilData.metrics.bulk_density} kg/dm³` : "N/A", sub: soilData.metrics.bulk_density != null ? (soilData.metrics.bulk_density > 1.6 ? "Compacted" : "Normal") : "", icon: Layers },
                  { label: "Coarse Frags", value: soilData.metrics.coarse_fragments_pct != null ? `${soilData.metrics.coarse_fragments_pct}%` : "N/A", sub: "Rock content", icon: Thermometer },
                ].map((m, i) => (
                  <div key={i} className="p-3 rounded-xl border border-border bg-accent/10">
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1"><m.icon className="w-3 h-3" />{m.label}</div>
                    <div className="text-sm font-semibold" style={{ color: m.color || "hsl(60, 20%, 90%)" }}>{m.value}</div>
                    {m.sub && <div className="text-[10px] text-muted-foreground">{m.sub}</div>}
                  </div>
                ))}
              </div>

              {/* Soil Texture Pie */}
              {textureData && (
                <div className="p-4 rounded-xl border border-border bg-accent/15">
                  <div className="text-xs font-medium text-muted-foreground mb-2">Soil Texture Composition</div>
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width={100} height={100}>
                      <PieChart>
                        <Pie data={textureData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={20} outerRadius={40} paddingAngle={2} strokeWidth={0}>
                          {textureData.map((e, i) => <Cell key={i} fill={e.color} />)}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-1.5">
                      {textureData.map((e, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: e.color }} />
                          <span className="text-muted-foreground">{e.name}</span>
                          <span className="text-foreground font-medium ml-auto">{e.value?.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-border bg-accent/10 text-sm text-muted-foreground">
              Soil data unavailable for this location.
            </div>
          )}
        </div>

        {/* Growth Stage - only for rural */}
        {!urban && <GrowthStageSection polygon={field.coordinates[0]} fieldId={field.id} />}

        {/* Carbon Footprint Estimation - rural only */}
        {!urban && soilData && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5" /> Carbon & Sustainability
            </h3>
            <div className="p-4 rounded-xl border border-border bg-accent/15 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] text-muted-foreground">Soil Carbon Stock</div>
                  <div className="text-sm font-semibold text-foreground">
                    {soilData.metrics.soc_g_per_kg != null
                      ? `${(soilData.metrics.soc_g_per_kg * 0.3 * (soilData.metrics.bulk_density || 1.3) * 10).toFixed(1)} t/ha`
                      : "N/A"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Top 30cm estimate</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Erosion Risk</div>
                  <div className="text-sm font-semibold" style={{
                    color: soilData.metrics.soc_g_per_kg != null && soilData.metrics.soc_g_per_kg < 5 ? "#d73027" : "#7BC75B"
                  }}>
                    {soilData.metrics.soc_g_per_kg != null
                      ? (soilData.metrics.soc_g_per_kg < 5 ? "High" : soilData.metrics.soc_g_per_kg < 7.5 ? "Moderate" : "Low")
                      : "N/A"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Based on organic carbon</div>
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
                {soilData.metrics.soc_g_per_kg != null && soilData.metrics.soc_g_per_kg < 5 && (
                  <p>⚠ Low organic carbon — consider cover crops and reduced tillage to improve soil health and sequester carbon.</p>
                )}
                {soilData.metrics.ph != null && (soilData.metrics.ph < 5.5 || soilData.metrics.ph > 8.5) && (
                  <p>⚠ pH is {soilData.metrics.ph < 5.5 ? "acidic" : "alkaline"} — nutrient availability may be limited. Consider soil amendments.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Urban-specific Environmental Section */}
        {urban && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> Urban Environment
            </h3>
            <div className="p-4 rounded-xl border border-border bg-accent/15 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground">Green Cover</span>
                  <div className="text-foreground font-medium">{ndviStats ? `${ndviStats.vegetation_health_score}/100` : "N/A"}</div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Air Quality</span>
                  <div className="font-medium" style={{ color: aqiData ? getAqiLabel(aqiData.european_aqi).color : undefined }}>
                    {aqiData ? `${getAqiLabel(aqiData.european_aqi).label} (${aqiData.european_aqi})` : "N/A"}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Temperature</span>
                  <div className="text-foreground font-medium">{weather ? `${Math.round(weather.temperature_2m)}°C` : "N/A"}</div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">PM2.5</span>
                  <div className="text-foreground font-medium">{aqiData ? `${aqiData.pm2_5.toFixed(1)} µg/m³` : "N/A"}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AI Analysis */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Brain className="w-3.5 h-3.5" /> {urban ? "AI Sustainability Analysis" : "AI Region Analysis"}
            </h3>
            <button onClick={fetchAiAnalysis} disabled={aiLoading}
              className="text-xs px-3 py-1 rounded-md border border-border text-foreground hover:bg-accent transition-colors disabled:opacity-50">
              {aiLoading ? "Analyzing…" : aiAnalysis ? "Refresh" : "Generate"}
            </button>
          </div>
          {showAnalysis && (
            <div className="p-4 rounded-xl border border-border bg-accent/15">
              {aiLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Generating {urban ? "sustainability" : "region"} analysis...
                </div>
              ) : (
                <div className="prose prose-sm prose-invert max-w-none text-foreground
                  [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:mt-4 [&_h2]:mb-2
                  [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-3 [&_h3]:mb-1
                  [&_p]:text-xs [&_p]:text-muted-foreground [&_p]:leading-relaxed
                  [&_li]:text-xs [&_li]:text-muted-foreground
                  [&_strong]:text-foreground
                  [&_table]:text-xs [&_table]:w-full [&_table]:border-collapse [&_table]:mt-2 [&_table]:mb-3
                  [&_th]:text-foreground [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:border [&_th]:border-border [&_th]:bg-accent/20 [&_th]:font-medium
                  [&_td]:text-muted-foreground [&_td]:px-2 [&_td]:py-1.5 [&_td]:border [&_td]:border-border
                  [&_tr:hover_td]:bg-accent/10
                  [&_hr]:border-border [&_hr]:my-3">
                  {analysisBlocks.map((block, blockIndex) => {
                    if (block.type === "markdown") {
                      if (!block.content.trim()) return null;
                      return <ReactMarkdown key={`md-${blockIndex}`}>{block.content}</ReactMarkdown>;
                    }
                    const [header, ...bodyRows] = block.rows;
                    return (
                      <table key={`table-${blockIndex}`} className="w-full border-collapse text-xs mt-2 mb-3">
                        <thead>
                          <tr className="hover:bg-accent/10">
                            {header.map((cell, i) => (
                              <th key={`${blockIndex}-h-${i}`} className="text-foreground px-2 py-1.5 text-left border border-border bg-accent/20 font-medium">{cell}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {bodyRows.map((row, rowIndex) => (
                            <tr key={`${blockIndex}-r-${rowIndex}`} className="hover:bg-accent/10">
                              {row.map((cell, colIndex) => (
                                <td key={`${blockIndex}-r-${rowIndex}-c-${colIndex}`} className="text-muted-foreground px-2 py-1.5 border border-border">{cell}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })}
                </div>
              )}
              <div className="mt-3 flex items-center gap-1 text-[10px]" style={{ color: "#C6B77E" }}>
                <AlertTriangle className="w-3 h-3" />
                AI-generated analysis may not always be accurate
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default FieldDetailView;
