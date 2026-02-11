interface NdviScrubberProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
}

const NDVI_DATES = [
  "2024-04-15",
  "2024-05-01",
  "2024-05-15",
  "2024-06-01",
  "2024-06-15",
  "2024-07-01",
  "2024-07-15",
  "2024-08-01",
  "2024-08-15",
  "2024-09-01",
  "2024-09-15",
  "2024-10-01",
];

const NdviScrubber = ({ selectedDate, onDateChange }: NdviScrubberProps) => {
  return (
    <div className="absolute bottom-4 left-4 right-[340px] z-10">
      <div className="bg-card/90 backdrop-blur-md rounded-xl border border-border p-3 animate-fade-in">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-foreground">
            NDVI Timeline
          </span>
          <span className="text-xs text-muted-foreground">
            {selectedDate
              ? new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "Select date"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {NDVI_DATES.map((date, i) => {
            const isSelected = date === selectedDate;
            const ndvi =
              0.3 + Math.sin((i / NDVI_DATES.length) * Math.PI) * 0.5;
            const green = Math.round(80 + ndvi * 175);
            return (
              <button
                key={date}
                onClick={() => onDateChange(date)}
                className={`flex-1 rounded-sm transition-all duration-300 ${
                  isSelected
                    ? "ring-2 ring-primary h-8 shadow-lg"
                    : "h-5 hover:h-7 opacity-80 hover:opacity-100"
                }`}
                style={{
                  backgroundColor: `rgb(${40}, ${green}, ${40})`,
                }}
                title={new Date(date + "T00:00:00").toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              />
            );
          })}
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-[10px] text-muted-foreground">Apr 2024</span>
          <span className="text-[10px] text-muted-foreground">Jul</span>
          <span className="text-[10px] text-muted-foreground">Oct 2024</span>
        </div>
      </div>
    </div>
  );
};

export default NdviScrubber;
