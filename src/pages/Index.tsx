import { useState } from "react";
import MapView from "@/components/MapView";
import WeatherView from "@/components/WeatherView";
import { fields as allFields, Field } from "@/data/fields";

const Index = () => {
  const [view, setView] = useState<"map" | "weather">("map");
  const [selectedFields, setSelectedFields] = useState<Field[]>(allFields);

  const handleRemoveField = (id: string) =>
  setSelectedFields((prev) => prev.filter((f) => f.id !== id));

  const handleToggleField = (field: Field) => {
    setSelectedFields((prev) => {
      const exists = prev.some((f) => f.id === field.id);
      return exists ? prev.filter((f) => f.id !== field.id) : [...prev, field];
    });
  };

  return (
    <div className="h-screen w-screen bg-surface-outer flex items-center justify-center p-6">
      <div className="w-full h-full max-w-[1400px] max-h-[900px] rounded-2xl overflow-hidden bg-background shadow-2xl relative border-[#041009] border-4">
        {/* View toggle */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex gap-1 bg-card/80 backdrop-blur-sm rounded-lg border border-border p-1">
          {(["map", "weather"] as const).map((v) =>
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all duration-300 ${
            view === v ?
            "bg-primary text-primary-foreground shadow-sm" :
            "text-muted-foreground hover:text-foreground"}`
            }>

              {v === "map" ? "Map" : "Weather"}
            </button>
          )}
        </div>

        {/* Both views always mounted, toggled via CSS */}
        <div
          className="w-full h-full absolute inset-0 transition-opacity duration-200"
          style={{ opacity: view === "map" ? 1 : 0, pointerEvents: view === "map" ? "auto" : "none" }}>

          <MapView
            selectedFields={selectedFields}
            allFields={allFields}
            onRemoveField={handleRemoveField}
            onToggleField={handleToggleField}
            onShowAll={() => setSelectedFields(allFields)}
            onHideAll={() => setSelectedFields([])} />

        </div>
        <div
          className="w-full h-full absolute inset-0 transition-opacity duration-200"
          style={{ opacity: view === "weather" ? 1 : 0, pointerEvents: view === "weather" ? "auto" : "none" }}>

          <WeatherView selectedFields={selectedFields} onRemoveField={handleRemoveField} />
        </div>
      </div>
    </div>);

};

export default Index;