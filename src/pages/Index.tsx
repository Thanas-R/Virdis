import { useState, useEffect, useCallback } from "react";
import MapView from "@/components/MapView";
import WeatherView from "@/components/WeatherView";
import { fields as initialFieldsData, Field } from "@/data/fields";
import SidePanel from "@/components/SidePanel";

const ALL_FIELDS_KEY = "farm-all-fields";
const SELECTED_IDS_KEY = "farm-selected-fields";

function loadAllFields(): Field[] {
  try {
    const saved = localStorage.getItem(ALL_FIELDS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return initialFieldsData;
}

function loadSelectedIds(allFields: Field[]): string[] {
  try {
    const saved = localStorage.getItem(SELECTED_IDS_KEY);
    if (saved) {
      const ids = JSON.parse(saved);
      if (Array.isArray(ids)) return ids.filter((id: string) => allFields.some(f => f.id === id));
    }
  } catch {}
  return allFields.map(f => f.id);
}

const Index = () => {
  const [view, setView] = useState<"map" | "weather">("map");
  const [allFields, setAllFields] = useState<Field[]>(loadAllFields);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => loadSelectedIds(loadAllFields()));
  const [activeField, setActiveField] = useState<Field | null>(null);
  const [detailField, setDetailField] = useState<Field | null>(null);
  const [flyToField, setFlyToField] = useState<Field | null>(null);

  const selectedFields = allFields.filter(f => selectedIds.includes(f.id));

  useEffect(() => {
    localStorage.setItem(ALL_FIELDS_KEY, JSON.stringify(allFields));
  }, [allFields]);

  useEffect(() => {
    localStorage.setItem(SELECTED_IDS_KEY, JSON.stringify(selectedIds));
  }, [selectedIds]);

  const handleFieldClick = useCallback((field: Field) => {
    setActiveField(field);
    setFlyToField(field);
  }, []);

  const handleFieldDoubleClick = useCallback((field: Field) => {
    setActiveField(field);
    setDetailField(field);
  }, []);

  const handleToggleField = useCallback((field: Field) => {
    setSelectedIds(prev =>
      prev.includes(field.id)
        ? prev.filter(id => id !== field.id)
        : [...prev, field.id]
    );
  }, []);

  const handleAddField = useCallback((field: Field) => {
    setAllFields(prev => [...prev, field]);
    setSelectedIds(prev => [...prev, field.id]);
  }, []);

  const handleUpdateField = useCallback((updated: Field) => {
    setAllFields(prev => prev.map(f => f.id === updated.id ? updated : f));
    if (detailField?.id === updated.id) setDetailField(updated);
    if (activeField?.id === updated.id) setActiveField(updated);
  }, [detailField, activeField]);

  const handleDeleteField = useCallback((id: string) => {
    setAllFields(prev => prev.filter(f => f.id !== id));
    setSelectedIds(prev => prev.filter(fid => fid !== id));
    if (detailField?.id === id) setDetailField(null);
    if (activeField?.id === id) setActiveField(null);
  }, [detailField, activeField]);

  const handleApplySelection = useCallback((ids: string[]) => {
    setSelectedIds(ids);
  }, []);

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

        <div className="flex w-full h-full">
          {/* Main content */}
          <div className="flex-1 relative">
            <div
              className="absolute inset-0 transition-opacity duration-200"
              style={{ opacity: view === "map" ? 1 : 0, pointerEvents: view === "map" ? "auto" : "none" }}
            >
              <MapView
                allFields={allFields}
                selectedFields={selectedFields}
                activeField={activeField}
                flyToField={flyToField}
                onFlyToDone={() => setFlyToField(null)}
                onFieldClickOnMap={(field) => {
                  setActiveField(field);
                  setDetailField(field);
                }}
                onAddField={handleAddField}
              />
            </div>
            <div
              className="absolute inset-0 transition-opacity duration-200"
              style={{ opacity: view === "weather" ? 1 : 0, pointerEvents: view === "weather" ? "auto" : "none" }}
            >
              <WeatherView activeField={activeField} selectedFields={selectedFields} />
            </div>
          </div>

          {/* Shared side panel */}
          <SidePanel
            allFields={allFields}
            selectedFields={selectedFields}
            activeField={activeField}
            detailField={detailField}
            onFieldClick={handleFieldClick}
            onFieldDoubleClick={handleFieldDoubleClick}
            onBackFromDetail={() => setDetailField(null)}
            onToggleField={handleToggleField}
            onApplySelection={handleApplySelection}
            onUpdateField={handleUpdateField}
            onDeleteField={handleDeleteField}
          />
        </div>
      </div>
    </div>
  );
};

export default Index;
