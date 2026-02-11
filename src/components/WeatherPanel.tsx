import { Cloud, Droplets, Wind, Thermometer } from "lucide-react";

interface WeatherPanelProps {
  locationName?: string;
  weatherData?: {
    temp: number;
    description: string;
    humidity: number;
    windSpeed: number;
    feelsLike: number;
  } | null;
  loading?: boolean;
}

const WeatherPanel = ({ locationName, weatherData, loading }: WeatherPanelProps) => {
  return (
    <div className="w-[300px] h-full bg-card/95 backdrop-blur-md border-l border-border flex flex-col animate-slide-in-right">
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold text-primary">Weather</h2>
        {locationName && (
          <p className="text-xs text-muted-foreground mt-1 truncate">📍 {locationName}</p>
        )}
      </div>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-sm text-muted-foreground animate-pulse">Loading weather…</div>
          </div>
        ) : weatherData ? (
          <>
            <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-accent/30">
              <div className="text-4xl font-light text-foreground">
                {weatherData.temp > 0 ? "+" : ""}{weatherData.temp}°
              </div>
              <div>
                <div className="text-sm text-foreground capitalize">{weatherData.description}</div>
                <div className="text-xs text-muted-foreground">Feels like {weatherData.feelsLike}°</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg border border-border bg-accent/20">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Droplets className="w-3.5 h-3.5" />
                  <span className="text-xs">Humidity</span>
                </div>
                <div className="text-sm font-medium text-foreground">{weatherData.humidity}%</div>
              </div>
              <div className="p-3 rounded-lg border border-border bg-accent/20">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Wind className="w-3.5 h-3.5" />
                  <span className="text-xs">Wind</span>
                </div>
                <div className="text-sm font-medium text-foreground">{weatherData.windSpeed} km/h</div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Cloud className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Search a location to see weather data</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default WeatherPanel;
