import { useIsMobile } from "@/hooks/use-mobile";

const NDVI_COLORS = [
  { color: "#d73027", label: "Stressed" },
  { color: "#fdae61", label: "Weak" },
  { color: "#fee08b", label: "Moderate" },
  { color: "#a6d96a", label: "Good" },
  { color: "#1a9850", label: "Healthy" },
];

const NdviLegend = () => {
  const isMobile = useIsMobile();
  return (
    <div className={`absolute ${isMobile ? 'bottom-20' : 'bottom-6'} right-4 z-10 bg-card/90 backdrop-blur-sm rounded-lg border border-border px-3 py-2`}>
      <div className="text-[10px] font-medium text-foreground mb-1.5 tracking-wide uppercase">NDVI</div>
      <div
        className="h-2.5 w-44 rounded-full"
        style={{
          background: `linear-gradient(to right, ${NDVI_COLORS.map((c) => c.color).join(", ")})`,
        }}
      />
      <div className="flex justify-between mt-1">
        <span className="text-[9px] text-muted-foreground">Stressed</span>
        <span className="text-[9px] text-muted-foreground">Healthy</span>
      </div>
    </div>
  );
};

export default NdviLegend;
