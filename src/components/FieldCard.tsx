import { X, MoreHorizontal } from "lucide-react";
import { Field } from "@/data/fields";

interface FieldCardProps {
  field: Field;
  onRemove: (id: string) => void;
  variant?: "select" | "list";
  style?: React.CSSProperties;
}

const FieldCard = ({ field, onRemove, variant = "select", style }: FieldCardProps) => {
  const isListVariant = variant === "list";

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 border border-border hover:bg-accent/50 transition-colors animate-fade-in group"
      style={{ ...style, animationDelay: `${parseInt(field.id) * 60}ms` }}
    >
      {/* Field shape thumbnail */}
      <div className="w-12 h-12 rounded-md bg-card flex items-center justify-center flex-shrink-0 overflow-hidden">
        <svg viewBox="0 0 40 40" className="w-8 h-8">
          <polygon
            points="10,30 20,8 35,25 25,35"
            fill={field.color + "33"}
            stroke={field.color}
            strokeWidth="2"
          />
        </svg>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{field.name}, {field.area} ha</span>
          {isListVariant && field.ndviChange !== undefined && (
            <span className={`text-xs font-medium ${field.ndviChange >= 0 ? 'text-field-green' : 'text-destructive'}`}>
              {field.ndviChange >= 0 ? '+' : ''}{field.ndviChange.toFixed(2)}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {field.cropEmoji} {field.crop}
        </div>
        {isListVariant && field.group && (
          <div className="text-xs text-muted-foreground">📁 {field.group}</div>
        )}
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <span className="text-destructive">📍</span> {field.location}
        </div>
      </div>

      {/* Action */}
      <button
        onClick={() => onRemove(field.id)}
        className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
      >
        {isListVariant ? <MoreHorizontal className="w-4 h-4" /> : <X className="w-4 h-4" />}
      </button>
    </div>
  );
};

export default FieldCard;
