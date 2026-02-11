import { useState } from "react";
import { ArrowLeft, Menu, Search, X } from "lucide-react";
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
}: SidePanelProps) => {
  const [search, setSearch] = useState("");

  if (selectedField) {
    return (
      <div className="w-[320px] h-full bg-card/95 backdrop-blur-md border-l border-border flex flex-col animate-fade-in">
        <FieldDetailView field={selectedField} onBack={onDeselectField} />
      </div>
    );
  }

  const filteredFields = selectedFields.filter(
    (f) =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.crop.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-[320px] h-full bg-card/95 backdrop-blur-md border-l border-border flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">Select Fields</h2>
        </div>
        <button className="text-muted-foreground hover:text-foreground transition-colors">
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Search (hidden, minimal) */}
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

      {/* Field list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {filteredFields.map((field) => (
          <div
            key={field.id}
            onClick={() => onFieldClick(field)}
            className="cursor-pointer"
          >
            <FieldCard field={field} onRemove={onRemoveField} variant="select" />
          </div>
        ))}
      </div>

      {/* Bottom actions */}
      <div className="p-4 border-t border-border flex gap-3">
        <button className="flex-1 py-2.5 rounded-lg border border-border text-sm text-foreground hover:bg-accent transition-colors">
          Cancel
        </button>
        <button className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors" style={{ backgroundColor: "#F7F4E4", color: "#041009" }}>
          Save
        </button>
      </div>
    </div>
  );
};

export default SidePanel;
