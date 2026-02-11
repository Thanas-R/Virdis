import { Plus, Minus, Map } from "lucide-react";
import { useState } from "react";

type MapStyle = "dark" | "satellite";

interface MapToolbarProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onStyleChange?: (style: MapStyle) => void;
}

const MapToolbar = ({ onZoomIn, onZoomOut, onStyleChange }: MapToolbarProps) => {
  const [currentStyle, setCurrentStyle] = useState<MapStyle>("satellite");

  const handleStyleToggle = () => {
    const next: MapStyle = currentStyle === "dark" ? "satellite" : "dark";
    setCurrentStyle(next);
    onStyleChange?.(next);
  };

  const items = [
    { icon: Plus, onClick: onZoomIn, label: "Zoom In" },
    { icon: Minus, onClick: onZoomOut, label: "Zoom Out" },
    { icon: Map, onClick: handleStyleToggle, label: currentStyle === "dark" ? "Satellite" : "Dark Mode", active: currentStyle === "satellite" },
  ];

  return (
    <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-10">
      {items.map(({ icon: Icon, onClick, label, active }) => (
        <button
          key={label}
          onClick={onClick}
          className={`w-9 h-9 rounded-lg backdrop-blur-sm border border-border flex items-center justify-center transition-colors ${
            active ? "text-primary bg-accent" : "text-foreground"
          }`}
          style={{ backgroundColor: active ? undefined : "hsl(var(--search-bg))" }}
          title={label}
        >
          <Icon className="w-4 h-4" />
        </button>
      ))}
    </div>
  );
};

export default MapToolbar;
