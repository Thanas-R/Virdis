import { useState } from "react";
import { Search, ArrowUpDown, SlidersHorizontal, MapPin, X, PenTool } from "lucide-react";
import { Field } from "@/data/fields";
import FieldCard from "./FieldCard";
import FieldEditDialog from "./FieldEditDialog";

interface MobileFieldSheetProps {
  allFields: Field[];
  selectedFields: Field[];
  activeField: Field | null;
  onFieldClick: (field: Field) => void;
  onFieldDoubleClick: (field: Field) => void;
  onUpdateField: (field: Field) => void;
  onDeleteField: (id: string) => void;
  onClose: () => void;
}

const MobileFieldSheet = ({
  allFields,
  activeField,
  onFieldClick,
  onFieldDoubleClick,
  onUpdateField,
  onDeleteField,
  onClose,
}: MobileFieldSheetProps) => {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "area" | "ndvi">("name");
  const [filterCrop, setFilterCrop] = useState<string | null>(null);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [editingField, setEditingField] = useState<Field | null>(null);

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
    <div className="absolute inset-0 z-30 bg-background flex flex-col pb-20">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground">Region List</h2>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-3 pt-3">
        <div className="relative">
          <input
            type="text"
            placeholder="Search regions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2.5 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        </div>
      </div>

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
            <div className="absolute top-full mt-1 left-0 w-40 rounded-lg border border-border bg-card shadow-xl z-20 overflow-hidden max-h-60 overflow-y-auto">
              <button
                onClick={() => { setFilterCrop(null); setShowFilterMenu(false); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors ${!filterCrop ? "text-primary" : "text-foreground"}`}
              >
                All types
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

      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
        {filtered.length === 0 && allFields.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center space-y-4">
            <div className="w-14 h-14 rounded-full border-2 border-dashed border-muted-foreground/40 flex items-center justify-center">
              <MapPin className="w-6 h-6 text-muted-foreground/60" />
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">No regions yet</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">Go to the Map tab and tap the <PenTool className="inline-block align-text-bottom mx-0.5 text-foreground w-3.5 h-3.5" /> icon to draw your first region.</p>
            </div>
          </div>
        )}
        {filtered.map((field, index) => (
          <div
            key={field.id}
            onClick={() => onFieldClick(field)}
            onDoubleClick={(e) => { e.preventDefault(); onFieldDoubleClick(field); }}
            className={`cursor-pointer ${index === 0 ? "mt-1" : ""}`}
          >
            <FieldCard
              field={field}
              onRemove={() => setEditingField(field)}
              variant="list"
              isActive={activeField?.id === field.id}
            />
          </div>
        ))}
        {filtered.length === 0 && allFields.length > 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">No regions match</div>
        )}
      </div>

      <div className="p-3 border-t border-border">
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <MapPin className="w-3 h-3" /> {filtered.length} region{filtered.length !== 1 ? "s" : ""}
        </div>
      </div>

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

export default MobileFieldSheet;
