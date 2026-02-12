import { useState, useEffect } from "react";
import {
  ArrowLeft,
  Droplets,
  Wind,
  Sprout,
  AlertTriangle,
  CheckCircle,
  MapPin,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Leaf,
} from "lucide-react";
import { Field } from "@/data/fields";

interface FieldDetailViewProps {
  field: Field;
  onBack: () => void;
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

// Crop growth stages based on crop type
const cropGrowthStages: Record<string, { stages: string[]; currentStage: number }> = {
  Maize: { stages: ["Germination", "Seedling", "Vegetative", "Tasseling", "Grain Fill", "Maturity"], currentStage: 3 },
  Grapes: { stages: ["Dormancy", "Bud Break", "Flowering", "Fruit Set", "Veraison", "Harvest"], currentStage: 4 },
  Sunflower: { stages: ["Emergence", "Vegetative", "Bud Stage", "Flowering", "Seed Fill", "Maturity"], currentStage: 2 },
  Apple: { stages: ["Dormancy", "Silver Tip", "Bloom", "Petal Fall", "Fruit Dev", "Harvest"], currentStage: 4 },
};

// Historical yield data (mock per crop)
const historicalYield: Record<string, { year: string; yield: number }[]> = {
  Maize: [
    { year: "2020", yield: 8.2 }, { year: "2021", yield: 9.1 }, { year: "2022", yield: 7.8 },
    { year: "2023", yield: 9.5 }, { year: "2024", yield: 10.1 },
  ],
  Grapes: [
    { year: "2020", yield: 6.5 }, { year: "2021", yield: 7.2 }, { year: "2022", yield: 5.9 },
    { year: "2023", yield: 7.8 }, { year: "2024", yield: 8.0 },
  ],
  Sunflower: [
    { year: "2020", yield: 2.1 }, { year: "2021", yield: 2.5 }, { year: "2022", yield: 1.9 },
    { year: "2023", yield: 2.8 }, { year: "2024", yield: 3.0 },
  ],
  Apple: [
    { year: "2020", yield: 25 }, { year: "2021", yield: 28 }, { year: "2022", yield: 22 },
    { year: "2023", yield: 30 }, { year: "2024", yield: 32 },
  ],
};

type TaskStatus = "pending" | "done";
type TaskPriority = "high" | "medium" | "low";
interface ScoutingTask { id: number; label: string; status: TaskStatus; priority: TaskPriority; }

function getScoutingTasks(crop: string): ScoutingTask[] {
  const baseTasks: ScoutingTask[] = [
    { id: 1, label: "Check irrigation system", status: "pending", priority: "high" },
    { id: 2, label: "Soil sampling - Zone A", status: "done", priority: "medium" },
    { id: 3, label: "Pest inspection", status: "pending", priority: "low" },
    { id: 4, label: "Fertilizer application", status: "pending", priority: "medium" },
  ];
  if (crop === "Grapes") baseTasks.push({ id: 5, label: "Canopy management", status: "pending", priority: "high" });
  if (crop === "Maize") baseTasks.push({ id: 5, label: "Check ear development", status: "pending", priority: "medium" });
  if (crop === "Sunflower") baseTasks.push({ id: 5, label: "Bird damage assessment", status: "pending", priority: "high" });
  return baseTasks;
}

const FieldDetailView = ({ field, onBack }: FieldDetailViewProps) => {
  const [weather, setWeather] = useState<FieldWeather | null>(null);
  const [loading, setLoading] = useState(true);

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
      } catch {
        setWeather(null);
      } finally {
        setLoading(false);
      }
    };
    fetchWeather();
  }, [field]);

  const growth = cropGrowthStages[field.crop] || { stages: ["N/A"], currentStage: 0 };
  const yields = historicalYield[field.crop] || [];
  const scoutingTasks = getScoutingTasks(field.crop);
  const lastYield = yields.length >= 2 ? yields[yields.length - 1].yield - yields[yields.length - 2].yield : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: field.color + "20" }}>
            <span className="text-lg">{field.cropEmoji}</span>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{field.name}</h2>
            <p className="text-xs text-muted-foreground">{field.crop} · {field.area} ha</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Field Info Grid */}
        <div className="p-4 rounded-xl border border-border bg-accent/15">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Field Info</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">Area</span>
              <div className="text-foreground font-medium">{field.area} ha</div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Crop</span>
              <div className="text-foreground font-medium">{field.cropEmoji} {field.crop}</div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Location</span>
              <div className="text-foreground font-medium text-xs truncate flex items-center gap-1">
                <MapPin className="w-3 h-3 flex-shrink-0" />{field.location}
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
        </div>

        {/* Crop Growth Stage */}
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
                  <div
                    className="w-full h-2 rounded-full transition-all duration-500"
                    style={{
                      backgroundColor: i <= growth.currentStage ? "#EAB947" : "hsl(150, 12%, 22%)",
                      opacity: i <= growth.currentStage ? 1 : 0.4,
                    }}
                  />
                  <span className="text-[9px] text-muted-foreground text-center leading-tight">{stage}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Weather */}
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Current Weather</h3>
          {loading ? (
            <div className="p-4 rounded-xl border border-border bg-accent/10">
              <div className="text-sm text-muted-foreground animate-pulse">Loading…</div>
            </div>
          ) : weather ? (
            <div className="p-4 rounded-xl border border-border bg-accent/15 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-3xl font-light text-foreground">{Math.round(weather.temperature_2m)}°C</span>
                <span className="text-sm text-muted-foreground">{weatherCodes[weather.weather_code] || "Unknown"}</span>
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

        {/* Historical Yield */}
        {yields.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" /> Historical Yield (t/ha)
            </h3>
            <div className="p-4 rounded-xl border border-border bg-accent/15">
              <div className="flex items-end gap-2 h-24">
                {yields.map((y) => {
                  const maxY = Math.max(...yields.map((yy) => yy.yield));
                  const heightPct = (y.yield / maxY) * 100;
                  return (
                    <div key={y.year} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] text-foreground font-medium">{y.yield}</span>
                      <div
                        className="w-full rounded-t-md transition-all duration-500"
                        style={{ height: `${heightPct}%`, backgroundColor: "#EAB947", minHeight: 4 }}
                      />
                      <span className="text-[10px] text-muted-foreground">{y.year}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                {lastYield >= 0 ? <TrendingUp className="w-3.5 h-3.5 text-field-green" /> : <TrendingDown className="w-3.5 h-3.5 text-destructive" />}
                <span>{lastYield >= 0 ? "+" : ""}{lastYield.toFixed(1)} t/ha vs last year</span>
              </div>
            </div>
          </div>
        )}

        {/* Scouting Tasks */}
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Scouting Tasks</h3>
          <div className="space-y-2">
            {scoutingTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-accent/10 transition-all duration-200 hover:bg-accent/20"
              >
                {task.status === "done" ? (
                  <CheckCircle className="w-4 h-4 text-field-green flex-shrink-0" />
                ) : task.priority === "high" ? (
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: "#EAB947" }} />
                ) : (
                  <Sprout className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
                <span className={`text-sm flex-1 ${task.status === "done" ? "text-muted-foreground line-through" : "text-foreground"}`}>
                  {task.label}
                </span>
                {task.priority === "high" && task.status !== "done" && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border" style={{ borderColor: "#EAB94766", color: "#EAB947" }}>
                    Urgent
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FieldDetailView;
