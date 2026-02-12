import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Field } from "@/data/fields";
import SearchBar from "./SearchBar";
import MapToolbar from "./MapToolbar";
import NewFieldDialog from "./NewFieldDialog";
import { supabase } from "@/integrations/supabase/client";

const MAP_STYLES = {
  dark: "mapbox://styles/mapbox/dark-v11",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
};

interface MapViewProps {
  allFields: Field[];
  selectedFields: Field[];
  activeField: Field | null;
  flyToField?: Field | null;
  onFlyToDone?: () => void;
  onFieldClickOnMap: (field: Field) => void;
  onAddField: (field: Field) => void;
}

const MapView = ({
  allFields,
  selectedFields,
  activeField,
  flyToField,
  onFlyToDone,
  onFieldClickOnMap,
  onAddField,
}: MapViewProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapToken, setMapToken] = useState("");
  const [mapLoaded, setMapLoaded] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [drawVertices, setDrawVertices] = useState<[number, number][]>([]);
  const [showNewFieldDialog, setShowNewFieldDialog] = useState(false);

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

  // Fly to field
  useEffect(() => {
    if (!flyToField || !mapRef.current) return;
    const coords = flyToField.coordinates[0];
    const lat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
    const lng = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
    mapRef.current.flyTo({ center: [lng, lat], zoom: 16, duration: 1500 });
    onFlyToDone?.();
  }, [flyToField, onFlyToDone]);

  const addFieldLayers = useCallback((map: mapboxgl.Map, selected: Field[]) => {
    allFields.forEach((field) => {
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
        const clicked = allFields.find((f) => f.id === field.id);
        if (clicked && !drawMode) onFieldClickOnMap(clicked);
      });

      map.on("mouseenter", fillLayerId, () => {
        if (!drawMode) {
          map.getCanvas().style.cursor = "pointer";
          map.setPaintProperty(fillLayerId, "fill-opacity", 0.45);
        }
      });

      map.on("mouseleave", fillLayerId, () => {
        if (!drawMode) {
          map.getCanvas().style.cursor = "";
          const sel = selected.some((f) => f.id === field.id);
          map.setPaintProperty(fillLayerId, "fill-opacity", sel ? 0.3 : 0.1);
        }
      });
    });
  }, [allFields, drawMode, onFieldClickOnMap]);

  // Init map
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

  // Update field visibility
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
  }, [selectedFields, mapLoaded, allFields]);

  // Refresh layers when allFields changes (new field added)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    addFieldLayers(map, selectedFields);
  }, [allFields, mapLoaded]);

  // Drawing mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (!drawMode) {
      map.getCanvas().style.cursor = "";
      // Clean up draw preview
      try {
        if (map.getLayer("draw-fill")) map.removeLayer("draw-fill");
        if (map.getLayer("draw-line")) map.removeLayer("draw-line");
        if (map.getLayer("draw-points")) map.removeLayer("draw-points");
        if (map.getSource("draw-preview")) map.removeSource("draw-preview");
        if (map.getSource("draw-points")) map.removeSource("draw-points");
      } catch {}
      return;
    }

    map.getCanvas().style.cursor = "crosshair";

    const handleClick = (e: mapboxgl.MapMouseEvent) => {
      setDrawVertices(prev => [...prev, [e.lngLat.lng, e.lngLat.lat]]);
    };

    const handleDblClick = (e: mapboxgl.MapMouseEvent) => {
      e.preventDefault();
      setDrawMode(false);
      setShowNewFieldDialog(true);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawMode(false);
        setDrawVertices([]);
      }
    };

    map.on("click", handleClick);
    map.on("dblclick", handleDblClick);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      map.off("click", handleClick);
      map.off("dblclick", handleDblClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [drawMode, mapLoaded]);

  // Update draw preview
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || drawVertices.length < 2) return;

    const coords = [...drawVertices, drawVertices[0]];
    const polyData: GeoJSON.Feature = {
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [coords] },
    };
    const pointData: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: drawVertices.map(v => ({
        type: "Feature" as const,
        properties: {},
        geometry: { type: "Point" as const, coordinates: v },
      })),
    };

    if (map.getSource("draw-preview")) {
      (map.getSource("draw-preview") as mapboxgl.GeoJSONSource).setData(polyData);
    } else {
      map.addSource("draw-preview", { type: "geojson", data: polyData });
      map.addLayer({
        id: "draw-fill",
        type: "fill",
        source: "draw-preview",
        paint: { "fill-color": "#EAB947", "fill-opacity": 0.2 },
      });
      map.addLayer({
        id: "draw-line",
        type: "line",
        source: "draw-preview",
        paint: { "line-color": "#EAB947", "line-width": 2, "line-dasharray": [2, 2] },
      });
    }

    if (map.getSource("draw-points")) {
      (map.getSource("draw-points") as mapboxgl.GeoJSONSource).setData(pointData);
    } else {
      map.addSource("draw-points", { type: "geojson", data: pointData });
      map.addLayer({
        id: "draw-points",
        type: "circle",
        source: "draw-points",
        paint: { "circle-radius": 5, "circle-color": "#EAB947", "circle-stroke-width": 2, "circle-stroke-color": "#fff" },
      });
    }
  }, [drawVertices, mapLoaded]);

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

  const handleLocationSelect = (lng: number, lat: number) => {
    mapRef.current?.flyTo({ center: [lng, lat], zoom: 13, duration: 2000 });
  };

  const handleToggleDraw = () => {
    if (drawMode) {
      setDrawMode(false);
      setDrawVertices([]);
    } else {
      setDrawMode(true);
      setDrawVertices([]);
    }
  };

  const handleSaveNewField = (fieldData: {
    name: string;
    crop: string;
    cropEmoji: string;
    area: number;
    color: string;
    location: string;
    group?: string;
    coordinates: [number, number][][];
  }) => {
    const newField: Field = {
      id: `custom-${Date.now()}`,
      ...fieldData,
    };
    onAddField(newField);
    setShowNewFieldDialog(false);
    setDrawVertices([]);
    // Clean up draw layers
    const map = mapRef.current;
    if (map) {
      try {
        if (map.getLayer("draw-fill")) map.removeLayer("draw-fill");
        if (map.getLayer("draw-line")) map.removeLayer("draw-line");
        if (map.getLayer("draw-points")) map.removeLayer("draw-points");
        if (map.getSource("draw-preview")) map.removeSource("draw-preview");
        if (map.getSource("draw-points")) map.removeSource("draw-points");
      } catch {}
    }
  };

  return (
    <div className="relative w-full h-full">
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
        onToggleDraw={handleToggleDraw}
        isDrawing={drawMode}
        defaultStyle="satellite"
      />

      {/* Drawing indicator */}
      {drawMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-card/90 backdrop-blur-sm rounded-lg border border-border px-4 py-2 text-sm text-foreground flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-chart-gold animate-pulse" style={{ backgroundColor: "#EAB947" }} />
          Click to add points · Double-click to finish · Esc to cancel
          <span className="text-muted-foreground ml-1">({drawVertices.length} points)</span>
        </div>
      )}

      {/* New field dialog */}
      {showNewFieldDialog && drawVertices.length >= 3 && (
        <NewFieldDialog
          coordinates={drawVertices}
          onSave={handleSaveNewField}
          onCancel={() => {
            setShowNewFieldDialog(false);
            setDrawVertices([]);
          }}
        />
      )}
    </div>
  );
};

export default MapView;
