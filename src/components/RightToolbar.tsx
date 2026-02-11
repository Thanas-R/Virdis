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
    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-10">
      {items.map(({ icon: Icon, label, mode }) => (
        <button
          key={label}
          onClick={() => handleClick(mode)}
          className={`w-10 h-10 rounded-lg backdrop-blur-sm border border-border flex items-center justify-center transition-all duration-200 ${
            activeMode === mode
              ? "text-primary bg-accent border-primary/40 shadow-md"
              : "text-muted-foreground hover:text-foreground"
          }`}
          style={{ backgroundColor: activeMode === mode ? undefined : "#041009" }}
          title={label}
        >
          <Icon className="w-4 h-4" />
        </button>
      ))}
    </div>
  );
};

export default RightToolbar;
