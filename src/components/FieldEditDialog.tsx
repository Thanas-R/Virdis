import { useState } from "react";
import { X, Trash2, Search } from "lucide-react";
import { Field } from "@/data/fields";
import { haToAcres } from "@/data/fields";
import LocationAutocomplete from "./LocationAutocomplete";
import { CROP_OPTIONS, CROP_CATEGORIES } from "@/data/crops";

const PRESET_COLORS = [
  "#D4A853", "#C75B7A", "#5BB8C7", "#8B9A5B", "#7BC75B",
  "#EAB947", "#E06C75", "#61AFEF", "#C678DD", "#98C379",
  "#D19A66", "#56B6C2", "#BE5046", "#E5C07B", "#FF6B6B",
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
  const [area, setArea] = useState(String(haToAcres(field.area)));
  const [location, setLocation] = useState(field.location);
  const [color, setColor] = useState(field.color);
  const [group, setGroup] = useState(field.group || "");
  const [cropSearch, setCropSearch] = useState("");
  const [showCropDropdown, setShowCropDropdown] = useState(false);

  const filteredCrops = cropSearch
    ? CROP_OPTIONS.filter(c => c.name.toLowerCase().includes(cropSearch.toLowerCase()) || c.category.toLowerCase().includes(cropSearch.toLowerCase()))
    : CROP_OPTIONS;

  const groupedCrops = CROP_CATEGORIES.reduce((acc, cat) => {
    const crops = filteredCrops.filter(c => c.category === cat);
    if (crops.length > 0) acc[cat] = crops;
    return acc;
  }, {} as Record<string, typeof CROP_OPTIONS>);

  const handleSave = () => {
    const areaAcres = parseFloat(area) || haToAcres(field.area);
    const areaHa = Math.round((areaAcres / 2.47105) * 10) / 10;
    onSave({ ...field, name, crop, cropEmoji: "", area: areaHa, location, color, group: group || undefined });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]">
      <div className="bg-card rounded-xl border border-border p-5 w-80 space-y-4 shadow-2xl animate-fade-in mx-[5px] max-h-[85vh] overflow-y-auto mb-16 sm:mb-0">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Edit Region</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">Region Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>

        <div className="relative">
          <label className="text-xs text-muted-foreground block mb-1">Crop / Land Use</label>
          <button type="button" onClick={() => setShowCropDropdown(!showCropDropdown)}
            className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground text-left focus:outline-none focus:ring-1 focus:ring-ring flex items-center justify-between">
            <span>{crop}</span><span className="text-muted-foreground text-xs">▼</span>
          </button>
          {showCropDropdown && (
            <div className="absolute top-full mt-1 left-0 right-0 bg-card border border-border rounded-lg shadow-xl z-30 max-h-56 overflow-y-auto">
              <div className="sticky top-0 bg-card p-2 border-b border-border">
                <div className="relative">
                  <input type="text" value={cropSearch} onChange={e => setCropSearch(e.target.value)} placeholder="Search crops..."
                    className="w-full bg-secondary/50 border border-border rounded-md px-3 py-1.5 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" autoFocus />
                  <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                </div>
              </div>
              {Object.entries(groupedCrops).map(([category, crops]) => (
                <div key={category}>
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-accent/20">{category}</div>
                  {crops.map(c => (
                    <button key={c.name} onClick={() => { setCrop(c.name); setShowCropDropdown(false); setCropSearch(""); }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors ${crop === c.name ? "text-primary bg-primary/10" : "text-foreground"}`}>
                      {c.name}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Area (acres)</label>
            <input type="number" step="0.1" value={area} onChange={(e) => setArea(e.target.value)}
              className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Group</label>
            <input type="text" value={group} onChange={(e) => setGroup(e.target.value)}
              className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">Location</label>
          <LocationAutocomplete value={location} onChange={setLocation} placeholder="Search location..." />
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">Color</label>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                style={{ backgroundColor: c, borderColor: color === c ? "hsl(60, 20%, 85%)" : "transparent", transform: color === c ? "scale(1.2)" : undefined }} />
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={() => onDelete(field.id)} className="p-2.5 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors" title="Delete region">
            <Trash2 className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-border text-sm text-foreground hover:bg-accent transition-colors">Cancel</button>
          <button onClick={handleSave} className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors bg-primary text-primary-foreground">Save</button>
        </div>
      </div>
    </div>
  );
};

export default FieldEditDialog;
