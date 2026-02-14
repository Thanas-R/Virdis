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
  satellite: "mapbox://styles/mapbox/satellite-streets-v12"
};

function hideExtraLabels(map: mapboxgl.Map) {
  const style = map.getStyle();
  if (!style?.layers) return;
  style.layers.forEach((layer) => {
    if (layer.id.includes("poi") || layer.id.includes("road-label") || layer.id.includes("transit") || layer.id.includes("building-") || (layer.id.includes("road") && layer.type === "symbol")) {
      try { map.setLayoutProperty(layer.id, "visibility", "none"); } catch {}
    }
  });
}

interface MapViewProps {
  allFields: Field[];
  selectedFields: Field[];
  activeField: Field | null;
  flyToField?: Field | null;
  onFlyToDone?: () => void;
  onFieldClickOnMap: (field: Field) => void;
  onAddField: (field: Field) => void;
  editBoundaryFieldId?: string | null;
  onUpdateField?: (field: Field) => void;
  onCancelEditBoundary?: () => void;
}

const MapView = ({ allFields, selectedFields, activeField, flyToField, onFlyToDone, onFieldClickOnMap, onAddField, editBoundaryFieldId, onUpdateField, onCancelEditBoundary }: MapViewProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapToken, setMapToken] = useState("");
  const [mapLoaded, setMapLoaded] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [drawVertices, setDrawVertices] = useState<[number, number][]>([]);
  const [showNewFieldDialog, setShowNewFieldDialog] = useState(false);
  const [showFields, setShowFields] = useState(true);
  const editMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const drawModeRef = useRef(false);
  const allFieldsRef = useRef(allFields);
  const onFieldClickRef = useRef(onFieldClickOnMap);
  const onUpdateFieldRef = useRef(onUpdateField);

  useEffect(() => { drawModeRef.current = drawMode; }, [drawMode]);
  useEffect(() => { allFieldsRef.current = allFields; }, [allFields]);
  useEffect(() => { onFieldClickRef.current = onFieldClickOnMap; }, [onFieldClickOnMap]);
  useEffect(() => { onUpdateFieldRef.current = onUpdateField; }, [onUpdateField]);

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const { data } = await supabase.functions.invoke("get-mapbox-token");
        if (data?.token) setMapToken(data.token);
      } catch (e) { console.error("Failed to fetch mapbox token", e); }
    };
    fetchToken();
  }, []);

  useEffect(() => {
    if (!flyToField || !mapRef.current) return;
    const coords = flyToField.coordinates[0];
    const lat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
    const lng = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
    mapRef.current.flyTo({ center: [lng, lat], zoom: 16, duration: 1500 });
    onFlyToDone?.();
  }, [flyToField, onFlyToDone]);

  const refreshFieldLayers = useCallback((map: mapboxgl.Map, fields: Field[], selected: Field[]) => {
    const style = map.getStyle();
    if (style?.layers) {
      style.layers.filter((l) => l.id.startsWith("field-fill-") || l.id.startsWith("field-line-")).forEach((l) => { try { map.removeLayer(l.id); } catch {} });
    }
    if (style?.sources) {
      Object.keys(style.sources).filter((s) => s.startsWith("field-")).forEach((s) => { try { map.removeSource(s); } catch {} });
    }
    fields.forEach((field) => {
      const sourceId = `field-${field.id}`;
      const isSelected = selected.some((f) => f.id === field.id);
      map.addSource(sourceId, { type: "geojson", data: { type: "Feature", properties: { id: field.id }, geometry: { type: "Polygon", coordinates: field.coordinates } } });
      map.addLayer({ id: `field-fill-${field.id}`, type: "fill", source: sourceId, paint: { "fill-color": field.color, "fill-opacity": isSelected ? 0.3 : 0.08 } });
      map.addLayer({ id: `field-line-${field.id}`, type: "line", source: sourceId, paint: { "line-color": field.color, "line-width": isSelected ? 2.5 : 1, "line-opacity": isSelected ? 1 : 0.4 } });
    });
  }, []);

  // Init map
  useEffect(() => {
    if (!mapContainer.current || !mapToken) return;
    mapboxgl.accessToken = mapToken;
    const map = new mapboxgl.Map({
      container: mapContainer.current, style: MAP_STYLES.satellite, center: [0.722, 40.719], zoom: 13, pitch: 0, attributionControl: false, doubleClickZoom: false
    });
    mapRef.current = map;
    map.on("load", () => { hideExtraLabels(map); setMapLoaded(true); refreshFieldLayers(map, allFieldsRef.current, allFieldsRef.current); });
    map.on("click", (e) => {
      if (drawModeRef.current) return;
      const fieldLayers = allFieldsRef.current.map((f) => `field-fill-${f.id}`).filter((id) => { try { return !!map.getLayer(id); } catch { return false; } });
      if (fieldLayers.length === 0) return;
      const features = map.queryRenderedFeatures(e.point, { layers: fieldLayers });
      if (features.length > 0) {
        const id = features[0].properties?.id;
        const field = allFieldsRef.current.find((f) => f.id === id);
        if (field) onFieldClickRef.current(field);
      }
    });
    map.on("mousemove", (e) => {
      if (drawModeRef.current) { map.getCanvas().style.cursor = "crosshair"; return; }
      const fieldLayers = allFieldsRef.current.map((f) => `field-fill-${f.id}`).filter((id) => { try { return !!map.getLayer(id); } catch { return false; } });
      if (fieldLayers.length === 0) { map.getCanvas().style.cursor = ""; return; }
      const features = map.queryRenderedFeatures(e.point, { layers: fieldLayers });
      map.getCanvas().style.cursor = features.length > 0 ? "pointer" : "";
    });
    return () => map.remove();
  }, [mapToken]);

  // Sync fields
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    refreshFieldLayers(map, allFields, selectedFields);
  }, [allFields, selectedFields, mapLoaded, refreshFieldLayers]);

  // Toggle visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    allFields.forEach((field) => {
      try {
        map.setLayoutProperty(`field-fill-${field.id}`, "visibility", showFields ? "visible" : "none");
        map.setLayoutProperty(`field-line-${field.id}`, "visibility", showFields ? "visible" : "none");
      } catch {}
    });
  }, [showFields, mapLoaded, allFields]);

  // Drawing mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (!drawMode) {
      map.getCanvas().style.cursor = "";
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
    const handleClick = (e: mapboxgl.MapMouseEvent) => { setDrawVertices((prev) => [...prev, [e.lngLat.lng, e.lngLat.lat]]); };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setDrawMode(false); setDrawVertices([]); }
      if (e.key === "Enter") {
        setDrawVertices((prev) => {
          if (prev.length >= 3) { setDrawMode(false); setShowNewFieldDialog(true); }
          return prev;
        });
      }
    };
    map.on("click", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => { map.off("click", handleClick); document.removeEventListener("keydown", handleKeyDown); };
  }, [drawMode, mapLoaded]);

  // Draw preview
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || drawVertices.length < 2) return;
    const coords = [...drawVertices, drawVertices[0]];
    const polyData: GeoJSON.Feature = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } };
    const pointData: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: drawVertices.map((v) => ({ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: v } }))
    };
    if (map.getSource("draw-preview")) {
      (map.getSource("draw-preview") as mapboxgl.GeoJSONSource).setData(polyData);
    } else {
      map.addSource("draw-preview", { type: "geojson", data: polyData });
      map.addLayer({ id: "draw-fill", type: "fill", source: "draw-preview", paint: { "fill-color": "#EAB947", "fill-opacity": 0.2 } });
      map.addLayer({ id: "draw-line", type: "line", source: "draw-preview", paint: { "line-color": "#EAB947", "line-width": 2, "line-dasharray": [2, 2] } });
    }
    if (map.getSource("draw-points")) {
      (map.getSource("draw-points") as mapboxgl.GeoJSONSource).setData(pointData);
    } else {
      map.addSource("draw-points", { type: "geojson", data: pointData });
      map.addLayer({ id: "draw-points", type: "circle", source: "draw-points", paint: { "circle-radius": 5, "circle-color": "#EAB947", "circle-stroke-width": 2, "circle-stroke-color": "#fff" } });
    }
  }, [drawVertices, mapLoaded]);

  // Boundary editing with draggable markers + dynamic lines + Enter/Escape
  useEffect(() => {
    editMarkersRef.current.forEach((m) => m.remove());
    editMarkersRef.current = [];
    if (!editBoundaryFieldId || !mapRef.current || !mapLoaded) return;

    const field = allFields.find((f) => f.id === editBoundaryFieldId);
    if (!field) return;
    const map = mapRef.current;
    const coords = field.coordinates[0];
    const currentCoords = [...coords]; // mutable copy for live updates

    const updateLivePolygon = () => {
      const sourceId = `field-${field.id}`;
      const source = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined;
      if (source) {
        source.setData({
          type: "Feature",
          properties: { id: field.id },
          geometry: { type: "Polygon", coordinates: [currentCoords] }
        });
      }
    };

    coords.slice(0, -1).forEach((coord, i) => {
      const el = document.createElement("div");
      el.style.width = "14px";
      el.style.height = "14px";
      el.style.borderRadius = "50%";
      el.style.border = "2px solid white";
      el.style.backgroundColor = field.color;
      el.style.cursor = "grab";
      el.style.boxShadow = "0 2px 6px rgba(0,0,0,0.4)";

      const marker = new mapboxgl.Marker({ element: el, draggable: true }).setLngLat(coord).addTo(map);

      // Dynamic line update on drag
      marker.on("drag", () => {
        const lngLat = marker.getLngLat();
        currentCoords[i] = [lngLat.lng, lngLat.lat];
        if (i === 0) currentCoords[currentCoords.length - 1] = [lngLat.lng, lngLat.lat];
        updateLivePolygon();
      });

      marker.on("dragend", () => {
        const lngLat = marker.getLngLat();
        const newCoords = [...currentCoords];
        newCoords[i] = [lngLat.lng, lngLat.lat];
        if (i === 0) newCoords[newCoords.length - 1] = [lngLat.lng, lngLat.lat];
        onUpdateFieldRef.current?.({ ...field, coordinates: [newCoords] as [number, number][][] });
      });

      editMarkersRef.current.push(marker);
    });

    // Enter to save, Escape to cancel
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Escape") {
        onCancelEditBoundary?.();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      editMarkersRef.current.forEach((m) => m.remove());
      editMarkersRef.current = [];
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [editBoundaryFieldId, mapLoaded, allFields, onCancelEditBoundary]);

  const handleStyleChange = (style: "dark" | "satellite") => {
    const map = mapRef.current;
    if (!map) return;
    setMapLoaded(false);
    map.setStyle(MAP_STYLES[style]);
    map.once("style.load", () => { if (style === "satellite") hideExtraLabels(map); setMapLoaded(true); refreshFieldLayers(map, allFields, selectedFields); });
  };

  const handleLocationSelect = (lng: number, lat: number) => { mapRef.current?.flyTo({ center: [lng, lat], zoom: 13, duration: 2000 }); };

  const handleToggleDraw = () => {
    if (drawMode) { setDrawMode(false); setDrawVertices([]); } else { setDrawMode(true); setDrawVertices([]); }
  };

  const handleSaveNewField = (fieldData: { name: string; crop: string; cropEmoji: string; area: number; color: string; location: string; group?: string; coordinates: [number, number][][]; }) => {
    const newField: Field = { id: `custom-${Date.now()}`, ...fieldData };
    onAddField(newField);
    setShowNewFieldDialog(false);
    setDrawVertices([]);
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
      {!mapToken && <div className="absolute inset-0 flex items-center justify-center bg-background z-10"><div className="text-muted-foreground text-sm animate-pulse">Loading map…</div></div>}
      <div ref={mapContainer} className="w-full h-full" />
      <SearchBar onSearch={() => {}} mapToken={mapToken} onLocationSelect={handleLocationSelect} />
      <MapToolbar onZoomIn={() => mapRef.current?.zoomIn()} onZoomOut={() => mapRef.current?.zoomOut()} onStyleChange={handleStyleChange}
        onToggleLayers={() => setShowFields((prev) => !prev)} onToggleDraw={handleToggleDraw} isDrawing={drawMode} showFields={showFields} defaultStyle="satellite" />

      {drawMode && (
        <div className="absolute bottom-6 left-4 z-10 bg-card/90 backdrop-blur-sm rounded-lg border border-border px-4 py-2.5 text-xs text-foreground space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "#EAB947" }} />
            <span className="font-medium">Drawing Mode</span>
          </div>
          <div className="text-muted-foreground">Click to add region points</div>
          <div className="text-muted-foreground">Enter to save · Esc to exit</div>
        </div>
      )}

      {editBoundaryFieldId && (
        <div className="absolute bottom-6 left-4 z-10 bg-card/90 backdrop-blur-sm rounded-lg border border-border px-4 py-2.5 text-xs text-foreground space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "#EAB947" }} />
            <span className="font-medium">Editing Boundary</span>
          </div>
          <div className="text-muted-foreground">Drag vertices to reshape</div>
          <div className="text-muted-foreground">Enter or Esc to finish</div>
          <button onClick={onCancelEditBoundary} className="mt-1 px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs">Done</button>
        </div>
      )}

      {showNewFieldDialog && drawVertices.length >= 3 && (
        <NewFieldDialog coordinates={drawVertices} mapToken={mapToken} onSave={handleSaveNewField} onCancel={() => { setShowNewFieldDialog(false); setDrawVertices([]); }} />
      )}
    </div>
  );
};

export default MapView;
