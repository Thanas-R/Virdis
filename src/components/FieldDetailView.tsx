import { useState, useEffect, useMemo } from "react";
import {
  ArrowLeft, Droplets, Wind, Sprout, CheckCircle, MapPin,
  TrendingUp, TrendingDown, BarChart3, Leaf, Move, Brain, Loader2,
} from "lucide-react";
import { Field, haToAcres } from "@/data/fields";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";

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

const weatherCodes: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Rime fog", 51: "Light drizzle", 53: "Moderate drizzle",
  55: "Dense drizzle", 61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
  71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
  80: "Slight showers", 81: "Moderate showers", 82: "Violent showers", 95: "Thunderstorm",
};

const cropGrowthStages: Record<string, { stages: string[]; currentStage: number }> = {
  Maize: { stages: ["Germination", "Seedling", "Vegetative", "Tasseling", "Grain Fill", "Maturity"], currentStage: 3 },
  Grapes: { stages: ["Dormancy", "Bud Break", "Flowering", "Fruit Set", "Veraison", "Harvest"], currentStage: 4 },
  Sunflower: { stages: ["Emergence", "Vegetative", "Bud Stage", "Flowering", "Seed Fill", "Maturity"], currentStage: 2 },
  Apple: { stages: ["Dormancy", "Silver Tip", "Bloom", "Petal Fall", "Fruit Dev", "Harvest"], currentStage: 4 },
  Wheat: { stages: ["Germination", "Tillering", "Stem Extension", "Heading", "Grain Fill", "Maturity"], currentStage: 3 },
  Rice: { stages: ["Germination", "Seedling", "Tillering", "Booting", "Heading", "Maturity"], currentStage: 2 },
};

const historicalYield: Record<string, { year: string; yield: number }[]> = {
  Maize: [{ year: "2020", yield: 8.2 }, { year: "2021", yield: 9.1 }, { year: "2022", yield: 7.8 }, { year: "2023", yield: 9.5 }, { year: "2024", yield: 10.1 }],
  Grapes: [{ year: "2020", yield: 6.5 }, { year: "2021", yield: 7.2 }, { year: "2022", yield: 5.9 }, { year: "2023", yield: 7.8 }, { year: "2024", yield: 8.0 }],
  Sunflower: [{ year: "2020", yield: 2.1 }, { year: "2021", yield: 2.5 }, { year: "2022", yield: 1.9 }, { year: "2023", yield: 2.8 }, { year: "2024", yield: 3.0 }],
  Apple: [{ year: "2020", yield: 25 }, { year: "2021", yield: 28 }, { year: "2022", yield: 22 }, { year: "2023", yield: 30 }, { year: "2024", yield: 32 }],
  Wheat: [{ year: "2020", yield: 3.5 }, { year: "2021", yield: 4.0 }, { year: "2022", yield: 3.8 }, { year: "2023", yield: 4.2 }, { year: "2024", yield: 4.5 }],
};

const ANALYSIS_CACHE_KEY = "field-ai-analysis-cache";

type AnalysisBlock =
  | { type: "markdown"; content: string }
  | { type: "table"; rows: string[][] };

const isTableRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);

const parseTableRow = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());

const isSeparatorCell = (cell: string) => /^:?-{3,}:?$/.test(cell.trim());

function splitAnalysisBlocks(rawText: string): AnalysisBlock[] {
  const text = rawText.replace(/\\n/g, "\n");
  const lines = text.split("\n");
  const blocks: AnalysisBlock[] = [];
  let markdownBuffer: string[] = [];

  const flushMarkdown = () => {
    if (!markdownBuffer.length) return;
    blocks.push({ type: "markdown", content: markdownBuffer.join("\n") });
    markdownBuffer = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    if (!isTableRow(lines[i])) {
      markdownBuffer.push(lines[i]);
      continue;
    }

    flushMarkdown();
    const tableRows: string[][] = [];
    while (i < lines.length && isTableRow(lines[i])) {
      tableRows.push(parseTableRow(lines[i]));
      i += 1;
    }

    const hasSeparator = tableRows[1]?.every(isSeparatorCell);
    if (hasSeparator) tableRows.splice(1, 1);

    if (tableRows.length >= 2) {
      blocks.push({ type: "table", rows: tableRows });
    } else {
      markdownBuffer.push(...tableRows.map((row) => `| ${row.join(" | ")} |`));
    }

    i -= 1;
  }

  flushMarkdown();
  return blocks;
}

