import { X, MoreHorizontal, MapPin } from "lucide-react";
import { Field } from "@/data/fields";
import { useState } from "react";

interface FieldCardProps {
  field: Field;
  onRemove: (id: string) => void;
  variant?: "select" | "list";
  isActive?: boolean;
  style?: React.CSSProperties;
}

const FieldCard = ({ field, onRemove, variant = "select", isActive = false, style }: FieldCardProps) => {
  const isListVariant = variant === "list";
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg border transition-all duration-300 ease-out cursor-pointer group"
      style={{
        ...style,
        backgroundColor: isActive
          ? "hsl(150, 15%, 20%)"
          : isHovered
            ? "hsl(150, 15%, 18%)"
            : "hsl(150, 15%, 14%)",
        transform: isHovered ? "translateX(-2px) scale(1.01)" : "translateX(0) scale(1)",
        boxShadow: isActive
          ? `0 0 0 1px ${field.color}88, 0 4px 20px -4px ${field.color}33`
          : isHovered
            ? `0 4px 20px -4px ${field.color}33, inset 0 0 0 1px ${field.color}44`
            : "none",
        borderColor: isActive
          ? field.color + "88"
          : isHovered
            ? field.color + "66"
            : "hsl(150, 12%, 22%)",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Field shape thumbnail */}
      <div
        className="w-12 h-12 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden transition-transform duration-300"
        style={{
          backgroundColor: field.color + "15",
          transform: isHovered ? "rotate(-5deg) scale(1.1)" : "rotate(0) scale(1)",
        }}
      >
        <svg viewBox="0 0 40 40" className="w-8 h-8">
          <polygon
            points="10,30 20,8 35,25 25,35"
            fill={field.color + "44"}
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
            <span
              className="text-xs font-semibold"
              style={{
                color: field.ndviChange >= 0 ? "hsl(120, 50%, 50%)" : "hsl(0, 62%, 50%)",
              }}
            >
              {field.ndviChange >= 0 ? "+" : ""}{field.ndviChange.toFixed(2)}
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
          <MapPin className="w-3 h-3 text-muted-foreground flex-shrink-0" /> {field.location}
        </div>
      </div>

      {/* Action */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove(field.id);
        }}
        className="text-muted-foreground hover:text-foreground transition-all duration-200 flex-shrink-0 opacity-60 group-hover:opacity-100"
        style={{
          transform: isHovered ? "scale(1.15)" : "scale(1)",
        }}
      >
        {isListVariant ? <MoreHorizontal className="w-4 h-4" /> : <X className="w-4 h-4" />}
      </button>
    </div>
  );
};

export default FieldCard;
