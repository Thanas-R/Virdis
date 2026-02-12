import { useState, useEffect } from "react";
import { CalendarArrowUp, CalendarArrowDown, Droplets, Wind, Thermometer, Sun, CloudRain, Sprout } from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart } from
"recharts";
import { Field } from "@/data/fields";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger } from
"@/components/ui/popover";
import FieldListPanel from "./FieldListPanel";

const CHART_GOLD = "#EAB947";
const CHART_CREAM = "#F7F4E4";

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

function getFarmerAdvice(weather: LiveWeather, crop: string): string[] {
  const advice: string[] = [];
  if (weather.temperature > 35) {
    advice.push(`⚠️ Extreme heat (${weather.temperature}°C). Increase irrigation for ${crop} and consider shade nets.`);
  } else if (weather.temperature > 30) {
    advice.push(`🌡️ High temperature (${weather.temperature}°C). Monitor ${crop} for heat stress. Water early morning or late evening.`);
  } else if (weather.temperature < 5) {
    advice.push(`❄️ Near-freezing conditions. Protect ${crop} with frost covers if overnight temps drop further.`);
  } else {
    advice.push(`✅ Temperature is favorable (${weather.temperature}°C) for ${crop} growth.`);
  }
  if (weather.humidity > 80) {
    advice.push(`💧 High humidity (${weather.humidity}%). Watch for fungal diseases on ${crop}. Ensure good air circulation.`);
  } else if (weather.humidity < 30) {
    advice.push(`🏜️ Low humidity (${weather.humidity}%). ${crop} may need supplemental irrigation.`);
  }
  if (weather.windSpeed > 40) {
    advice.push(`💨 Strong winds (${weather.windSpeed} km/h). Postpone spraying. Check ${crop} supports.`);
  } else if (weather.windSpeed > 20) {
    advice.push(`🌬️ Moderate wind (${weather.windSpeed} km/h). Spray operations may drift — adjust nozzles or wait.`);
  }
  const code = weather.weatherCode;
  if (code >= 61 && code <= 67) {
    advice.push(`🌧️ Rain expected. Delay field work and harvesting. Good natural irrigation for ${crop}.`);
  } else if (code >= 95) {
    advice.push(`⛈️ Thunderstorm warning. Stay indoors and secure equipment.`);
  } else if (code === 0 || code === 1) {
    advice.push(`☀️ Clear conditions — ideal for field scouting, spraying, or harvesting ${crop}.`);
  }
  return advice;
}

interface WeatherViewProps {
  selectedFields: Field[];
  onRemoveField: (id: string) => void;
}

