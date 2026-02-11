import { useState, useEffect } from "react";
import {
  ArrowLeft,
  Droplets,
  Wind,
  Sprout,
  AlertTriangle,
  CheckCircle,
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
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  80: "Slight showers",
  81: "Moderate showers",
  82: "Violent showers",
  95: "Thunderstorm",
};

const scoutingTasks = [
  { id: 1, label: "Check irrigation system", status: "pending", priority: "high" },
  { id: 2, label: "Soil sampling - Zone A", status: "done", priority: "medium" },
  { id: 3, label: "Pest inspection", status: "pending", priority: "low" },
  { id: 4, label: "Fertilizer application", status: "pending", priority: "medium" },
];

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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border">
        <button
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 flex-1">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: field.color + "20" }}
          >
            <span className="text-lg">{field.cropEmoji}</span>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {field.name}
            </h2>
            <p className="text-xs text-muted-foreground">
              {field.crop} · {field.area} ha
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Field Info Grid */}
        <div className="p-4 rounded-xl border border-border bg-accent/15">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Field Info
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">Area</span>
              <div className="text-foreground font-medium">{field.area} ha</div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Crop</span>
              <div className="text-foreground font-medium">
                {field.cropEmoji} {field.crop}
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Location</span>
              <div className="text-foreground font-medium text-xs truncate">
                {field.location}
              </div>
            </div>
            {field.ndviChange !== undefined && (
              <div>
                <span className="text-xs text-muted-foreground">
                  NDVI Change
                </span>
                <div
                  className={`font-semibold ${
                    field.ndviChange >= 0
                      ? "text-field-green"
                      : "text-destructive"
                  }`}
                >
                  {field.ndviChange >= 0 ? "+" : ""}
                  {field.ndviChange.toFixed(2)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Weather */}
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Current Weather
          </h3>
          {loading ? (
            <div className="p-4 rounded-xl border border-border bg-accent/10">
              <div className="text-sm text-muted-foreground animate-pulse">
                Loading…
              </div>
            </div>
          ) : weather ? (
            <div className="p-4 rounded-xl border border-border bg-accent/15 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-3xl font-light text-foreground">
                  {Math.round(weather.temperature_2m)}°C
                </span>
                <span className="text-sm text-muted-foreground">
                  {weatherCodes[weather.weather_code] || "Unknown"}
                </span>
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Droplets className="w-3.5 h-3.5" />
                  {weather.relative_humidity_2m}%
                </span>
                <span className="flex items-center gap-1.5">
                  <Wind className="w-3.5 h-3.5" />
                  {Math.round(weather.wind_speed_10m)} km/h
                </span>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-border bg-accent/10 text-sm text-muted-foreground">
              Weather unavailable
            </div>
          )}
        </div>

        {/* Scouting Tasks */}
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Scouting Tasks
          </h3>
          <div className="space-y-2">
            {scoutingTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-accent/10 transition-all duration-200 hover:bg-accent/20"
              >
                {task.status === "done" ? (
                  <CheckCircle className="w-4 h-4 text-field-green flex-shrink-0" />
                ) : task.priority === "high" ? (
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: "hsl(var(--chart-gold))" }} />
                ) : (
                  <Sprout className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
                <span
                  className={`text-sm flex-1 ${
                    task.status === "done"
                      ? "text-muted-foreground line-through"
                      : "text-foreground"
                  }`}
                >
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
