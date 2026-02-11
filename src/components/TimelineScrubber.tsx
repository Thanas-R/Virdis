import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface TimelineScrubberProps {
  onDateSelect?: (date: string) => void;
}

const generateDates = () => {
  const dates: string[] = [];
  const start = new Date(2019, 3, 1); // Apr 1
  const end = new Date(2019, 9, 1); // Oct 1
  const d = new Date(start);
  while (d <= end) {
    dates.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }));
    d.setDate(d.getDate() + 5);
  }
  return dates;
};

const TimelineScrubber = ({ onDateSelect }: TimelineScrubberProps) => {
  const dates = generateDates();
  const [selectedIndex, setSelectedIndex] = useState(Math.floor(dates.length / 2));
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current.children[selectedIndex] as HTMLElement;
      el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [selectedIndex]);

  const handleSelect = (i: number) => {
    setSelectedIndex(i);
    onDateSelect?.(dates[i]);
  };

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-card/90 backdrop-blur-sm rounded-lg border border-border px-2 py-1.5 max-w-[600px]">
      <button
        onClick={() => handleSelect(Math.max(0, selectedIndex - 1))}
        className="text-muted-foreground hover:text-foreground p-1"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <div ref={scrollRef} className="flex gap-1 overflow-x-auto scrollbar-hide">
        {dates.map((date, i) => (
          <button
            key={date}
            onClick={() => handleSelect(i)}
            className={`px-2.5 py-1 rounded-md text-xs whitespace-nowrap transition-all ${
              i === selectedIndex
                ? "bg-primary text-primary-foreground font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {date}
          </button>
        ))}
      </div>
      <button
        onClick={() => handleSelect(Math.min(dates.length - 1, selectedIndex + 1))}
        className="text-muted-foreground hover:text-foreground p-1"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
};

export default TimelineScrubber;
