import { Layers, Plus, Minus, Map, Search } from "lucide-react";

interface MapToolbarProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
}

const MapToolbar = ({ onZoomIn, onZoomOut }: MapToolbarProps) => {
  return (
    <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-10">
      {[
      { icon: Layers, onClick: () => {}, label: "Layers" },
      { icon: Plus, onClick: onZoomIn, label: "Zoom In" },
      { icon: Minus, onClick: onZoomOut, label: "Zoom Out" },
      { icon: Map, onClick: () => {}, label: "Map Type" }].
      map(({ icon: Icon, onClick, label }) =>
      <button
        key={label}
        onClick={onClick}
        className="w-10 h-10 rounded-lg backdrop-blur-sm border border-border flex items-center justify-center text-foreground transition-colors bg-[#041009]"
        title={label}>

          <Icon className="w-4 h-4" />
        </button>
      )}
    </div>);

};

export default MapToolbar;