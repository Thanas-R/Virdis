import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { fields as allFieldsData, Field } from "@/data/fields";
import SearchBar from "./SearchBar";
import MapToolbar from "./MapToolbar";
import SidePanel from "./SidePanel";
import { supabase } from "@/integrations/supabase/client";

const MAP_STYLES = {
  dark: "mapbox://styles/mapbox/dark-v11",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
};

interface MapViewProps {
  selectedFields: Field[];
  allFields: Field[];
  onRemoveField: (id: string) => void;
  onToggleField: (field: Field) => void;
  onShowAll: () => void;
  onHideAll: () => void;
  flyToField?: Field | null;
  onFlyToDone?: () => void;
}

const MapView = ({
  selectedFields,
  allFields,
  onRemoveField,
  onToggleField,
  onShowAll,
  onHideAll,
  flyToField,
  onFlyToDone,
}: MapViewProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapToken, setMapToken] = useState<string>("");
  const [mapLoaded, setMapLoaded] = useState(false);
  const [selectedField, setSelectedField] = useState<Field | null>(null);

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const { data } = await supabase.functions.invoke("get-mapbox-token");
        if (data?.token) setMapToken(data.token);
      } catch (e) {
        console.error("Failed to fetch mapbox token", e);
      }
    };
    fetchToken();
  }, []);

  // Fly to field when requested from other views
  useEffect(() => {
    if (!flyToField || !mapRef.current) return;
    const coords = flyToField.coordinates[0];
    const lat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
    const lng = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
    mapRef.current.flyTo({ center: [lng, lat], zoom: 16, duration: 1500 });
    setSelectedField(flyToField);
    onFlyToDone?.();
  }, [flyToField, onFlyToDone]);

  const addFieldLayers = useCallback(
    (map: mapboxgl.Map, selected: Field[]) => {
      allFieldsData.forEach((field) => {
        const sourceId = `field-${field.id}`;
        const fillLayerId = `field-fill-${field.id}`;
        const lineLayerId = `field-line-${field.id}`;

        if (map.getSource(sourceId)) return;

        map.addSource(sourceId, {
          type: "geojson",
          data: {
            type: "Feature",
            properties: { id: field.id, name: field.name },
            geometry: { type: "Polygon", coordinates: field.coordinates },
          },
        });

        const isSelected = selected.some((f) => f.id === field.id);

        map.addLayer({
          id: fillLayerId,
          type: "fill",
          source: sourceId,
          paint: { "fill-color": field.color, "fill-opacity": isSelected ? 0.3 : 0.1 },
        });

        map.addLayer({
          id: lineLayerId,
          type: "line",
          source: sourceId,
          paint: { "line-color": field.color, "line-width": isSelected ? 2.5 : 1 },
        });

        map.on("click", fillLayerId, () => {
          const clicked = allFieldsData.find((f) => f.id === field.id);
          if (clicked) setSelectedField(clicked);
        });

        map.on("mouseenter", fillLayerId, () => {
          map.getCanvas().style.cursor = "pointer";
          map.setPaintProperty(fillLayerId, "fill-opacity", 0.45);
        });

        map.on("mouseleave", fillLayerId, () => {
          map.getCanvas().style.cursor = "";
          const sel = selected.some((f) => f.id === field.id);
          map.setPaintProperty(fillLayerId, "fill-opacity", sel ? 0.3 : 0.1);
        });
      });
    },
    []
  );

  useEffect(() => {
    if (!mapContainer.current || !mapToken) return;
    mapboxgl.accessToken = mapToken;
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAP_STYLES.satellite,
      center: [0.722, 40.719],
      zoom: 14,
      pitch: 0,
      attributionControl: false,
    });
    mapRef.current = map;
    map.on("load", () => {
      setMapLoaded(true);
      addFieldLayers(map, selectedFields);
    });
    return () => map.remove();
  }, [mapToken]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    allFieldsData.forEach((field) => {
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

  const handleStyleChange = (style: "dark" | "satellite") => {
    const map = mapRef.current;
    if (!map) return;
    setMapLoaded(false);
    map.setStyle(MAP_STYLES[style]);
    map.once("style.load", () => {
      setMapLoaded(true);
      addFieldLayers(map, selectedFields);
    });
  };

  const handleLocationSelect = (lng: number, lat: number, _name: string) => {
    mapRef.current?.flyTo({ center: [lng, lat], zoom: 13, duration: 2000 });
  };

  const handleFieldClickInPanel = (field: Field) => {
    // Fly to field on map
    const coords = field.coordinates[0];
    const lat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
    const lng = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
    mapRef.current?.flyTo({ center: [lng, lat], zoom: 16, duration: 1500 });
    setSelectedField(field);
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
        <SearchBar onSearch={() => {}} mapToken={mapToken} onLocationSelect={handleLocationSelect} />
        <MapToolbar
          onZoomIn={() => mapRef.current?.zoomIn()}
          onZoomOut={() => mapRef.current?.zoomOut()}
          onStyleChange={handleStyleChange}
          onToggleLayers={() => {}}
          defaultStyle="satellite"
        />
      </div>

      <SidePanel
        selectedFields={selectedFields}
        allFields={allFields}
        selectedField={selectedField}
        onFieldClick={handleFieldClickInPanel}
        onDeselectField={() => setSelectedField(null)}
        onRemoveField={onRemoveField}
        onToggleField={onToggleField}
        onShowAll={onShowAll}
        onHideAll={onHideAll}
      />
    </div>
  );
};

export default MapView;
