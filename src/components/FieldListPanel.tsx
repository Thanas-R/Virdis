import { Search, Check, ArrowUpDown } from "lucide-react";
import { useState } from "react";
import { Field } from "@/data/fields";
import FieldCard from "./FieldCard";

interface FieldListPanelProps {
  fields: Field[];
  onRemoveField: (id: string) => void;
}

const FieldListPanel = ({ fields, onRemoveField }: FieldListPanelProps) => {
  const [search, setSearch] = useState("");

  const filtered = fields.filter(
    (f) =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.crop.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-[300px] h-full bg-card/95 backdrop-blur-md border-l border-border flex flex-col">
      {/* Search */}
      <div className="px-3 pt-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search fields…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-secondary/50 border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Filter/Sort */}
      <div className="flex gap-2 px-3 py-2">
        <button className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-border text-xs text-foreground hover:bg-accent transition-colors">
          <Check className="w-3.5 h-3.5" /> Filter
        </button>
        <button className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-border text-xs text-foreground hover:bg-accent transition-colors">
          <ArrowUpDown className="w-3.5 h-3.5" /> Sort
        </button>
      </div>

      {/* Field list */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
        {filtered.map((field) => (
          <FieldCard key={field.id} field={field} onRemove={onRemoveField} variant="list" />
        ))}
      </div>
    </div>
  );
};

export default FieldListPanel;
