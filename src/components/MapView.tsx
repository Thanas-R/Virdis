import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { fields as allFields, Field } from "@/data/fields";
import SearchBar from "./SearchBar";
import MapToolbar from "./MapToolbar";
import FieldSelectPanel from "./FieldSelectPanel";
import RightToolbar, { RightMode } from "./RightToolbar";
import LayersPanel from "./LayersPanel";
import WeatherPanel from "./WeatherPanel";
import LocationPanel from "./LocationPanel";
import { supabase } from "@/integrations/supabase/client";

const MAP_STYLES = {
  dark: "mapbox://styles/mapbox/dark-v11",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
};

interface WeatherData {
  temp: number;
  description: string;
  humidity: number;
  windSpeed: number;
  feelsLike: number;
}

const MapView = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [selectedFields, setSelectedFields] = useState<Field[]>(allFields);
  const [mapToken, setMapToken] = useState<string>("");
  const [mapLoaded, setMapLoaded] = useState(false);
  const [rightMode, setRightMode] = useState<RightMode>(null);
  const [showLayers, setShowLayers] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{ lng: number; lat: number; name: string } | null>(null);
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  // Fetch token from edge function
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

      map.on("click", fillLayerId, () => {
        setSelectedFields((prev) => {
          const exists = prev.some((f) => f.id === field.id);
          return exists ? prev.filter((f) => f.id !== field.id) : [...prev, field];
        });
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
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || !mapToken) return;

    mapboxgl.accessToken = mapToken;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAP_STYLES.dark,
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

  const fetchWeather = async (lat: number, lng: number) => {
    setWeatherLoading(true);
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,apparent_temperature,weather_code`
      );
      const data = await res.json();
      const current = data.current;
      const weatherCodes: Record<number, string> = {
        0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
        45: "Fog", 48: "Depositing rime fog", 51: "Light drizzle", 53: "Moderate drizzle",
        55: "Dense drizzle", 61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
        71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow", 80: "Slight showers",
        81: "Moderate showers", 82: "Violent showers", 95: "Thunderstorm",
      };
      setWeatherData({
        temp: Math.round(current.temperature_2m),
        description: weatherCodes[current.weather_code] || "Unknown",
        humidity: current.relative_humidity_2m,
        windSpeed: Math.round(current.wind_speed_10m),
        feelsLike: Math.round(current.apparent_temperature),
      });
    } catch {
      setWeatherData(null);
    } finally {
      setWeatherLoading(false);
    }
  };

  const handleLocationSelect = (lng: number, lat: number, name: string) => {
    setSelectedLocation({ lng, lat, name });
    mapRef.current?.flyTo({ center: [lng, lat], zoom: 13, duration: 2000 });
    fetchWeather(lat, lng);
  };

  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();
  const handleRemoveField = (id: string) => {
    setSelectedFields((prev) => prev.filter((f) => f.id !== id));
  };

  const handleToggleLayerField = (field: Field) => {
    setSelectedFields((prev) => {
      const exists = prev.some((f) => f.id === field.id);
      return exists ? prev.filter((f) => f.id !== field.id) : [...prev, field];
    });
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
        <SearchBar
          onSearch={() => {}}
          mapToken={mapToken}
          onLocationSelect={handleLocationSelect}
        />
        <MapToolbar
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onStyleChange={handleStyleChange}
          onToggleLayers={() => setRightMode(rightMode === "layers" ? null : "layers")}
        />
      </div>

      {/* Main right panel - field select */}
      <FieldSelectPanel
        fields={selectedFields}
        onRemoveField={handleRemoveField}
        onSave={() => {}}
        onCancel={() => setSelectedFields(allFields)}
        onBack={() => {}}
      />

      {/* Mode panels */}
      {rightMode === "layers" && (
        <LayersPanel
          fields={allFields}
          visibleFields={selectedFields}
          onToggleField={handleToggleLayerField}
          onShowAll={() => setSelectedFields(allFields)}
          onHideAll={() => setSelectedFields([])}
        />
      )}
      {rightMode === "weather" && (
        <WeatherPanel
          locationName={selectedLocation?.name}
          weatherData={weatherData}
          loading={weatherLoading}
        />
      )}
      {rightMode === "location" && (
        <LocationPanel
          locationName={selectedLocation?.name}
          coordinates={selectedLocation ? { lng: selectedLocation.lng, lat: selectedLocation.lat } : undefined}
        />
      )}

      <RightToolbar activeMode={rightMode} onModeChange={setRightMode} />
    </div>
  );
};

export default MapView;
