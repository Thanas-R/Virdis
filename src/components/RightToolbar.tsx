import { Layers, Cloud, MapPin } from "lucide-react";

export type RightMode = "layers" | "weather" | "location" | null;

interface RightToolbarProps {
  activeMode?: RightMode;
  onModeChange?: (mode: RightMode) => void;
}

const RightToolbar = ({ activeMode, onModeChange }: RightToolbarProps) => {
  const items: { icon: typeof Layers; label: string; mode: RightMode }[] = [
    { icon: Layers, label: "Layers", mode: "layers" },
    { icon: Cloud, label: "Weather", mode: "weather" },
    { icon: MapPin, label: "Location", mode: "location" },
  ];

  const handleClick = (mode: RightMode) => {
    onModeChange?.(activeMode === mode ? null : mode);
  };

  return (
    <div className="w-12 h-full border-l border-border flex flex-col items-center py-4 gap-3 bg-card/80 backdrop-blur-sm">
      {items.map(({ icon: Icon, label, mode }) => (
        <button
          key={label}
          onClick={() => handleClick(mode)}
          className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-all duration-200 ${
            activeMode === mode
              ? "text-primary bg-accent border-primary/40 shadow-md"
              : "text-muted-foreground hover:text-foreground border-transparent hover:border-border"
          }`}
          title={label}
        >
          <Icon className="w-4 h-4" />
        </button>
      ))}
    </div>
  );
};

export default RightToolbar;
