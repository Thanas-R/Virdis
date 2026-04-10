import { useState, useEffect } from "react";
import { X, Search } from "lucide-react";
import LocationAutocomplete from "./LocationAutocomplete";
import { supabase } from "@/integrations/supabase/client";
import { CROP_OPTIONS, CROP_CATEGORIES } from "@/data/crops";

const PRESET_COLORS = [
  "#D4A853", "#C75B7A", "#5BB8C7", "#8B9A5B", "#7BC75B",
  "#EAB947", "#E06C75", "#61AFEF", "#C678DD", "#98C379",
  "#D19A66", "#56B6C2", "#BE5046", "#E5C07B", "#FF6B6B",
];

function calculateAreaAcres(coords: [number, number][]): number {
  let area = 0;
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += coords[i][0] * coords[j][1];
    area -= coords[j][0] * coords[i][1];
  }
  area = Math.abs(area) / 2;
  area = (area * 111000 * 85000) / 4046.86;
  return Math.round(area * 10) / 10;
}

interface NewFieldDialogProps {
  coordinates: [number, number][];
  mapToken?: string;
  onSave: (field: {
    name: string;
    crop: string;
    cropEmoji: string;
    area: number;
    color: string;
    location: string;
    group?: string;
    coordinates: [number, number][][];
  }) => void;
  onCancel: () => void;
}

const NewFieldDialog = ({ coordinates, mapToken, onSave, onCancel }: NewFieldDialogProps) => {
  const [name, setName] = useState("");
  const [crop, setCrop] = useState("Wheat");
  const [color, setColor] = useState("#EAB947");
  const [group, setGroup] = useState("");
  const [location, setLocation] = useState("");
  const [cropSearch, setCropSearch] = useState("");
  const [showCropDropdown, setShowCropDropdown] = useState(false);

  const estimatedAcres = calculateAreaAcres(coordinates);
  const estimatedHa = Math.round((estimatedAcres / 2.47105) * 10) / 10;

  useEffect(() => {
    const reverseGeocode = async () => {
      let token = mapToken;
      if (!token) {
        const { data } = await supabase.functions.invoke("get-mapbox-token");
        token = data?.token;
      }
      if (!token || !coordinates.length) return;
      const center = coordinates.reduce(
        (acc, c) => [acc[0] + c[0] / coordinates.length, acc[1] + c[1] / coordinates.length], [0, 0]
      );
      try {
        const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${center[0]},${center[1]}.json?access_token=${token}&limit=1`);
        const geoData = await res.json();
        if (geoData.features?.[0]) setLocation(geoData.features[0].place_name);
      } catch {}
    };
    reverseGeocode();
  }, [coordinates, mapToken]);

  const filteredCrops = cropSearch
    ? CROP_OPTIONS.filter(c => c.name.toLowerCase().includes(cropSearch.toLowerCase()) || c.category.toLowerCase().includes(cropSearch.toLowerCase()))
    : CROP_OPTIONS;

  const groupedCrops = CROP_CATEGORIES.reduce((acc, cat) => {
    const crops = filteredCrops.filter(c => c.category === cat);
    if (crops.length > 0) acc[cat] = crops;
    return acc;
  }, {} as Record<string, typeof CROP_OPTIONS>);

  const handleSave = () => {
    if (!name.trim()) return;
    const closed = [...coordinates, coordinates[0]] as [number, number][];
    onSave({
      name: name.trim(),
      crop,
      cropEmoji: "",
      area: estimatedHa,
      color,
      location: location || `${coordinates[0][1].toFixed(3)}°N, ${coordinates[0][0].toFixed(3)}°E`,
      group: group || undefined,
      coordinates: [closed],
    });
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card rounded-xl border border-border p-5 w-80 space-y-4 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">New Region</h3>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">Region Name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Region#7890"
            className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" autoFocus />
        </div>

        <div className="relative">
          <label className="text-xs text-muted-foreground block mb-1">Crop / Land Use</label>
          <button
            type="button"
            onClick={() => setShowCropDropdown(!showCropDropdown)}
            className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground text-left focus:outline-none focus:ring-1 focus:ring-ring flex items-center justify-between"
          >
            <span>{crop}</span>
            <span className="text-muted-foreground text-xs">▼</span>
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
            <div className="bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-muted-foreground">~{estimatedAcres}</div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Group</label>
            <input type="text" value={group} onChange={e => setGroup(e.target.value)} placeholder="Optional"
              className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">Location</label>
          <LocationAutocomplete value={location} onChange={setLocation} placeholder="Search location..." mapToken={mapToken} />
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">Color</label>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                style={{ backgroundColor: c, borderColor: color === c ? "hsl(60, 20%, 85%)" : "transparent", transform: color === c ? "scale(1.2)" : undefined }} />
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-lg border border-border text-sm text-foreground hover:bg-accent transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={!name.trim()} className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors bg-primary text-primary-foreground disabled:opacity-50">Save Region</button>
        </div>
      </div>
    </div>
  );
};

export default NewFieldDialog;
