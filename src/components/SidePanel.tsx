import { useState } from "react";
import {
  Search,
  Layers,
  Cloud,
  Eye,
  EyeOff,
  Droplets,
  Wind,
} from "lucide-react";
import { Field } from "@/data/fields";
import FieldCard from "./FieldCard";
import FieldDetailView from "./FieldDetailView";

type SideTab = "fields" | "layers" | "weather";

interface SidePanelProps {
  selectedFields: Field[];
  allFields: Field[];
  selectedField: Field | null;
  onFieldClick: (field: Field) => void;
  onDeselectField: () => void;
  onRemoveField: (id: string) => void;
  onToggleField: (field: Field) => void;
  onShowAll: () => void;
  onHideAll: () => void;
  weatherData?: {
    temp: number;
    description: string;
    humidity: number;
    windSpeed: number;
    feelsLike: number;
  } | null;
  weatherLoading?: boolean;
  locationName?: string;
}

const SidePanel = ({
  selectedFields,
  allFields,
  selectedField,
  onFieldClick,
  onDeselectField,
  onRemoveField,
  onToggleField,
  onShowAll,
  onHideAll,
  weatherData,
  weatherLoading,
  locationName,
}: SidePanelProps) => {
  const [tab, setTab] = useState<SideTab>("fields");
  const [search, setSearch] = useState("");

  if (selectedField) {
    return (
      <div className="w-[320px] h-full bg-card/95 backdrop-blur-md border-l border-border flex flex-col animate-fade-in">
        <FieldDetailView field={selectedField} onBack={onDeselectField} />
      </div>
    );
  }

  const filteredFields = selectedFields.filter(
    (f) =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.crop.toLowerCase().includes(search.toLowerCase())
  );

  const tabs: { id: SideTab; label: string; icon: typeof Layers }[] = [
    { id: "fields", label: "Fields", icon: Search },
    { id: "layers", label: "Layers", icon: Layers },
    { id: "weather", label: "Weather", icon: Cloud },
  ];

  return (
    <div className="w-[320px] h-full bg-card/95 backdrop-blur-md border-l border-border flex flex-col">
      {/* Tabs */}
      <div className="flex border-b border-border">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-xs font-medium transition-all duration-200 border-b-2 ${
              tab === id
                ? "text-primary border-primary"
                : "text-muted-foreground border-transparent hover:text-foreground"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col" key={tab}>
        {tab === "fields" && (
          <div className="flex-1 flex flex-col animate-fade-in">
            <div className="px-3 pt-3">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search fields…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              </div>
            </div>
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {filteredFields.length} field
              {filteredFields.length !== 1 ? "s" : ""}
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
              {filteredFields.map((field) => (
                <div
                  key={field.id}
                  onClick={() => onFieldClick(field)}
                  className="cursor-pointer"
                >
                  <FieldCard
                    field={field}
                    onRemove={onRemoveField}
                    variant="list"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "layers" && (
          <div className="flex-1 flex flex-col animate-fade-in">
            <div className="flex gap-2 px-4 py-3 border-b border-border">
              <button
                onClick={onShowAll}
                className="flex-1 py-1.5 rounded-lg border border-border text-xs text-foreground hover:bg-accent transition-colors"
              >
                Show All
              </button>
              <button
                onClick={onHideAll}
                className="flex-1 py-1.5 rounded-lg border border-border text-xs text-foreground hover:bg-accent transition-colors"
              >
                Hide All
              </button>
            </div>
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {selectedFields.length} of {allFields.length} visible
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
              {allFields.map((field) => {
                const isVisible = selectedFields.some(
                  (f) => f.id === field.id
                );
                return (
                  <button
                    key={field.id}
                    onClick={() => onToggleField(field)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all duration-200 text-left ${
                      isVisible
                        ? "border-border bg-accent/30"
                        : "border-transparent bg-secondary/20 opacity-50"
                    }`}
                  >
                    <div
                      className="w-4 h-4 rounded-sm flex-shrink-0 transition-opacity duration-200"
                      style={{
                        backgroundColor: field.color,
                        opacity: isVisible ? 1 : 0.3,
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-foreground truncate">
                        {field.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {field.cropEmoji} {field.crop} · {field.area} ha
                      </div>
                    </div>
                    {isVisible ? (
                      <Eye className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <EyeOff className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {tab === "weather" && (
          <div className="flex-1 p-4 space-y-4 overflow-y-auto animate-fade-in">
            {weatherLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-sm text-muted-foreground animate-pulse">
                  Loading weather…
                </div>
              </div>
            ) : weatherData ? (
              <>
                {locationName && (
                  <p className="text-xs text-muted-foreground truncate">
                    📍 {locationName}
                  </p>
                )}
                <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-accent/30">
                  <div className="text-4xl font-light text-foreground">
                    {weatherData.temp > 0 ? "+" : ""}
                    {weatherData.temp}°
                  </div>
                  <div>
                    <div className="text-sm text-foreground capitalize">
                      {weatherData.description}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Feels like {weatherData.feelsLike}°
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg border border-border bg-accent/20">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Droplets className="w-3.5 h-3.5" />
                      <span className="text-xs">Humidity</span>
                    </div>
                    <div className="text-sm font-medium text-foreground">
                      {weatherData.humidity}%
                    </div>
                  </div>
                  <div className="p-3 rounded-lg border border-border bg-accent/20">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Wind className="w-3.5 h-3.5" />
                      <span className="text-xs">Wind</span>
                    </div>
                    <div className="text-sm font-medium text-foreground">
                      {weatherData.windSpeed} km/h
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Cloud className="w-10 h-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  Search a location to see weather
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SidePanel;
