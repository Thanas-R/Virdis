import { useState } from "react";
import MapView from "@/components/MapView";
import WeatherView from "@/components/WeatherView";

const Index = () => {
  const [view, setView] = useState<"map" | "weather">("map");

  return (
    <div className="h-screen w-screen bg-surface-outer flex items-center justify-center p-6">
      {/* Main container with rounded border like the mockup */}
      <div className="w-full h-full max-w-[1400px] max-h-[900px] rounded-2xl overflow-hidden border border-border bg-background shadow-2xl relative">
        {/* View toggle - subtle nav */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex gap-1 bg-card/80 backdrop-blur-sm rounded-lg border border-border p-1">
          <button
            onClick={() => setView("map")}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
              view === "map"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Map
          </button>
          <button
            onClick={() => setView("weather")}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
              view === "weather"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Weather
          </button>
        </div>

        {view === "map" ? <MapView /> : <WeatherView />}
      </div>
    </div>
  );
};

export default Index;
