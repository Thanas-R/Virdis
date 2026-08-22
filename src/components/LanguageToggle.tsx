import { Languages } from "lucide-react";
import { APP_LANGUAGES, useLanguage } from "@/lib/language";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card/85 px-2 py-1 shadow-sm backdrop-blur-sm">
      <Languages className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <Select value={language} onValueChange={setLanguage}>
        <SelectTrigger className="h-8 w-[128px] border-0 bg-transparent px-1 py-0 text-xs shadow-none focus:ring-0 focus:ring-offset-0" aria-label="Website language">
          <SelectValue placeholder="Language" />
        </SelectTrigger>
        <SelectContent align="end">
          {APP_LANGUAGES.map((option) => (
            <SelectItem key={option.code} value={option.code}>
              {option.nativeLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
