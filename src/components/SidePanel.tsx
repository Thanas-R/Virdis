import { useState } from "react";
import { Search, ArrowUpDown, SlidersHorizontal, MapPin } from "lucide-react";
import { Field } from "@/data/fields";
import FieldCard from "./FieldCard";
import FieldDetailView from "./FieldDetailView";
import FieldEditDialog from "./FieldEditDialog";

interface SidePanelProps {
  allFields: Field[];
  selectedFields: Field[];
  activeField: Field | null;
  detailField: Field | null;
  onFieldClick: (field: Field) => void;
  onFieldDoubleClick: (field: Field) => void;
  onBackFromDetail: () => void;
  onToggleField: (field: Field) => void;
  onApplySelection: (ids: string[]) => void;
  onUpdateField: (field: Field) => void;
  onDeleteField: (id: string) => void;
  onEditBoundary?: (field: Field) => void;
}

const SidePanel = ({
  allFields,
  selectedFields,
  activeField,
  detailField,
  onFieldClick,
  onFieldDoubleClick,
  onBackFromDetail,
  onUpdateField,
  onDeleteField,
  onEditBoundary,
}: SidePanelProps) => {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "area" | "ndvi">("name");
  const [filterCrop, setFilterCrop] = useState<string | null>(null);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [editingField, setEditingField] = useState<Field | null>(null);

  // Detail view
  if (detailField) {
    return (
      <div className="w-[320px] h-full bg-card/95 backdrop-blur-md border-l border-border flex flex-col animate-fade-in">
        <FieldDetailView
          field={detailField}
          onBack={onBackFromDetail}
          onEditBoundary={onEditBoundary ? () => onEditBoundary(detailField) : undefined}
        />
      </div>
    );
  }

  const crops = Array.from(new Set(allFields.map(f => f.crop)));

  const filtered = allFields
    .filter(f =>
      (f.name.toLowerCase().includes(search.toLowerCase()) ||
       f.crop.toLowerCase().includes(search.toLowerCase())) &&
      (!filterCrop || f.crop === filterCrop)
    )
    .sort((a, b) => {
      if (sortBy === "area") return b.area - a.area;
      if (sortBy === "ndvi") return (b.ndviChange ?? 0) - (a.ndviChange ?? 0);
      return a.name.localeCompare(b.name);
    });

  const sortLabel = sortBy === "name" ? "Name" : sortBy === "area" ? "Area" : "NDVI";

  return (
    <div className="w-[320px] h-full bg-card/95 backdrop-blur-md border-l border-border flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground">Field List</h2>
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

      {/* Filter / Sort */}
      <div className="flex gap-2 px-3 py-3 relative">
        <div className="relative">
          <button
            onClick={() => setShowFilterMenu(!showFilterMenu)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors ${
              filterCrop
                ? "border-primary/50 text-primary bg-primary/10"
                : "border-border text-foreground hover:bg-accent"
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
              {crops.map(crop => (
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
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
        {filtered.map(field => (
          <div
            key={field.id}
            onClick={() => onFieldClick(field)}
            onDoubleClick={(e) => { e.preventDefault(); onFieldDoubleClick(field); }}
            className="cursor-pointer"
          >
            <FieldCard
              field={field}
              onRemove={() => setEditingField(field)}
              variant="list"
              isActive={activeField?.id === field.id}
            />
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">No fields match</div>
        )}
      </div>

      {/* Bottom */}
      <div className="p-4 border-t border-border">
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <MapPin className="w-3 h-3" /> {filtered.length} field{filtered.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Field Edit Dialog */}
      {editingField && (
        <FieldEditDialog
          field={editingField}
          onSave={(updated) => { onUpdateField(updated); setEditingField(null); }}
          onDelete={(id) => { onDeleteField(id); setEditingField(null); }}
          onClose={() => setEditingField(null)}
        />
      )}
    </div>
  );
};

export default SidePanel;
