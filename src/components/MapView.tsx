import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Field } from "@/data/fields";
import SearchBar from "./SearchBar";
import MapToolbar from "./MapToolbar";
import NewFieldDialog from "./NewFieldDialog";
import MobileDrawPrompt from "./MobileDrawPrompt";
import DetectedFieldsReview from "./DetectedFieldsReview";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { detectFieldBoundaries, assignFieldColor } from "@/lib/field-segmentation";

const MAP_STYLES = {
  dark: "mapbox://styles/mapbox/dark-v11",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12"
};

const MAP_POS_KEY = "map-last-position";
const MIN_DETECT_ZOOM = 16;
const MAX_DETECT_SPAN_KM = 10;

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

function haversineDist(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

interface DetectedFieldData {
  name: string;
  crop: string;
  cropEmoji: string;
  ndviEstimate: number;
  color: string;
  coordinates: [number, number][];
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
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedFields, setDetectedFields] = useState<DetectedFieldData[] | null>(null);
  const [detectionSummary, setDetectionSummary] = useState("");
  const [autoFieldMode, setAutoFieldMode] = useState(false);
  const [autoFieldDetecting, setAutoFieldDetecting] = useState(false);
  const [geeNdviTileUrl, setGeeNdviTileUrl] = useState<string | null>(null);
  const [geeNdviToken, setGeeNdviToken] = useState<string | null>(null);
  const editMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const drawModeRef = useRef(false);
  const autoFieldModeRef = useRef(false);
  const allFieldsRef = useRef(allFields);
  const onFieldClickRef = useRef(onFieldClickOnMap);
  const onUpdateFieldRef = useRef(onUpdateField);

  useEffect(() => { drawModeRef.current = drawMode; }, [drawMode]);
  useEffect(() => { autoFieldModeRef.current = autoFieldMode; }, [autoFieldMode]);
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
    const pos = loadMapPosition();
    const map = new mapboxgl.Map({
      container: mapContainer.current, style: MAP_STYLES.satellite,
      center: [pos.lng, pos.lat], zoom: pos.zoom, bearing: pos.bearing, pitch: pos.pitch,
      attributionControl: false, doubleClickZoom: false, preserveDrawingBuffer: true, // needed for canvas capture
    });
    mapRef.current = map;
    map.on("load", () => { hideExtraLabels(map); setMapLoaded(true); refreshFieldLayers(map, allFieldsRef.current, allFieldsRef.current); });
    map.on("moveend", () => saveMapPosition(map));
    map.on("click", (e) => {
      console.log("Map clicked:", e.lngLat.lat, e.lngLat.lng, "| drawMode:", drawModeRef.current, "| autoField:", autoFieldModeRef.current);
      if (drawModeRef.current) return;
      if (editBoundaryFieldIdRef.current) return;
      if (autoFieldModeRef.current) {
        console.log("Auto-detect triggered at:", e.lngLat.lat, e.lngLat.lng);
        handleAutoFieldClick(e.lngLat.lat, e.lngLat.lng);
        return;
      }
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
      if (autoFieldModeRef.current) { map.getCanvas().style.cursor = "crosshair"; return; }
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
    // If we don't have GEE tiles yet, fetch them
    if (!geeNdviTileUrl) {
      loadGeeNdviTiles();
      return;
    }
    if (!map.getSource(ndviSourceId)) {
      // GEE tiles require auth token in the URL
      const authenticatedUrl = `${geeNdviTileUrl}?access_token=${geeNdviToken}`;
      map.addSource(ndviSourceId, {
        type: "raster",
        tiles: [authenticatedUrl],
        tileSize: 256,
      });
    }
    if (!map.getLayer(ndviLayerId)) {
      map.addLayer({ id: ndviLayerId, type: "raster", source: ndviSourceId, paint: { "raster-opacity": 0.5 } },
        allFields.length > 0 ? `field-fill-${allFields[0].id}` : undefined);
    }
  }, [showNdvi, mapLoaded, allFields, geeNdviTileUrl, geeNdviToken]);

  // Show detected field previews on map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const style = map.getStyle();
    if (style?.layers) {
      style.layers.filter(l => l.id.startsWith("detected-")).forEach(l => { try { map.removeLayer(l.id); } catch {} });
    }
    if (style?.sources) {
      Object.keys(style.sources).filter(s => s.startsWith("detected-")).forEach(s => { try { map.removeSource(s); } catch {} });
    }
    if (!detectedFields || detectedFields.length === 0) return;
    detectedFields.forEach((field, idx) => {
      const sourceId = `detected-${idx}`;
      const coords: [number, number][] = [...field.coordinates, field.coordinates[0]];
      map.addSource(sourceId, { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } } });
      map.addLayer({ id: `detected-fill-${idx}`, type: "fill", source: sourceId, paint: { "fill-color": field.color, "fill-opacity": 0.25 } });
      map.addLayer({ id: `detected-line-${idx}`, type: "line", source: sourceId, paint: { "line-color": field.color, "line-width": 2, "line-dasharray": [3, 2] } });
    });
  }, [detectedFields, mapLoaded]);

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
    const handleClick = (e: mapboxgl.MapMouseEvent) => { setDrawVertices((prev) => [...prev, [e.lngLat.lng, e.lngLat.lat]]); };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setDrawMode(false); setDrawVertices([]); }
      if (e.key === "Backspace") {
        e.preventDefault();
        setDrawVertices((prev) => prev.length > 0 ? prev.slice(0, -1) : prev);
      }
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
    if (!map || !mapLoaded) return;
    // Clear if no vertices
    if (drawVertices.length < 2) {
      try {
        if (map.getLayer("draw-fill")) map.removeLayer("draw-fill");
        if (map.getLayer("draw-line")) map.removeLayer("draw-line");
        if (map.getLayer("draw-points")) map.removeLayer("draw-points");
        if (map.getSource("draw-preview")) map.removeSource("draw-preview");
        if (map.getSource("draw-points")) map.removeSource("draw-points");
      } catch {}
      // Still show single point
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
      toast.info("Loading GEE NDVI tiles…");
      const { data, error } = await supabase.functions.invoke("gee-ndvi-tiles");
      if (error) throw error;
      if (data?.tileUrl) {
        setGeeNdviTileUrl(data.tileUrl);
        setGeeNdviToken(data.token);
        toast.success("GEE NDVI layer loaded");
      } else if (data?.error) {
        throw new Error(data.error);
      }
    } catch (err: any) {
      console.error("GEE NDVI tiles error:", err);
      toast.error("Failed to load NDVI tiles: " + (err?.message || "Unknown error"));
      setShowNdvi(false);
    }
  };

  // ── GEE: Auto-field single-click detection ────────────────────
  const handleAutoFieldClick = async (lat: number, lng: number) => {
    if (autoFieldDetecting) return;
    setAutoFieldDetecting(true);
    toast.info(`Detecting field at ${lat.toFixed(4)}, ${lng.toFixed(4)}…`);

    try {
      const { data, error } = await supabase.functions.invoke("gee-detect-field", {
        body: { lat, lng },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const f = data.field;
      if (!f?.coordinates || f.coordinates.length < 3) {
        toast.warning("No field boundary detected at this location");
        return;
      }

      const detected: DetectedFieldData[] = [{
        name: `Field ${Date.now() % 10000}`,
        crop: f.crop,
        cropEmoji: f.cropEmoji,
        ndviEstimate: f.stats.meanNdvi,
        color: assignFieldColor(allFields.length),
        coordinates: f.coordinates,
      }];

      setDetectedFields(detected);
      setDetectionSummary(
        `GEE Detection · ${f.stats.areaHectares} ha · NDVI ${f.stats.meanNdvi} ± ${f.stats.stdNdvi} · Health ${f.stats.healthScore}/100`
      );
      toast.success(`Field detected: ${f.stats.areaHectares} ha, health ${f.stats.healthScore}/100`);
    } catch (err: any) {
      console.error("Auto field detection error:", err);
      toast.error("Detection failed: " + (err?.message || "Unknown error"));
    } finally {
      setAutoFieldDetecting(false);
    }
  };

  const handleToggleAutoField = () => {
    setAutoFieldMode(prev => !prev);
    if (!autoFieldMode) {
      toast.info("Auto Field mode ON – click on a field to detect its boundary");
      setDrawMode(false);
      setDrawVertices([]);
    }
  };

  // Deterministic field detection via image segmentation
  const handleDetectFields = () => {
    const map = mapRef.current;
    if (!map) return;

    // Zoom check
    const zoom = map.getZoom();
    if (zoom < MIN_DETECT_ZOOM) {
      toast.warning(`Zoom in more to detect fields (current: ${zoom.toFixed(1)}, need ≥${MIN_DETECT_ZOOM})`);
      return;
    }

    // Bounds size check
    const bounds = map.getBounds();
    const spanX = haversineDist(bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getSouth());
    const spanY = haversineDist(bounds.getWest(), bounds.getSouth(), bounds.getWest(), bounds.getNorth());
    if (spanX > MAX_DETECT_SPAN_KM || spanY > MAX_DETECT_SPAN_KM) {
      toast.warning(`View too large (${spanX.toFixed(1)}×${spanY.toFixed(1)} km). Max ${MAX_DETECT_SPAN_KM}×${MAX_DETECT_SPAN_KM} km.`);
      return;
    }

    setIsDetecting(true);
    setDetectedFields(null);
    toast.info("Analyzing satellite imagery for field boundaries…");

    // Run segmentation in next frame to allow UI update
    requestAnimationFrame(() => {
      try {
        const canvas = map.getCanvas();
        const boundsData = {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest(),
        };

        const result = detectFieldBoundaries(canvas, boundsData, {
          vegThreshold: 0.06,
          morphKernel: 2,
          minAreaHa: 0.5,
          downscale: 2,
        });

        if (result.polygons.length === 0) {
          toast.info("No field boundaries detected. Try a different area with more vegetation.");
          setIsDetecting(false);
          return;
        }

        const detected: DetectedFieldData[] = result.polygons.map((poly, idx) => ({
          name: `Field ${idx + 1}`,
          crop: poly.meanVegIndex > 0.2 ? "Active Crop" : poly.meanVegIndex > 0.1 ? "Pasture" : "Bare Soil",
          cropEmoji: poly.meanVegIndex > 0.2 ? "🌾" : poly.meanVegIndex > 0.1 ? "🌿" : "🟤",
          ndviEstimate: poly.meanVegIndex,
          color: assignFieldColor(idx),
          coordinates: poly.coordinates,
        }));

        setDetectedFields(detected);
        setDetectionSummary(`${detected.length} regions detected in ${result.processingTimeMs}ms · ${spanX.toFixed(1)}×${spanY.toFixed(1)} km area`);
        toast.success(`Detected ${detected.length} field boundaries in ${result.processingTimeMs}ms`);
      } catch (err: any) {
        console.error("Segmentation error:", err);
        toast.error("Field detection failed: " + (err?.message || "Unknown error"));
      } finally {
        setIsDetecting(false);
      }
    });
  };

  const handleAcceptDetected = (fields: Field[]) => {
    fields.forEach(f => onAddField(f));
    setDetectedFields(null);
    setDetectionSummary("");
    toast.success(`Added ${fields.length} detected fields`);
  };

  const handleDismissDetected = () => {
    setDetectedFields(null);
    setDetectionSummary("");
  };

  return (
    <div className="relative w-full h-full">
      {!mapToken && <div className="absolute inset-0 flex items-center justify-center bg-background z-10"><div className="text-muted-foreground text-sm animate-pulse">Loading map…</div></div>}
      <div ref={mapContainer} className="w-full h-full" />
      <SearchBar onSearch={() => {}} mapToken={mapToken} onLocationSelect={handleLocationSelect} />
      <MapToolbar onZoomIn={() => mapRef.current?.zoomIn()} onZoomOut={() => mapRef.current?.zoomOut()} onStyleChange={handleStyleChange}
        onToggleLayers={() => setShowFields((prev) => !prev)} onToggleDraw={handleToggleDraw} isDrawing={drawMode} showFields={showFields} defaultStyle="satellite"
        onResetNorth={handleResetNorth} onLocateUser={handleLocateUser}
        onDetectFields={handleDetectFields} isDetecting={isDetecting}
        onToggleNdvi={() => setShowNdvi(prev => !prev)} showNdvi={showNdvi}
        onToggleAutoField={handleToggleAutoField} isAutoField={autoFieldMode} />

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

      {autoFieldMode && !drawMode && (
        <div className="absolute bottom-6 left-4 z-10 bg-card/90 backdrop-blur-sm rounded-lg border border-border px-4 py-2.5 text-xs text-foreground space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "#4CAF50" }} />
            <span className="font-medium">{autoFieldDetecting ? "Detecting field…" : "Auto Field Mode"}</span>
          </div>
          <div className="text-muted-foreground">Click on any field to detect its boundary via GEE</div>
          <button onClick={() => setAutoFieldMode(false)} className="mt-1 px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs">Exit</button>
        </div>
      )}

      {detectedFields && detectedFields.length > 0 && (
        <DetectedFieldsReview detectedFields={detectedFields} summary={detectionSummary}
          onAccept={handleAcceptDetected} onDismiss={handleDismissDetected} />
      )}

      {showNewFieldDialog && drawVertices.length >= 3 && (
        <NewFieldDialog coordinates={drawVertices} mapToken={mapToken} onSave={handleSaveNewField} onCancel={() => { setShowNewFieldDialog(false); setDrawVertices([]); }} />
      )}
    </div>
  );
};

export default MapView;
