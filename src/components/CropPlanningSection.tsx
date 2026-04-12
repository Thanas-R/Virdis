import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Field, haToAcres } from "@/data/fields";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import mapboxgl from "mapbox-gl";
import {
  Loader2, Sprout, TreePine, Droplets, TrendingUp, RotateCw,
  Lightbulb, Layers, ArrowRight, Zap,
} from "lucide-react";
import {
  Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface CropZone {
  id: string;
  name: string;
  crop: string;
  emoji: string;
  color: string;
  area_pct: number;
  reason: string;
  spacing_m: number;
  water_needs: string;
  season: string;
  yield_estimate: string;
  position: { x: number; y: number };
}

interface IntercroppingPair {
  primary: string;
  secondary: string;
  emoji: string;
  benefit: string;
  spacing: string;
}

interface RotationStep {
  season: string;
  months: string;
  crops: string[];
}

interface CropPlan {
  zones: CropZone[];
  intercropping: IntercroppingPair[];
  rotation_plan: RotationStep[];
  summary: string;
  tips: string[];
  overall_score: number;
  water_saving_pct: number;
  expected_revenue_increase_pct: number;
}

interface CropPlanningSectionProps {
  field: Field;
  ndviData?: any;
  soilData?: any;
  weatherData?: any;
  suitabilityData?: any;
  mapToken: string;
}

const CROP_PLAN_CACHE_KEY = "crop-plan-cache";

function getPlanCache(): Record<string, { data: CropPlan; timestamp: number }> {
  try {
    const c = localStorage.getItem(CROP_PLAN_CACHE_KEY);
    return c ? JSON.parse(c) : {};
  } catch { return {}; }
}

function setPlanCache(fieldId: string, data: CropPlan) {
  const cache = getPlanCache();
  cache[fieldId] = { data, timestamp: Date.now() };
  localStorage.setItem(CROP_PLAN_CACHE_KEY, JSON.stringify(cache));
}

const CustomTooltipContent = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg px-3 py-2 shadow-xl border border-border/50" style={{ background: "hsl(150, 18%, 12%)" }}>
      <div className="text-xs font-semibold text-foreground">{d.emoji} {d.name || d.crop}</div>
      <div className="text-sm font-bold" style={{ color: d.color }}>{d.value || d.area_pct}%</div>
      {d.reason && <div className="text-[10px] text-muted-foreground mt-1 max-w-[200px]">{d.reason}</div>}
    </div>
  );
};

