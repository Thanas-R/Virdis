import { useState, useEffect, useCallback } from "react";
import MapView from "@/components/MapView";
import WeatherView from "@/components/WeatherView";
import { fields as initialFieldsData, Field } from "@/data/fields";
import SidePanel from "@/components/SidePanel";
import { useIsMobile } from "@/hooks/use-mobile";
import MobileBottomNav from "@/components/MobileBottomNav";
import MobileFieldSheet from "@/components/MobileFieldSheet";
import { useSwipe } from "@/hooks/use-swipe";

const ALL_FIELDS_KEY = "farm-fields-v7";
const SELECTED_IDS_KEY = "farm-sel-v7";

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
  const isMobile = useIsMobile();
  const [view, setView] = useState<"map" | "analytics">("map");
  const [allFields, setAllFields] = useState<Field[]>(loadAllFields);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => loadSelectedIds(loadAllFields()));
  const [activeField, setActiveField] = useState<Field | null>(null);
  const [detailField, setDetailField] = useState<Field | null>(null);
  const [flyToField, setFlyToField] = useState<Field | null>(null);
  const [editBoundaryFieldId, setEditBoundaryFieldId] = useState<string | null>(null);
  // Mobile-specific state
  const [mobileTab, setMobileTab] = useState<"map" | "fields" | "analytics" | "detail">("map");

  const selectedFields = allFields.filter(f => selectedIds.includes(f.id));

  useEffect(() => { localStorage.setItem(ALL_FIELDS_KEY, JSON.stringify(allFields)); }, [allFields]);
  useEffect(() => { localStorage.setItem(SELECTED_IDS_KEY, JSON.stringify(selectedIds)); }, [selectedIds]);

  const handleFieldClick = useCallback((field: Field) => { setActiveField(field); setFlyToField(field); }, []);
  const handleFieldDoubleClick = useCallback((field: Field) => {
    setActiveField(field);
    setDetailField(field);
    if (isMobile) setMobileTab("detail");
  }, [isMobile]);
  const handleToggleField = useCallback((field: Field) => {
    setSelectedIds(prev => prev.includes(field.id) ? prev.filter(id => id !== field.id) : [...prev, field.id]);
  }, []);
  const handleAddField = useCallback((field: Field) => { setAllFields(prev => [...prev, field]); setSelectedIds(prev => [...prev, field.id]); }, []);
  const handleUpdateField = useCallback((updated: Field) => {
    setAllFields(prev => prev.map(f => f.id === updated.id ? updated : f));
    if (detailField?.id === updated.id) setDetailField(updated);
    if (activeField?.id === updated.id) setActiveField(updated);
  }, [detailField, activeField]);
  const handleDeleteField = useCallback((id: string) => {
    setAllFields(prev => prev.filter(f => f.id !== id));
    setSelectedIds(prev => prev.filter(fid => fid !== id));
    if (detailField?.id === id) { setDetailField(null); if (isMobile) setMobileTab("fields"); }
    if (activeField?.id === id) setActiveField(null);
  }, [detailField, activeField, isMobile]);
  const handleApplySelection = useCallback((ids: string[]) => { setSelectedIds(ids); }, []);
  const handleEditBoundary = useCallback((field: Field) => {
    setEditBoundaryFieldId(field.id); setDetailField(null); setFlyToField(field);
    if (isMobile) setMobileTab("map");
  }, [isMobile]);

  const tabOrder: ("map" | "fields" | "analytics")[] = ["map", "fields", "analytics"];
  const swipeHandlers = useSwipe({
    onSwipeLeft: () => {
      if (mobileTab === "detail") return;
      const idx = tabOrder.indexOf(mobileTab);
      if (idx < tabOrder.length - 1) setMobileTab(tabOrder[idx + 1]);
    },
    onSwipeRight: () => {
      if (mobileTab === "detail") return;
      const idx = tabOrder.indexOf(mobileTab);
      if (idx > 0) setMobileTab(tabOrder[idx - 1]);
    },
  });

  // MOBILE LAYOUT
  if (isMobile) {
    return (
      <div className="h-screen w-screen bg-background flex flex-col relative overflow-hidden" {...swipeHandlers}>
        {/* Full-screen map always rendered behind */}
        <div className="absolute inset-0" style={{ bottom: 0 }}>
          <MapView allFields={allFields} selectedFields={selectedFields} activeField={activeField} flyToField={flyToField}
            onFlyToDone={() => setFlyToField(null)} onFieldClickOnMap={(field) => { setActiveField(field); setDetailField(field); setMobileTab("detail"); }}
            onAddField={handleAddField} editBoundaryFieldId={editBoundaryFieldId} onUpdateField={handleUpdateField} onCancelEditBoundary={() => setEditBoundaryFieldId(null)} />
        </div>

        {/* Slide-up sheets for fields/analytics/detail */}
        {mobileTab === "fields" && (
          <MobileFieldSheet
            allFields={allFields}
            selectedFields={selectedFields}
            activeField={activeField}
            onFieldClick={(f) => { handleFieldClick(f); setMobileTab("map"); }}
            onFieldDoubleClick={handleFieldDoubleClick}
            onUpdateField={handleUpdateField}
            onDeleteField={handleDeleteField}
            onClose={() => setMobileTab("map")}
          />
        )}

        {mobileTab === "analytics" && (
          <div className="absolute inset-0 z-30 bg-background overflow-y-auto pb-20">
            <WeatherView activeField={activeField} selectedFields={selectedFields} allFields={allFields} />
          </div>
        )}

        {mobileTab === "detail" && detailField && (
          <div className="absolute inset-0 z-30 bg-card overflow-y-auto pb-20">
            <SidePanel allFields={allFields} selectedFields={selectedFields} activeField={activeField} detailField={detailField}
              onFieldClick={handleFieldClick} onFieldDoubleClick={handleFieldDoubleClick}
              onBackFromDetail={() => { setDetailField(null); setMobileTab("map"); }}
              onToggleField={handleToggleField} onApplySelection={handleApplySelection}
              onUpdateField={handleUpdateField} onDeleteField={handleDeleteField} onEditBoundary={handleEditBoundary} />
          </div>
        )}

        {/* Floating Bottom Navigation */}
        <MobileBottomNav activeTab={mobileTab === "detail" ? "fields" : mobileTab} onTabChange={(tab) => {
          if (tab === "map") { setMobileTab("map"); }
          else if (tab === "fields") { setMobileTab("fields"); }
          else if (tab === "analytics") { setMobileTab("analytics"); }
        }} />
      </div>
    );
  }

  // DESKTOP LAYOUT (unchanged)
  return (
    <div className="h-screen w-screen bg-surface-outer flex items-center justify-center p-6">
      <div className="w-full h-full max-w-[1400px] max-h-[900px] rounded-2xl overflow-hidden bg-background shadow-2xl relative border-[#041009] border-2">
        {/* View toggle */}
        <div className="absolute top-4 z-20 flex gap-1 bg-card/80 backdrop-blur-sm rounded-lg border border-border p-1" style={{ left: "calc(50% - 15px)", transform: "translateX(-50%)" }}>
          {(["map", "analytics"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all duration-300 ${view === v ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {v === "map" ? "Map" : "Analytics"}
            </button>
          ))}
        </div>

        <div className="flex w-full h-full">
          <div className="flex-1 relative">
            <div className="absolute inset-0 transition-opacity duration-200" style={{ opacity: view === "map" ? 1 : 0, pointerEvents: view === "map" ? "auto" : "none" }}>
              <MapView allFields={allFields} selectedFields={selectedFields} activeField={activeField} flyToField={flyToField}
                onFlyToDone={() => setFlyToField(null)} onFieldClickOnMap={(field) => { setActiveField(field); setDetailField(field); }}
                onAddField={handleAddField} editBoundaryFieldId={editBoundaryFieldId} onUpdateField={handleUpdateField} onCancelEditBoundary={() => setEditBoundaryFieldId(null)} />
            </div>
            <div className="absolute inset-0 transition-opacity duration-200" style={{ opacity: view === "analytics" ? 1 : 0, pointerEvents: view === "analytics" ? "auto" : "none" }}>
              <WeatherView activeField={activeField} selectedFields={selectedFields} allFields={allFields} />
            </div>
          </div>
          <SidePanel allFields={allFields} selectedFields={selectedFields} activeField={activeField} detailField={detailField}
            onFieldClick={handleFieldClick} onFieldDoubleClick={handleFieldDoubleClick} onBackFromDetail={() => setDetailField(null)}
            onToggleField={handleToggleField} onApplySelection={handleApplySelection} onUpdateField={handleUpdateField} onDeleteField={handleDeleteField} onEditBoundary={handleEditBoundary} />
        </div>
      </div>
    </div>
  );
};

export default Index;
