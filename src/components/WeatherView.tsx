import { useState, useEffect } from "react";
import { ChevronDown, CalendarArrowUp, CalendarArrowDown } from "lucide-react";
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
} from "recharts";
import { fields } from "@/data/fields";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import FieldListPanel from "./FieldListPanel";

const CHART_GOLD = "#EAB947";
const CHART_CREAM = "#F7F4E4";

const tooltipStyle = {
  backgroundColor: "hsl(150, 18%, 14%)",
  border: "1px solid hsl(150, 12%, 22%)",
  borderRadius: "8px",
  color: "hsl(60, 20%, 85%)",
  fontSize: "12px",
};

const WeatherView = () => {
  const [fieldList, setFieldList] = useState(fields);
  const [startDate, setStartDate] = useState<Date>(new Date(2024, 3, 1));
  const [endDate, setEndDate] = useState<Date>(new Date(2024, 9, 1));
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [dailyData, setDailyData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleRemoveField = (id: string) => {
    setFieldList((prev) => prev.filter((f) => f.id !== id));
  };

  useEffect(() => {
    const fetchWeatherData = async () => {
      const field = fieldList[0];
      if (!field) return;
      setLoading(true);
      try {
        const coords = field.coordinates[0];
        const lat =
          coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
        const lng =
          coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
        const start = format(startDate, "yyyy-MM-dd");
        const end = format(endDate, "yyyy-MM-dd");

        const res = await fetch(
          `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${start}&end_date=${end}&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,et0_fao_evapotranspiration`
        );
        const data = await res.json();

        if (data.daily) {
          const daily = data.daily.time.map((date: string, i: number) => ({
            date,
            label: format(new Date(date), "MMM dd"),
            precipitation: data.daily.precipitation_sum[i] || 0,
            tempMax: data.daily.temperature_2m_max[i],
            tempMin: data.daily.temperature_2m_min[i],
            evap: data.daily.et0_fao_evapotranspiration[i] || 0,
          }));

          // Monthly aggregation
          const monthMap = new Map<
            string,
            {
              precip: number;
              count: number;
              tMax: number;
              tMin: number;
              evap: number;
            }
          >();
          daily.forEach((d: any) => {
            const key = format(new Date(d.date), "MMM");
            const m = monthMap.get(key) || {
              precip: 0,
              count: 0,
              tMax: -999,
              tMin: 999,
              evap: 0,
            };
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
              month,
              precipitation: Math.round(v.precip),
              accumulated: Math.round(accumulated),
              tempMax: Math.round(v.tMax),
              tempMin: Math.round(v.tMin),
              evapotranspiration: Math.round(v.evap),
            };
          });

          setMonthlyData(monthly);
          setDailyData(
            daily.filter((_: any, i: number) => i % 3 === 0)
          );
        }
      } catch (e) {
        console.error("Failed to fetch weather data", e);
      } finally {
        setLoading(false);
      }
    };
    fetchWeatherData();
  }, [startDate, endDate, fieldList]);

  return (
    <div className="relative w-full h-full flex">
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-center py-3 border-b border-border">
          <button className="flex items-center gap-2 text-foreground font-semibold text-lg">
            Historical Weather <ChevronDown className="w-4 h-4" />
          </button>
        </div>

        {/* Date controls */}
        <div className="flex items-center gap-4 px-6 py-3 border-b border-border flex-wrap">
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-2 border border-border rounded-lg px-3 py-2 hover:bg-accent/30 transition-colors">
                <div>
                  <div className="text-xs text-muted-foreground">
                    Start Date
                  </div>
                  <div className="text-sm text-foreground">
                    {format(startDate, "MMM d, yyyy")}
                  </div>
                </div>
                <CalendarArrowUp className="w-4 h-4 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={(d) => d && setStartDate(d)}
              />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-2 border border-border rounded-lg px-3 py-2 hover:bg-accent/30 transition-colors">
                <div>
                  <div className="text-xs text-muted-foreground">End Date</div>
                  <div className="text-sm text-foreground">
                    {format(endDate, "MMM d, yyyy")}
                  </div>
                </div>
                <CalendarArrowDown className="w-4 h-4 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={endDate}
                onSelect={(d) => d && setEndDate(d)}
              />
            </PopoverContent>
          </Popover>

          {fieldList[0] && (
            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: fieldList[0].color }}
              />
              {fieldList[0].name} · {fieldList[0].location}
            </div>
          )}
        </div>

        {/* Charts */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-muted-foreground animate-pulse text-sm">
                Fetching weather data…
              </div>
            </div>
          ) : (
            <>
              {/* Accumulated Precipitation */}
              <div className="animate-fade-in">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-foreground">
                    Accumulated Precipitation, mm
                  </h3>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-3 h-3 rounded-sm"
                        style={{ backgroundColor: CHART_GOLD }}
                      />
                      Precipitation
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-3 h-3 rounded-sm"
                        style={{ backgroundColor: CHART_CREAM }}
                      />
                      Evapotranspiration
                    </span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={monthlyData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(150, 12%, 22%)"
                    />
                    <XAxis
                      dataKey="month"
                      stroke="hsl(150, 10%, 55%)"
                      fontSize={11}
                    />
                    <YAxis stroke="hsl(150, 10%, 55%)" fontSize={11} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line
                      type="monotone"
                      dataKey="accumulated"
                      stroke={CHART_GOLD}
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: CHART_GOLD }}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="evapotranspiration"
                      stroke={CHART_CREAM}
                      strokeWidth={1.5}
                      dot={false}
                      strokeDasharray="5 5"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Daily Precipitation */}
              <div
                className="animate-fade-in"
                style={{ animationDelay: "100ms" }}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-foreground">
                    Daily Precipitation, mm
                  </h3>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={dailyData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(150, 12%, 22%)"
                    />
                    <XAxis
                      dataKey="label"
                      stroke="hsl(150, 10%, 55%)"
                      fontSize={10}
                      interval="preserveStartEnd"
                    />
                    <YAxis stroke="hsl(150, 10%, 55%)" fontSize={11} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar
                      dataKey="precipitation"
                      fill={CHART_GOLD}
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Temperature Range */}
              <div
                className="animate-fade-in"
                style={{ animationDelay: "200ms" }}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-foreground">
                    Temperature Range, °C
                  </h3>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-3 h-3 rounded-sm"
                        style={{ backgroundColor: CHART_GOLD }}
                      />
                      Max
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-3 h-3 rounded-sm"
                        style={{ backgroundColor: CHART_CREAM }}
                      />
                      Min
                    </span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={monthlyData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(150, 12%, 22%)"
                    />
                    <XAxis
                      dataKey="month"
                      stroke="hsl(150, 10%, 55%)"
                      fontSize={11}
                    />
                    <YAxis stroke="hsl(150, 10%, 55%)" fontSize={11} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line
                      type="monotone"
                      dataKey="tempMax"
                      stroke={CHART_GOLD}
                      strokeWidth={2}
                      dot={{ r: 3, fill: CHART_GOLD }}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="tempMin"
                      stroke={CHART_CREAM}
                      strokeWidth={2}
                      dot={{ r: 3, fill: CHART_CREAM }}
                      strokeDasharray="5 5"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right sidebar */}
      <FieldListPanel fields={fieldList} onRemoveField={handleRemoveField} />
    </div>
  );
};

export default WeatherView;
