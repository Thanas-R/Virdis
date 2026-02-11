import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { fields as allFields, Field } from "@/data/fields";
import SearchBar from "./SearchBar";
import MapToolbar from "./MapToolbar";
import FieldSelectPanel from "./FieldSelectPanel";
import RightToolbar from "./RightToolbar";
import { supabase } from "@/integrations/supabase/client";

const MapView = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [selectedFields, setSelectedFields] = useState<Field[]>(allFields);
  const [mapToken, setMapToken] = useState<string>("");
  const [mapLoaded, setMapLoaded] = useState(false);

  // Fetch token from edge function
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("get-mapbox-token");
        if (data?.token) {
          setMapToken(data.token);
        }
      } catch (e) {
        console.error("Failed to fetch mapbox token", e);
      }
    };
    fetchToken();
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || !mapToken) return;

    mapboxgl.accessToken = mapToken;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [0.722, 40.719],
      zoom: 14,
      pitch: 0,
      attributionControl: false,
    });

    mapRef.current = map;

    map.on("load", () => {
      setMapLoaded(true);

      // Add all field sources and layers
      allFields.forEach((field) => {
        const sourceId = `field-${field.id}`;
        const fillLayerId = `field-fill-${field.id}`;
        const lineLayerId = `field-line-${field.id}`;

        map.addSource(sourceId, {
          type: "geojson",
          data: {
            type: "Feature",
            properties: { id: field.id, name: field.name },
            geometry: { type: "Polygon", coordinates: field.coordinates },
          },
        });

        const isSelected = selectedFields.some((f) => f.id === field.id);

        map.addLayer({
          id: fillLayerId,
          type: "fill",
          source: sourceId,
          paint: {
            "fill-color": field.color,
            "fill-opacity": isSelected ? 0.3 : 0.1,
          },
        });

        map.addLayer({
          id: lineLayerId,
          type: "line",
          source: sourceId,
          paint: {
            "line-color": field.color,
            "line-width": isSelected ? 2.5 : 1,
          },
        });

        // Click handler to toggle selection
        map.on("click", fillLayerId, () => {
          setSelectedFields((prev) => {
            const exists = prev.some((f) => f.id === field.id);
            if (exists) {
              return prev.filter((f) => f.id !== field.id);
            }
            return [...prev, field];
          });
        });

        // Cursor pointer on hover
        map.on("mouseenter", fillLayerId, () => {
          map.getCanvas().style.cursor = "pointer";
          map.setPaintProperty(fillLayerId, "fill-opacity", 0.45);
        });

        map.on("mouseleave", fillLayerId, () => {
          map.getCanvas().style.cursor = "";
          const sel = selectedFields.some((f) => f.id === field.id);
          map.setPaintProperty(fillLayerId, "fill-opacity", sel ? 0.3 : 0.1);
        });
      });
    });

    return () => map.remove();
  }, [mapToken]);

  // Update polygon styles when selection changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    allFields.forEach((field) => {
      const fillLayerId = `field-fill-${field.id}`;
      const lineLayerId = `field-line-${field.id}`;
      const isSelected = selectedFields.some((f) => f.id === field.id);

      try {
        map.setPaintProperty(fillLayerId, "fill-opacity", isSelected ? 0.3 : 0.08);
        map.setPaintProperty(lineLayerId, "line-width", isSelected ? 2.5 : 1);
        map.setPaintProperty(lineLayerId, "line-opacity", isSelected ? 1 : 0.4);
      } catch {}
    });
  }, [selectedFields, mapLoaded]);

  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();
  const handleRemoveField = (id: string) => {
    setSelectedFields((prev) => prev.filter((f) => f.id !== id));
  };

  return (
    <div className="relative w-full h-full flex">
      <div className="flex-1 relative">
        {!mapToken && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <div className="text-muted-foreground text-sm animate-pulse">Loading map…</div>
          </div>
        )}
        <div ref={mapContainer} className="w-full h-full" />
        <SearchBar onSearch={() => {}} />
        <MapToolbar onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} />
      </div>

      <FieldSelectPanel
        fields={selectedFields}
        onRemoveField={handleRemoveField}
        onSave={() => {}}
        onCancel={() => setSelectedFields(allFields)}
        onBack={() => {}}
      />

      <RightToolbar />
    </div>
  );
};

export default MapView;