const CropPlanningSection = ({ field, ndviData, soilData, weatherData, suitabilityData, mapToken }: CropPlanningSectionProps) => {
  const isMobile = useIsMobile();
  const [plan, setPlan] = useState<CropPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedZone, setSelectedZone] = useState<CropZone | null>(null);
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  const fieldCenter = useMemo(() => {
    const coords = field.coordinates[0];
    return {
      lat: coords.reduce((s, c) => s + c[1], 0) / coords.length,
      lng: coords.reduce((s, c) => s + c[0], 0) / coords.length,
    };
  }, [field]);

  const fieldBounds = useMemo(() => {
    const coords = field.coordinates[0];
    const lngs = coords.map(c => c[0]);
    const lats = coords.map(c => c[1]);
    return {
      minLng: Math.min(...lngs), maxLng: Math.max(...lngs),
      minLat: Math.min(...lats), maxLat: Math.max(...lats),
    };
  }, [field]);

  const fetchPlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("crop-planning", {
        body: {
          fieldName: field.name,
          crop: field.crop,
          area: haToAcres(field.area),
          location: field.location,
          coordinates: field.coordinates,
          ndviData,
          soilData,
          weatherData,
          suitabilityData,
        },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setPlan(data);
      setPlanCache(field.id, data);
    } catch (e: any) {
      console.error("Crop planning error:", e);
      setError(e?.message || "Failed to generate crop plan");
    } finally {
      setLoading(false);
    }
  }, [field, ndviData, soilData, weatherData, suitabilityData]);

  // Load cached or prompt to generate
  useEffect(() => {
    const cache = getPlanCache();
    const cached = cache[field.id];
    if (cached && Date.now() - cached.timestamp < 3600000) {
      setPlan(cached.data);
    } else {
      setPlan(null);
    }
  }, [field.id]);

  // Initialize static map
  useEffect(() => {
    if (!mapContainer.current || !mapToken || !plan) return;
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    mapboxgl.accessToken = mapToken;
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [fieldCenter.lng, fieldCenter.lat],
      zoom: 16,
      interactive: false,
      attributionControl: false,
    });
    mapRef.current = map;

    map.on("load", () => {
      // Add field boundary
      map.addSource("plan-field", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "Polygon", coordinates: field.coordinates },
        },
      });
      map.addLayer({
        id: "plan-field-fill",
        type: "fill",
        source: "plan-field",
        paint: { "fill-color": "#ffffff", "fill-opacity": 0.08 },
      });
      map.addLayer({
        id: "plan-field-line",
        type: "line",
        source: "plan-field",
        paint: { "line-color": "#ffffff", "line-width": 2, "line-dasharray": [3, 2] },
      });

      // Add zone markers with dotted pattern
      plan.zones.forEach((zone) => {
        const lng = fieldBounds.minLng + zone.position.x * (fieldBounds.maxLng - fieldBounds.minLng);
        const lat = fieldBounds.minLat + zone.position.y * (fieldBounds.maxLat - fieldBounds.minLat);

        // Create custom marker element
        const el = document.createElement("div");
        el.className = "crop-zone-marker";
        el.style.cssText = `
          width: 36px; height: 36px; border-radius: 50%;
          background: ${zone.color}; border: 3px solid white;
          display: flex; align-items: center; justify-content: center;
          font-size: 16px; cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
          transition: transform 0.2s;
        `;
        el.textContent = zone.emoji;
        el.title = `${zone.crop} — ${zone.area_pct}% of field`;
        el.addEventListener("mouseenter", () => { el.style.transform = "scale(1.3)"; });
        el.addEventListener("mouseleave", () => { el.style.transform = "scale(1)"; });
        el.addEventListener("click", () => setSelectedZone(zone));

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(map);
        markersRef.current.push(marker);

        // Add small dotted circles around the marker to show spacing pattern
        const dotCount = Math.min(6, Math.max(3, Math.floor(zone.area_pct / 8)));
        const radius = 0.0003; // ~30m
        for (let i = 0; i < dotCount; i++) {
          const angle = (i / dotCount) * Math.PI * 2;
          const dotLng = lng + Math.cos(angle) * radius;
          const dotLat = lat + Math.sin(angle) * radius * 0.7;

          const dot = document.createElement("div");
          dot.style.cssText = `
            width: 8px; height: 8px; border-radius: 50%;
            background: ${zone.color}; opacity: 0.6;
            border: 1.5px dotted white;
          `;

          const dotMarker = new mapboxgl.Marker({ element: dot })
            .setLngLat([dotLng, dotLat])
            .addTo(map);
          markersRef.current.push(dotMarker);
        }
      });

      // Fit to bounds
      const bounds = new mapboxgl.LngLatBounds();
      field.coordinates[0].forEach(c => bounds.extend(c as [number, number]));
      map.fitBounds(bounds, { padding: 40 });
    });

    return () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [mapToken, plan, field, fieldCenter, fieldBounds]);

  // Pie chart data for zone allocation
  const zoneChartData = plan?.zones.map(z => ({
    name: z.crop,
    value: z.area_pct,
    color: z.color,
    emoji: z.emoji,
    reason: z.reason,
  })) || [];

  if (!plan && !loading) {
    return (
      <div className="animate-fade-in" style={{ animationDelay: "450ms" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Sprout className="w-4 h-4" /> AI Crop Planning
          </h3>
        </div>
        <div className="p-6 rounded-2xl border border-border bg-accent/15 text-center space-y-3">
          <div className="text-3xl">🌱</div>
          <p className="text-sm text-muted-foreground">
            Get AI-powered crop placement recommendations based on your field's NDVI, soil, and climate data
          </p>
          <button
            onClick={fetchPlan}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Zap className="w-4 h-4" /> Generate Crop Plan
          </button>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="animate-fade-in" style={{ animationDelay: "450ms" }}>
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2 mb-4">
          <Sprout className="w-4 h-4" /> AI Crop Planning
        </h3>
        <div className="p-8 rounded-2xl border border-border bg-accent/15 flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Analyzing field data & generating optimal crop layout...</p>
          <p className="text-[10px] text-muted-foreground">This uses NDVI, soil composition, weather & climate data</p>
        </div>
      </div>
    );
  }

  if (!plan) return null;

  return (
    <div className="animate-fade-in space-y-6" style={{ animationDelay: "450ms" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <Sprout className="w-4 h-4" /> AI Crop Planning
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
            Score: {plan.overall_score}/10
          </span>
          <button
            onClick={fetchPlan}
            className="p-1.5 rounded-lg hover:bg-accent/30 transition-colors text-muted-foreground hover:text-foreground"
            title="Regenerate plan"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="p-3 rounded-xl border border-border bg-accent/15 text-xs text-muted-foreground leading-relaxed">
        {plan.summary}
      </div>

      {/* Key Metrics */}
      <div className={`grid ${isMobile ? 'grid-cols-3 gap-2' : 'grid-cols-3 gap-3'}`}>
        <div className="p-3 rounded-xl border border-border bg-accent/15 text-center">
          <Droplets className="w-4 h-4 mx-auto mb-1 text-blue-400" />
          <div className="text-lg font-semibold text-foreground">{plan.water_saving_pct}%</div>
          <div className="text-[10px] text-muted-foreground">Water Saved</div>
        </div>
        <div className="p-3 rounded-xl border border-border bg-accent/15 text-center">
          <TrendingUp className="w-4 h-4 mx-auto mb-1 text-green-400" />
          <div className="text-lg font-semibold text-foreground">+{plan.expected_revenue_increase_pct}%</div>
          <div className="text-[10px] text-muted-foreground">Revenue Boost</div>
        </div>
        <div className="p-3 rounded-xl border border-border bg-accent/15 text-center">
          <Layers className="w-4 h-4 mx-auto mb-1 text-amber-400" />
          <div className="text-lg font-semibold text-foreground">{plan.zones.length}</div>
          <div className="text-[10px] text-muted-foreground">Crop Zones</div>
        </div>
      </div>

      {/* Static Map + Zone Allocation */}
      <div className={`grid ${isMobile ? 'grid-cols-1 gap-4' : 'grid-cols-2 gap-6'}`}>
        {/* Static Map */}
        <div className="flex flex-col">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Field Zone Map</h4>
          <div
            ref={mapContainer}
            className="rounded-2xl border border-border overflow-hidden"
            style={{ height: isMobile ? 220 : 280, background: "hsl(150, 18%, 12%)" }}
          />
          <div className="flex flex-wrap gap-2 mt-2">
            {plan.zones.map((z) => (
              <UITooltip key={z.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setSelectedZone(z)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] border transition-all ${
                      selectedZone?.id === z.id
                        ? "border-primary bg-primary/20 text-foreground"
                        : "border-border bg-accent/10 text-muted-foreground hover:bg-accent/20"
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: z.color }} />
                    {z.emoji} {z.crop}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px]">
                  <p className="text-xs font-semibold">{z.name}</p>
                  <p className="text-[10px] text-muted-foreground">{z.reason}</p>
                  <p className="text-[10px] mt-1">Spacing: {z.spacing_m}m · Water: {z.water_needs} · {z.season}</p>
                </TooltipContent>
              </UITooltip>
            ))}
          </div>
        </div>

        {/* Zone Allocation Pie */}
        <div className="flex flex-col">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Zone Allocation</h4>
          <div className="rounded-2xl border border-border/40 p-4 flex flex-col items-center justify-center" style={{ height: isMobile ? 220 : 280, background: "hsla(150, 18%, 14%, 0.6)" }}>
            <ResponsiveContainer width="100%" height={isMobile ? 140 : 180}>
              <PieChart>
                <Pie data={zoneChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={isMobile ? 30 : 40} outerRadius={isMobile ? 55 : 70} paddingAngle={2} strokeWidth={0}>
                  {zoneChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltipContent />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-2">
              {zoneChartData.map((z, i) => (
                <div key={i} className="flex items-center gap-1 text-[10px]">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: z.color }} />
                  <span className="text-muted-foreground">{z.emoji} {z.name}</span>
                  <span className="text-foreground font-semibold">{z.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Selected Zone Detail */}
      {selectedZone && (
        <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 animate-fade-in space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">{selectedZone.emoji} {selectedZone.name}</h4>
            <button onClick={() => setSelectedZone(null)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
          </div>
          <p className="text-xs text-muted-foreground">{selectedZone.reason}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">
            <div className="p-2 rounded-lg bg-accent/20"><span className="text-muted-foreground">Area:</span> <span className="text-foreground font-medium">{selectedZone.area_pct}%</span></div>
            <div className="p-2 rounded-lg bg-accent/20"><span className="text-muted-foreground">Spacing:</span> <span className="text-foreground font-medium">{selectedZone.spacing_m}m</span></div>
            <div className="p-2 rounded-lg bg-accent/20"><span className="text-muted-foreground">Water:</span> <span className="text-foreground font-medium capitalize">{selectedZone.water_needs}</span></div>
            <div className="p-2 rounded-lg bg-accent/20"><span className="text-muted-foreground">Yield:</span> <span className="text-foreground font-medium">{selectedZone.yield_estimate}</span></div>
          </div>
          <div className="text-[10px] text-muted-foreground">Season: {selectedZone.season}</div>
        </div>
      )}

      {/* Intercropping Suggestions */}
      {plan.intercropping.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <TreePine className="w-3.5 h-3.5" /> Intercropping Pairs
          </h4>
          <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
            {plan.intercropping.map((pair, i) => (
              <div key={i} className="p-3 rounded-xl border border-border bg-accent/15 space-y-1.5">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <span>{pair.emoji}</span>
                  <span>{pair.primary}</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  <span>{pair.secondary}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">{pair.benefit}</p>
                <p className="text-[10px] text-primary/80 italic">{pair.spacing}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rotation Plan */}
      {plan.rotation_plan.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <RotateCw className="w-3.5 h-3.5" /> Crop Rotation Plan
          </h4>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {plan.rotation_plan.map((step, i) => (
              <div key={i} className="flex-shrink-0 p-3 rounded-xl border border-border bg-accent/15 min-w-[140px] space-y-1">
                <div className="text-xs font-semibold text-foreground">{step.season}</div>
                <div className="text-[10px] text-muted-foreground">{step.months}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {step.crops.map((crop, j) => (
                    <span key={j} className="px-1.5 py-0.5 rounded bg-primary/15 text-[10px] text-foreground">{crop}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tips */}
      {plan.tips.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5" /> Expert Tips
          </h4>
          <div className="space-y-1.5">
            {plan.tips.map((tip, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="text-primary mt-0.5">•</span>
                <span>{tip}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CropPlanningSection;