function getAnalysisCache(): Record<string, { analysis: string; timestamp: number }> {
  try {
    const cached = localStorage.getItem(ANALYSIS_CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch { return {}; }
}

function setAnalysisCache(fieldId: string, analysis: string) {
  const cache = getAnalysisCache();
  cache[fieldId] = { analysis, timestamp: Date.now() };
  localStorage.setItem(ANALYSIS_CACHE_KEY, JSON.stringify(cache));
}

const FieldDetailView = ({ field, onBack, onEditBoundary }: FieldDetailViewProps) => {
  const [weather, setWeather] = useState<FieldWeather | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

  const areaAcres = haToAcres(field.area);

  useEffect(() => {
    const fetchWeather = async () => {
      setLoading(true);
      try {
        const coords = field.coordinates[0];
        const lat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
        const lng = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`
        );
        const data = await res.json();
        setWeather(data.current);
      } catch { setWeather(null); }
      finally { setLoading(false); }
    };
    fetchWeather();
  }, [field]);

  // Load cached analysis
  useEffect(() => {
    const cache = getAnalysisCache();
    const cached = cache[field.id];
    // Use cache if less than 1 hour old
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
      const ndviEstimate = field.ndviChange !== undefined ? (0.55 + field.ndviChange).toFixed(2) : "0.55";
      const { data, error } = await supabase.functions.invoke("analyze-field", {
        body: {
          fieldName: field.name,
          crop: field.crop,
          area: areaAcres,
          location: field.location,
          temperature: weather?.temperature_2m ?? 25,
          humidity: weather?.relative_humidity_2m ?? 60,
          windSpeed: weather?.wind_speed_10m ?? 10,
          soilMoisture: 45,
          ndviEstimate,
        },
      });
      if (error) throw error;
      setAiAnalysis(data.analysis);
      setAnalysisCache(field.id, data.analysis);
    } catch (e) {
      console.error("AI analysis error:", e);
      setAiAnalysis("Analysis temporarily unavailable. Please try again.");
    } finally {
      setAiLoading(false);
    }
  };

  const growth = cropGrowthStages[field.crop] || { stages: ["Germination", "Growth", "Maturity"], currentStage: 1 };
  const yields = historicalYield[field.crop] || [];
  const lastYield = yields.length >= 2 ? yields[yields.length - 1].yield - yields[yields.length - 2].yield : 0;
  const analysisBlocks = useMemo(() => splitAnalysisBlocks(aiAnalysis), [aiAnalysis]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-4 border-b border-border">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: field.color + "20" }}>
            <div className="w-5 h-5 rounded" style={{ backgroundColor: field.color + "66", border: `2px solid ${field.color}` }} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{field.name}</h2>
            <p className="text-xs text-muted-foreground">{field.crop} · {areaAcres} acres</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Field Info */}
        <div className="p-4 rounded-xl border border-border bg-accent/15">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Field Info</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">Area</span>
              <div className="text-foreground font-medium">{areaAcres} acres</div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Crop</span>
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
            {field.ndviChange !== undefined && (
              <div>
                <span className="text-xs text-muted-foreground">NDVI Change</span>
                <div className={`font-semibold flex items-center gap-1 ${field.ndviChange >= 0 ? "text-field-green" : "text-destructive"}`}>
                  {field.ndviChange >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  {field.ndviChange >= 0 ? "+" : ""}{field.ndviChange.toFixed(2)}
                </div>
              </div>
            )}
          </div>
          {onEditBoundary && (
            <button onClick={onEditBoundary} className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Move className="w-3.5 h-3.5" /> Edit boundary
            </button>
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

        {/* Growth Stage */}
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Leaf className="w-3.5 h-3.5" /> Growth Stage
          </h3>
          <div className="p-4 rounded-xl border border-border bg-accent/15">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-medium text-foreground">{growth.stages[growth.currentStage]}</span>
              <span className="text-xs text-muted-foreground">({growth.currentStage + 1}/{growth.stages.length})</span>
            </div>
            <div className="flex gap-1">
              {growth.stages.map((stage, i) => (
                <div key={stage} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full h-2 rounded-full" style={{ backgroundColor: i <= growth.currentStage ? "#EAB947" : "hsl(150, 12%, 22%)", opacity: i <= growth.currentStage ? 1 : 0.4 }} />
                  <span className="text-[9px] text-muted-foreground text-center leading-tight">{stage}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Historical Yield */}
        {yields.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" /> Historical Yield (t/acre)
            </h3>
            <div className="p-4 rounded-xl border border-border bg-accent/15">
              <div className="flex items-end gap-2 h-24">
                {yields.map((y) => {
                  const maxY = Math.max(...yields.map((yy) => yy.yield));
                  const heightPct = (y.yield / maxY) * 100;
                  return (
                    <div key={y.year} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] text-foreground font-medium">{y.yield}</span>
                      <div className="w-full rounded-t-md" style={{ height: `${heightPct}%`, backgroundColor: "#EAB947", minHeight: 4 }} />
                      <span className="text-[10px] text-muted-foreground">{y.year}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                {lastYield >= 0 ? <TrendingUp className="w-3.5 h-3.5 text-field-green" /> : <TrendingDown className="w-3.5 h-3.5 text-destructive" />}
                <span>{lastYield >= 0 ? "+" : ""}{lastYield.toFixed(1)} t/acre vs last year</span>
              </div>
            </div>
          </div>
        )}

        {/* AI Analysis */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Brain className="w-3.5 h-3.5" /> AI Field Analysis
            </h3>
            <button
              onClick={fetchAiAnalysis}
              disabled={aiLoading}
              className="text-xs px-3 py-1 rounded-md border border-border text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              {aiLoading ? "Analyzing…" : aiAnalysis ? "Refresh" : "Generate"}
            </button>
          </div>
          {showAnalysis && (
            <div className="p-4 rounded-xl border border-border bg-accent/15">
              {aiLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating field analysis...
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
            </div>
          )}
        </div>

        {/* Scouting Tasks */}
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Scouting Tasks</h3>
          <div className="space-y-2">
            {[
              { id: 1, label: "Check irrigation system", status: "pending" as const, priority: "high" as const },
              { id: 2, label: "Soil sampling - Zone A", status: "done" as const, priority: "medium" as const },
              { id: 3, label: "Pest inspection", status: "pending" as const, priority: "low" as const },
              { id: 4, label: "Fertilizer application", status: "pending" as const, priority: "medium" as const },
            ].map((task) => (
              <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-accent/10 hover:bg-accent/20 transition-all">
                {task.status === "done" ? (
                  <CheckCircle className="w-4 h-4 text-field-green flex-shrink-0" />
                ) : (
                  <Sprout className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
                <span className={`text-sm flex-1 ${task.status === "done" ? "text-muted-foreground line-through" : "text-foreground"}`}>
                  {task.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FieldDetailView;
