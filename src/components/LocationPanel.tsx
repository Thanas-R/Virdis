import { MapPin, Navigation } from "lucide-react";

interface LocationPanelProps {
  locationName?: string;
  coordinates?: { lng: number; lat: number };
}

const LocationPanel = ({ locationName, coordinates }: LocationPanelProps) => {
  return (
    <div className="w-[300px] h-full bg-card/95 backdrop-blur-md border-l border-border flex flex-col animate-slide-in-right">
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold text-primary">Location</h2>
      </div>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        {locationName ? (
          <>
            <div className="p-4 rounded-xl border border-border bg-accent/30">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-foreground">Selected Location</span>
              </div>
              <p className="text-sm text-foreground">{locationName}</p>
            </div>

            {coordinates && (
              <div className="p-4 rounded-xl border border-border bg-accent/20">
                <div className="flex items-center gap-2 mb-2">
                  <Navigation className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Coordinates</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground">Lat</span>
                    <div className="text-foreground font-mono">{coordinates.lat.toFixed(5)}</div>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Lng</span>
                    <div className="text-foreground font-mono">{coordinates.lng.toFixed(5)}</div>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MapPin className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Search a location to see details</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LocationPanel;
