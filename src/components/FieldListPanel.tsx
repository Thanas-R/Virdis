import { Search, Check, ArrowUpDown, SlidersHorizontal, Pencil } from "lucide-react";
import { useState } from "react";
import { Field } from "@/data/fields";
import FieldCard from "./FieldCard";

interface FieldListPanelProps {
  fields: Field[];
  onRemoveField: (id: string) => void;
  onFieldClick?: (field: Field) => void;
  onEditField?: (field: Field) => void;
}

const FieldListPanel = ({ fields, onRemoveField, onFieldClick, onEditField }: FieldListPanelProps) => {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "area" | "ndvi">("name");
  const [filterCrop, setFilterCrop] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const crops = Array.from(new Set(fields.map((f) => f.crop)));

  const filtered = fields
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

  const sortLabels: Record<string, string> = { name: "Name", area: "Area", ndvi: "NDVI" };

  return (
    <div className="w-[320px] h-full bg-card/95 backdrop-blur-md border-l border-border flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground">Field List</h2>
        <button
          onClick={() => setIsEditing(!isEditing)}
          className={`p-1.5 rounded-md transition-colors ${isEditing ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          title="Edit fields"
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

      {/* Filter/Sort/Edit row */}
      <div className="flex gap-2 px-3 py-3">
        {/* Filter dropdown */}
        <div className="relative flex-1">
          <button
            onClick={() => setFilterCrop(filterCrop ? null : crops[0] || null)}
            className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-border text-sm transition-colors ${filterCrop ? "bg-primary/20 text-primary border-primary/40" : "text-foreground hover:bg-accent"}`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            {filterCrop || "Filter"}
          </button>
          {filterCrop && (
            <div className="absolute top-full mt-1 left-0 w-full rounded-lg border border-border bg-card shadow-lg z-10 overflow-hidden">
              <button
                onClick={() => setFilterCrop(null)}
                className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-accent border-b border-border"
              >
                All crops
              </button>
              {crops.map((crop) => (
                <button
                  key={crop}
                  onClick={() => setFilterCrop(crop)}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-accent ${filterCrop === crop ? "text-primary" : "text-foreground"}`}
                >
                  {crop}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sort */}
        <button
          onClick={() => setSortBy(sortBy === "name" ? "area" : sortBy === "area" ? "ndvi" : "name")}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-accent transition-colors"
        >
          <ArrowUpDown className="w-4 h-4" /> {sortLabels[sortBy]}
        </button>
      </div>

      {/* Field list */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
        {filtered.map((field) => (
          <FieldCard
            key={field.id}
            field={field}
            onRemove={isEditing ? onRemoveField : () => {}}
            onClick={isEditing ? undefined : onFieldClick}
            variant="list"
          />
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">No fields found</div>
        )}
      </div>

      {/* Field count */}
      <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground">
        {filtered.length} of {fields.length} fields
      </div>
    </div>
  );
};

export default FieldListPanel;
