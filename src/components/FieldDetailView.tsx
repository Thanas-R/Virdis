import { useState, useEffect, useMemo } from "react";
import {
  ArrowLeft, Droplets, Wind, Sprout, MapPin,
  Leaf, Move, Brain, Loader2, Satellite, Building2, AlertTriangle, Factory,
} from "lucide-react";
import { Field, haToAcres } from "@/data/fields";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";

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

const weatherCodes: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Rime fog", 51: "Light drizzle", 53: "Moderate drizzle",
  55: "Dense drizzle", 61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
  71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
  80: "Slight showers", 81: "Moderate showers", 82: "Violent showers", 95: "Thunderstorm",
};

const ANALYSIS_CACHE_KEY = "region-ai-analysis-cache";
const NDVI_CACHE_KEY = "region-ndvi-cache";

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

function getAnalysisCache(): Record<string, { analysis: string; timestamp: number }> {
  try { const c = localStorage.getItem(ANALYSIS_CACHE_KEY); return c ? JSON.parse(c) : {}; } catch { return {}; }
}
function setAnalysisCache(fieldId: string, analysis: string) {
  const cache = getAnalysisCache();
  cache[fieldId] = { analysis, timestamp: Date.now() };
  localStorage.setItem(ANALYSIS_CACHE_KEY, JSON.stringify(cache));
}

