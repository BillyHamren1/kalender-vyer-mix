import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PackingWithBooking, PACKING_STATUS_LABELS } from "@/types/packing";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addMonths, subMonths, addWeeks, subWeeks,
  eachDayOfInterval, format, isSameMonth, isToday,
  isSameDay, isWithinInterval, parseISO, differenceInDays,
} from "date-fns";
import { sv } from "date-fns/locale";
import { cn } from "@/lib/utils";

type ViewMode = "month" | "week";

interface Props {
  packings: PackingWithBooking[];
}

const STATUS_COLORS: Record<string, string> = {
  planning: "bg-blue-500/80 hover:bg-blue-500",
  in_progress: "bg-yellow-500/80 hover:bg-yellow-500",
  packed: "bg-teal-500/80 hover:bg-teal-500",
  delivered: "bg-purple-500/80 hover:bg-purple-500",
  completed: "bg-green-500/80 hover:bg-green-500",
  cancelled: "bg-muted hover:bg-muted",
};

const STATUS_DOT_COLORS: Record<string, string> = {
  planning: "bg-blue-400",
  in_progress: "bg-yellow-400",
  packed: "bg-teal-400",
  delivered: "bg-purple-400",
  completed: "bg-green-400",
  cancelled: "bg-muted-foreground/40",
};

