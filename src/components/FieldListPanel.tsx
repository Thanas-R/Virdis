import { Search, Check, ArrowUpDown, PanelRightClose } from "lucide-react";
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
    <div className="w-[320px] h-full bg-card/95 backdrop-blur-md border-l border-border flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground">Field List</h2>
        <button className="text-muted-foreground hover:text-foreground transition-colors">
          <PanelRightClose className="w-5 h-5" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pt-3">
        <div className="relative">
          <input
            type="text"
            placeholder="Field…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />

          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        </div>
      </div>

      {/* Filter/Sort */}
      <div className="flex gap-2 px-3 py-3">
        <button className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-accent transition-colors">
          <Check className="w-4 h-4" /> Filter
        </button>
        <button className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-accent transition-colors">
          <ArrowUpDown className="w-4 h-4" /> Sort
        </button>
      </div>

      {/* Field list */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
        {filtered.map((field) =>
        <FieldCard key={field.id} field={field} onRemove={onRemoveField} variant="list" />
        )}
      </div>
    </div>);

};

export default FieldListPanel;