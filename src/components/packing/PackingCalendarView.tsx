import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Package as PackageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PackingWithBooking, PACKING_STATUS_LABELS } from "@/types/packing";
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  isWithinInterval,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { sv } from "date-fns/locale";
import { cn } from "@/lib/utils";

type ViewMode = "month" | "week";
type EventKind = "out" | "in";

interface Props {
  packings: PackingWithBooking[];
}

const KIND_TOKENS: Record<EventKind, {
  bg: string;
  border: string;
  iconBg: string;
  iconFg: string;
}> = {
  out: {
    bg: "#F2FCE2",
    border: "#D4EAB5",
    iconBg: "#E4F6CE",
    iconFg: "#3F6B17",
  },
  in: {
    bg: "#FEC6A1",
    border: "#FEB190",
    iconBg: "#FED9BD",
    iconFg: "#7A3414",
  },
};

const KIND_LABELS: Record<EventKind, string> = {
  out: "UT · packning",
  in: "IN · retur",
};

const MAX_EVENTS_PER_DAY_MONTH = 3;

export default function PackingCalendarView({ packings }: Props) {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());

  const days = useMemo(() => {
    if (viewMode === "month") {
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      return eachDayOfInterval({
        start: startOfWeek(monthStart, { weekStartsOn: 1 }),
        end: endOfWeek(monthEnd, { weekStartsOn: 1 }),
      });
    }

    return eachDayOfInterval({
      start: startOfWeek(currentDate, { weekStartsOn: 1 }),
      end: endOfWeek(currentDate, { weekStartsOn: 1 }),
    });
  }, [viewMode, currentDate]);

  type CalEvent = {
    id: string;
    packingId: string;
    kind: EventKind;
    status: string;
    startDate: Date;
    endDate: Date;
    label: string;
    bookingNum: string;
    shortAddr: string;
    isConsolidated: boolean;
    projectLeader: string | null;
  };

  const packingEvents = useMemo<CalEvent[]>(() => {
    const events: CalEvent[] = [];

    for (const packing of packings) {
      if (packing.status === "cancelled") continue;

      const bookingNum = packing.booking?.booking_number || "";
      const client = packing.booking?.client || packing.name;
      const rawAddress = packing.booking?.deliveryaddress || packing.delivery_address || "";
      const shortAddr = rawAddress.split(",").map((part) => part.trim()).filter(Boolean)[0] || "";
      const isConsolidated = !!packing.large_project_id;
      const label = isConsolidated ? packing.name : client;

      const outAnchor = packing.booking?.rigdaydate || packing.start_date;
      if (outAnchor) {
        const start = parseISO(outAnchor);
        const eventDate = packing.booking?.eventdate ? parseISO(packing.booking.eventdate) : start;
        events.push({
          id: `${packing.id}-out`,
          packingId: packing.id,
          kind: "out",
          status: packing.status,
          startDate: start,
          endDate: eventDate < start ? start : eventDate,
          label,
          bookingNum,
          shortAddr,
          isConsolidated,
          projectLeader: packing.project_leader ?? null,
        });
      }

      const inAnchor = packing.booking?.rigdowndate || packing.end_date;
      if (inAnchor) {
        const start = parseISO(inAnchor);
        events.push({
          id: `${packing.id}-in`,
          packingId: packing.id,
          kind: "in",
          status: packing.status,
          startDate: start,
          endDate: start,
          label,
          bookingNum,
          shortAddr,
          isConsolidated,
          projectLeader: packing.project_leader ?? null,
        });
      }
    }

    return events;
  }, [packings]);

  const goto = (direction: 1 | -1) => {
    if (viewMode === "month") {
      setCurrentDate(direction === 1 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
      return;
    }
    setCurrentDate(direction === 1 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
  };

  const title = viewMode === "month"
    ? format(currentDate, "MMMM yyyy", { locale: sv })
    : `Vecka ${format(currentDate, "w", { locale: sv })}`;

  const eventsForDay = (day: Date) =>
    packingEvents.filter((event) =>
      isWithinInterval(day, { start: event.startDate, end: event.endDate }) ||
      isSameDay(day, event.startDate) ||
      isSameDay(day, event.endDate),
    );

  const openPacking = (packingId: string) => navigate(`/warehouse/packing/${packingId}`);

  const EventChip = ({ event, dense = false }: { event: CalEvent; dense?: boolean }) => {
    const token = KIND_TOKENS[event.kind];
    const Icon = event.kind === "out" ? ArrowUpRight : ArrowDownLeft;

    return (
      <button
        type="button"
        onClick={(clickEvent) => {
          clickEvent.stopPropagation();
          openPacking(event.packingId);
        }}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md border text-left transition-colors hover:brightness-[0.98]",
          dense ? "px-1.5 py-1" : "px-2 py-1.5",
        )}
        style={{ backgroundColor: token.bg, borderColor: token.border, color: "#1a1a1a" }}
        title={`${KIND_LABELS[event.kind]} · ${event.bookingNum ? `${event.bookingNum} · ` : ""}${event.label}`}
      >
        <span
          className="inline-flex shrink-0 items-center justify-center rounded"
          style={{
            backgroundColor: token.iconBg,
            color: token.iconFg,
            width: dense ? 15 : 18,
            height: dense ? 15 : 18,
          }}
        >
          <Icon className={dense ? "h-2.5 w-2.5" : "h-3 w-3"} strokeWidth={2.5} />
        </span>
        <span className={cn("min-w-0 flex-1 truncate font-medium", dense ? "text-[10.5px]" : "text-xs")}>
          {event.bookingNum && <span className="mr-1 opacity-60">{event.bookingNum}</span>}
          {event.isConsolidated && <PackageIcon className="mr-1 inline h-2.5 w-2.5 opacity-70" />}
          {event.label}
        </span>
      </button>
    );
  };

  const WeekEventRow = ({ event }: { event: CalEvent }) => {
    const token = KIND_TOKENS[event.kind];
    const Icon = event.kind === "out" ? ArrowUpRight : ArrowDownLeft;

    return (
      <button
        type="button"
        onClick={() => openPacking(event.packingId)}
        className="w-full rounded-lg border p-2 text-left transition-colors hover:bg-muted/20"
        style={{ borderColor: token.border, backgroundColor: token.bg }}
      >
        <div className="flex items-start gap-2">
          <span
            className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded"
            style={{ backgroundColor: token.iconBg, color: token.iconFg }}
          >
            <Icon className="h-3 w-3" strokeWidth={2.5} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: token.iconFg }}>
              <span>{event.kind === "out" ? "UT" : "IN"}</span>
              {event.bookingNum && <span className="font-normal normal-case tracking-normal opacity-70">#{event.bookingNum.replace(/^#/, "")}</span>}
            </div>
            <div className="mt-0.5 flex items-center gap-1 truncate text-xs font-semibold text-foreground">
              {event.isConsolidated && <PackageIcon className="h-3 w-3 shrink-0 opacity-70" />}
              <span className="truncate">{event.label}</span>
            </div>
            {(event.shortAddr || event.projectLeader) && (
              <div className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
                {event.shortAddr}{event.shortAddr && event.projectLeader ? " · " : ""}{event.projectLeader}
              </div>
            )}
            <div className="mt-1 text-[10px] text-muted-foreground">
              {PACKING_STATUS_LABELS[event.status]}
            </div>
          </div>
        </div>
      </button>
    );
  };

  const weekDayHeaders = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];

  return (
    <section className="overflow-hidden rounded-xl border border-border/50 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 px-3 py-2.5">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goto(-1)} aria-label="Föregående period">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <button
            type="button"
            onClick={() => setCurrentDate(new Date())}
            className="min-w-[110px] text-center text-sm font-semibold capitalize text-foreground hover:text-primary"
          >
            {title}
          </button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goto(1)} aria-label="Nästa period">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setCurrentDate(new Date())}>
            Idag
          </Button>
        </div>

        <div className="inline-flex rounded-lg border border-border/50 p-0.5">
          {(["week", "month"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                viewMode === mode ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {mode === "week" ? "Vecka" : "Månad"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-border/30 bg-muted/20">
        {weekDayHeaders.map((day, index) => (
          <div
            key={day}
            className={cn(
              "py-2 text-center text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground",
              index < 6 && "border-r border-border/30",
            )}
          >
            {day}
          </div>
        ))}
      </div>

      <div className={cn("grid grid-cols-7", viewMode === "week" && "min-h-[360px]")}>
        {days.map((day, index) => {
          const inMonth = viewMode === "month" ? isSameMonth(day, currentDate) : true;
          const today = isToday(day);
          const dayEvents = eventsForDay(day).sort((a, b) => {
            if (a.kind !== b.kind) return a.kind === "out" ? -1 : 1;
            return a.bookingNum.localeCompare(b.bookingNum);
          });
          const visible = viewMode === "month" ? dayEvents.slice(0, MAX_EVENTS_PER_DAY_MONTH) : dayEvents;
          const overflow = viewMode === "month" ? dayEvents.length - visible.length : 0;
          const isLastColumn = index % 7 === 6;
          const isLastRow = index >= days.length - 7;

          return (
            <div
              key={day.toISOString()}
              className={cn(
                !isLastColumn && "border-r border-border/30",
                !isLastRow && "border-b border-border/30",
                viewMode === "week" ? "min-h-[360px] p-2" : "min-h-[105px] p-1.5",
                !inMonth && "bg-muted/15",
              )}
            >
              <div className="mb-1.5 flex items-center px-0.5">
                <span
                  className={cn(
                    "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums",
                    today ? "bg-warehouse text-white" : inMonth ? "text-foreground/80" : "text-muted-foreground/40",
                  )}
                >
                  {format(day, "d")}
                </span>
              </div>

              <div className="space-y-1">
                {viewMode === "month" ? (
                  <>
                    {visible.map((event) => <EventChip key={event.id} event={event} dense />)}
                    {overflow > 0 && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="w-full rounded px-1.5 py-0.5 text-left text-[10px] font-medium text-muted-foreground hover:bg-muted/50"
                          >
                            +{overflow} fler
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-72 p-2">
                          <div className="mb-2 px-1 text-xs font-semibold capitalize text-foreground">
                            {format(day, "EEEE d MMMM", { locale: sv })}
                          </div>
                          <div className="max-h-80 space-y-1 overflow-y-auto">
                            {dayEvents.map((event) => <EventChip key={event.id} event={event} />)}
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </>
                ) : (
                  visible.map((event) => <WeekEventRow key={event.id} event={event} />)
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-border/30 px-3 py-2 text-[11px] text-muted-foreground">
        {(Object.keys(KIND_LABELS) as EventKind[]).map((kind) => {
          const token = KIND_TOKENS[kind];
          const Icon = kind === "out" ? ArrowUpRight : ArrowDownLeft;
          return (
            <span key={kind} className="inline-flex items-center gap-1.5">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded" style={{ backgroundColor: token.iconBg, color: token.iconFg }}>
                <Icon className="h-2.5 w-2.5" strokeWidth={2.5} />
              </span>
              {KIND_LABELS[kind]}
            </span>
          );
        })}
      </div>
    </section>
  );
}
