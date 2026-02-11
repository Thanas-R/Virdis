import { useState } from "react";
import { ChevronDown, CalendarArrowUp, CalendarArrowDown } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer } from
"recharts";
import { fields, accumulatedPrecipitation, dailyPrecipitation } from "@/data/fields";
import FieldListPanel from "./FieldListPanel";
import RightToolbar, { RightMode } from "./RightToolbar";

const WeatherView = () => {
  const [fieldList, setFieldList] = useState(fields);
  const [rightMode, setRightMode] = useState<RightMode>(null);

  const handleRemoveField = (id: string) => {
    setFieldList((prev) => prev.filter((f) => f.id !== id));
  };

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

        {/* Weather info bar */}
        <div className="flex items-center gap-6 px-6 py-4 border-b border-border flex-wrap">
          <div>
            <div className="text-xs text-muted-foreground">Weather Now</div>
            <div className="text-sm text-foreground">Mostly Clear</div>
          </div>
          <div className="text-2xl font-light text-foreground flex items-center gap-2">
            +20° <span className="text-2xl">⛅</span>
          </div>
          <div className="flex items-center gap-2 border border-border rounded-lg px-3 py-2">
            <div>
              <div className="text-xs text-muted-foreground">Compare</div>
              <div className="text-sm text-foreground flex items-center gap-1">5 Year Avg <ChevronDown className="w-3 h-3" /></div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 border border-border rounded-lg px-3 py-2">
              <div>
                <div className="text-xs text-muted-foreground">Start Date</div>
                <div className="text-sm text-foreground">Apr 1, 2019</div>
              </div>
              <CalendarArrowUp className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex items-center gap-2 border border-border rounded-lg px-3 py-2">
              <div>
                <div className="text-xs text-muted-foreground">End Date</div>
                <div className="text-sm text-foreground">Oct 1, 2019</div>
              </div>
              <CalendarArrowDown className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Accumulated Precipitation */}
          <div className="animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-foreground">Accumulated Precipitation, mm</h3>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: "hsl(340, 70%, 65%)" }} /> 5 Year Avg
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: "hsl(180, 70%, 55%)" }} /> Precipitation 2019
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: "hsl(120, 50%, 50%)" }} /> Growth Stages 2019
                </span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={accumulatedPrecipitation}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(150, 12%, 22%)" />
                <XAxis dataKey="month" stroke="hsl(150, 10%, 55%)" fontSize={12} />
                <YAxis stroke="hsl(150, 10%, 55%)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(150, 18%, 14%)",
                    border: "1px solid hsl(150, 12%, 22%)",
                    borderRadius: "8px",
                    color: "hsl(60, 20%, 85%)"
                  }} />

                <Line type="monotone" dataKey="fiveYearAvg" stroke="hsl(340, 70%, 65%)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="current" stroke="hsl(180, 70%, 55%)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="growth" stroke="hsl(120, 50%, 50%)" strokeWidth={2} dot={false} strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Daily Precipitation */}
          <div className="animate-fade-in" style={{ animationDelay: "150ms" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-foreground">Daily Precipitation, mm</h3>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: "hsl(340, 60%, 55%)" }} /> 5 Year Avg
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: "hsl(180, 60%, 50%)" }} /> Precipitation 2019
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: "hsl(120, 50%, 50%)" }} /> Growth Stages 2019
                </span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={dailyPrecipitation}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(150, 12%, 22%)" />
                <XAxis dataKey="month" stroke="hsl(150, 10%, 55%)" fontSize={12} />
                <YAxis stroke="hsl(150, 10%, 55%)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(150, 18%, 14%)",
                    border: "1px solid hsl(150, 12%, 22%)",
                    borderRadius: "8px",
                    color: "hsl(60, 20%, 85%)"
                  }} />

                <Bar dataKey="fiveYearAvg" fill="hsl(340, 60%, 55%)" />
                <Bar dataKey="current" fill="hsl(180, 60%, 50%)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Right sidebar */}
      <FieldListPanel fields={fieldList} onRemoveField={handleRemoveField} />

      {/* Right icon toolbar */}
      <RightToolbar activeMode={rightMode} onModeChange={setRightMode} />
    </div>);

};

export default WeatherView;