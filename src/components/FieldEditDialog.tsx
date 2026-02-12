import { useState } from "react";
import { X, Trash2 } from "lucide-react";
import { Field } from "@/data/fields";
import LocationAutocomplete from "./LocationAutocomplete";

const PRESET_COLORS = [
  "#D4A853", "#C75B7A", "#5BB8C7", "#8B9A5B", "#7BC75B",
  "#EAB947", "#E06C75", "#61AFEF", "#C678DD", "#98C379",
  "#D19A66", "#56B6C2", "#BE5046", "#E5C07B", "#FF6B6B",
];

const CROP_OPTIONS = [
  { name: "Maize" },
  { name: "Grapes" },
  { name: "Sunflower" },
  { name: "Apple" },
  { name: "Wheat" },
  { name: "Rice" },
  { name: "Soybean" },
  { name: "Cotton" },
];

interface FieldEditDialogProps {
  field: Field;
  onSave: (updated: Field) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const FieldEditDialog = ({ field, onSave, onDelete, onClose }: FieldEditDialogProps) => {
  const [name, setName] = useState(field.name);
  const [crop, setCrop] = useState(field.crop);
  const [area, setArea] = useState(String(field.area));
  const [location, setLocation] = useState(field.location);
  const [color, setColor] = useState(field.color);
  const [group, setGroup] = useState(field.group || "");

  const handleSave = () => {
    onSave({
      ...field,
      name,
      crop,
      cropEmoji: "",
      area: parseFloat(area) || field.area,
      location,
      color,
      group: group || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card rounded-xl border border-border p-5 w-80 space-y-4 shadow-2xl animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Edit Field</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Name */}
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Field Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Crop */}
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Crop</label>
          <select
            value={crop}
            onChange={e => setCrop(e.target.value)}
            className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {CROP_OPTIONS.map(c => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Area + Group */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Area (ha)</label>
            <input
              type="number"
              step="0.1"
              value={area}
              onChange={e => setArea(e.target.value)}
              className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Group</label>
            <input
              type="text"
              value={group}
              onChange={e => setGroup(e.target.value)}
              className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        {/* Location with geocoding */}
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Location</label>
          <LocationAutocomplete
            value={location}
            onChange={setLocation}
            placeholder="Search location…"
          />
        </div>

        {/* Color picker */}
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Color</label>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  backgroundColor: c,
                  borderColor: color === c ? "hsl(60, 20%, 85%)" : "transparent",
                  transform: color === c ? "scale(1.2)" : undefined,
                }}
              />
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={() => onDelete(field.id)}
            className="p-2.5 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors"
            title="Delete field"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-border text-sm text-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors bg-primary text-primary-foreground"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default FieldEditDialog;