export default function PackingCalendarView({ packings }: Props) {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());

  const days = useMemo(() => {
    if (viewMode === "month") {
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
      const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
      return eachDayOfInterval({ start: calStart, end: calEnd });
    }
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
  }, [viewMode, currentDate]);

  // Parse packing dates
  const packingEvents = useMemo(() => {
    return packings
      .filter(p => p.status !== "cancelled")
      .map(p => {
        const start = p.start_date ? parseISO(p.start_date) : null;
        const end = p.end_date ? parseISO(p.end_date) : null;
        const bookingNum = p.booking?.booking_number || "";
        const client = p.booking?.client || p.name;
        // Address: street name+number, city (skip postal code)
        const rawAddr = p.booking?.deliveryaddress || p.delivery_address || "";
        const parts = rawAddr.split(",").map(s => s.trim()).filter(Boolean);
        // street is first part, skip middle parts that look like postal codes
        const street = parts[0] || "";
        const shortAddr = street;
        
        const label = [bookingNum, client].filter(Boolean).join(" – ");
        return { ...p, startDate: start, endDate: end, label, shortAddr, bookingNum };
      });
  }, [packings]);

  const scheduled = packingEvents.filter(e => e.startDate);
  const unscheduled = packingEvents.filter(e => !e.startDate);

  const navigate_ = (dir: 1 | -1) => {
    if (viewMode === "month") {
      setCurrentDate(dir === 1 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
    } else {
      setCurrentDate(dir === 1 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    }
  };

  const title = viewMode === "month"
    ? format(currentDate, "MMMM yyyy", { locale: sv })
    : `Vecka ${format(currentDate, "w", { locale: sv })}, ${format(currentDate, "yyyy")}`;

  // Get events that overlap a given day
  const eventsForDay = (day: Date) => {
    return scheduled.filter(e => {
      const s = e.startDate!;
      const end = e.endDate || s;
      return isWithinInterval(day, { start: s, end }) || isSameDay(day, s) || isSameDay(day, end);
    });
  };

  // For month view, determine if an event bar should start on this day
  const barStartsOnDay = (day: Date, e: typeof scheduled[0]) => {
    return isSameDay(day, e.startDate!);
  };

  // Calculate bar span in days from start
  const barSpan = (e: typeof scheduled[0], fromDay: Date) => {
    const end = e.endDate || e.startDate!;
    return differenceInDays(end, fromDay) + 1;
  };

  const weekDayHeaders = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];

  return (
    <div className="rounded-2xl border border-border/40 bg-card shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-muted/30">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5 text-warehouse" />
          <h3 className="font-semibold text-[hsl(var(--heading))]">Packningskalender</h3>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-border/40 overflow-hidden">
            <button
              onClick={() => setViewMode("month")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors",
                viewMode === "month"
                  ? "bg-warehouse text-white"
                  : "bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              Månad
            </button>
            <button
              onClick={() => setViewMode("week")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors",
                viewMode === "week"
                  ? "bg-warehouse text-white"
                  : "bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              Vecka
            </button>
          </div>

          {/* Navigation */}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate_(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="text-sm font-medium min-w-[140px] text-center capitalize text-[hsl(var(--heading))]"
          >
            {title}
          </button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate_(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => setCurrentDate(new Date())}>
            Idag
          </Button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-border/30">
        {weekDayHeaders.map(d => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2 border-r last:border-r-0 border-border/20">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className={cn("grid grid-cols-7", viewMode === "week" ? "min-h-[300px]" : "")}>
        {days.map((day, i) => {
          const inMonth = viewMode === "month" ? isSameMonth(day, currentDate) : true;
          const today = isToday(day);
          const dayEvents = eventsForDay(day);

          return (
            <div
              key={i}
              className={cn(
                "border-r border-b border-border/20 last:border-r-0 relative",
                viewMode === "week" ? "min-h-[250px] p-2" : "min-h-[90px] p-1",
                !inMonth && "bg-muted/20",
                today && "bg-warehouse/5"
              )}
            >
              <span className={cn(
                "text-xs font-medium block mb-1",
                today
                  ? "bg-warehouse text-white rounded-full w-6 h-6 flex items-center justify-center mx-auto"
                  : inMonth ? "text-foreground text-center" : "text-muted-foreground/50 text-center"
              )}>
                {format(day, "d")}
              </span>

              {/* Events */}
              <div className="space-y-0.5">
                {viewMode === "month" ? (
                  // Month: show compact chips for events starting this day
                  dayEvents.filter(e => barStartsOnDay(day, e)).map(e => {
                    const span = Math.min(barSpan(e, day), 7 - (i % 7)); // clamp to row
                    return (
                      <div
                        key={e.id}
                        onClick={() => navigate(`/warehouse/packing/${e.id}`)}
                        className={cn(
                          "text-[10px] leading-tight text-white px-1.5 py-0.5 rounded-sm cursor-pointer truncate font-medium transition-colors",
                          STATUS_COLORS[e.status] || "bg-muted"
                        )}
                        style={{
                          width: span > 1 ? `calc(${span * 100}% + ${(span - 1) * 1}px)` : undefined,
                          position: span > 1 ? "relative" : undefined,
                          zIndex: span > 1 ? 10 : undefined,
                        }}
                        title={`${e.label}${e.shortAddr ? ` • ${e.shortAddr}` : ""} — ${PACKING_STATUS_LABELS[e.status]}`}
                      >
                        {e.label}{e.shortAddr ? ` • ${e.shortAddr}` : ""}
                      </div>
                    );
                  })
                ) : (
                  // Week: show more detailed cards
                  dayEvents.filter(e => barStartsOnDay(day, e) || isSameDay(day, days[0])).map(e => (
                    <div
                      key={e.id}
                      onClick={() => navigate(`/warehouse/packing/${e.id}`)}
                      className={cn(
                        "text-xs text-white px-2 py-1.5 rounded cursor-pointer transition-colors",
                        STATUS_COLORS[e.status] || "bg-muted"
                      )}
                      title={`${e.label}${e.shortAddr ? ` • ${e.shortAddr}` : ""} — ${PACKING_STATUS_LABELS[e.status]}`}
                    >
                      <div className="font-medium truncate">{e.label}</div>
                      <div className="text-[10px] opacity-80 mt-0.5">
                        {e.shortAddr && <span>{e.shortAddr} • </span>}
                        {PACKING_STATUS_LABELS[e.status]}
                        {e.project_leader && ` • ${e.project_leader}`}
                      </div>
                    </div>
                  ))
                )}

                {/* Continuation dots for month view (event runs through but didn't start here) */}
                {viewMode === "month" && dayEvents.filter(e => !barStartsOnDay(day, e) && i % 7 === 0).map(e => (
                  <div
                    key={e.id}
                    onClick={() => navigate(`/warehouse/packing/${e.id}`)}
                    className={cn(
                      "text-[10px] leading-tight text-white px-1.5 py-0.5 rounded-sm cursor-pointer truncate font-medium transition-colors",
                      STATUS_COLORS[e.status] || "bg-muted"
                    )}
                    title={`${e.label} — ${PACKING_STATUS_LABELS[e.status]} (fortsätter)`}
                  >
                    ← {e.label}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Unscheduled packings */}
      {unscheduled.length > 0 && (
        <div className="border-t border-border/30 px-4 py-3 bg-muted/20">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Ej schemalagda ({unscheduled.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {unscheduled.map(e => (
              <Badge
                key={e.id}
                variant="outline"
                className="cursor-pointer hover:bg-muted transition-colors gap-1.5"
                onClick={() => navigate(`/warehouse/packing/${e.id}`)}
              >
                <span className={cn("w-2 h-2 rounded-full", STATUS_DOT_COLORS[e.status])} />
                {e.label}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="border-t border-border/30 px-4 py-2 flex flex-wrap gap-3">
        {Object.entries(PACKING_STATUS_LABELS)
          .filter(([k]) => k !== "cancelled")
          .map(([key, label]) => (
            <div key={key} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className={cn("w-2.5 h-2.5 rounded-sm", STATUS_DOT_COLORS[key])} />
              {label}
            </div>
          ))}
      </div>
    </div>
  );
}
