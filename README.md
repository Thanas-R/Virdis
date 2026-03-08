# Virdis — Precision Agriculture Field Monitoring Platform

**Virdis** is a modern precision-agriculture platform that allows farmers, agronomists, and agricultural analysts to **map fields, monitor crop health using satellite imagery, analyze vegetation indices (NDVI), and receive AI-powered recommendations** — all from a single interactive dashboard.

The platform combines **satellite remote sensing, geospatial mapping, weather analytics, and AI field analysis** into a unified web application.

---

# What Virdis Does

Virdis enables users to:

• Draw and manage crop fields on an interactive satellite map
• Automatically detect fields from satellite imagery
• Monitor crop health using NDVI vegetation analysis
• View real-time weather data for each field
• Get AI-generated agronomy insights and recommendations
• Track field analytics and historical yield data

This allows farmers and agricultural analysts to **identify crop stress early, optimize irrigation, and improve yield outcomes.**

---

# Key Features

## Interactive Satellite Map

* High-resolution satellite basemap using Mapbox
* Polygon drawing for custom field boundaries
* Field editing and deletion
* Smooth fly-to animations
* Field highlighting and color coding
* Layer visibility toggles

---

## NDVI Vegetation Health Monitoring

Uses **Sentinel-2 satellite imagery via Google Earth Engine**.

NDVI (Normalized Difference Vegetation Index):

```
NDVI = (NIR - Red) / (NIR + Red)
```

Color scale:

| NDVI   | Meaning             |
| ------ | ------------------- |
| Red    | Stressed vegetation |
| Yellow | Moderate vegetation |
| Green  | Healthy vegetation  |

NDVI overlay appears as a semi-transparent raster layer above satellite imagery.

---

## Auto Field Detection

Users can automatically detect a field by **clicking on the map**.

Process:

1. User clicks location
2. Backend queries Sentinel-2 imagery
3. NDVI calculated from satellite bands
4. Region-growing segmentation detects connected vegetation area
5. Boundary converted to GeoJSON polygon

Output includes:

* Field boundary
* Area (hectares)
* Mean NDVI
* NDVI variability
* Vegetation health score

---

## AI Field Analysis

AI generates agronomic insights including:

• Crop health assessment
• Irrigation recommendations
• Pest & disease risk
• Field scouting suggestions
• Vegetation stress indicators

AI results are cached to reduce API usage.

---

## Weather Monitoring

Weather data per field including:

• Temperature
• Wind speed
• Humidity
• Rainfall

Data powered by Open-Meteo API.

---

## Field Management

Users can:

• Create fields
• Edit boundaries
• Assign crops
• Group fields
• Add colors
• Store location metadata

Over **190 crop types** are supported.

---

# Tech Stack

| Layer          | Technology               | Purpose                  |
| -------------- | ------------------------ | ------------------------ |
| Frontend       | React 18 + TypeScript    | UI framework             |
| Build Tool     | Vite 5                   | Fast dev environment     |
| Styling        | Tailwind CSS + shadcn/ui | UI design system         |
| Mapping        | Mapbox GL JS             | Satellite map rendering  |
| Charts         | Recharts                 | Data visualization       |
| Routing        | React Router             | SPA navigation           |
| State          | TanStack React Query     | Server state management  |
| Backend        | Lovable Cloud (Supabase) | Edge functions + DB      |
| Satellite Data | Google Earth Engine      | Sentinel-2 NDVI analysis |
| AI             | Lovable AI Gateway       | Agronomy insights        |
| Weather        | Open-Meteo API           | Weather data             |

---

# System Architecture

```
Frontend (React + Mapbox)
        │
        ▼
Edge Functions (Supabase / Lovable)
        │
 ┌──────┼─────────────┐
 ▼      ▼             ▼
GEE NDVI Tiles   Field Detection   AI Analysis
        │
        ▼
Google Earth Engine
(Sentinel-2 Satellite Data)
```

---

# Core Components

### MapView.tsx

Handles:

* Mapbox map rendering
* Field polygons
* NDVI layer
* Click detection
* Drawing tools

---

### FieldListPanel.tsx

Sidebar for:

* Field management
* Searching
* Filtering
* Sorting

---

### FieldDetailView.tsx

Displays:

* Weather data
* Yield analytics
* AI insights
* Growth stages

---

### DetectedFieldsReview.tsx

Allows users to:

* Review automatically detected fields
* Accept or reject boundaries

---

# Backend Edge Functions

| Function         | Purpose                      |
| ---------------- | ---------------------------- |
| get-mapbox-token | Returns Mapbox token         |
| gee-detect-field | Single-click field detection |
| gee-ndvi-tiles   | Generates NDVI map tiles     |
| detect-fields    | AI vision-based detection    |
| analyze-field    | AI agronomy analysis         |

---

# Google Earth Engine Integration

Authentication uses a **Service Account JSON key**.

Environment variable:

```
GOOGLE_APPLICATION_CREDENTIALS=/secure/path/service-account.json
```

Workflow:

1. Backend authenticates with Earth Engine
2. Sentinel-2 imagery queried
3. NDVI calculated
4. Raster or field polygon returned to frontend

---

# Database Schema

### profiles

| Column     | Type      |
| ---------- | --------- |
| id         | uuid      |
| user_id    | uuid      |
| username   | text      |
| avatar_url | text      |
| created_at | timestamp |

---

### user_saved_fields

| Column            | Type    |
| ----------------- | ------- |
| id                | uuid    |
| user_id           | uuid    |
| field_id          | text    |
| field_name        | text    |
| field_crop        | text    |
| field_area        | numeric |
| field_coordinates | jsonb   |
| field_color       | text    |
| field_group       | text    |

---

# Responsive Design

### Desktop

* Map left
* Field panel right
* Analytics toggle

### Mobile

* Full screen map
* Bottom navigation
* Swipe gestures
* Slide-up panels

---

# Local State

Stored in browser:

```
farm-fields-v7
farm-sel-v7
field-ai-analysis-cache
```

Used for:

* saved fields
* selected field
* cached AI results

---

# Example Data Flow

User clicks map to detect field:

```
User click
   ↓
MapView captures lat/lon
   ↓
Edge Function: gee-detect-field
   ↓
Sentinel-2 query
   ↓
NDVI calculation
   ↓
Region growing segmentation
   ↓
Polygon + stats returned
   ↓
Frontend renders field
```

---

# Design System

Theme: **Dark agricultural UI**

Primary color palette:

```
#006837  Deep vegetation green
#2e7d32  Crop green
#fee08b  Mid vegetation
#d73027  Stressed vegetation
```

UI framework:

* shadcn/ui
* Radix UI primitives
* Tailwind utilities

---

# Installation

```
git clone https://github.com/your-org/virdis
cd virdis
npm install
npm run dev
```

---

# Environment Variables

```
MAPBOX_TOKEN=
GEE_SERVICE_ACCOUNT_KEY=
OPEN_METEO_API_URL=
SUPABASE_URL=
SUPABASE_ANON_KEY=
```

---

# Planned Features

Future roadmap for Virdis:

• Soil moisture index
• Crop yield prediction models
•
