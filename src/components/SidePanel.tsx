import { useState } from "react";
import { ArrowLeft, Search, MapPin, Pencil, ArrowUpDown, SlidersHorizontal } from "lucide-react";
import { Field } from "@/data/fields";
import FieldCard from "./FieldCard";
import FieldDetailView from "./FieldDetailView";

interface SidePanelProps {
  selectedFields: Field[];
  allFields: Field[];
  selectedField: Field | null;
  onFieldClick: (field: Field) => void;
  onDeselectField: () => void;
  onRemoveField: (id: string) => void;
  onToggleField: (field: Field) => void;
  onShowAll: () => void;
  onHideAll: () => void;
}

const SidePanel = ({
  selectedFields,
  allFields,
  selectedField,
  onFieldClick,
  onDeselectField,
  onRemoveField,
  onToggleField,
  onShowAll,
  onHideAll,
}: SidePanelProps) => {
  const [search, setSearch] = useState("");
  const [pendingSelection, setPendingSelection] = useState<Set<string>>(() => new Set(selectedFields.map(f => f.id)));
  const [isEditing, setIsEditing] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "area" | "ndvi">("name");
  const [filterCrop, setFilterCrop] = useState<string | null>(null);
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  if (selectedField) {
    return (
      <div className="w-[320px] h-full bg-card/95 backdrop-blur-md border-l border-border flex flex-col animate-fade-in">
        <FieldDetailView field={selectedField} onBack={onDeselectField} />
      </div>
    );
  }

  const crops = Array.from(new Set(allFields.map((f) => f.crop)));

  const filteredFields = allFields
    .filter(
      (f) =>
        (f.name.toLowerCase().includes(search.toLowerCase()) ||
        f.crop.toLowerCase().includes(search.toLowerCase())) &&
        (!filterCrop || f.crop === filterCrop)
    )
    .sort((a, b) => {
      if (sortBy === "area") return b.area - a.area;
      if (sortBy === "ndvi") return (b.ndviChange ?? 0) - (a.ndviChange ?? 0);
      return a.name.localeCompare(b.name);
    });

  const handleSave = () => {
    allFields.forEach(f => {
      const isSelected = selectedFields.some(sf => sf.id === f.id);
      const isPending = pendingSelection.has(f.id);
      if (isPending && !isSelected) onToggleField(f);
      if (!isPending && isSelected) onToggleField(f);
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setPendingSelection(new Set(selectedFields.map(f => f.id)));
    setIsEditing(false);
  };

  const handleTogglePending = (id: string) => {
    setIsEditing(true);
    setPendingSelection(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sortLabel = sortBy === "name" ? "Name" : sortBy === "area" ? "Area" : "NDVI";

  return (
    <div className="w-[320px] h-full bg-card/95 backdrop-blur-md border-l border-border flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">Select Fields</h2>
        </div>
        <button
          onClick={() => setIsEditing(!isEditing)}
          title="Edit selection"
          className={`p-1.5 rounded-md transition-colors ${isEditing ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-accent/30"}`}
        >
          <Pencil className="w-4 h-4" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pt-3">
        <div className="relative">
          <input
            type="text"
            placeholder="Search fields…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        </div>
      </div>

      {/* Filter/Sort toolbar */}
      <div className="flex gap-2 px-3 py-3 relative">
        <div className="relative">
          <button
            onClick={() => setShowFilterMenu(!showFilterMenu)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors ${
              filterCrop ? "border-primary/50 text-primary bg-primary/10" : "border-border text-foreground hover:bg-accent"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {filterCrop || "Filter"}
          </button>
          {showFilterMenu && (
            <div className="absolute top-full mt-1 left-0 w-40 rounded-lg border border-border bg-card shadow-xl z-20 overflow-hidden">
              <button
                onClick={() => { setFilterCrop(null); setShowFilterMenu(false); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors ${!filterCrop ? "text-primary" : "text-foreground"}`}
              >
                All crops
              </button>
              {crops.map((crop) => (
                <button
                  key={crop}
                  onClick={() => { setFilterCrop(crop); setShowFilterMenu(false); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors border-t border-border ${filterCrop === crop ? "text-primary" : "text-foreground"}`}
                >
                  {crop}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => setSortBy(sortBy === "name" ? "area" : sortBy === "area" ? "ndvi" : "name")}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-accent transition-colors"
        >
          <ArrowUpDown className="w-3.5 h-3.5" /> {sortLabel}
        </button>
      </div>

      {/* Field list */}
      <div className="flex-1 overflow-y-auto px-3 py-1 space-y-2">
        {filteredFields.map((field) => {
          const isActive = pendingSelection.has(field.id);
          return (
            <div
              key={field.id}
              onClick={() => onFieldClick(field)}
              className="cursor-pointer"
              style={{ opacity: isActive ? 1 : 0.5 }}
            >
              <FieldCard
                field={field}
                onRemove={(id) => handleTogglePending(id)}
                variant="select"
              />
            </div>
          );
        })}
      </div>

      {/* Bottom actions */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-between mb-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {pendingSelection.size} selected</span>
          <div className="flex gap-2">
            <button onClick={onShowAll} className="hover:text-foreground transition-colors">All</button>
            <button onClick={onHideAll} className="hover:text-foreground transition-colors">None</button>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleCancel}
            className="flex-1 py-2.5 rounded-lg border border-border text-sm text-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{ backgroundColor: "#F7F4E4", color: "#041009" }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default SidePanel;
