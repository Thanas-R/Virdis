import { Layers, Plus, Minus, Map, PenTool, Compass, LocateFixed, ScanSearch, Satellite, MousePointerClick } from "lucide-react";
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
  onDetectFields?: () => void;
  onToggleNdvi?: () => void;
  onToggleAutoField?: () => void;
  isDrawing?: boolean;
  isDetecting?: boolean;
  isAutoField?: boolean;
  showFields?: boolean;
  showNdvi?: boolean;
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
  onDetectFields,
  onToggleNdvi,
  onToggleAutoField,
  isDrawing,
  isDetecting,
  isAutoField,
  showFields = true,
  showNdvi = false,
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
    { icon: MousePointerClick, onClick: onToggleAutoField ?? (() => {}), label: isAutoField ? "Exit Auto Field" : "Auto Field (Click)", active: isAutoField },
    { icon: ScanSearch, onClick: onDetectFields ?? (() => {}), label: isDetecting ? "Detecting…" : "AI Detect Fields", active: isDetecting, pulse: isDetecting },
    { icon: Satellite, onClick: onToggleNdvi ?? (() => {}), label: showNdvi ? "Hide NDVI" : "GEE NDVI Overlay", active: showNdvi },
    { icon: Compass, onClick: onResetNorth ?? (() => {}), label: "Reset North" },
    { icon: LocateFixed, onClick: onLocateUser ?? (() => {}), label: "My Location" },
  ];

  return (
    <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-10 opacity-85">
      {items.map(({ icon: Icon, onClick, label, active, pulse }) => (
        <button
          key={label}
          onClick={onClick}
          disabled={!!pulse}
          className={`w-10 h-10 rounded-lg backdrop-blur-sm border border-border flex items-center justify-center transition-colors ${
            active ? "text-primary bg-accent" : "text-foreground"
          } ${pulse ? "animate-pulse" : ""}`}
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
