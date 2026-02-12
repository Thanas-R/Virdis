import { Search } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface SearchBarProps {
  onSearch: (query: string) => void;
  mapToken?: string;
  onLocationSelect?: (lng: number, lat: number, name: string) => void;
}

interface GeocodingResult {
  id: string;
  place_name: string;
  center: [number, number];
}

const SearchBar = ({ onSearch, mapToken, onLocationSelect }: SearchBarProps) => {
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
    <div className="absolute top-4 left-4 z-10" ref={containerRef}>
      <div className="relative opacity-85">
        <input
          type="text"
          placeholder="Location…"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          className="w-72 backdrop-blur-sm border border-border rounded-lg px-4 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          style={{ backgroundColor: "#041009" }} />

        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      </div>

      {showResults && results.length > 0 &&
      <div className="absolute top-full mt-1 w-72 rounded-lg border border-border overflow-hidden shadow-xl" style={{ backgroundColor: "#041009" }}>
          {results.map((r) =>
        <button
          key={r.id}
          onClick={() => handleSelect(r)}
          className="w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-accent transition-colors border-b border-border last:border-0 truncate opacity-85">

              📍 {r.place_name}
            </button>
        )}
        </div>
      }
    </div>);

};

export default SearchBar;