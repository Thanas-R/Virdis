import { useState, useEffect } from "react";
import {
  ArrowLeft,
  Droplets,
  Wind,
  Sprout,
  AlertTriangle,
  CheckCircle,
  MapPin,
  Pencil,
  Save,
  X,
  TrendingUp,
  Wheat,
} from "lucide-react";
import { Field } from "@/data/fields";

interface FieldDetailViewProps {
  field: Field;
  onBack: () => void;
  onUpdateField?: (field: Field) => void;
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

// Crop growth stages based on common agriculture
const cropGrowthStages: Record<string, { stages: string[]; current: number }> = {
  Maize: { stages: ["Germination", "Seedling", "Vegetative", "Tasseling", "Grain Fill", "Maturity"], current: 3 },
  Grapes: { stages: ["Bud Break", "Flowering", "Fruit Set", "Véraison", "Ripening", "Harvest"], current: 4 },
  Sunflower: { stages: ["Emergence", "Vegetative", "Bud Stage", "Flowering", "Seed Fill", "Maturity"], current: 2 },
  Apple: { stages: ["Dormant", "Bud Swell", "Bloom", "Petal Fall", "Fruit Dev", "Harvest"], current: 4 },
};

const historicalYield: Record<string, { year: number; yield: number }[]> = {
  Maize: [{ year: 2020, yield: 8.2 }, { year: 2021, yield: 9.1 }, { year: 2022, yield: 7.8 }, { year: 2023, yield: 9.5 }],
  Grapes: [{ year: 2020, yield: 6.5 }, { year: 2021, yield: 7.2 }, { year: 2022, yield: 5.9 }, { year: 2023, yield: 7.8 }],
  Sunflower: [{ year: 2020, yield: 2.1 }, { year: 2021, yield: 2.4 }, { year: 2022, yield: 1.9 }, { year: 2023, yield: 2.6 }],
  Apple: [{ year: 2020, yield: 15.0 }, { year: 2021, yield: 16.2 }, { year: 2022, yield: 14.5 }, { year: 2023, yield: 17.1 }],
};

const scoutingTasks = [
  { id: 1, label: "Check irrigation system", status: "pending", priority: "high" },
  { id: 2, label: "Soil sampling - Zone A", status: "done", priority: "medium" },
  { id: 3, label: "Pest inspection", status: "pending", priority: "low" },
  { id: 4, label: "Fertilizer application", status: "pending", priority: "medium" },
];

const FieldDetailView = ({ field, onBack, onUpdateField }: FieldDetailViewProps) => {
  const [weather, setWeather] = useState<FieldWeather | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(field.name);
  const [editCrop, setEditCrop] = useState(field.crop);
  const [editArea, setEditArea] = useState(field.area.toString());

  useEffect(() => {
    setEditName(field.name);
    setEditCrop(field.crop);
    setEditArea(field.area.toString());
  }, [field]);

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

  const handleSave = () => {
    if (onUpdateField) {
      onUpdateField({
        ...field,
        name: editName,
        crop: editCrop,
        area: parseFloat(editArea) || field.area,
      });
    }
    setEditing(false);
  };

  const growth = cropGrowthStages[field.crop] || { stages: ["Unknown"], current: 0 };
  const yields = historicalYield[field.crop] || [];

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
          <div className="flex-1">
            {editing ? (
              <input value={editName} onChange={(e) => setEditName(e.target.value)} className="text-sm font-semibold text-foreground bg-secondary/50 border border-border rounded px-2 py-1 w-full" />
            ) : (
              <>
                <h2 className="text-sm font-semibold text-foreground">{field.name}</h2>
                <p className="text-xs text-muted-foreground">{field.crop} · {field.area} ha</p>
              </>
            )}
          </div>
          <button
            onClick={() => editing ? handleSave() : setEditing(true)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors"
          >
            {editing ? <Save className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Field Info Grid */}
        <div className="p-4 rounded-xl border border-border bg-accent/15">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Field Info</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">Area</span>
              {editing ? (
                <input value={editArea} onChange={(e) => setEditArea(e.target.value)} className="text-foreground font-medium bg-secondary/50 border border-border rounded px-2 py-0.5 w-full text-sm" />
              ) : (
                <div className="text-foreground font-medium">{field.area} ha</div>
              )}
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Crop</span>
              {editing ? (
                <input value={editCrop} onChange={(e) => setEditCrop(e.target.value)} className="text-foreground font-medium bg-secondary/50 border border-border rounded px-2 py-0.5 w-full text-sm" />
              ) : (
                <div className="text-foreground font-medium">{field.cropEmoji} {field.crop}</div>
              )}
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Location</span>
              <div className="text-foreground font-medium text-xs truncate flex items-center gap-1">
                <MapPin className="w-3 h-3 text-muted-foreground" /> {field.location}
              </div>
            </div>
            {field.ndviChange !== undefined && (
              <div>
                <span className="text-xs text-muted-foreground">NDVI Change</span>
                <div className={`font-semibold ${field.ndviChange >= 0 ? "text-field-green" : "text-destructive"}`}>
                  {field.ndviChange >= 0 ? "+" : ""}{field.ndviChange.toFixed(2)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Crop Growth Stage */}
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Wheat className="w-3.5 h-3.5" /> Crop Growth Stage
          </h3>
          <div className="p-4 rounded-xl border border-border bg-accent/15">
            <div className="flex items-center gap-1 mb-2">
              {growth.stages.map((stage, i) => (
                <div key={stage} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className={`w-full h-1.5 rounded-full ${i <= growth.current ? "bg-primary" : "bg-border"}`}
                  />
                  <span className={`text-[9px] text-center ${i === growth.current ? "text-primary font-medium" : "text-muted-foreground"}`}>
                    {stage}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Currently in <span className="text-foreground font-medium">{growth.stages[growth.current]}</span> stage
            </p>
          </div>
        </div>

        {/* Historical Yield */}
        {yields.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" /> Historical Yield (t/ha)
            </h3>
            <div className="p-4 rounded-xl border border-border bg-accent/15">
              <div className="flex items-end gap-3 h-20">
                {yields.map((y) => {
                  const maxYield = Math.max(...yields.map((v) => v.yield));
                  const height = (y.yield / maxYield) * 100;
                  return (
                    <div key={y.year} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] text-foreground font-medium">{y.yield}</span>
                      <div
                        className="w-full rounded-t-sm"
                        style={{ height: `${height}%`, backgroundColor: "hsl(var(--chart-gold))" }}
                      />
                      <span className="text-[10px] text-muted-foreground">{y.year}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

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

        {/* Scouting Tasks */}
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Scouting Tasks</h3>
          <div className="space-y-2">
            {scoutingTasks.map((task) => (
              <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-accent/10 transition-all duration-200 hover:bg-accent/20">
                {task.status === "done" ? (
                  <CheckCircle className="w-4 h-4 text-field-green flex-shrink-0" />
                ) : task.priority === "high" ? (
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: "hsl(var(--chart-gold))" }} />
                ) : (
                  <Sprout className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
                <span className={`text-sm flex-1 ${task.status === "done" ? "text-muted-foreground line-through" : "text-foreground"}`}>
                  {task.label}
                </span>
                {task.priority === "high" && task.status !== "done" && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border" style={{ borderColor: "hsl(var(--chart-gold) / 0.4)", color: "hsl(var(--chart-gold))" }}>
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
