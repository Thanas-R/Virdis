import { useState } from "react";
import { Check, X, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { Field } from "@/data/fields";

interface DetectedField {
  name: string;
  crop: string;
  cropEmoji: string;
  ndviEstimate: number;
  color: string;
  coordinates: [number, number][];
}

interface DetectedFieldsReviewProps {
  detectedFields: DetectedField[];
  summary: string;
  onAccept: (fields: Field[]) => void;
  onDismiss: () => void;
}

const DetectedFieldsReview = ({ detectedFields, summary, onAccept, onDismiss }: DetectedFieldsReviewProps) => {
  const [selected, setSelected] = useState<Set<number>>(new Set(detectedFields.map((_, i) => i)));
  const [expanded, setExpanded] = useState(true);

  const toggleField = (idx: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const handleAccept = () => {
    const accepted: Field[] = Array.from(selected).map(idx => {
      const f = detectedFields[idx];
      const coords: [number, number][] = [...f.coordinates, f.coordinates[0]];
      return {
        id: `detected-${Date.now()}-${idx}`,
        name: f.name,
        crop: f.crop,
        cropEmoji: f.cropEmoji || "🌱",
        area: 0, // will be calculated
        location: "",
        color: f.color,
        ndviChange: 0,
        coordinates: [coords] as [number, number][][],
      };
    });
    onAccept(accepted);
  };

  // Calculate area from coordinates (Shoelace formula, approximate acres)
  const calcArea = (coords: [number, number][]) => {
    if (coords.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < coords.length; i++) {
      const j = (i + 1) % coords.length;
      area += coords[i][0] * coords[j][1];
      area -= coords[j][0] * coords[i][1];
    }
    area = Math.abs(area) / 2;
    // Convert degree² to m² (rough approximation at mid-latitudes)
    const midLat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
    const m2 = area * (111320 * Math.cos(midLat * Math.PI / 180)) * 111320;
    return Math.round(m2 / 4047 * 10) / 10; // acres
  };

  return (
    <div className="absolute bottom-20 right-4 z-30 w-80 max-h-[70vh] rounded-xl border border-border overflow-hidden"
      style={{ backgroundColor: "rgba(4, 16, 9, 0.92)", backdropFilter: "blur(16px)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">
            {detectedFields.length} Fields Detected
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setExpanded(!expanded)} className="p-1 rounded hover:bg-accent/30 text-muted-foreground">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
          <button onClick={onDismiss} className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <>
          {/* Summary */}
          <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border/30">
            {summary}
          </div>

          {/* Field list */}
          <div className="overflow-y-auto max-h-[40vh] px-2 py-2 space-y-1.5">
            {detectedFields.map((field, idx) => (
              <button
                key={idx}
                onClick={() => toggleField(idx)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                  selected.has(idx) ? "bg-accent/20 border border-primary/30" : "bg-transparent border border-transparent opacity-50"
                }`}
              >
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: field.color }} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground truncate">
                    {field.cropEmoji} {field.name}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {field.crop} · ~{calcArea(field.coordinates)} ac · NDVI {field.ndviEstimate?.toFixed(2) || "N/A"}
                  </div>
                </div>
                <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${
                  selected.has(idx) ? "bg-primary" : "border border-border"
                }`}>
                  {selected.has(idx) && <Check className="w-3 h-3 text-primary-foreground" />}
                </div>
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="px-4 py-3 border-t border-border/50 flex gap-2">
            <button onClick={onDismiss}
              className="flex-1 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground border border-border hover:bg-accent/20 transition-colors">
              Discard All
            </button>
            <button onClick={handleAccept} disabled={selected.size === 0}
              className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40">
              Add {selected.size} Field{selected.size !== 1 ? "s" : ""}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default DetectedFieldsReview;
