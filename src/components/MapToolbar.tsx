import { Layers, Plus, Minus, Map, PenTool, Compass, LocateFixed, Satellite, Crosshair } from "lucide-react";
import { useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type MapStyle = "dark" | "satellite";

interface MapToolbarProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onStyleChange?: (style: MapStyle) => void;
  onToggleLayers?: () => void;
  onToggleDraw?: () => void;
  onResetNorth?: () => void;
  onLocateUser?: () => void;
  onToggleNdvi?: () => void;
  onAutoDetect?: () => void;
  isDrawing?: boolean;
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
  onToggleNdvi,
  onAutoDetect,
  isDrawing,
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
    { icon: Layers, onClick: onToggleLayers ?? (() => {}), label: showFields ? "Hide Regions" : "Show Regions", active: showFields },
    { icon: Plus, onClick: onZoomIn, label: "Zoom In" },
    { icon: Minus, onClick: onZoomOut, label: "Zoom Out" },
    { icon: Map, onClick: handleStyleToggle, label: currentStyle === "dark" ? "Satellite" : "Dark Mode", active: currentStyle === "satellite" },
    { icon: Crosshair, onClick: onAutoDetect ?? (() => {}), label: "Auto-Detect Region" },
    { icon: PenTool, onClick: onToggleDraw ?? (() => {}), label: "Draw Manually", active: isDrawing },
    { icon: Satellite, onClick: onToggleNdvi ?? (() => {}), label: showNdvi ? "Hide NDVI" : "NDVI Overlay", active: showNdvi },
    { icon: Compass, onClick: onResetNorth ?? (() => {}), label: "Reset North" },
    { icon: LocateFixed, onClick: onLocateUser ?? (() => {}), label: "My Location" },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-10 opacity-85">
        {items.map(({ icon: Icon, onClick, label, active }) => (
          <Tooltip key={label}>
            <TooltipTrigger asChild>
              <button
                onClick={onClick}
                className={`w-10 h-10 rounded-lg backdrop-blur-sm border border-border flex items-center justify-center transition-colors ${
                  active ? "text-primary bg-accent" : "text-foreground"
                }`}
                style={{ backgroundColor: active ? undefined : "#041009" }}
              >
                <Icon className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {label}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
};

export default MapToolbar;
