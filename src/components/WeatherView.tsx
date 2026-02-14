import { useState, useEffect } from "react";
import { CalendarArrowUp, CalendarArrowDown, Droplets, Wind, Sprout, Thermometer, Leaf, TrendingUp } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Area, AreaChart, PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from
"recharts";
import { Field, haToAcres } from "@/data/fields";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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

const LAND_USE_DATA = [
  { name: "Cropland", value: 45, color: "#98C379" },
  { name: "Vegetation", value: 25, color: "#7BC75B" },
  { name: "Water", value: 10, color: "#5BB8C7" },
  { name: "Built-up", value: 12, color: "#BE5046" },
  { name: "Bare Soil", value: 8, color: "#EAB947" },
];


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

  const effectiveField = activeField || selectedFields[0];

  // Simulated vegetation indices based on soil moisture + weather
  const vegetationIndices = soilMoistureData.map((d, i) => ({
    month: d.month,
    ndvi: Math.min(0.9, Math.max(0.1, 0.3 + d.shallow * 1.5 + Math.random() * 0.15)),
    evi: Math.min(0.8, Math.max(0.05, 0.2 + d.shallow * 1.2 + Math.random() * 0.1)),
    waterStress: Math.max(0, 100 - d.shallow * 300 - (monthlyData[i]?.precipitation || 0) * 0.5)
  }));

  const suitabilityData = effectiveField ? [
  { metric: "Soil Quality", value: 72 },
  { metric: "Water Access", value: 65 },
  { metric: "Climate", value: 80 },
  { metric: "Drainage", value: 58 },
  { metric: "Topography", value: 85 },
  { metric: "Nutrient Level", value: 70 }] :
  [];

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
            { label: "Avg NDVI", value: vegetationIndices.length > 0 ? (vegetationIndices.reduce((s, v) => s + v.ndvi, 0) / vegetationIndices.length).toFixed(2) : "N/A", icon: Leaf, color: CHART_GREEN },
            { label: "Avg Moisture", value: soilMoistureData.length > 0 ? `${(soilMoistureData.reduce((s, d) => s + d.shallow, 0) / soilMoistureData.length).toFixed(1)}%` : "N/A", icon: Droplets, color: CHART_BLUE },
            { label: "Temp Range", value: monthlyData.length > 0 ? `${Math.min(...monthlyData.map((d) => d.tempMin))}–${Math.max(...monthlyData.map((d) => d.tempMax))}°C` : "N/A", icon: Thermometer, color: CHART_GOLD },
            { label: "Total Rain", value: monthlyData.length > 0 ? `${monthlyData[monthlyData.length - 1]?.accumulated || 0} mm` : "N/A", icon: TrendingUp, color: CHART_CREAM }].
            map((m, i) =>
            <div key={i} className="p-3 rounded-xl border border-border bg-accent/15 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><m.icon className="w-3.5 h-3.5" />{m.label}</div>
                  <div className="text-lg font-semibold text-foreground">{m.value}</div>
                </div>
            )}
            </div>

            {/* Vegetation Indices (NDVI/EVI) */}
            {vegetationIndices.length > 0






















          }

            {/* Water Stress */}
            {vegetationIndices.length > 0












          }

            {/* Land Use / Suitability side by side */}
            <div className="grid grid-cols-2 gap-6 animate-fade-in" style={{ animationDelay: "100ms" }}>
              <div>
                <h3 className="text-sm font-medium text-foreground mb-4">Regional Land Use</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={LAND_USE_DATA}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={65}
                      paddingAngle={3}
                      dataKey="value"
                      label={({ name, percent, cx, cy, midAngle, outerRadius: oR }) => {
                        const RADIAN = Math.PI / 180;
                        const radius = oR + 18;
                        const x = cx + radius * Math.cos(-midAngle * RADIAN);
                        const y = cy + radius * Math.sin(-midAngle * RADIAN);
                        return (
                          <text x={x} y={y} fill="hsl(60, 20%, 85%)" textAnchor={x > cx ? "start" : "end"} dominantBaseline="central" fontSize={10}>
                            {`${name} ${(percent * 100).toFixed(0)}%`}
                          </text>
                        );
                      }}
                      stroke="none"
                      fillOpacity={0.9}
                    >
                      {LAND_USE_DATA.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        ...tooltipStyle,
                        backdropFilter: "blur(8px)",
                        background: "hsla(150, 18%, 14%, 0.9)",
                      }}
                      itemStyle={{ color: "hsl(60, 20%, 85%)" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div>
                <h3 className="text-sm font-medium text-foreground mb-4">Land Suitability Score</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <RadarChart data={suitabilityData}>
                    <PolarGrid stroke="hsl(150, 12%, 22%)" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: "hsl(150, 10%, 55%)", fontSize: 10 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} />
                    <Radar name="Score" dataKey="value" stroke={CHART_GOLD} fill={CHART_GOLD} fillOpacity={0.25} />
                    <Tooltip contentStyle={tooltipStyle} />
                  </RadarChart>
                </ResponsiveContainer>
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
                  <Tooltip contentStyle={tooltipStyle} />
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
                  <Tooltip contentStyle={tooltipStyle} />
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
                  <Tooltip contentStyle={tooltipStyle} />
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
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area type="monotone" dataKey="shallow" stroke={CHART_GOLD} strokeWidth={2} fill="url(#soilGrad)" dot={{ r: 3, fill: CHART_GOLD }} />
                    <Line type="monotone" dataKey="deep" stroke={CHART_CREAM} strokeWidth={1.5} dot={false} strokeDasharray="5 5" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
          }

            {/* Crop Growth Data */}
            <div className="animate-fade-in" style={{ animationDelay: "350ms" }}>
              <h3 className="text-sm font-medium text-foreground mb-4">Crop Growth Indicators</h3>
              <div className="grid grid-cols-3 gap-3">
                {[
              { label: "Growth Rate", value: "N/A", detail: "Satellite data not available", color: "hsl(150, 10%, 55%)" },
              { label: "Canopy Cover", value: "N/A", detail: "Satellite data not available", color: "hsl(150, 10%, 55%)" },
              { label: "Biomass Est.", value: "N/A", detail: "Satellite data not available", color: "hsl(150, 10%, 55%)" }].
              map((item, i) =>
              <div key={i} className="p-3 rounded-xl border border-border bg-accent/10">
                    <div className="text-xs text-muted-foreground mb-1">{item.label}</div>
                    <div className="text-sm font-semibold" style={{ color: item.color }}>{item.value}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">{item.detail}</div>
                  </div>
              )}
              </div>
            </div>
          </>
        }
      </div>
    </div>);

};

export default WeatherView;