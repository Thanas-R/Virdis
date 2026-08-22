import { useState, useRef, useEffect } from "react";
import { MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { callBackend } from "@/lib/call-backend";

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** @deprecated retained for backwards compatibility; token is no longer required on the client */
  mapToken?: string;
}

const LocationAutocomplete = ({ value, onChange, placeholder = "Search location…" }: LocationAutocompleteProps) => {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<any[]>([]);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const geocode = async (text: string) => {
    if (text.length < 2) { setResults([]); return; }
    try {
      const { data } = await callBackend("mapbox-geocode", { mode: "forward", query: text, limit: 4 });
      setResults(data?.features || []);
      setShowResults(true);
    } catch {
      setResults([]);
    }
  };

  const handleChange = (val: string) => {
    setQuery(val);
    onChange(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => geocode(val), 300);
  };

  return (
    <div className="relative" ref={containerRef}>
      <input
        type="text"
        value={query}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => results.length > 0 && setShowResults(true)}
        placeholder={placeholder}
        className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      {showResults && results.length > 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 rounded-lg border border-border bg-card shadow-xl z-30 overflow-hidden">
          {results.map((r: any) => (
            <button
              key={r.id}
              onClick={() => {
                setQuery(r.place_name);
                onChange(r.place_name);
                setShowResults(false);
              }}
              className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors border-b border-border last:border-0 flex items-center gap-2"
            >
              <MapPin className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <span className="truncate">{r.place_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LocationAutocomplete;
