import { useState } from "react";
import MapView from "@/components/MapView";
import WeatherView from "@/components/WeatherView";
import { fields as allFieldsData, Field } from "@/data/fields";
import { useAuth } from "@/hooks/useAuth";
import { useSavedFields } from "@/hooks/useSavedFields";
import { LogOut } from "lucide-react";

const Index = () => {
  const [view, setView] = useState<"map" | "weather">("map");
  const { user, signOut } = useAuth();
  const { savedFields, loading, addField, removeField, updateField, toggleField } = useSavedFields(user?.id);

  if (loading) {
    return (
      <div className="h-screen w-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground animate-pulse text-sm">Loading fields…</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-surface-outer flex items-center justify-center p-6">
      <div className="w-full h-full max-w-[1400px] max-h-[900px] rounded-2xl overflow-hidden bg-background shadow-2xl relative border-[#041009] border-2">
        {/* View toggle */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex gap-1 bg-card/80 backdrop-blur-sm rounded-lg border border-border p-1">
          {(["map", "weather"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all duration-300 ${
                view === v
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {v === "map" ? "Map" : "Weather"}
            </button>
          ))}
        </div>

        {/* Sign out */}
        <button
          onClick={signOut}
          className="absolute top-4 right-4 z-20 w-8 h-8 rounded-lg bg-card/80 backdrop-blur-sm border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          title="Sign out"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>

        {/* Both views always mounted, toggled via CSS */}
        <div
          className="w-full h-full absolute inset-0 transition-opacity duration-200"
          style={{ opacity: view === "map" ? 1 : 0, pointerEvents: view === "map" ? "auto" : "none" }}
        >
          <MapView
            selectedFields={savedFields}
            allFields={allFieldsData}
            onRemoveField={(id) => removeField(id)}
            onToggleField={toggleField}
            onUpdateField={updateField}
            onShowAll={() => allFieldsData.forEach((f) => addField(f))}
            onHideAll={() => savedFields.forEach((f) => removeField(f.id))}
          />
        </div>
        <div
          className="w-full h-full absolute inset-0 transition-opacity duration-200"
          style={{ opacity: view === "weather" ? 1 : 0, pointerEvents: view === "weather" ? "auto" : "none" }}
        >
          <WeatherView selectedFields={savedFields} onRemoveField={(id) => removeField(id)} />
        </div>
      </div>
    </div>
  );
};

export default Index;
