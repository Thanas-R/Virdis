import { Layers, Plus, Minus, Map, PenTool, Compass, LocateFixed } from "lucide-react";
import { useState } from "react";

type MapStyle = "dark" | "satellite";

interface MapToolbarProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onStyleChange?: (style: MapStyle) => void;
  onToggleLayers?: () => void;
  onToggleDraw?: () => void;
  onResetNorth?: () => void;
  onLocateUser?: () => void;
  isDrawing?: boolean;
  showFields?: boolean;
  defaultStyle?: MapStyle;
}

const MapToolbar = ({
  onZoomIn,
  onZoomOut,
  onStyleChange,
  onToggleLayers,
  onToggleDraw,
  onResetNorth,
  onLocateUser,
  isDrawing,
  showFields = true,
  defaultStyle = "dark",
}: MapToolbarProps) => {
  const [currentStyle, setCurrentStyle] = useState<MapStyle>(defaultStyle);

  const handleStyleToggle = () => {
    const next: MapStyle = currentStyle === "dark" ? "satellite" : "dark";
    setCurrentStyle(next);
    onStyleChange?.(next);
  };

  const items = [
    { icon: Layers, onClick: onToggleLayers ?? (() => {}), label: showFields ? "Hide Fields" : "Show Fields", active: showFields },
    { icon: Plus, onClick: onZoomIn, label: "Zoom In" },
    { icon: Minus, onClick: onZoomOut, label: "Zoom Out" },
    { icon: Map, onClick: handleStyleToggle, label: currentStyle === "dark" ? "Satellite" : "Dark Mode", active: currentStyle === "satellite" },
    { icon: PenTool, onClick: onToggleDraw ?? (() => {}), label: "Draw Field", active: isDrawing },
    { icon: Compass, onClick: onResetNorth ?? (() => {}), label: "Reset North" },
    { icon: LocateFixed, onClick: onLocateUser ?? (() => {}), label: "My Location" },
  ];

  return (
    <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-10 opacity-85">
      {items.map(({ icon: Icon, onClick, label, active }) => (
        <button
          key={label}
          onClick={onClick}
          className={`w-10 h-10 rounded-lg backdrop-blur-sm border border-border flex items-center justify-center transition-colors ${
            active ? "text-primary bg-accent" : "text-foreground"
          }`}
          style={{ backgroundColor: active ? undefined : "#041009" }}
          title={label}
        >
          <Icon className="w-4 h-4" />
        </button>
      ))}
    </div>
  );
};

export default MapToolbar;
