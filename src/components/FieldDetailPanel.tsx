import { X, MapPin, Leaf, Cloud, Plus } from "lucide-react";
import { Field } from "@/data/fields";
import { useState, useEffect } from "react";

interface FieldDetailPanelProps {
  field: Field;
  onClose: () => void;
  weatherData?: { temp: number; description: string } | null;
}

interface ScoutingTask {
  id: string;
  title: string;
  description: string;
  date: string;
  status: "new" | "resolved";
}

const mockTasks: ScoutingTask[] = [
  { id: "1", title: "Task#1", description: "Check the phase of plant development, also add pho…", date: "Aug 20, 9:49 AM", status: "new" },
  { id: "2", title: "Task#2", description: "Check the soil moisture level", date: "Aug 20, 10:10 AM", status: "new" },
  { id: "3", title: "Task#3", description: "Inspect leaf discoloration in NW corner", date: "Aug 18, 2:30 PM", status: "new" },
  { id: "4", title: "Task#4", description: "Verify irrigation system output", date: "Aug 15, 11:00 AM", status: "resolved" },
  { id: "5", title: "Task#5", description: "Soil sample collection complete", date: "Aug 12, 9:00 AM", status: "resolved" },
];

const FieldDetailPanel = ({ field, onClose, weatherData }: FieldDetailPanelProps) => {
  const [taskTab, setTaskTab] = useState<"new" | "resolved">("new");
  const newTasks = mockTasks.filter(t => t.status === "new");
  const resolvedTasks = mockTasks.filter(t => t.status === "resolved");
  const currentTasks = taskTab === "new" ? newTasks : resolvedTasks;

  return (
    <div className="w-[300px] h-full bg-card/95 backdrop-blur-md border-l border-border flex flex-col animate-slide-in-right overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <span className="text-muted-foreground cursor-pointer">•••</span>
        <h2 className="text-sm font-semibold text-foreground">{field.name}</h2>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Field info */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Field Area</div>
            <div className="text-sm font-medium text-foreground">{field.area} ha</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Group</div>
            <div className="text-sm font-medium text-foreground">{field.group || "—"}</div>
          </div>
        </div>

        <div className="border-t border-border pt-3">
          <div className="text-xs text-muted-foreground">Location</div>
          <div className="text-sm text-foreground flex items-center gap-1.5 mt-0.5">
            <MapPin className="w-3 h-3 text-destructive" /> {field.location}
          </div>
        </div>

        {/* Season info */}
        <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
          <div className="px-2 py-1.5 rounded-md bg-accent/30 border border-border">
            <div className="text-xs text-muted-foreground">Season 2019</div>
            <div className="text-sm text-foreground flex items-center gap-1">
              <Leaf className="w-3 h-3 text-field-green" /> {field.crop}
            </div>
          </div>
          <div className="px-2 py-1.5 rounded-md bg-accent/30 border border-border">
            <div className="text-xs text-muted-foreground">Sowing Date</div>
            <div className="text-sm text-foreground">Apr 1, 2019</div>
          </div>
        </div>

        {/* Weather */}
        <div className="border-t border-border pt-3">
          <div className="flex items-center gap-2 px-2 py-2 rounded-md bg-accent/20 border border-border">
            <Cloud className="w-4 h-4 text-muted-foreground" />
            <div className="flex-1">
              <div className="text-xs text-muted-foreground">Weather Now</div>
              <div className="text-sm text-foreground">
                {weatherData ? `${weatherData.description}` : "—"}
              </div>
            </div>
            {weatherData && (
              <div className="text-lg font-light text-foreground">
                {weatherData.temp > 0 ? "+" : ""}{weatherData.temp}°
              </div>
            )}
          </div>
        </div>

        {/* Scouting Tasks */}
        <div className="border-t border-border pt-3">
          <div className="flex items-center gap-2 mb-3">
            <button className="w-5 h-5 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center">
              <Plus className="w-3 h-3 text-primary" />
            </button>
            <h3 className="text-sm font-semibold text-foreground">Scouting Tasks</h3>
          </div>

          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setTaskTab("new")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                taskTab === "new" ? "bg-primary text-primary-foreground" : "bg-accent/30 text-muted-foreground"
              }`}
            >
              New ({newTasks.length})
            </button>
            <button
              onClick={() => setTaskTab("resolved")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                taskTab === "resolved" ? "bg-primary text-primary-foreground" : "bg-accent/30 text-muted-foreground"
              }`}
            >
              Resolved ({resolvedTasks.length})
            </button>
          </div>

          <div className="space-y-2">
            {currentTasks.map((task) => (
              <div key={task.id} className="p-3 rounded-lg border border-border bg-accent/20">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-foreground">{task.title}</span>
                  <span className="text-muted-foreground text-xs cursor-pointer">•••</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{task.description}</p>
                <p className="text-xs text-muted-foreground mt-1">{task.date}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FieldDetailPanel;
