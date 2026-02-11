import { useState } from "react";
import MapView from "@/components/MapView";
import WeatherView from "@/components/WeatherView";

const Index = () => {
  const [view, setView] = useState<"map" | "weather">("map");
  const [transitioning, setTransitioning] = useState(false);

  const switchView = (newView: "map" | "weather") => {
    if (newView === view) return;
    setTransitioning(true);
    setTimeout(() => {
      setView(newView);
      setTransitioning(false);
    }, 200);
  };

  return (
    <div className="h-screen w-screen bg-surface-outer flex items-center justify-center p-6">
      <div className="w-full h-full max-w-[1400px] max-h-[900px] rounded-2xl overflow-hidden bg-background shadow-2xl relative border-[#041009] border-4">
        {/* View toggle */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex gap-1 bg-card/80 backdrop-blur-sm rounded-lg border border-border p-1">
          {(["map", "weather"] as const).map((v) =>
          <button
            key={v}
            onClick={() => switchView(v)}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all duration-300 ${
            view === v ?
            "bg-primary text-primary-foreground shadow-sm" :
            "text-muted-foreground hover:text-foreground"}`
            }>

              {v === "map" ? "Map" : "Weather"}
            </button>
          )}
        </div>

        <div
          className="w-full h-full transition-opacity duration-200"
          style={{ opacity: transitioning ? 0 : 1 }}>

          {view === "map" ? <MapView /> : <WeatherView />}
        </div>
      </div>
    </div>);

};

export default Index;