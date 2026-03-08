import { useState, useEffect } from "react";
import { CalendarArrowUp, CalendarArrowDown, Droplets, Wind, Sprout, Thermometer, Leaf, TrendingUp, Loader2 } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Area, AreaChart, PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { Field, haToAcres } from "@/data/fields";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";

const CHART_GOLD = "#EAB947";
const CHART_CREAM = "#F7F4E4";
const CHART_GREEN = "#7BC75B";
const CHART_BLUE = "#61AFEF";

const tooltipStyle = {
  backgroundColor: "hsl(150, 18%, 14%)",
  border: "1px solid hsl(150, 12%, 22%)",
  borderRadius: "8px",
  color: "hsl(60, 20%, 85%)",
  fontSize: "12px"
};

interface LiveWeather {
  temperature: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  feelsLike: number;
}

const weatherDescriptions: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Rime fog", 51: "Light drizzle", 53: "Moderate drizzle",
  55: "Dense drizzle", 61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
  71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
  80: "Slight showers", 81: "Moderate showers", 82: "Violent showers", 95: "Thunderstorm"
};

const LAND_USE_COLORS: Record<string, string> = {
  "Cropland": "#2F6936",
  "Tree cover": "#4A9E5C",
  "Grassland": "#72B755",
  "Built-up": "#D34739",
  "Water": "#2196F3",
  "Bare/sparse": "#D6AA43",
  "Shrubland": "#A5D6A7",
  "Wetland": "#457b9d",
  "Snow/ice": "#e0e1dd",
  "Mangroves": "#1b4332",
  "Moss/lichen": "#b5e48c",
};

const CustomLandUseTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const { name, value, color } = payload[0].payload;
  return (
    <div className="rounded-lg px-3 py-2 shadow-xl border border-border/50" style={{ background: "hsl(150, 18%, 12%)" }}>
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
        <span className="text-xs font-semibold" style={{ color }}>{name}</span>
      </div>
      <div className="text-sm font-bold text-foreground">{value}%</div>
    </div>
  );
};

const CustomChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 shadow-xl border border-border/50" style={{ background: "hsl(150, 18%, 12%)" }}>
      <div className="text-[10px] text-muted-foreground mb-1.5">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.stroke || p.fill || p.color }} />
          <span className="text-muted-foreground">{p.name || p.dataKey}</span>
          <span className="font-semibold text-foreground ml-auto">{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</span>
        </div>
      ))}
    </div>
  );
};

function getFieldCenter(field: Field) {
  const coords = field.coordinates[0];
  const lat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
  const lng = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
  return { lat, lng };
}

interface WeatherViewProps {
  activeField: Field | null;
  selectedFields: Field[];
}

const GEE_ANALYTICS_CACHE_KEY = "gee-analytics-cache";

function getGeeCache(): Record<string, { data: any; timestamp: number }> {
  try { const c = localStorage.getItem(GEE_ANALYTICS_CACHE_KEY); return c ? JSON.parse(c) : {}; } catch { return {}; }
}
function setGeeCache(fieldId: string, data: any) {
  const cache = getGeeCache();
  cache[fieldId] = { data, timestamp: Date.now() };
  localStorage.setItem(GEE_ANALYTICS_CACHE_KEY, JSON.stringify(cache));
}

