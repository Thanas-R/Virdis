# Virdis

![React](https://img.shields.io/badge/React-18-000000?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-Build-646CFF?style=flat-square&logo=vite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-Framework-000000?style=flat-square&logo=tailwindcss)
![Mapbox](https://img.shields.io/badge/Mapbox-GL_JS-000000?style=flat-square&logo=mapbox)
![Supabase](https://img.shields.io/badge/Supabase-Backend-3ECF8E?style=flat-square&logo=supabase&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini-2.5_Flash-1A73E8?style=flat-square&logo=google)
![EarthEngine](https://img.shields.io/badge/Google_Earth_Engine-Sentinel--2-4285F4?style=flat-square&logo=googleearth)
![License](https://img.shields.io/badge/License-MIT-000000?style=flat-square)

Virdis is a precision agriculture field monitoring platform that combines satellite imagery, geospatial mapping, weather analytics, and AI-driven agronomic insights into a single web dashboard.

The platform allows farmers, agronomists, and agricultural analysts to map crop fields, monitor vegetation health using NDVI, and receive AI-generated recommendations for irrigation, crop stress, and field management.


## Preview

> ### Live Site: https://virdis.vercel.app

<br>
> <img src="src/assets/preview-img.png" alt="Virdis platform preview" width="100%">


## What Virdis Does

Virdis enables users to:

- Map and manage crop fields on an interactive satellite map  
- Monitor crop health using NDVI vegetation analysis  
- Automatically detect fields from satellite imagery  
- View real-time weather data for each field  
- Receive AI-powered agronomy recommendations  
- Track vegetation health and field analytics over time  

The goal is to help identify crop stress early and support better irrigation and yield decisions.


## Key Features

### Interactive Satellite Mapping

- Satellite basemap powered by Mapbox  
- Polygon drawing for custom field boundaries  
- Field editing and deletion  
- Map fly-to animations and field highlighting  
- Layer visibility toggles  

### NDVI Crop Health Monitoring

Sentinel-2 imagery is processed through Google Earth Engine to calculate NDVI.
[NDVI = (NIR - Red) / (NIR + Red)]


| NDVI Value | Vegetation Health |
|-------------|------------------|
| Red | Stressed vegetation |
| Yellow | Moderate vegetation |
| Green | Healthy vegetation |

NDVI data is displayed as a semi-transparent raster layer above satellite imagery.

### Automatic Field Detection

Users can detect crop fields by clicking on the map.

Process:

1. User selects a location  
2. Sentinel-2 imagery is queried  
3. NDVI is calculated  
4. Region-growing segmentation detects vegetation boundaries  
5. Field polygon and statistics are returned  

Returned data includes field area, vegetation health score, and NDVI statistics.

### AI Agronomic Insights

AI analyzes vegetation metrics and field data to generate:

- Crop health assessments  
- Irrigation recommendations  
- Pest and disease risk indicators  
- Field scouting suggestions  

AI results are cached to reduce API usage.

### Weather Monitoring

Per-field weather data including:

- Temperature  
- Rainfall  
- Humidity  
- Wind speed  

Weather data is powered by Open-Meteo.


## Tech Stack

| Layer | Technology | Purpose |
|------|-------------|---------|
| Frontend | React 18 + TypeScript | UI framework |
| Build Tool | Vite | Development and bundling |
| Styling | Tailwind CSS + shadcn/ui | Interface design |
| Mapping | Mapbox GL JS | Satellite map rendering |
| Charts | Recharts | Data visualization |
| Routing | React Router | SPA navigation |
| State | TanStack React Query | Server state management |
| Backend | Supabase Edge Functions | APIs and backend logic |
| Database | Supabase PostgreSQL | Data storage |
| Satellite Data | Google Earth Engine | Sentinel-2 NDVI processing |
| AI | Gemini 2.5 Flash | Agronomic analysis |
| Weather | Open-Meteo API | Weather data |


## System Architecture


User / Browser
│
▼
Frontend
React + Mapbox GL JS + Tailwind
│
▼
Edge Functions (Supabase)
│
┌────┼───────────────┬───────────────┐
▼ ▼ ▼ ▼
NDVI Tiles Field Detection AI Analysis Mapbox Token
(GEE) (GEE) (Gemini) (Mapbox API)
│
▼
Google Earth Engine
Sentinel-2 Satellite Data

## Installation


git clone https://github.com/your-org/virdis

cd virdis
npm install
npm run dev



## Environment Variables


MAPBOX_TOKEN=
GEE_SERVICE_ACCOUNT_KEY=
OPEN_METEO_API_URL=
SUPABASE_URL=
SUPABASE_ANON_KEY=


## License

MIT License