const WeatherView = ({ selectedFields, onRemoveField }: WeatherViewProps) => {
  const [startDate, setStartDate] = useState<Date>(new Date(2024, 3, 1));
  const [endDate, setEndDate] = useState<Date>(new Date(2024, 9, 1));
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [dailyData, setDailyData] = useState<any[]>([]);
  const [soilMoistureData, setSoilMoistureData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [liveWeather, setLiveWeather] = useState<LiveWeather | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  

  const activeField = selectedFields[0];

  // Fetch live weather
  useEffect(() => {
    if (!activeField) return;
    const fetchLive = async () => {
      setLiveLoading(true);
      try {
        const { lat, lng } = getFieldCenter(activeField);
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,apparent_temperature,weather_code&timezone=auto`
        );
        const data = await res.json();
        const c = data.current;
        setLiveWeather({
          temperature: Math.round(c.temperature_2m),
          humidity: c.relative_humidity_2m,
          windSpeed: Math.round(c.wind_speed_10m),
          weatherCode: c.weather_code,
          feelsLike: Math.round(c.apparent_temperature)
        });
      } catch {
        setLiveWeather(null);
      } finally {
        setLiveLoading(false);
      }
    };
    fetchLive();
  }, [activeField]);

  // Fetch historical weather + soil moisture
  useEffect(() => {
    if (!activeField) return;
    const fetchWeatherData = async () => {
      setLoading(true);
      try {
        const { lat, lng } = getFieldCenter(activeField);
        const start = format(startDate, "yyyy-MM-dd");
        const end = format(endDate, "yyyy-MM-dd");

        const [weatherRes, soilRes] = await Promise.all([
        fetch(
          `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${start}&end_date=${end}&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,et0_fao_evapotranspiration`
        ),
        fetch(
          `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${start}&end_date=${end}&daily=soil_moisture_0_to_7cm_mean,soil_moisture_7_to_28cm_mean`
        )]
        );

        const data = await weatherRes.json();
        const soilData = await soilRes.json();

        if (data.daily) {
          const daily = data.daily.time.map((date: string, i: number) => ({
            date,
            label: format(new Date(date + "T00:00:00"), "MMM dd"),
            precipitation: data.daily.precipitation_sum[i] || 0,
            tempMax: data.daily.temperature_2m_max[i],
            tempMin: data.daily.temperature_2m_min[i],
            evap: data.daily.et0_fao_evapotranspiration[i] || 0
          }));

          const monthMap = new Map<string, {precip: number;count: number;tMax: number;tMin: number;evap: number;}>();
          daily.forEach((d: any) => {
            const key = format(new Date(d.date + "T00:00:00"), "MMM yyyy");
            const m = monthMap.get(key) || { precip: 0, count: 0, tMax: -999, tMin: 999, evap: 0 };
            m.precip += d.precipitation;
            m.count++;
            m.tMax = Math.max(m.tMax, d.tempMax ?? -999);
            m.tMin = Math.min(m.tMin, d.tempMin ?? 999);
            m.evap += d.evap;
            monthMap.set(key, m);
          });

          let accumulated = 0;
          const monthly = Array.from(monthMap.entries()).map(([month, v]) => {
            accumulated += v.precip;
            return {
              month: month.split(" ")[0],
              precipitation: Math.round(v.precip * 10) / 10,
              accumulated: Math.round(accumulated * 10) / 10,
              tempMax: Math.round(v.tMax),
              tempMin: Math.round(v.tMin),
              evapotranspiration: Math.round(v.evap * 10) / 10
            };
          });

          setMonthlyData(monthly);
          setDailyData(daily.filter((_: any, i: number) => i % 2 === 0));
        }

        // Soil moisture
        if (soilData.daily) {
          const soilMonthMap = new Map<string, {shallow: number;deep: number;count: number;}>();
          soilData.daily.time.forEach((date: string, i: number) => {
            const key = format(new Date(date + "T00:00:00"), "MMM yyyy");
            const m = soilMonthMap.get(key) || { shallow: 0, deep: 0, count: 0 };
            m.shallow += soilData.daily.soil_moisture_0_to_7cm_mean?.[i] || 0;
            m.deep += soilData.daily.soil_moisture_7_to_28cm_mean?.[i] || 0;
            m.count++;
            soilMonthMap.set(key, m);
          });

          const soilMonthly = Array.from(soilMonthMap.entries()).map(([month, v]) => ({
            month: month.split(" ")[0],
            shallow: Math.round(v.shallow / v.count * 1000) / 10,
            deep: Math.round(v.deep / v.count * 1000) / 10
          }));
          setSoilMoistureData(soilMonthly);
        }
      } catch (e) {
        console.error("Failed to fetch weather data", e);
      } finally {
        setLoading(false);
      }
    };
    fetchWeatherData();
  }, [startDate, endDate, activeField]);

  return (
    <div className="relative w-full h-full flex">
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header row: title + field info + date pickers */}
        <div className="flex items-center gap-4 px-6 py-3 border-b border-border flex-wrap">
          <h1 className="text-lg font-semibold text-foreground">Historical Weather</h1>
          {activeField &&
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: activeField.color }} />
              {activeField.name} · {activeField.cropEmoji} {activeField.crop} · {activeField.location}
            </div>
          }

          {/* Spacer */}
          <div className="flex-1" />

          {/* Date pickers in header */}
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-2 border border-border rounded-lg px-3 py-2 hover:bg-accent/30 transition-colors">
                <div>
                  <div className="text-xs text-muted-foreground">Start Date</div>
                  <div className="text-sm text-foreground">{format(startDate, "MMM d, yyyy")}</div>
                </div>
                <CalendarArrowUp className="w-4 h-4 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={startDate} onSelect={(d) => d && setStartDate(d)} className="pointer-events-auto" />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-2 border border-border rounded-lg px-3 py-2 hover:bg-accent/30 transition-colors">
                <div>
                  <div className="text-xs text-muted-foreground">End Date</div>
                  <div className="text-sm text-foreground">{format(endDate, "MMM d, yyyy")}</div>
                </div>
                <CalendarArrowDown className="w-4 h-4 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={endDate} onSelect={(d) => d && setEndDate(d)} className="pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>

        {/* Live Weather Card */}
        {activeField &&
        <div className="px-6 py-3 border-b border-border">
            {liveLoading ?
          <div className="text-sm text-muted-foreground animate-pulse">Loading live conditions…</div> :
          liveWeather ?
          <div className="space-y-3">
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
                </div>
                {/* Farmer Advice */}
                




              </div> :

          <div className="text-sm text-muted-foreground">Weather unavailable</div>
          }
          </div>
        }



        {/* Charts */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {!activeField ?
          <div className="flex flex-col items-center justify-center py-20 text-center">
              <Sprout className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Select a field to view weather data</p>
            </div> :
          loading ?
          <div className="flex items-center justify-center py-20">
              <div className="text-muted-foreground animate-pulse text-sm">Fetching weather data for {activeField.name}…</div>
            </div> :

          <>
              {/* Accumulated Precipitation */}
              <div className="animate-fade-in">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-foreground">Accumulated Precipitation, mm</h3>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: CHART_GOLD }} />Precipitation
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: CHART_CREAM }} />Evapotranspiration
                    </span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={monthlyData}>
                    <defs>
                      <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_GOLD} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={CHART_GOLD} stopOpacity={0} />
                      </linearGradient>
                    </defs>
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
              <div className="animate-fade-in" style={{ animationDelay: "100ms" }}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-foreground">Daily Precipitation, mm</h3>
                </div>
                <ResponsiveContainer width="100%" height={200}>
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
              <div className="animate-fade-in" style={{ animationDelay: "200ms" }}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-foreground">Temperature Range, °C</h3>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: CHART_GOLD }} />Max
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: CHART_CREAM }} />Min
                    </span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={200}>
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
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: CHART_GOLD }} />Surface (0-7cm)
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: CHART_CREAM }} />Deep (7-28cm)
                      </span>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={soilMoistureData}>
                      <defs>
                        <linearGradient id="soilGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={CHART_GOLD} stopOpacity={0.25} />
                          <stop offset="95%" stopColor={CHART_GOLD} stopOpacity={0} />
                        </linearGradient>
                      </defs>
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
            </>
          }
        </div>
      </div>

      {/* Right sidebar - field list */}
      <FieldListPanel fields={selectedFields} onRemoveField={onRemoveField} />
    </div>);

};

export default WeatherView;