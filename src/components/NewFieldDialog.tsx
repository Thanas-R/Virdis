import { useState, useEffect } from "react";
import { X } from "lucide-react";
import LocationAutocomplete from "./LocationAutocomplete";
import { supabase } from "@/integrations/supabase/client";

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

function calculateArea(coords: [number, number][]): number {
  let area = 0;
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += coords[i][0] * coords[j][1];
    area -= coords[j][0] * coords[i][1];
  }
  area = Math.abs(area) / 2;
  area = (area * 111000 * 85000) / 10000;
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
  const [crop, setCrop] = useState("Maize");
  const [color, setColor] = useState("#EAB947");
  const [group, setGroup] = useState("");
  const [location, setLocation] = useState("");

  const estimatedArea = calculateArea(coordinates);

  // Reverse geocode the center of the drawn polygon
  useEffect(() => {
    const reverseGeocode = async () => {
      let token = mapToken;
      if (!token) {
        const { data } = await supabase.functions.invoke("get-mapbox-token");
        token = data?.token;
      }
      if (!token || !coordinates.length) return;
      const center = coordinates.reduce(
        (acc, c) => [acc[0] + c[0] / coordinates.length, acc[1] + c[1] / coordinates.length],
        [0, 0]
      );
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${center[0]},${center[1]}.json?access_token=${token}&limit=1`
        );
        const geoData = await res.json();
        if (geoData.features?.[0]) {
          setLocation(geoData.features[0].place_name);
        }
      } catch {}
    };
    reverseGeocode();
  }, [coordinates, mapToken]);

  const handleSave = () => {
    if (!name.trim()) return;
    const closed = [...coordinates, coordinates[0]] as [number, number][];
    onSave({
      name: name.trim(),
      crop,
      cropEmoji: "",
      area: estimatedArea,
      color,
      location: location || `${coordinates[0][1].toFixed(3)}°N, ${coordinates[0][0].toFixed(3)}°E`,
      group: group || undefined,
      coordinates: [closed],
    });
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card rounded-xl border border-border p-5 w-80 space-y-4 shadow-2xl animate-fade-in">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">New Field</h3>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">Field Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Field#7890"
            className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />
        </div>

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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Area (ha)</label>
            <div className="bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-muted-foreground">
              ~{estimatedArea}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Group</label>
            <input
              type="text"
              value={group}
              onChange={e => setGroup(e.target.value)}
              placeholder="Optional"
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
            mapToken={mapToken}
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

        <div className="flex gap-3 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg border border-border text-sm text-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors bg-primary text-primary-foreground disabled:opacity-50"
          >
            Save Field
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewFieldDialog;
