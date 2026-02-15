import { Map, Layers, BarChart3 } from "lucide-react";

interface MobileBottomNavProps {
  activeTab: "map" | "fields" | "analytics";
  onTabChange: (tab: "map" | "fields" | "analytics") => void;
}

const tabs = [
  { id: "map" as const, icon: Map, label: "Map" },
  { id: "fields" as const, icon: Layers, label: "Fields" },
  { id: "analytics" as const, icon: BarChart3, label: "Analytics" },
];

const MobileBottomNav = ({ activeTab, onTabChange }: MobileBottomNavProps) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-t border-border flex items-center justify-around h-14 safe-area-bottom">
      {tabs.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          onClick={() => onTabChange(id)}
          className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
            activeTab === id ? "text-primary" : "text-muted-foreground"
          }`}
        >
          <Icon className="w-5 h-5" />
          <span className="text-[10px] font-medium">{label}</span>
        </button>
      ))}
    </div>
  );
};

export default MobileBottomNav;
