import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker> & {
  onMonthYearChange?: (date: Date) => void;
};

function MonthYearCaption({ calendarMonth, onMonthChange }: { calendarMonth: { date: Date }; onMonthChange?: (date: Date) => void }) {
  const date = calendarMonth.date;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);

  return (
    <div className="flex items-center gap-1 justify-center">
      <select
        value={date.getMonth()}
        onChange={(e) => {
          const newDate = new Date(date);
          newDate.setMonth(parseInt(e.target.value));
          onMonthChange?.(newDate);
        }}
        className="bg-transparent text-sm font-medium text-foreground border-none outline-none cursor-pointer appearance-none px-1 hover:text-primary transition-colors"
      >
        {months.map((m, i) => (
          <option key={m} value={i} className="bg-card text-foreground">{m}</option>
        ))}
      </select>
      <select
        value={date.getFullYear()}
        onChange={(e) => {
          const newDate = new Date(date);
          newDate.setFullYear(parseInt(e.target.value));
          onMonthChange?.(newDate);
        }}
        className="bg-transparent text-sm font-medium text-foreground border-none outline-none cursor-pointer appearance-none px-1 hover:text-primary transition-colors"
      >
        {years.map((y) => (
          <option key={y} value={y} className="bg-card text-foreground">{y}</option>
        ))}
      </select>
    </div>
  );
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  components: userComponents,
  onMonthYearChange,
  month: controlledMonth,
  onMonthChange: controlledOnMonthChange,
  ...props
}: CalendarProps) {
  const [internalMonth, setInternalMonth] = React.useState(controlledMonth || new Date());
  const activeMonth = controlledMonth || internalMonth;

  const handleMonthChange = (date: Date) => {
    setInternalMonth(date);
    controlledOnMonthChange?.(date);
    onMonthYearChange?.(date);
  };

  const defaultClassNames = {
    months: "relative flex flex-col sm:flex-row gap-4",
    month: "w-full",
    month_caption: "relative mx-10 mb-1 flex h-9 items-center justify-center z-20",
    caption_label: "hidden",
    nav: "absolute top-0 flex w-full justify-between z-10",
    button_previous: cn(
      buttonVariants({ variant: "ghost" }),
      "size-9 text-muted-foreground/80 hover:text-foreground p-0",
    ),
    button_next: cn(
      buttonVariants({ variant: "ghost" }),
      "size-9 text-muted-foreground/80 hover:text-foreground p-0",
    ),
    weekday: "size-9 p-0 text-xs font-medium text-muted-foreground/80",
    day_button:
      "relative flex size-9 items-center justify-center whitespace-nowrap rounded-lg p-0 text-foreground outline-offset-2 group-[[data-selected]:not(.range-middle)]:[transition-property:color,background-color,border-radius,box-shadow] group-[[data-selected]:not(.range-middle)]:duration-150 focus:outline-none group-data-[disabled]:pointer-events-none focus-visible:z-10 hover:bg-accent group-data-[selected]:bg-primary hover:text-foreground group-data-[selected]:text-primary-foreground group-data-[disabled]:text-foreground/30 group-data-[disabled]:line-through group-data-[outside]:text-foreground/30 group-data-[outside]:group-data-[selected]:text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 group-[.range-start:not(.range-end)]:rounded-e-none group-[.range-end:not(.range-start)]:rounded-s-none group-[.range-middle]:rounded-none group-data-[selected]:group-[.range-middle]:bg-accent group-data-[selected]:group-[.range-middle]:text-foreground",
    day: "group size-9 px-0 text-sm",
    range_start: "range-start",
    range_end: "range-end",
    range_middle: "range-middle",
    today:
      "*:after:pointer-events-none *:after:absolute *:after:bottom-1 *:after:start-1/2 *:after:z-10 *:after:size-[3px] *:after:-translate-x-1/2 *:after:rounded-full *:after:bg-primary [&[data-selected]:not(.range-middle)>*]:after:bg-background [&[data-disabled]>*]:after:bg-foreground/30 *:after:transition-colors",
    outside:
      "text-muted-foreground data-selected:bg-accent/50 data-selected:text-muted-foreground",
    hidden: "invisible",
    week_number: "size-9 p-0 text-xs font-medium text-muted-foreground/80",
  };

  const mergedClassNames: typeof defaultClassNames = Object.keys(
    defaultClassNames,
  ).reduce(
    (acc, key) => ({
      ...acc,
      [key]: classNames?.[key as keyof typeof classNames]
        ? cn(
            defaultClassNames[key as keyof typeof defaultClassNames],
            classNames[key as keyof typeof classNames],
          )
        : defaultClassNames[key as keyof typeof defaultClassNames],
    }),
    {} as typeof defaultClassNames,
  );

  const defaultComponents = {
    Chevron: (props: any) => {
      if (props.orientation === "left") {
        return (
          <ChevronLeft size={16} strokeWidth={2} {...props} aria-hidden="true" />
        );
      }
      return (
        <ChevronRight size={16} strokeWidth={2} {...props} aria-hidden="true" />
      );
    },
    MonthCaption: (captionProps: any) => (
      <MonthYearCaption calendarMonth={captionProps.calendarMonth} onMonthChange={handleMonthChange} />
    ),
  };

  const mergedComponents = {
    ...defaultComponents,
    ...userComponents,
  };

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("w-fit pointer-events-auto", className)}
      classNames={mergedClassNames}
      components={mergedComponents}
      month={activeMonth}
      onMonthChange={handleMonthChange}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
