# Virdis — Satellite-Powered Agricultural & Land Analytics Platform

Virdis is a web-based geospatial analytics platform that combines satellite imagery, climate data, soil science, and AI-powered crop planning to provide actionable insights for any region on Earth.

## 🌍 Overview

Virdis lets users draw polygonal regions on an interactive map and instantly receive:
- **Satellite vegetation analysis** (NDVI via Sentinel-2)
- **Real-time & historical weather** (temperature, precipitation, humidity, wind)
- **Soil health profiling** (pH, texture, organic carbon, nitrogen, water retention)
- **Air quality monitoring** (PM2.5, PM10, AQI)
- **Land use classification** (ESA WorldCover via Google Earth Engine)
- **Land suitability scoring** (soil, water, climate, topography, drainage, nutrients)
- **AI-powered crop planning** with visual field layouts, intercropping strategies, and rotation plans
- **Urban region detection** with sustainability-focused analytics

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│                 React Frontend                   │
│  (Vite + TypeScript + Tailwind + shadcn/ui)     │
├─────────────────────────────────────────────────┤
│              Supabase Edge Functions             │
│  (Deno runtime, serverless)                     │
├──────────┬──────────┬──────────┬────────────────┤
│ Mapbox   │ Google   │ Open-    │ Lovable AI     │
│ GL JS    │ Earth    │ Meteo    │ Gateway        │
│          │ Engine   │          │ (Gemini 2.5)   │
└──────────┴──────────┴──────────┴────────────────┘
```

### Frontend Stack
| Technology | Purpose |
|---|---|
| **React 18** | UI framework |
| **Vite 5** | Build tool & dev server |
| **TypeScript 5** | Type safety |
| **Tailwind CSS 3** | Utility-first styling with semantic design tokens |
| **shadcn/ui** | Accessible UI component library (Radix primitives) |
| **Mapbox GL JS** | Interactive 3D map rendering |
| **Recharts** | Data visualization (charts, radar, pie) |
| **Framer Motion** | Animations (via Tailwind animate) |
| **React Router** | Client-side routing |
| **TanStack Query** | Server state management |
| **jsPDF** | Client-side PDF export of crop plans |

### Backend (Supabase Edge Functions)
All backend logic runs as serverless Deno edge functions:

| Function | Purpose |
|---|---|
| `get-mapbox-token` | Securely serves the Mapbox access token |
| `analyze-field` | AI-powered field analysis using satellite + weather data |
| `gee-analytics` | Google Earth Engine: land use classification, vegetation indices, suitability scoring |
| `gee-ndvi-tiles` | GEE: generates NDVI tile URLs for map overlay |
| `ndvi-timeseries` | GEE: 90-day NDVI time-series with growth stage detection |
| `soil-data` | Fetches soil properties from SoilGrids API (ISRIC) |
| `crop-planning` | AI crop planning via Lovable AI Gateway (Gemini 2.5 Pro) |
| `keepalive` | Health check endpoint |

## 📡 Data Sources & APIs

### Satellite & Earth Observation
| Source | Data | Usage |
|---|---|---|
| **Google Earth Engine** | Sentinel-2 imagery, ESA WorldCover, SRTM elevation, CHIRPS rainfall | NDVI analysis, land use classification, suitability scoring |
| **Sentinel-2 (via GEE)** | 10m resolution multispectral imagery | Vegetation health (NDVI), canopy cover, biomass estimation |
| **ESA WorldCover (via GEE)** | 10m land cover classification | Cropland, tree cover, grassland, built-up, water detection |
| **SRTM (via GEE)** | 30m elevation model | Elevation, slope, topography scoring |
| **CHIRPS (via GEE)** | Rainfall estimates | Annual precipitation for suitability analysis |

### Weather & Climate
| Source | Data | Usage |
|---|---|---|
| **Open-Meteo Forecast API** | Current temperature, humidity, wind, weather code, feels-like | Real-time conditions display |
| **Open-Meteo Archive API** | Historical daily precipitation, temperature range, evapotranspiration, soil moisture | Climate analytics charts |
| **Open-Meteo Air Quality API** | PM2.5, PM10, European AQI, US AQI | Air quality monitoring |

### Soil Science
| Source | Data | Usage |
|---|---|---|
| **ISRIC SoilGrids** | pH, organic carbon, nitrogen, bulk density, CEC, texture (sand/silt/clay), water retention | Soil health profiling, crop suitability |

### Mapping
| Source | Data | Usage |
|---|---|---|
| **Mapbox GL JS** | Vector/satellite tiles, geocoding, reverse geocoding | Interactive map, location search, region visualization |

### AI
| Source | Model | Usage |
|---|---|---|
| **Lovable AI Gateway** | Google Gemini 2.5 Pro | Crop planning, field analysis, region-specific recommendations |

## 🌾 Crop Planning System

The crop planning system uses a dual-approach:

### 1. Local Agronomy Model (Instant)
A client-side scoring engine with 50+ crop profiles that:
- Detects the climate region from location text (tropical, Mediterranean, temperate, arid, etc.)
- Scores each crop against field signals (temperature, rainfall, soil pH, NDVI, water index)
- Weights area allocation proportionally to suitability scores (best crop gets 40-55%)
- Ensures the user's current crop is included
- Always includes at least one native tree species
- Generates intercropping pairs and 3-season rotation plans

### 2. AI Planner (Background)
Calls Gemini 2.5 Pro via the `crop-planning` edge function with full field context (NDVI, soil, weather, suitability data). The AI response replaces the local model when available.

### Visualization
- **Satellite minimap** with Mapbox showing the field boundary
- **Static dot grid** fills the entire field polygon with crop markers
- **Variable dot sizes** — trees get 16px dots, small grains get 7px
- **Tree distribution** — 1 tree per ~60 crop plants, spread uniformly
- **Non-tree clustering** — crops cluster by zone center with 25% random mixing
- **Color-coded legend** with crop filtering

### Edge Case Detection
The system detects and handles:
- **Water bodies** (ocean, lakes) — low NDVI + high water access
- **Extreme deserts** (Sahara, Atacama) — <50mm annual rainfall
- **Polar regions** (Arctic/Antarctic) — latitude >66° or keyword detection
- **Extreme altitude** — >5000m elevation
- **Urban regions** — >30% built-up land use (switches to urban analytics)

## 🗺️ Map Features

- **Dark & Satellite** base map styles
- **Region drawing** with pen tool — click to place vertices, Enter to save
- **Boundary editing** for existing regions
- **NDVI overlay** — satellite vegetation layer via GEE tile service
- **Field visibility toggle** — show/hide all regions
- **Compass reset** & **user geolocation**
- **Auto-detect region type** (rural vs urban) using GEE land use data
- **Auto-cycle colors** — new regions get distinct colors not already in use
- **Fly-to animation** when selecting regions from the list

## 📊 Analytics Dashboard

The analytics view provides per-region analysis:

### Climate Analytics
- Accumulated precipitation (area chart with evapotranspiration overlay)
- Daily precipitation (bar chart)
- Temperature range (min/max line chart)
- Soil moisture at two depths (0-7cm surface, 7-28cm deep)

### Satellite Analytics
- NDVI vegetation trend (90-day time series)
- Growth rate, canopy cover, biomass estimation
- Land use donut chart (ESA WorldCover)
- Land suitability radar chart (6 dimensions)

### Air & Water Quality
- EU AQI, PM2.5 concentrations
- Annual rainfall, water access score

### Field Comparison
- Side-by-side comparison of two regions with synchronized charts

## 📱 Mobile Layout

Full responsive mobile experience:
- **Bottom navigation** with Map / Fields / Analytics tabs
- **Swipe gestures** between tabs
- **Full-screen map** always rendered behind overlays
- **Slide-up sheets** for field list and detail views
- **Compact chart sizing** for mobile viewports
- **Touch-optimized** draw prompts and controls

## 🔐 Secrets & Configuration

| Secret | Purpose |
|---|---|
| `MAPBOX_TOKEN` | Mapbox GL JS map rendering & geocoding |
| `GEE_SERVICE_ACCOUNT_JSON` | Google Earth Engine service account credentials |
| `GEE_PROJECT_ID` | GEE cloud project identifier |
| `LOVABLE_API_KEY` | Lovable AI Gateway authentication (auto-provisioned) |

## 📁 Project Structure

```
src/
├── components/
│   ├── MapView.tsx              # Main map with drawing, NDVI overlay, field rendering
│   ├── MapToolbar.tsx           # Left toolbar (zoom, draw, layers, NDVI, compass)
│   ├── SidePanel.tsx            # Right sidebar with field list & detail view
│   ├── FieldDetailView.tsx      # Per-field detail: weather, NDVI, soil, AI analysis
│   ├── FieldCard.tsx            # Compact field card for lists
│   ├── FieldEditDialog.tsx      # Edit field name, crop, color, group
│   ├── FieldComparisonColumn.tsx# Side-by-side field comparison charts
│   ├── WeatherView.tsx          # Full analytics dashboard
│   ├── CropPlanningSection.tsx  # AI crop planning with map visualization
│   ├── NewFieldDialog.tsx       # Create new field from drawn polygon
│   ├── SearchBar.tsx            # Map search with geocoding
│   ├── LocationAutocomplete.tsx # Location input with Mapbox suggestions
│   ├── NdviLegend.tsx           # NDVI color scale legend
│   ├── NdviScrubber.tsx         # NDVI date navigation
│   ├── MobileBottomNav.tsx      # Mobile tab bar
│   ├── MobileFieldSheet.tsx     # Mobile field list overlay
│   ├── MobileDrawPrompt.tsx     # Mobile draw mode controls
│   └── ui/                     # shadcn/ui components
├── data/
│   ├── fields.ts               # Field type definition & helpers
│   └── crops.ts                # Crop options for field creation
├── hooks/
│   ├── use-mobile.tsx           # Responsive breakpoint hook (768px)
│   ├── use-swipe.ts             # Touch swipe gesture detection
│   └── use-toast.ts             # Toast notification hook
├── pages/
│   ├── Index.tsx                # Main page with desktop/mobile layouts
│   └── NotFound.tsx             # 404 page
└── integrations/
    └── supabase/
        └── client.ts            # Supabase client configuration

supabase/functions/
├── analyze-field/index.ts       # AI field analysis
├── crop-planning/index.ts       # AI crop planning (Gemini 2.5 Pro)
├── gee-analytics/index.ts       # Google Earth Engine analytics
├── gee-ndvi-tiles/index.ts      # GEE NDVI tile generation
├── get-mapbox-token/index.ts    # Mapbox token provider
├── keepalive/index.ts           # Health check
├── ndvi-timeseries/index.ts     # NDVI time-series data
└── soil-data/index.ts           # SoilGrids API integration
```

## 🚀 Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Configure secrets in Lovable Cloud:
   - `MAPBOX_TOKEN` — from [Mapbox](https://account.mapbox.com/)
   - `GEE_SERVICE_ACCOUNT_JSON` — from [Google Cloud Console](https://console.cloud.google.com/)
   - `GEE_PROJECT_ID` — your GEE-enabled project ID
4. Run locally: `npm run dev`

## 📄 License

This project is built with [Lovable](https://lovable.dev).
