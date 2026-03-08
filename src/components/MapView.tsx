import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Field } from "@/data/fields";
import SearchBar from "./SearchBar";
import MapToolbar from "./MapToolbar";
import NewFieldDialog from "./NewFieldDialog";
import MobileDrawPrompt from "./MobileDrawPrompt";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const MAP_STYLES = {
  dark: "mapbox://styles/mapbox/dark-v11",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12"
};

const MAP_POS_KEY = "map-last-position";

function saveMapPosition(map: mapboxgl.Map) {
  const center = map.getCenter();
  localStorage.setItem(MAP_POS_KEY, JSON.stringify({ lng: center.lng, lat: center.lat, zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() }));
}

function loadMapPosition() {
  try { const s = localStorage.getItem(MAP_POS_KEY); if (s) return JSON.parse(s); } catch {}
  return { lng: 0.722, lat: 40.719, zoom: 13, bearing: 0, pitch: 0 };
}

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
  const isMobile = useIsMobile();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapToken, setMapToken] = useState("");
  const [mapLoaded, setMapLoaded] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [drawVertices, setDrawVertices] = useState<[number, number][]>([]);
  const [showNewFieldDialog, setShowNewFieldDialog] = useState(false);
  const [showFields, setShowFields] = useState(true);
  const [showNdvi, setShowNdvi] = useState(false);
  const [geeNdviTileUrl, setGeeNdviTileUrl] = useState<string | null>(null);
  const [geeNdviToken, setGeeNdviToken] = useState<string | null>(null);
  const editMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const drawModeRef = useRef(false);
  const editBoundaryFieldIdRef = useRef(editBoundaryFieldId);
  const allFieldsRef = useRef(allFields);
  const onFieldClickRef = useRef(onFieldClickOnMap);
  const onUpdateFieldRef = useRef(onUpdateField);

  useEffect(() => { drawModeRef.current = drawMode; }, [drawMode]);
  useEffect(() => { editBoundaryFieldIdRef.current = editBoundaryFieldId; }, [editBoundaryFieldId]);
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
    if (!map.isStyleLoaded()) return;
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
    const pos = loadMapPosition();
    const map = new mapboxgl.Map({
      container: mapContainer.current, style: MAP_STYLES.satellite,
      center: [pos.lng, pos.lat], zoom: pos.zoom, bearing: pos.bearing, pitch: pos.pitch,
      attributionControl: false, doubleClickZoom: false,
    });
    mapRef.current = map;
    map.on("load", () => { hideExtraLabels(map); setMapLoaded(true); refreshFieldLayers(map, allFieldsRef.current, allFieldsRef.current); });
    map.on("moveend", () => saveMapPosition(map));
    map.on("click", (e) => {
      if (drawModeRef.current) return;
      if (editBoundaryFieldIdRef.current) return;
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

  // GEE NDVI overlay
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const ndviSourceId = "gee-ndvi-source";
    const ndviLayerId = "gee-ndvi-layer";
    if (!showNdvi) {
      try { if (map.getLayer(ndviLayerId)) map.removeLayer(ndviLayerId); } catch {}
      try { if (map.getSource(ndviSourceId)) map.removeSource(ndviSourceId); } catch {}
      return;
    }
    if (!geeNdviTileUrl) {
      loadGeeNdviTiles();
      return;
    }
    if (!map.getSource(ndviSourceId)) {
      const authenticatedUrl = `${geeNdviTileUrl}?access_token=${geeNdviToken}`;
      map.addSource(ndviSourceId, { type: "raster", tiles: [authenticatedUrl], tileSize: 256 });
    }
    if (!map.getLayer(ndviLayerId)) {
      map.addLayer({ id: ndviLayerId, type: "raster", source: ndviSourceId, paint: { "raster-opacity": 0.5 } },
        allFields.length > 0 ? `field-fill-${allFields[0].id}` : undefined);
    }
  }, [showNdvi, mapLoaded, allFields, geeNdviTileUrl, geeNdviToken]);

  // Drawing mode with Backspace undo
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
    console.log("[Virdis Draw] Drawing mode started");
    const handleClick = (e: mapboxgl.MapMouseEvent) => {
      const vertex: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      console.log("[Virdis Draw] Vertex added:", vertex);
      setDrawVertices((prev) => {
        const updated = [...prev, vertex];
        console.log("[Virdis Draw] Total vertices:", updated.length);
        return updated;
      });
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        console.log("[Virdis Draw] Drawing cancelled (Escape)");
        setDrawMode(false); setDrawVertices([]);
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        console.log("[Virdis Draw] Undo last vertex (Backspace)");
        setDrawVertices((prev) => prev.length > 0 ? prev.slice(0, -1) : prev);
      }
      if (e.key === "Enter") {
        setDrawVertices((prev) => {
          if (prev.length >= 3) {
            const closedCoords = [...prev, prev[0]];
            const geometry = { type: "Polygon" as const, coordinates: [closedCoords] };
            console.log("[Virdis Draw] Polygon created:", geometry);
            setDrawMode(false);
            setShowNewFieldDialog(true);
          } else {
            console.warn("[Virdis Draw] Need at least 3 vertices, have:", prev.length);
          }
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
    if (!map || !mapLoaded) return;
    if (drawVertices.length < 2) {
      try {
        if (map.getLayer("draw-fill")) map.removeLayer("draw-fill");
        if (map.getLayer("draw-line")) map.removeLayer("draw-line");
        if (map.getLayer("draw-points")) map.removeLayer("draw-points");
        if (map.getSource("draw-preview")) map.removeSource("draw-preview");
        if (map.getSource("draw-points")) map.removeSource("draw-points");
      } catch {}
      if (drawVertices.length === 1) {
        const pointData: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: drawVertices[0] } }]
        };
        if (map.getSource("draw-points")) {
          (map.getSource("draw-points") as mapboxgl.GeoJSONSource).setData(pointData);
        } else {
          map.addSource("draw-points", { type: "geojson", data: pointData });
          map.addLayer({ id: "draw-points", type: "circle", source: "draw-points", paint: { "circle-radius": 5, "circle-color": "#EAB947", "circle-stroke-width": 2, "circle-stroke-color": "#fff" } });
        }
      }
      return;
    }
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

  // Boundary editing
  useEffect(() => {
    editMarkersRef.current.forEach((m) => m.remove());
    editMarkersRef.current = [];
    if (!editBoundaryFieldId || !mapRef.current || !mapLoaded) return;
    const field = allFields.find((f) => f.id === editBoundaryFieldId);
    if (!field) return;
    const map = mapRef.current;
    const coords = field.coordinates[0];
    const currentCoords = [...coords];
    const updateLivePolygon = () => {
      const source = map.getSource(`field-${field.id}`) as mapboxgl.GeoJSONSource | undefined;
      if (source) source.setData({ type: "Feature", properties: { id: field.id }, geometry: { type: "Polygon", coordinates: [currentCoords] } });
    };
    coords.slice(0, -1).forEach((coord, i) => {
      const el = document.createElement("div");
      Object.assign(el.style, { width: "14px", height: "14px", borderRadius: "50%", border: "2px solid white", backgroundColor: field.color, cursor: "grab", boxShadow: "0 2px 6px rgba(0,0,0,0.4)" });
      const marker = new mapboxgl.Marker({ element: el, draggable: true }).setLngLat(coord).addTo(map);
      marker.on("drag", () => {
        const ll = marker.getLngLat();
        currentCoords[i] = [ll.lng, ll.lat];
        if (i === 0) currentCoords[currentCoords.length - 1] = [ll.lng, ll.lat];
        updateLivePolygon();
      });
      marker.on("dragend", () => {
        const ll = marker.getLngLat();
        const nc = [...currentCoords];
        nc[i] = [ll.lng, ll.lat];
        if (i === 0) nc[nc.length - 1] = [ll.lng, ll.lat];
        onUpdateFieldRef.current?.({ ...field, coordinates: [nc] as [number, number][][] });
      });
      editMarkersRef.current.push(marker);
    });
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === "Escape") onCancelEditBoundary?.(); };
    document.addEventListener("keydown", handleKeyDown);
    return () => { editMarkersRef.current.forEach((m) => m.remove()); editMarkersRef.current = []; document.removeEventListener("keydown", handleKeyDown); };
  }, [editBoundaryFieldId, mapLoaded, allFields, onCancelEditBoundary]);

  const handleStyleChange = (style: "dark" | "satellite") => {
    const map = mapRef.current;
    if (!map) return;
    setMapLoaded(false);
    map.setStyle(MAP_STYLES[style]);
    map.once("style.load", () => { if (style === "satellite") hideExtraLabels(map); setMapLoaded(true); refreshFieldLayers(map, allFields, selectedFields); });
  };

  const handleLocationSelect = (lng: number, lat: number) => { mapRef.current?.flyTo({ center: [lng, lat], zoom: 13, duration: 2000 }); };
  const handleToggleDraw = () => { if (drawMode) { setDrawMode(false); setDrawVertices([]); } else { setDrawMode(true); setDrawVertices([]); } };

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

  const handleResetNorth = () => { mapRef.current?.easeTo({ bearing: 0, pitch: 0, duration: 500 }); };
  const handleLocateUser = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => { mapRef.current?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 15, duration: 2000 }); },
      (err) => { console.warn("Geolocation error:", err.message); }
    );
  };

  // ── GEE: Load NDVI tile layer ──────────────────────────────────
  const loadGeeNdviTiles = async () => {
    try {
      toast.info("Loading NDVI overlay…");
      const { data, error } = await supabase.functions.invoke("gee-ndvi-tiles");
      if (error) throw error;
      if (data?.tileUrl) {
        setGeeNdviTileUrl(data.tileUrl);
        setGeeNdviToken(data.token);
        toast.success("NDVI layer loaded");
      } else if (data?.error) {
        throw new Error(data.error);
      }
    } catch (err: any) {
      console.error("NDVI tiles error:", err);
      toast.error("Failed to load NDVI tiles: " + (err?.message || "Unknown error"));
      setShowNdvi(false);
    }
  };

  return (
    <div className="relative w-full h-full">
      {!mapToken && <div className="absolute inset-0 flex items-center justify-center bg-background z-10"><div className="text-muted-foreground text-sm animate-pulse">Loading map…</div></div>}
      <div ref={mapContainer} className="w-full h-full" />
      <SearchBar onSearch={() => {}} mapToken={mapToken} onLocationSelect={handleLocationSelect} />
      <MapToolbar onZoomIn={() => mapRef.current?.zoomIn()} onZoomOut={() => mapRef.current?.zoomOut()} onStyleChange={handleStyleChange}
        onToggleLayers={() => setShowFields((prev) => !prev)} onToggleDraw={handleToggleDraw} isDrawing={drawMode} showFields={showFields} defaultStyle="satellite"
        onResetNorth={handleResetNorth} onLocateUser={handleLocateUser}
        onToggleNdvi={() => setShowNdvi(prev => !prev)} showNdvi={showNdvi} />

      {drawMode && isMobile && (
        <MobileDrawPrompt vertexCount={drawVertices.length}
          onSave={() => { if (drawVertices.length >= 3) { setDrawMode(false); setShowNewFieldDialog(true); } }}
          onCancel={() => { setDrawMode(false); setDrawVertices([]); }}
          onUndo={() => setDrawVertices(prev => prev.slice(0, -1))} />
      )}

      {drawMode && !isMobile && (
        <div className="absolute bottom-6 left-4 z-10 bg-card/90 backdrop-blur-sm rounded-lg border border-border px-4 py-2.5 text-xs text-foreground space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "#EAB947" }} />
            <span className="font-medium">Drawing Mode</span>
          </div>
          <div className="text-muted-foreground">Click to add points · Backspace to undo</div>
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
