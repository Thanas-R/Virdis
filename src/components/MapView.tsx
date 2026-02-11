import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { fields, Field } from "@/data/fields";
import SearchBar from "./SearchBar";
import MapToolbar from "./MapToolbar";
import FieldSelectPanel from "./FieldSelectPanel";
import RightToolbar from "./RightToolbar";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || "";

const MapView = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [selectedFields, setSelectedFields] = useState<Field[]>(fields);

  useEffect(() => {
    if (!mapContainer.current || !MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

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
      // Add field polygons
      selectedFields.forEach((field) => {
        const sourceId = `field-${field.id}`;
        const fillLayerId = `field-fill-${field.id}`;
        const lineLayerId = `field-line-${field.id}`;

        map.addSource(sourceId, {
          type: "geojson",
          data: {
            type: "Feature",
            properties: { name: field.name },
            geometry: {
              type: "Polygon",
              coordinates: field.coordinates,
            },
          },
        });

        map.addLayer({
          id: fillLayerId,
          type: "fill",
          source: sourceId,
          paint: {
            "fill-color": field.color,
            "fill-opacity": 0.2,
          },
        });

        map.addLayer({
          id: lineLayerId,
          type: "line",
          source: sourceId,
          paint: {
            "line-color": field.color,
            "line-width": 2,
          },
        });
      });
    });

    return () => map.remove();
  }, [selectedFields]);

  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();
  const handleRemoveField = (id: string) => {
    setSelectedFields((prev) => prev.filter((f) => f.id !== id));
  };

  return (
    <div className="relative w-full h-full flex">
      {/* Map */}
      <div className="flex-1 relative">
        <div ref={mapContainer} className="w-full h-full" />
        <SearchBar onSearch={() => {}} />
        <MapToolbar onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} />
      </div>

      {/* Right sidebar */}
      <FieldSelectPanel
        fields={selectedFields}
        onRemoveField={handleRemoveField}
        onSave={() => {}}
        onCancel={() => setSelectedFields(fields)}
        onBack={() => {}}
      />

      {/* Right icon toolbar */}
      <RightToolbar />
    </div>
  );
};

export default MapView;
