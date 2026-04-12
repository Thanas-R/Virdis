import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Field, haToAcres } from "@/data/fields";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import mapboxgl from "mapbox-gl";
import {
  Loader2, Sprout, TreePine, Droplets, TrendingUp, RotateCw,
  Lightbulb, Layers, ArrowRight, Zap, CalendarDays, ChevronDown,
  Download,
} from "lucide-react";
import {
  Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import jsPDF from "jspdf";

interface CropZone {
  id: string;
  name: string;
  crop: string;
  emoji?: string;
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
  emoji?: string;
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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Parse "Jun-Oct" style month ranges into indices
function parseMonthRange(monthsStr: string): number[] {
  const parts = monthsStr.split("-").map(s => s.trim().substring(0, 3));
  if (parts.length !== 2) return [];
  const startIdx = MONTHS.findIndex(m => m.toLowerCase() === parts[0].toLowerCase());
  const endIdx = MONTHS.findIndex(m => m.toLowerCase() === parts[1].toLowerCase());
  if (startIdx === -1 || endIdx === -1) return [];
  const indices: number[] = [];
  if (startIdx <= endIdx) {
    for (let i = startIdx; i <= endIdx; i++) indices.push(i);
  } else {
    for (let i = startIdx; i < 12; i++) indices.push(i);
    for (let i = 0; i <= endIdx; i++) indices.push(i);
  }
  return indices;
}

const SEASON_COLORS: Record<string, string> = {
  "Kharif": "#4CAF50",
  "Rabi": "#FF9800",
  "Zaid": "#2196F3",
};

function getSeasonColor(season: string): string {
  for (const [key, color] of Object.entries(SEASON_COLORS)) {
    if (season.toLowerCase().includes(key.toLowerCase())) return color;
  }
  const hash = season.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const hue = hash % 360;
  return `hsl(${hue}, 55%, 50%)`;
}

const CustomTooltipContent = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg px-3 py-2 shadow-xl border border-border/50" style={{ background: "hsl(150, 18%, 12%)" }}>
      <div className="text-xs font-semibold text-foreground">{d.name || d.crop}</div>
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
  const [showCalendar, setShowCalendar] = useState(false);
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const popupsRef = useRef<mapboxgl.Popup[]>([]);

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

  // Load cached plan
  useEffect(() => {
    const cache = getPlanCache();
    const cached = cache[field.id];
    if (cached && Date.now() - cached.timestamp < 3600000) {
      setPlan(cached.data);
    } else {
      setPlan(null);
    }
  }, [field.id]);

  // Initialize map — always show field, locked to bounds
  useEffect(() => {
    if (!mapContainer.current || !mapToken) return;
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    popupsRef.current.forEach(p => p.remove());
    popupsRef.current = [];

    mapboxgl.accessToken = mapToken;

    const bounds = new mapboxgl.LngLatBounds();
    field.coordinates[0].forEach(c => bounds.extend(c as [number, number]));

    // Add padding to bounds
    const padLng = (fieldBounds.maxLng - fieldBounds.minLng) * 0.15;
    const padLat = (fieldBounds.maxLat - fieldBounds.minLat) * 0.15;
    const maxBounds: [number, number, number, number] = [
      fieldBounds.minLng - padLng,
      fieldBounds.minLat - padLat,
      fieldBounds.maxLng + padLng,
      fieldBounds.maxLat + padLat,
    ];

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [fieldCenter.lng, fieldCenter.lat],
      zoom: 15,
      minZoom: 15,
      maxZoom: 20,
      maxBounds,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.scrollZoom.enable();
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    // Lock zoom-out to fitted level after load
    map.once("idle", () => {
      const currentZoom = map.getZoom();
      map.setMinZoom(currentZoom);
    });

    mapRef.current = map;

    map.on("load", () => {
      // Field boundary
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
        paint: { "fill-color": "#ffffff", "fill-opacity": 0.1 },
      });
      map.addLayer({
        id: "plan-field-line",
        type: "line",
        source: "plan-field",
        paint: { "line-color": "#ffffff", "line-width": 2.5, "line-dasharray": [3, 2] },
      });

      map.fitBounds(bounds, { padding: 50 });

      // Add zone markers if plan exists
      if (plan) {
        addZoneMarkers(map, plan);
      }
    });

    return () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      popupsRef.current.forEach(p => p.remove());
      popupsRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [mapToken, field, fieldCenter, fieldBounds]);

  // When plan changes, update markers on existing map
  useEffect(() => {
    if (!mapRef.current || !plan) return;
    const map = mapRef.current;
    if (!map.isStyleLoaded()) {
      map.once("load", () => addZoneMarkers(map, plan));
    } else {
      addZoneMarkers(map, plan);
    }
  }, [plan]);

  const addZoneMarkers = (map: mapboxgl.Map, cropPlan: CropPlan) => {
    // Clear old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    popupsRef.current.forEach(p => p.remove());
    popupsRef.current = [];

    cropPlan.zones.forEach((zone) => {
      const lng = fieldBounds.minLng + zone.position.x * (fieldBounds.maxLng - fieldBounds.minLng);
      const lat = fieldBounds.minLat + zone.position.y * (fieldBounds.maxLat - fieldBounds.minLat);

      // Main marker — colored circle with crop initial
      const el = document.createElement("div");
      el.style.cssText = `
        width: 32px; height: 32px; border-radius: 50%;
        background: ${zone.color}; border: 2.5px solid white;
        display: flex; align-items: center; justify-content: center;
        font-size: 12px; font-weight: 700; color: white;
        cursor: pointer; box-shadow: 0 2px 10px rgba(0,0,0,0.5);
        transition: transform 0.2s; text-shadow: 0 1px 2px rgba(0,0,0,0.5);
      `;
      el.textContent = zone.crop.charAt(0).toUpperCase();

      // Popup with zone details
      const popupHtml = `
        <div style="padding:4px 0;max-width:200px;">
          <div style="font-weight:700;font-size:13px;margin-bottom:4px;">${zone.crop}</div>
          <div style="font-size:11px;color:#aaa;margin-bottom:4px;">${zone.name}</div>
          <div style="font-size:11px;line-height:1.5;">
            <span style="color:#888;">Area:</span> ${zone.area_pct}%<br/>
            <span style="color:#888;">Spacing:</span> ${zone.spacing_m}m<br/>
            <span style="color:#888;">Water:</span> ${zone.water_needs}<br/>
            <span style="color:#888;">Season:</span> ${zone.season}<br/>
            <span style="color:#888;">Yield:</span> ${zone.yield_estimate}
          </div>
          <div style="font-size:10px;color:#999;margin-top:6px;border-top:1px solid #333;padding-top:4px;">
            ${zone.reason}
          </div>
        </div>
      `;

      const popup = new mapboxgl.Popup({
        offset: 20,
        closeButton: true,
        className: "crop-zone-popup",
        maxWidth: "220px",
      }).setHTML(popupHtml);

      el.addEventListener("mouseenter", () => { el.style.transform = "scale(1.3)"; });
      el.addEventListener("mouseleave", () => { el.style.transform = "scale(1)"; });
      el.addEventListener("click", () => setSelectedZone(zone));

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(map);
      markersRef.current.push(marker);
      popupsRef.current.push(popup);

      // Surrounding dot pattern for spacing visualization
      const dotCount = Math.min(8, Math.max(4, Math.floor(zone.area_pct / 6)));
      const radius = 0.0004;
      for (let i = 0; i < dotCount; i++) {
        const angle = (i / dotCount) * Math.PI * 2;
        const dotLng = lng + Math.cos(angle) * radius;
        const dotLat = lat + Math.sin(angle) * radius * 0.7;

        const dot = document.createElement("div");
        dot.style.cssText = `
          width: 10px; height: 10px; border-radius: 50%;
          background: ${zone.color}; opacity: 0.7;
          border: 2px dotted rgba(255,255,255,0.8);
          cursor: pointer;
        `;
        dot.title = `${zone.crop} — ${zone.spacing_m}m spacing`;

        const dotMarker = new mapboxgl.Marker({ element: dot })
          .setLngLat([dotLng, dotLat])
          .addTo(map);
        markersRef.current.push(dotMarker);
      }
    });
  };

  // Pie chart data
  const zoneChartData = plan?.zones.map(z => ({
    name: z.crop,
    value: z.area_pct,
    color: z.color,
    reason: z.reason,
  })) || [];

  // Crop Calendar data
  const calendarRows = useMemo(() => {
    if (!plan?.rotation_plan) return [];
    return plan.rotation_plan.map(step => ({
      season: step.season,
      months: step.months,
      crops: step.crops,
      activeMonths: parseMonthRange(step.months),
      color: getSeasonColor(step.season),
    }));
  }, [plan]);

  // Always show map section — generate button overlaid if no plan
  return (
    <div className="animate-fade-in space-y-6" style={{ animationDelay: "450ms" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <Sprout className="w-4 h-4" /> AI Crop Planning
        </h3>
        <div className="flex items-center gap-2">
          {plan && (
            <>
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
                Score: {plan.overall_score}/10
              </span>
              <button
                onClick={fetchPlan}
                disabled={loading}
                className="p-1.5 rounded-lg hover:bg-accent/30 transition-colors text-muted-foreground hover:text-foreground"
                title="Regenerate plan"
              >
                <RotateCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Fixed Map — always visible */}
      <div className="relative">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Field Region Map</h4>
        <div
          ref={mapContainer}
          className="rounded-2xl border border-border overflow-hidden"
          style={{ height: isMobile ? 260 : 340, background: "hsl(150, 18%, 12%)" }}
        />

        {/* Generate overlay when no plan */}
        {!plan && !loading && (
          <div className="absolute inset-0 mt-6 rounded-2xl flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm">
            <Sprout className="w-8 h-8 text-primary mb-3" />
            <p className="text-sm text-foreground/80 mb-3 text-center px-4">
              Analyze field data to generate AI crop placement recommendations
            </p>
            <button
              onClick={fetchPlan}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Zap className="w-4 h-4" /> Generate Crop Plan
            </button>
            {error && <p className="text-xs text-destructive mt-2">{error}</p>}
          </div>
        )}

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 mt-6 rounded-2xl flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm">
            <Loader2 className="w-6 h-6 animate-spin text-primary mb-2" />
            <p className="text-sm text-foreground/80">Analyzing field data...</p>
            <p className="text-[10px] text-muted-foreground mt-1">Using NDVI, soil, weather & climate data</p>
          </div>
        )}

        {/* Zone legend below map */}
        {plan && (
          <div className="flex flex-wrap gap-2 mt-3">
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
                    {z.crop}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px]">
                  <p className="text-xs font-semibold">{z.name}</p>
                  <p className="text-[10px] text-muted-foreground">{z.reason}</p>
                  <p className="text-[10px] mt-1">Spacing: {z.spacing_m}m · Water: {z.water_needs} · {z.season}</p>
                  <p className="text-[10px] mt-0.5">Yield: {z.yield_estimate}</p>
                </TooltipContent>
              </UITooltip>
            ))}
          </div>
        )}
      </div>

      {/* Plan details — only show when plan exists */}
      {plan && (
        <>
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

          {/* Zone Allocation Pie */}
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Zone Allocation</h4>
            <div className="rounded-2xl border border-border/40 p-4 flex flex-col items-center justify-center" style={{ height: isMobile ? 220 : 260, background: "hsla(150, 18%, 14%, 0.6)" }}>
              <ResponsiveContainer width="100%" height={isMobile ? 140 : 170}>
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
                    <span className="text-muted-foreground">{z.name}</span>
                    <span className="text-foreground font-semibold">{z.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Selected Zone Detail */}
          {selectedZone && (
            <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 animate-fade-in space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground">{selectedZone.name}</h4>
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

          {/* Crop Rotation Plan */}
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

          {/* Crop Calendar View */}
          <div>
            <button
              onClick={() => setShowCalendar(!showCalendar)}
              className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 hover:text-foreground transition-colors w-full"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              Crop Calendar
              <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform ${showCalendar ? "rotate-180" : ""}`} />
            </button>
            {showCalendar && calendarRows.length > 0 && (
              <div className="rounded-2xl border border-border overflow-hidden" style={{ background: "hsla(150, 18%, 14%, 0.6)" }}>
                {/* Month header */}
                <div className="grid grid-cols-[100px_repeat(12,1fr)] text-[10px] border-b border-border/50">
                  <div className="p-2 text-muted-foreground font-medium">Season</div>
                  {MONTHS.map(m => (
                    <div key={m} className="p-2 text-center text-muted-foreground">{m}</div>
                  ))}
                </div>
                {/* Rows */}
                {calendarRows.map((row, i) => (
                  <div key={i} className="grid grid-cols-[100px_repeat(12,1fr)] text-[10px] border-b border-border/30 last:border-b-0">
                    <div className="p-2 flex flex-col justify-center">
                      <span className="font-semibold text-foreground">{row.season}</span>
                      <span className="text-muted-foreground">{row.crops.join(", ")}</span>
                    </div>
                    {MONTHS.map((_, mi) => {
                      const active = row.activeMonths.includes(mi);
                      return (
                        <UITooltip key={mi}>
                          <TooltipTrigger asChild>
                            <div className="p-1 flex items-center justify-center">
                              <div
                                className="w-full h-6 rounded-sm transition-all"
                                style={{
                                  backgroundColor: active ? row.color : "transparent",
                                  opacity: active ? 0.75 : 0.1,
                                  border: active ? "none" : "1px solid rgba(255,255,255,0.05)",
                                }}
                              />
                            </div>
                          </TooltipTrigger>
                          {active && (
                            <TooltipContent side="top">
                              <p className="text-xs font-semibold">{row.season}: {MONTHS[mi]}</p>
                              <p className="text-[10px] text-muted-foreground">{row.crops.join(", ")}</p>
                            </TooltipContent>
                          )}
                        </UITooltip>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

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
        </>
      )}
    </div>
  );
};

export default CropPlanningSection;
