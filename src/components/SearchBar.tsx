import { Search, MapPin } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface SearchBarProps {
  onSearch: (query: string) => void;
  mapToken?: string;
  onLocationSelect?: (lng: number, lat: number, name: string) => void;
  centered?: boolean;
}

interface GeocodingResult {
  id: string;
  place_name: string;
  center: [number, number];
  place_type: string[];
}

const SearchBar = ({ onSearch, mapToken, onLocationSelect, centered }: SearchBarProps) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

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
    if (!mapToken || text.length < 2) {
      setResults([]);
      return;
    }
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(text)}.json?access_token=${mapToken}&autocomplete=true&limit=5`
      );
      const data = await res.json();
      setResults(data.features || []);
      setShowResults(true);
    } catch {
      setResults([]);
    }
  };

  const handleChange = (value: string) => {
    setQuery(value);
    onSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => geocode(value), 300);
  };

  const handleSelect = (result: GeocodingResult) => {
    setQuery(result.place_name);
    setShowResults(false);
    onLocationSelect?.(result.center[0], result.center[1], result.place_name);
  };

  return (
    <div
      className={`z-10 ${centered ? "w-full max-w-md" : "absolute top-4 left-4"}`}
      ref={containerRef}
    >
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search location…"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          className="w-full backdrop-blur-sm border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          style={{ backgroundColor: "hsl(var(--search-bg))" }}
        />
      </div>

      {showResults && results.length > 0 && (
        <div
          className="absolute top-full mt-2 w-full rounded-xl border border-border/60 overflow-hidden shadow-2xl backdrop-blur-xl"
          style={{ backgroundColor: "hsla(150, 30%, 6%, 0.92)" }}
        >
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => handleSelect(r)}
              className="w-full text-left px-4 py-3 text-sm text-foreground hover:bg-accent/40 transition-colors border-b border-border/30 last:border-0 flex items-center gap-3"
            >
              <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="truncate">{r.place_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
