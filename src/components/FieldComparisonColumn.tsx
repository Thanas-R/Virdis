import { useState, useEffect } from "react";
import { Droplets, Wind, Leaf, Thermometer, TrendingUp, Loader2, Sprout } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Area, AreaChart, PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { Field, haToAcres } from "@/data/fields";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

const CHART_GOLD = "#C6B77E";
const CHART_CREAM = "#F7F4E4";
const CHART_GREEN = "#7BC75B";
const CHART_BLUE = "#61AFEF";

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

const GEE_ANALYTICS_CACHE_KEY = "gee-analytics-cache";

function getGeeCache(): Record<string, { data: any; timestamp: number }> {
  try { const c = localStorage.getItem(GEE_ANALYTICS_CACHE_KEY); return c ? JSON.parse(c) : {}; } catch { return {}; }
}

interface FieldComparisonColumnProps {
  field: Field;
  startDate: Date;
  endDate: Date;
  compact?: boolean;
  gradientIdSuffix?: string;
}

const FieldComparisonColumn = ({ field, startDate, endDate, compact = false, gradientIdSuffix = "" }: FieldComparisonColumnProps) => {
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [dailyData, setDailyData] = useState<any[]>([]);
  const [soilMoistureData, setSoilMoistureData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [geeData, setGeeData] = useState<any>(null);
  const [geeLoading, setGeeLoading] = useState(false);
  const [ndviTimeSeries, setNdviTimeSeries] = useState<any>(null);
  const [ndviTsLoading, setNdviTsLoading] = useState(false);

  // Fetch GEE analytics
  useEffect(() => {
    const cache = getGeeCache();
    const cached = cache[field.id];
    if (cached && Date.now() - cached.timestamp < 3600000) {
      setGeeData(cached.data);
      return;
    }
    const fetchGee = async () => {
      setGeeLoading(true);
      try {
        const polygon = field.coordinates[0];
        const { data, error } = await supabase.functions.invoke("gee-analytics", {
          body: { polygon, analyses: ["land_use", "vegetation", "suitability"] },
        });
        if (error) throw error;
        setGeeData(data);
      } catch (e) {
        console.error("GEE analytics error:", e);
        setGeeData(null);
      } finally { setGeeLoading(false); }
    };
    fetchGee();
  }, [field.id]);

  // Fetch NDVI time-series
  useEffect(() => {
    const cache = getGeeCache();
    const cached = cache[`ts-${field.id}`];
    if (cached && Date.now() - cached.timestamp < 3600000) {
      setNdviTimeSeries(cached.data);
      return;
    }
    const fetchTs = async () => {
      setNdviTsLoading(true);
      try {
        const polygon = field.coordinates[0];
        const { data, error } = await supabase.functions.invoke("ndvi-timeseries", {
          body: { polygon },
        });
        if (error) throw error;
        setNdviTimeSeries(data);
      } catch (e) {
        console.error("NDVI time-series error:", e);
        setNdviTimeSeries(null);
      } finally { setNdviTsLoading(false); }
    };
    fetchTs();
  }, [field.id]);

  // Fetch weather data
  useEffect(() => {
    const fetchWeatherData = async () => {
      setLoading(true);
      try {
        const { lat, lng } = getFieldCenter(field);
        const start = format(startDate, "yyyy-MM-dd");
        const end = format(endDate, "yyyy-MM-dd");
        const [weatherRes, soilRes] = await Promise.all([
          fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${start}&end_date=${end}&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,et0_fao_evapotranspiration`),
          fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${start}&end_date=${end}&daily=soil_moisture_0_to_7cm_mean,soil_moisture_7_to_28cm_mean`),
        ]);
        const data = await weatherRes.json();
        const soilData = await soilRes.json();

        if (data.daily) {
          const daily = data.daily.time.map((date: string, i: number) => ({
            date, label: format(new Date(date + "T00:00:00"), "MMM dd"),
            precipitation: data.daily.precipitation_sum[i] || 0,
            tempMax: data.daily.temperature_2m_max[i], tempMin: data.daily.temperature_2m_min[i],
            evap: data.daily.et0_fao_evapotranspiration[i] || 0,
          }));
          const monthMap = new Map<string, { precip: number; count: number; tMax: number; tMin: number; evap: number }>();
          daily.forEach((d: any) => {
            const key = format(new Date(d.date + "T00:00:00"), "MMM yyyy");
            const m = monthMap.get(key) || { precip: 0, count: 0, tMax: -999, tMin: 999, evap: 0 };
            m.precip += d.precipitation; m.count++; m.tMax = Math.max(m.tMax, d.tempMax ?? -999); m.tMin = Math.min(m.tMin, d.tempMin ?? 999); m.evap += d.evap;
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
          const soilMonthMap = new Map<string, { shallow: number; deep: number; count: number }>();
          soilData.daily.time.forEach((date: string, i: number) => {
            const key = format(new Date(date + "T00:00:00"), "MMM yyyy");
            const m = soilMonthMap.get(key) || { shallow: 0, deep: 0, count: 0 };
            m.shallow += soilData.daily.soil_moisture_0_to_7cm_mean?.[i] || 0;
            m.deep += soilData.daily.soil_moisture_7_to_28cm_mean?.[i] || 0;
            m.count++; soilMonthMap.set(key, m);
          });
          const soilMonthly = Array.from(soilMonthMap.entries()).map(([month, v]) => ({
            month: month.split(" ")[0], shallow: Math.round(v.shallow / v.count * 1000) / 10, deep: Math.round(v.deep / v.count * 1000) / 10,
          }));
          setSoilMoistureData(soilMonthly);
        }
      } catch (e) { console.error("Failed to fetch weather data", e); }
      finally { setLoading(false); }
    };
    fetchWeatherData();
  }, [startDate, endDate, field.id]);

  const vegetation = geeData?.vegetation;
  const landUseData = geeData?.land_use
    ? Object.entries(geeData.land_use).map(([name, pct]) => ({
        name, value: pct as number, color: LAND_USE_COLORS[name] || "#888",
      })).sort((a, b) => b.value - a.value)
    : null;

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

  const ndviChartData = ndviTimeSeries?.timeseries?.map((p: any) => ({
    date: format(new Date(p.date + "T00:00:00"), "MMM dd"),
    ndvi: p.ndvi,
  })) || [];

  const chartHeight = compact ? 140 : 180;
  const sfx = gradientIdSuffix;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-muted-foreground animate-pulse text-sm">Loading analytics...</div>
      </div>
    );
  }

  return (
    <div key={field.id} className="animate-fade-in space-y-5">
      {/* Field header */}
      <div className="flex items-center gap-2 pb-2 border-b border-border/40">
        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: field.color }} />
        <span className="text-sm font-semibold text-foreground">{field.name}</span>
        <span className="text-xs text-muted-foreground">{field.crop} - {haToAcres(field.area)} acres</span>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Avg NDVI", value: ndviTimeSeries?.mean_ndvi != null ? ndviTimeSeries.mean_ndvi.toFixed(3) : (vegetation?.mean_ndvi != null ? vegetation.mean_ndvi.toFixed(3) : "N/A"), icon: Leaf, color: CHART_GREEN },
          { label: "Avg Moisture", value: soilMoistureData.length > 0 ? `${(soilMoistureData.reduce((s: number, d: any) => s + d.shallow, 0) / soilMoistureData.length).toFixed(1)}%` : "N/A", icon: Droplets, color: CHART_BLUE },
          { label: "Temp Range", value: monthlyData.length > 0 ? `${Math.min(...monthlyData.map((d) => d.tempMin))}-${Math.max(...monthlyData.map((d) => d.tempMax))}°C` : "N/A", icon: Thermometer, color: CHART_GOLD },
          { label: "Total Rain", value: monthlyData.length > 0 ? `${monthlyData[monthlyData.length - 1]?.accumulated || 0} mm` : "N/A", icon: TrendingUp, color: CHART_CREAM },
        ].map((m, i) => (
          <div key={i} className="p-2.5 rounded-xl border border-border bg-accent/15 space-y-0.5">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><m.icon className="w-3 h-3" />{m.label}</div>
            <div className="text-sm font-semibold text-foreground">{m.value}</div>
          </div>
        ))}
      </div>

      {/* Land Use + Suitability */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col">
          <h3 className="text-xs font-medium text-foreground mb-2">Land Use</h3>
          <div className="rounded-xl border border-border/40 p-3 h-[200px] flex flex-col items-center justify-center" style={{ background: "hsla(150, 18%, 14%, 0.6)" }}>
            {geeLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : landUseData && landUseData.length > 0 ? (
              <div className="flex flex-col items-center w-full h-full justify-center">
                <ResponsiveContainer width="100%" height={110}>
                  <PieChart>
                    <Pie data={landUseData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={25} outerRadius={45} paddingAngle={2} strokeWidth={0}>
                      {landUseData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip content={<CustomLandUseTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-x-2 gap-y-1 justify-center mt-1">
                  {landUseData.slice(0, 4).map((entry, i) => (
                    <div key={i} className="flex items-center gap-1 text-[9px]">
                      <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: entry.color }} />
                      <span className="text-muted-foreground">{entry.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">No data</span>
            )}
          </div>
        </div>
        <div className="flex flex-col">
          <h3 className="text-xs font-medium text-foreground mb-2">Suitability</h3>
          <div className="rounded-xl border border-border/40 p-3 h-[200px] flex items-center justify-center" style={{ background: "hsla(150, 18%, 14%, 0.6)" }}>
            {geeLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : suitabilityData && suitabilityData.length > 0 ? (
              <ResponsiveContainer width="100%" height={170}>
                <RadarChart data={suitabilityData} cx="50%" cy="50%" outerRadius="65%">
                  <PolarGrid stroke="hsl(150, 12%, 22%)" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: "hsl(150, 10%, 55%)", fontSize: 8 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} />
                  <Radar name="Score" dataKey="value" stroke={CHART_GREEN} fill={CHART_GREEN} fillOpacity={0.25} strokeWidth={2} />
                  <Tooltip content={<CustomChartTooltip />} />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <span className="text-xs text-muted-foreground">No data</span>
            )}
          </div>
        </div>
      </div>

      {/* NDVI Trend */}
      <div>
        <h3 className="text-xs font-medium text-foreground mb-2">NDVI Trend (90 days)</h3>
        {ndviTsLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground p-2"><Loader2 className="w-3 h-3 animate-spin" /> Loading...</div>
        ) : ndviChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <AreaChart data={ndviChartData}>
              <defs>
                <linearGradient id={`ndviGrad${sfx}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_GREEN} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_GREEN} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(150, 12%, 22%)" />
              <XAxis dataKey="date" stroke="hsl(150, 10%, 55%)" fontSize={9} interval="preserveStartEnd" />
              <YAxis stroke="hsl(150, 10%, 55%)" fontSize={9} domain={[0, 1]} />
              <Tooltip content={<CustomChartTooltip />} />
              <Area type="monotone" dataKey="ndvi" stroke={CHART_GREEN} strokeWidth={2} fill={`url(#ndviGrad${sfx})`} dot={{ r: 2, fill: CHART_GREEN }} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="p-3 rounded-lg border border-border bg-accent/10 text-xs text-muted-foreground">No satellite data</div>
        )}
      </div>

      {/* Temperature */}
      <div>
        <h3 className="text-xs font-medium text-foreground mb-2">Temperature Range, °C</h3>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <LineChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(150, 12%, 22%)" />
            <XAxis dataKey="month" stroke="hsl(150, 10%, 55%)" fontSize={9} />
            <YAxis stroke="hsl(150, 10%, 55%)" fontSize={9} />
            <Tooltip content={<CustomChartTooltip />} />
            <Line type="monotone" dataKey="tempMax" stroke={CHART_GOLD} strokeWidth={2} dot={{ r: 2, fill: CHART_GOLD }} />
            <Line type="monotone" dataKey="tempMin" stroke={CHART_CREAM} strokeWidth={2} dot={{ r: 2, fill: CHART_CREAM }} strokeDasharray="5 5" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Soil Moisture */}
      {soilMoistureData.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-foreground mb-2">Soil Moisture, %</h3>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <AreaChart data={soilMoistureData}>
              <defs>
                <linearGradient id={`soilGrad${sfx}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_GOLD} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={CHART_GOLD} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(150, 12%, 22%)" />
              <XAxis dataKey="month" stroke="hsl(150, 10%, 55%)" fontSize={9} />
              <YAxis stroke="hsl(150, 10%, 55%)" fontSize={9} />
              <Tooltip content={<CustomChartTooltip />} />
              <Area type="monotone" dataKey="shallow" stroke={CHART_GOLD} strokeWidth={2} fill={`url(#soilGrad${sfx})`} dot={{ r: 2, fill: CHART_GOLD }} />
              <Line type="monotone" dataKey="deep" stroke={CHART_CREAM} strokeWidth={1.5} dot={false} strokeDasharray="5 5" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Precipitation */}
      <div>
        <h3 className="text-xs font-medium text-foreground mb-2">Precipitation, mm</h3>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <AreaChart data={monthlyData}>
            <defs>
              <linearGradient id={`goldGrad${sfx}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_GOLD} stopOpacity={0.3} />
                <stop offset="95%" stopColor={CHART_GOLD} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(150, 12%, 22%)" />
            <XAxis dataKey="month" stroke="hsl(150, 10%, 55%)" fontSize={9} />
            <YAxis stroke="hsl(150, 10%, 55%)" fontSize={9} />
            <Tooltip content={<CustomChartTooltip />} />
            <Area type="monotone" dataKey="accumulated" stroke={CHART_GOLD} strokeWidth={2} fill={`url(#goldGrad${sfx})`} dot={{ r: 2, fill: CHART_GOLD }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default FieldComparisonColumn;