const WeatherView = ({ activeField, selectedFields }: WeatherViewProps) => {
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [startDate, setStartDate] = useState<Date>(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d;
  });
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [dailyData, setDailyData] = useState<any[]>([]);
  const [soilMoistureData, setSoilMoistureData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [liveWeather, setLiveWeather] = useState<LiveWeather | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);

  // GEE analytics state
  const [geeData, setGeeData] = useState<any>(null);
  const [geeLoading, setGeeLoading] = useState(false);

  // NDVI time-series state
  const [ndviTimeSeries, setNdviTimeSeries] = useState<any>(null);
  const [ndviTsLoading, setNdviTsLoading] = useState(false);

  const effectiveField = activeField || selectedFields[0];

  // Fetch GEE analytics
  useEffect(() => {
    if (!effectiveField) { setGeeData(null); return; }
    const cache = getGeeCache();
    const cached = cache[effectiveField.id];
    if (cached && Date.now() - cached.timestamp < 3600000) {
      setGeeData(cached.data);
      return;
    }
    const fetchGee = async () => {
      setGeeLoading(true);
      try {
        const polygon = effectiveField.coordinates[0];
        const { data, error } = await supabase.functions.invoke("gee-analytics", {
          body: { polygon, analyses: ["land_use", "vegetation", "suitability"] },
        });
        if (error) throw error;
        setGeeData(data);
        setGeeCache(effectiveField.id, data);
      } catch (e) {
        console.error("GEE analytics error:", e);
        setGeeData(null);
      } finally { setGeeLoading(false); }
    };
    fetchGee();
  }, [effectiveField?.id]);

  // Fetch NDVI time-series
  useEffect(() => {
    if (!effectiveField) { setNdviTimeSeries(null); return; }
    const tsCache = getGeeCache();
    const tsCached = tsCache[`ts-${effectiveField.id}`];
    if (tsCached && Date.now() - tsCached.timestamp < 3600000) {
      setNdviTimeSeries(tsCached.data);
      return;
    }
    const fetchTs = async () => {
      setNdviTsLoading(true);
      try {
        const polygon = effectiveField.coordinates[0];
        const { data, error } = await supabase.functions.invoke("ndvi-timeseries", {
          body: { polygon },
        });
        if (error) throw error;
        setNdviTimeSeries(data);
        setGeeCache(`ts-${effectiveField.id}`, data);
      } catch (e) {
        console.error("NDVI time-series error:", e);
        setNdviTimeSeries(null);
      } finally { setNdviTsLoading(false); }
    };
    fetchTs();
  }, [effectiveField?.id]);

  // Fetch live weather
  useEffect(() => {
    if (!effectiveField) return;
    const fetchLive = async () => {
      setLiveLoading(true);
      try {
        const { lat, lng } = getFieldCenter(effectiveField);
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,apparent_temperature,weather_code&timezone=auto`);
        const data = await res.json();
        const c = data.current;
        setLiveWeather({ temperature: Math.round(c.temperature_2m), humidity: c.relative_humidity_2m, windSpeed: Math.round(c.wind_speed_10m), weatherCode: c.weather_code, feelsLike: Math.round(c.apparent_temperature) });
      } catch {setLiveWeather(null);} finally
      {setLiveLoading(false);}
    };
    fetchLive();
  }, [effectiveField]);

  // Fetch historical weather + soil moisture
  useEffect(() => {
    if (!effectiveField) return;
    const fetchWeatherData = async () => {
      setLoading(true);
      try {
        const { lat, lng } = getFieldCenter(effectiveField);
        const start = format(startDate, "yyyy-MM-dd");
        const end = format(endDate, "yyyy-MM-dd");
        const [weatherRes, soilRes] = await Promise.all([
        fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${start}&end_date=${end}&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,et0_fao_evapotranspiration`),
        fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${start}&end_date=${end}&daily=soil_moisture_0_to_7cm_mean,soil_moisture_7_to_28cm_mean`)]
        );
        const data = await weatherRes.json();
        const soilData = await soilRes.json();

        if (data.daily) {
          const daily = data.daily.time.map((date: string, i: number) => ({
            date, label: format(new Date(date + "T00:00:00"), "MMM dd"),
            precipitation: data.daily.precipitation_sum[i] || 0,
            tempMax: data.daily.temperature_2m_max[i], tempMin: data.daily.temperature_2m_min[i],
            evap: data.daily.et0_fao_evapotranspiration[i] || 0
          }));
          const monthMap = new Map<string, {precip: number;count: number;tMax: number;tMin: number;evap: number;}>();
          daily.forEach((d: any) => {
            const key = format(new Date(d.date + "T00:00:00"), "MMM yyyy");
            const m = monthMap.get(key) || { precip: 0, count: 0, tMax: -999, tMin: 999, evap: 0 };
            m.precip += d.precipitation;m.count++;m.tMax = Math.max(m.tMax, d.tempMax ?? -999);m.tMin = Math.min(m.tMin, d.tempMin ?? 999);m.evap += d.evap;
            monthMap.set(key, m);
          });
          let accumulated = 0;
          const monthly = Array.from(monthMap.entries()).map(([month, v]) => {
            accumulated += v.precip;
            return { month: month.split(" ")[0], precipitation: Math.round(v.precip * 10) / 10, accumulated: Math.round(accumulated * 10) / 10, tempMax: Math.round(v.tMax), tempMin: Math.round(v.tMin), evapotranspiration: Math.round(v.evap * 10) / 10 };
          });
          setMonthlyData(monthly);
          setDailyData(daily.filter((_: any, i: number) => i % 2 === 0));
        }
        if (soilData.daily) {
          const soilMonthMap = new Map<string, {shallow: number;deep: number;count: number;}>();
          soilData.daily.time.forEach((date: string, i: number) => {
            const key = format(new Date(date + "T00:00:00"), "MMM yyyy");
            const m = soilMonthMap.get(key) || { shallow: 0, deep: 0, count: 0 };
            m.shallow += soilData.daily.soil_moisture_0_to_7cm_mean?.[i] || 0;
            m.deep += soilData.daily.soil_moisture_7_to_28cm_mean?.[i] || 0;
            m.count++;soilMonthMap.set(key, m);
          });
          const soilMonthly = Array.from(soilMonthMap.entries()).map(([month, v]) => ({
            month: month.split(" ")[0], shallow: Math.round(v.shallow / v.count * 1000) / 10, deep: Math.round(v.deep / v.count * 1000) / 10
          }));
          setSoilMoistureData(soilMonthly);
        }
      } catch (e) {console.error("Failed to fetch weather data", e);} finally
      {setLoading(false);}
    };
    fetchWeatherData();
  }, [startDate, endDate, effectiveField]);

  // Prepare land use chart data
  const landUseData = geeData?.land_use
    ? Object.entries(geeData.land_use).map(([name, pct]) => ({
        name,
        value: pct as number,
        color: LAND_USE_COLORS[name] || "#888",
      })).sort((a, b) => b.value - a.value)
    : null;

  // Prepare suitability radar data
  const suitabilityData = geeData?.suitability
    ? [
        { subject: "Soil Quality", value: geeData.suitability.soil_quality ?? 0 },
        { subject: "Water Access", value: geeData.suitability.water_access ?? 0 },
        { subject: "Climate", value: geeData.suitability.climate ?? 0 },
        { subject: "Topography", value: geeData.suitability.topography ?? 0 },
        { subject: "Drainage", value: geeData.suitability.drainage ?? 0 },
        { subject: "Nutrients", value: geeData.suitability.nutrient_level ?? 0 },
      ].filter((d) => d.value > 0)
    : null;

  const vegetation = geeData?.vegetation;

  // NDVI time-series chart data
  const ndviChartData = ndviTimeSeries?.timeseries?.map((p: any) => ({
    date: format(new Date(p.date + "T00:00:00"), "MMM dd"),
    ndvi: p.ndvi,
  })) || [];

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-border flex-wrap">
        <h1 className="text-lg font-semibold text-foreground">Field Analytics</h1>
        {effectiveField &&
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: effectiveField.color }} />
            {effectiveField.name} · {effectiveField.crop} · {haToAcres(effectiveField.area)} acres
          </div>
        }
        <div className="flex-1" />
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex items-center gap-2 border border-border rounded-lg px-3 py-2 hover:bg-accent/30 transition-colors">
              <div><div className="text-xs text-muted-foreground">Start</div><div className="text-sm text-foreground">{format(startDate, "MMM d, yyyy")}</div></div>
              <CalendarArrowUp className="w-4 h-4 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={startDate} onSelect={(d) => d && setStartDate(d)} className="pointer-events-auto" /></PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex items-center gap-2 border border-border rounded-lg px-3 py-2 hover:bg-accent/30 transition-colors">
              <div><div className="text-xs text-muted-foreground">End</div><div className="text-sm text-foreground">{format(endDate, "MMM d, yyyy")}</div></div>
              <CalendarArrowDown className="w-4 h-4 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={endDate} onSelect={(d) => d && setEndDate(d)} className="pointer-events-auto" /></PopoverContent>
        </Popover>
      </div>

      {/* Live Weather */}
      {effectiveField &&
      <div className="px-6 py-3 border-b border-border">
          {liveLoading ? <div className="text-sm text-muted-foreground animate-pulse">Loading live conditions…</div> :
        liveWeather ?
        <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                  <div className="text-3xl font-light text-foreground">{liveWeather.temperature}°C</div>
                  <div>
                    <div className="text-sm text-foreground">{weatherDescriptions[liveWeather.weatherCode] || "Unknown"}</div>
                    <div className="text-xs text-muted-foreground">Feels like {liveWeather.feelsLike}°C</div>
                  </div>
                </div>
                <div className="flex gap-5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><Droplets className="w-3.5 h-3.5" />{liveWeather.humidity}%</span>
                  <span className="flex items-center gap-1.5"><Wind className="w-3.5 h-3.5" />{liveWeather.windSpeed} km/h</span>
                </div>
                <div className="flex-1" />
                <span className="text-[10px] italic" style={{ color: "#EAB947" }}>⚠ Data may not always be accurate</span>
              </div> :
        <div className="text-sm text-muted-foreground">Weather unavailable</div>
        }
        </div>
      }

      {/* Charts */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {!effectiveField ?
        <div className="flex flex-col items-center justify-center py-20 text-center">
            <Sprout className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Select a field to view analytics</p>
          </div> :
        loading ?
        <div className="flex items-center justify-center py-20">
            <div className="text-muted-foreground animate-pulse text-sm">Fetching analytics for {effectiveField.name}…</div>
          </div> :

        <>
            {/* Key Metrics Cards */}
            <div className="grid grid-cols-4 gap-3 animate-fade-in">
              {[
            { label: "Avg NDVI", value: ndviTimeSeries?.mean_ndvi != null ? ndviTimeSeries.mean_ndvi.toFixed(3) : (vegetation?.mean_ndvi != null ? vegetation.mean_ndvi.toFixed(3) : "N/A"), icon: Leaf, color: CHART_GREEN },
            { label: "Avg Moisture", value: soilMoistureData.length > 0 ? `${(soilMoistureData.reduce((s: number, d: any) => s + d.shallow, 0) / soilMoistureData.length).toFixed(1)}%` : "N/A", icon: Droplets, color: CHART_BLUE },
            { label: "Temp Range", value: monthlyData.length > 0 ? `${Math.min(...monthlyData.map((d) => d.tempMin))}–${Math.max(...monthlyData.map((d) => d.tempMax))}°C` : "N/A", icon: Thermometer, color: CHART_GOLD },
            { label: "Total Rain", value: monthlyData.length > 0 ? `${monthlyData[monthlyData.length - 1]?.accumulated || 0} mm` : "N/A", icon: TrendingUp, color: CHART_CREAM }].
            map((m, i) =>
            <div key={i} className="p-3 rounded-xl border border-border bg-accent/15 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><m.icon className="w-3.5 h-3.5" />{m.label}</div>
                  <div className="text-lg font-semibold text-foreground">{m.value}</div>
                </div>
            )}
            </div>

            {/* Land Use / Suitability side by side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in" style={{ animationDelay: "100ms" }}>
              {/* Land Use Donut */}
              <div className="flex flex-col">
                <h3 className="text-sm font-medium text-foreground mb-4">Regional Land Use</h3>
                <div className="rounded-2xl border border-border/40 p-4 w-full h-[290px] flex flex-col items-center justify-center" style={{ background: "hsla(150, 18%, 14%, 0.6)" }}>
                  {geeLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" /> Fetching ESA WorldCover…
                    </div>
                  ) : landUseData && landUseData.length > 0 ? (
                    <div className="flex flex-col items-center w-full h-full justify-center">
                      <ResponsiveContainer width="100%" height={160}>
                        <PieChart>
                          <Pie data={landUseData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={35} outerRadius={62} paddingAngle={2} strokeWidth={0} label={false}>
                            {landUseData.map((entry, i) => (
                              <Cell key={i} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomLandUseTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-2">
                        {landUseData.map((entry, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-[10px]">
                            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: entry.color }} />
                            <span className="text-muted-foreground">{entry.name}</span>
                            <span className="text-foreground font-semibold">{entry.value}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-sm text-muted-foreground">
                      <Leaf className="w-6 h-6 mx-auto mb-2 opacity-40" />
                      No satellite data available for this field.
                    </div>
                  )}
                </div>
              </div>

              {/* Suitability Radar */}
              <div className="flex flex-col">
                <h3 className="text-sm font-medium text-foreground mb-4">Land Suitability Score</h3>
                <div className="rounded-2xl border border-border/40 p-4 w-full h-[290px] flex items-center justify-center" style={{ background: "hsla(150, 18%, 14%, 0.6)" }}>
                  {geeLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" /> Fetching suitability data…
                    </div>
                  ) : suitabilityData && suitabilityData.length > 0 ? (
                    <div className="w-full">
                      <ResponsiveContainer width="100%" height={220}>
                        <RadarChart data={suitabilityData} cx="50%" cy="50%" outerRadius="70%">
                          <PolarGrid stroke="hsl(150, 12%, 22%)" />
                          <PolarAngleAxis dataKey="subject" tick={{ fill: "hsl(150, 10%, 55%)", fontSize: 10 }} />
                          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: "hsl(150, 10%, 55%)", fontSize: 9 }} />
                          <Radar name="Score" dataKey="value" stroke={CHART_GREEN} fill={CHART_GREEN} fillOpacity={0.25} strokeWidth={2} />
                          <Tooltip content={<CustomChartTooltip />} />
                        </RadarChart>
                      </ResponsiveContainer>
                      {geeData?.suitability?.raw && (
                        <div className="flex gap-3 justify-center text-[10px] text-muted-foreground mt-1">
                          {geeData.suitability.raw.elevation_m != null && <span>Elev: {geeData.suitability.raw.elevation_m}m</span>}
                          {geeData.suitability.raw.slope_deg != null && <span>Slope: {geeData.suitability.raw.slope_deg}°</span>}
                          {geeData.suitability.raw.annual_rainfall_mm != null && <span>Rain: {geeData.suitability.raw.annual_rainfall_mm}mm/yr</span>}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center text-sm text-muted-foreground">
                      <Leaf className="w-6 h-6 mx-auto mb-2 opacity-40" />
                      No satellite data available for this field.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Accumulated Precipitation */}
            <div className="animate-fade-in" style={{ animationDelay: "150ms" }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-foreground">Accumulated Precipitation, mm</h3>
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: CHART_GOLD }} />Precipitation</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: CHART_CREAM }} />Evapotranspiration</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={monthlyData}>
                  <defs><linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={CHART_GOLD} stopOpacity={0.3} /><stop offset="95%" stopColor={CHART_GOLD} stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(150, 12%, 22%)" />
                  <XAxis dataKey="month" stroke="hsl(150, 10%, 55%)" fontSize={11} />
                  <YAxis stroke="hsl(150, 10%, 55%)" fontSize={11} />
                  <Tooltip content={<CustomChartTooltip />} />
                  <Area type="monotone" dataKey="accumulated" stroke={CHART_GOLD} strokeWidth={2.5} fill="url(#goldGrad)" dot={{ r: 3, fill: CHART_GOLD }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="evapotranspiration" stroke={CHART_CREAM} strokeWidth={1.5} dot={false} strokeDasharray="5 5" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Daily Precipitation */}
            <div className="animate-fade-in" style={{ animationDelay: "200ms" }}>
              <h3 className="text-sm font-medium text-foreground mb-4">Daily Precipitation, mm</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(150, 12%, 22%)" />
                  <XAxis dataKey="label" stroke="hsl(150, 10%, 55%)" fontSize={10} interval="preserveStartEnd" />
                  <YAxis stroke="hsl(150, 10%, 55%)" fontSize={11} />
                  <Tooltip content={<CustomChartTooltip />} />
                  <Bar dataKey="precipitation" fill={CHART_GOLD} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Temperature Range */}
            <div className="animate-fade-in" style={{ animationDelay: "250ms" }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-foreground">Temperature Range, °C</h3>
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: CHART_GOLD }} />Max</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: CHART_CREAM }} />Min</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(150, 12%, 22%)" />
                  <XAxis dataKey="month" stroke="hsl(150, 10%, 55%)" fontSize={11} />
                  <YAxis stroke="hsl(150, 10%, 55%)" fontSize={11} />
                  <Tooltip content={<CustomChartTooltip />} />
                  <Line type="monotone" dataKey="tempMax" stroke={CHART_GOLD} strokeWidth={2} dot={{ r: 3, fill: CHART_GOLD }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="tempMin" stroke={CHART_CREAM} strokeWidth={2} dot={{ r: 3, fill: CHART_CREAM }} strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Soil Moisture */}
            {soilMoistureData.length > 0 &&
          <div className="animate-fade-in" style={{ animationDelay: "300ms" }}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-foreground">Soil Moisture, %</h3>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: CHART_GOLD }} />Surface (0-7cm)</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: CHART_CREAM }} />Deep (7-28cm)</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={soilMoistureData}>
                    <defs><linearGradient id="soilGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={CHART_GOLD} stopOpacity={0.25} /><stop offset="95%" stopColor={CHART_GOLD} stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(150, 12%, 22%)" />
                    <XAxis dataKey="month" stroke="hsl(150, 10%, 55%)" fontSize={11} />
                    <YAxis stroke="hsl(150, 10%, 55%)" fontSize={11} />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Area type="monotone" dataKey="shallow" stroke={CHART_GOLD} strokeWidth={2} fill="url(#soilGrad)" dot={{ r: 3, fill: CHART_GOLD }} />
                    <Line type="monotone" dataKey="deep" stroke={CHART_CREAM} strokeWidth={1.5} dot={false} strokeDasharray="5 5" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
          }

            {/* NDVI Vegetation Trend */}
            <div className="animate-fade-in" style={{ animationDelay: "350ms" }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-foreground">NDVI Vegetation Trend (90 days)</h3>
                {ndviTimeSeries?.growth_stage && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-accent/30 text-foreground">{ndviTimeSeries.growth_stage}</span>
                )}
              </div>
              {ndviTsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground p-3">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading NDVI time-series…
                </div>
              ) : ndviChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={ndviChartData}>
                    <defs>
                      <linearGradient id="ndviGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_GREEN} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={CHART_GREEN} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(150, 12%, 22%)" />
                    <XAxis dataKey="date" stroke="hsl(150, 10%, 55%)" fontSize={10} interval="preserveStartEnd" />
                    <YAxis stroke="hsl(150, 10%, 55%)" fontSize={11} domain={[0, 1]} />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Area type="monotone" dataKey="ndvi" stroke={CHART_GREEN} strokeWidth={2.5} fill="url(#ndviGrad)" dot={{ r: 3, fill: CHART_GREEN }} activeDot={{ r: 5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="p-4 rounded-xl border border-border bg-accent/10 text-sm text-muted-foreground">
                  No satellite data available for this field.
                </div>
              )}
            </div>

            {/* Crop Growth Indicators */}
            <div className="animate-fade-in" style={{ animationDelay: "400ms" }}>
              <h3 className="text-sm font-medium text-foreground mb-4">Crop Growth Indicators</h3>
              {(geeLoading || ndviTsLoading) ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground p-3">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading satellite indices…
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    {
                      label: "Growth Rate",
                      value: ndviTimeSeries?.growth_rate != null ? `${ndviTimeSeries.growth_rate > 0 ? "+" : ""}${ndviTimeSeries.growth_rate}/day` : "N/A",
                      detail: ndviTimeSeries?.growth_rate != null ? "NDVI change per day" : "No time-series data",
                      color: ndviTimeSeries?.growth_rate != null ? (ndviTimeSeries.growth_rate >= 0 ? CHART_GREEN : "#d73027") : "hsl(150, 10%, 55%)",
                    },
                    {
                      label: "Canopy Cover",
                      value: ndviTimeSeries?.canopy_cover != null ? `${ndviTimeSeries.canopy_cover}%` : (vegetation?.canopy_cover_pct != null ? `${vegetation.canopy_cover_pct}%` : "N/A"),
                      detail: ndviTimeSeries?.canopy_cover != null ? "NDVI > 0.5 observations" : "No satellite data",
                      color: (ndviTimeSeries?.canopy_cover ?? vegetation?.canopy_cover_pct) != null ? CHART_GREEN : "hsl(150, 10%, 55%)",
                    },
                    {
                      label: "Biomass Est.",
                      value: ndviTimeSeries?.biomass_estimate != null ? ndviTimeSeries.biomass_estimate.toFixed(2) : (vegetation?.biomass_estimate_kg_ha != null ? `${vegetation.biomass_estimate_kg_ha} kg/ha` : "N/A"),
                      detail: ndviTimeSeries?.biomass_estimate != null ? "mean NDVI × 8" : "No satellite data",
                      color: (ndviTimeSeries?.biomass_estimate ?? vegetation?.biomass_estimate_kg_ha) != null ? CHART_GOLD : "hsl(150, 10%, 55%)",
                    },
                  ].map((item, i) => (
                    <div key={i} className="p-3 rounded-xl border border-border bg-accent/10">
                      <div className="text-xs text-muted-foreground mb-1">{item.label}</div>
                      <div className="text-sm font-semibold" style={{ color: item.color }}>{item.value}</div>
                      <div className="text-[10px] text-muted-foreground mt-1">{item.detail}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        }
      </div>
    </div>);

};

export default WeatherView;
