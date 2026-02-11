import { Eye, EyeOff } from "lucide-react";
import { Field } from "@/data/fields";

interface LayersPanelProps {
  fields: Field[];
  visibleFields: Field[];
  onToggleField: (field: Field) => void;
  onShowAll: () => void;
  onHideAll: () => void;
}

const LayersPanel = ({ fields, visibleFields, onToggleField, onShowAll, onHideAll }: LayersPanelProps) => {
  return (
    <div className="w-[300px] h-full bg-card/95 backdrop-blur-md border-l border-border flex flex-col animate-slide-in-right">
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold text-primary">Layers</h2>
        <p className="text-xs text-muted-foreground mt-1">{visibleFields.length} of {fields.length} visible</p>
      </div>

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

      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {fields.map((field) => {
          const isVisible = visibleFields.some((f) => f.id === field.id);
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
                className="w-4 h-4 rounded-sm flex-shrink-0"
                style={{ backgroundColor: field.color, opacity: isVisible ? 1 : 0.3 }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-foreground truncate">{field.name}</div>
                <div className="text-xs text-muted-foreground">{field.cropEmoji} {field.crop} · {field.area} ha</div>
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
  );
};

export default LayersPanel;
