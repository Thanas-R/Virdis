import { ArrowLeft, Menu } from "lucide-react";
import { Field } from "@/data/fields";
import FieldCard from "./FieldCard";

interface FieldSelectPanelProps {
  fields: Field[];
  onRemoveField: (id: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onBack: () => void;
}

const FieldSelectPanel = ({ fields, onRemoveField, onSave, onCancel, onBack }: FieldSelectPanelProps) => {
  return (
    <div className="w-[320px] h-full bg-card/95 backdrop-blur-md border-l border-border flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-foreground hover:text-primary transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-semibold text-foreground">Select Fields</h2>
        </div>
        <button className="text-muted-foreground hover:text-foreground transition-colors">
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Field list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {fields.map((field) =>
        <FieldCard key={field.id} field={field} onRemove={onRemoveField} variant="select" />
        )}
      </div>

      {/* Footer buttons */}
      <div className="p-4 border-t border-border flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors">

          Cancel
        </button>
        <button
          onClick={onSave}
          className="flex-1 py-2.5 rounded-lg text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity bg-primary">

          Save
        </button>
      </div>
    </div>);

};

export default FieldSelectPanel;