function getNdviCache(): Record<string, { stats: NdviStats; timestamp: number }> {
  try { const c = localStorage.getItem(NDVI_CACHE_KEY); return c ? JSON.parse(c) : {}; } catch { return {}; }
}
function setNdviCache(fieldId: string, stats: NdviStats) {
  const cache = getNdviCache();
  cache[fieldId] = { stats, timestamp: Date.now() };
  localStorage.setItem(NDVI_CACHE_KEY, JSON.stringify(cache));
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

const GROWTH_STAGE_CACHE_KEY = "region-growth-stage-cache";

function getGrowthCache(): Record<string, { data: any; timestamp: number }> {
  try { const c = localStorage.getItem(GROWTH_STAGE_CACHE_KEY); return c ? JSON.parse(c) : {}; } catch { return {}; }
}

function GrowthStageSection({ polygon, fieldId }: { polygon: [number, number][]; fieldId: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const cache = getGrowthCache();
    const cached = cache[fieldId];
    if (cached && Date.now() - cached.timestamp < 3600000) {
      setData(cached.data);
      return;
    }
    const fetchGrowthStage = async () => {
      setLoading(true);
      try {
        const { data: result, error } = await supabase.functions.invoke("ndvi-timeseries", {
          body: { polygon },
        });
        if (error) throw error;
        const gs = result?.growth_stage ? {
          stage: result.growth_stage,
          progress: result.growth_progress,
          current_ndvi: result.latest_ndvi,
          date_range: result.date_range,
        } : null;
        setData(gs);
        if (gs) {
          const c = getGrowthCache();
          c[fieldId] = { data: gs, timestamp: Date.now() };
          localStorage.setItem(GROWTH_STAGE_CACHE_KEY, JSON.stringify(c));
        }
      } catch (e) {
        console.error("Growth stage error:", e);
        setData(null);
      } finally { setLoading(false); }
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
            <span>Germination</span>
            <span>Tillering</span>
            <span>Extension</span>
            <span>Heading</span>
            <span>Grain Fill</span>
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

const FieldDetailView = ({ field, onBack, onEditBoundary }: FieldDetailViewProps) => {
  const [weather, setWeather] = useState<FieldWeather | null>(null);
  const [loading, setLoading] = useState(true);
  const [ndviStats, setNdviStats] = useState<NdviStats | null>(null);
  const [ndviLoading, setNdviLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

  const areaAcres = haToAcres(field.area);
  const urban = isUrbanField(field);

  // Fetch weather
  useEffect(() => {
    const fetchWeather = async () => {
      setLoading(true);
      try {
        const coords = field.coordinates[0];
        const lat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
        const lng = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`);
        const data = await res.json();
        setWeather(data.current);
      } catch { setWeather(null); }
      finally { setLoading(false); }
    };
    fetchWeather();
  }, [field]);

  // Load cached NDVI or fetch
  useEffect(() => {
    const cache = getNdviCache();
    const cached = cache[field.id];
    if (cached && Date.now() - cached.timestamp < 3600000) {
      setNdviStats(cached.stats);
    } else {
      setNdviStats(null);
      fetchNdviStats();
    }
  }, [field.id]);

  const fetchNdviStats = async () => {
    setNdviLoading(true);
    try {
      const polygon = field.coordinates[0];
      const { data, error } = await supabase.functions.invoke("analyze-field", {
        body: { polygon },
      });
      if (error) throw error;
      if (data?.mean_ndvi !== undefined) {
        setNdviStats(data as NdviStats);
        setNdviCache(field.id, data as NdviStats);
      }
    } catch (e) {
      console.error("NDVI analysis error:", e);
    } finally {
      setNdviLoading(false);
    }
  };

  // Load cached AI analysis
  useEffect(() => {
    const cache = getAnalysisCache();
    const cached = cache[field.id];
    if (cached && Date.now() - cached.timestamp < 3600000) {
      setAiAnalysis(cached.analysis);
      setShowAnalysis(true);
    } else {
      setAiAnalysis("");
      setShowAnalysis(false);
    }
  }, [field.id]);

  const fetchAiAnalysis = async () => {
    setAiLoading(true);
    setShowAnalysis(true);
    try {
      const ndviEstimate = ndviStats?.mean_ndvi?.toFixed(2) || (field.ndviChange !== undefined ? (0.55 + field.ndviChange).toFixed(2) : "0.55");
      const { data, error } = await supabase.functions.invoke("analyze-field", {
        body: {
          fieldName: field.name, crop: field.crop, area: areaAcres, location: field.location,
          temperature: weather?.temperature_2m ?? 25, humidity: weather?.relative_humidity_2m ?? 60,
          windSpeed: weather?.wind_speed_10m ?? 10, soilMoisture: 45, ndviEstimate,
          isUrban: urban,
        },
      });
      if (error) throw error;
      setAiAnalysis(data.analysis);
      setAnalysisCache(field.id, data.analysis);
    } catch (e) {
      console.error("AI analysis error:", e);
      setAiAnalysis("Analysis temporarily unavailable. Please try again.");
    } finally { setAiLoading(false); }
  };

  const analysisBlocks = useMemo(() => splitAnalysisBlocks(aiAnalysis), [aiAnalysis]);

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
                {(() => {
                  const coords = field.coordinates[0];
                  const lat = (coords.reduce((s, c) => s + c[1], 0) / coords.length).toFixed(5);
                  const lng = (coords.reduce((s, c) => s + c[0], 0) / coords.length).toFixed(5);
                  return `${lat}°N, ${lng}°E`;
                })()}
              </div>
            </div>
          </div>
          {onEditBoundary && (
            <button onClick={onEditBoundary} className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Move className="w-3.5 h-3.5" /> Edit boundary
            </button>
          )}
        </div>

        {/* Satellite Analysis - label changes for urban */}
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
                <span className="flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" style={{ color: "#C6B77E" }} />
                  <span style={{ color: "#C6B77E" }}>May not be fully accurate</span>
                </span>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-border bg-accent/10 text-sm text-muted-foreground">
              No satellite data available for this region. Click Refresh to analyze.
            </div>
          )}
        </div>

        {/* Current Weather */}
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Current Weather</h3>
          {loading ? (
            <div className="p-4 rounded-xl border border-border bg-accent/10">
              <div className="text-sm text-muted-foreground animate-pulse">Loading…</div>
            </div>
          ) : weather ? (
            <div className="p-4 rounded-xl border border-border bg-accent/15 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-light text-foreground">{Math.round(weather.temperature_2m)}°C</span>
                <span className="text-xs text-muted-foreground">{weatherCodes[weather.weather_code] || "Unknown"}</span>
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><Droplets className="w-3.5 h-3.5" />{weather.relative_humidity_2m}%</span>
                <span className="flex items-center gap-1.5"><Wind className="w-3.5 h-3.5" />{Math.round(weather.wind_speed_10m)} km/h</span>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-border bg-accent/10 text-sm text-muted-foreground">Weather unavailable</div>
          )}
        </div>

        {/* Growth Stage - only for rural */}
        {!urban && <GrowthStageSection polygon={field.coordinates[0]} fieldId={field.id} />}

        {/* Urban-specific section */}
        {urban && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> Urban Sustainability
            </h3>
            <div className="p-4 rounded-xl border border-border bg-accent/15 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground">Green Cover Score</span>
                  <div className="text-foreground font-medium">{ndviStats ? `${ndviStats.vegetation_health_score}/100` : "N/A"}</div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Land Use Type</span>
                  <div className="text-foreground font-medium">{field.crop}</div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Temperature</span>
                  <div className="text-foreground font-medium">{weather ? `${Math.round(weather.temperature_2m)}°C` : "N/A"}</div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Humidity</span>
                  <div className="text-foreground font-medium">{weather ? `${weather.relative_humidity_2m}%` : "N/A"}</div>
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground leading-relaxed">
                Urban regions are analyzed for sustainability metrics including green infrastructure coverage, heat island effect, air quality, and environmental resilience.
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
