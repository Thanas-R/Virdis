import { Check, X } from "lucide-react";

interface MobileDrawPromptProps {
  vertexCount: number;
  onSave: () => void;
  onCancel: () => void;
}

const MobileDrawPrompt = ({ vertexCount, onSave, onCancel }: MobileDrawPromptProps) => {
  return (
    <div className="absolute bottom-20 left-4 right-4 z-20 animate-fade-in">
      <div className="bg-card/90 backdrop-blur-xl rounded-2xl border border-border/60 shadow-lg shadow-black/20 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "#EAB947" }} />
          <span className="text-sm font-medium text-foreground">Drawing Mode</span>
          <span className="ml-auto text-xs text-muted-foreground">{vertexCount} point{vertexCount !== 1 ? "s" : ""}</span>
        </div>
        <p className="text-xs text-muted-foreground">Tap on the map to add boundary points</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-border text-sm text-foreground hover:bg-accent transition-colors"
          >
            <X className="w-4 h-4" /> Cancel
          </button>
          <button
            onClick={onSave}
            disabled={vertexCount < 3}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium transition-colors bg-primary text-primary-foreground disabled:opacity-40"
          >
            <Check className="w-4 h-4" /> Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default MobileDrawPrompt;
