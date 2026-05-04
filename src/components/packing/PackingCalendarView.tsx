import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, ArrowUpRight, ArrowDownLeft, Package as PackageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { PackingWithBooking, PACKING_STATUS_LABELS } from "@/types/packing";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addMonths, subMonths, addWeeks, subWeeks,
  eachDayOfInterval, format, isSameMonth, isToday,
  isSameDay, isWithinInterval, parseISO,
} from "date-fns";
import { sv } from "date-fns/locale";
import { cn } from "@/lib/utils";

type ViewMode = "month" | "week";

interface Props {
  packings: PackingWithBooking[];
}

type EventKind = "out" | "in";

// Matchar personalkalenderns rig/rigDown-palett (src/styles/calendar.css)
// OUT = rig (mjuk grön mint), IN = rigDown (varm persika)
const KIND_TOKENS: Record<EventKind, {
  bg: string; border: string; ring: string; dot: string; iconBg: string; iconFg: string;
}> = {
  out: {
    bg: "#F2FCE2",
    border: "#D4EAB5",
    ring: "rgba(132, 178, 91, 0.35)",
    dot: "#7FAE4F",
    iconBg: "#E4F6CE",
    iconFg: "#3F6B17",
  },
  in: {
    bg: "#FEC6A1",
    border: "#FEB190",
    ring: "rgba(217, 119, 80, 0.35)",
    dot: "#D97750",
    iconBg: "#FED9BD",
    iconFg: "#7A3414",
  },
};

const KIND_LABELS: Record<EventKind, string> = {
  out: "UT — packning",
  in: "IN — retur",
};

const MAX_EVENTS_PER_DAY_MONTH = 3;

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

  type CalEvent = {
    id: string;
    packingId: string;
    kind: EventKind;
    status: string;
    startDate: Date;
    endDate: Date;
    label: string;
    bookingNum: string;
    client: string;
    shortAddr: string;
    isConsolidated: boolean;
    project_leader: string | null;
  };

  const packingEvents = useMemo<CalEvent[]>(() => {
    const events: CalEvent[] = [];

    for (const p of packings) {
      if (p.status === "cancelled") continue;
      const bookingNum = p.booking?.booking_number || "";
      const client = p.booking?.client || p.name;
      const rawAddr = p.booking?.deliveryaddress || p.delivery_address || "";
      const street = rawAddr.split(",").map(s => s.trim()).filter(Boolean)[0] || "";
      const isConsolidated = !!p.large_project_id;
      const baseLabel = isConsolidated ? p.name : client;

      const outAnchor = p.booking?.rigdaydate || p.start_date;
      if (outAnchor) {
        const start = parseISO(outAnchor);
        const end = p.booking?.eventdate ? parseISO(p.booking.eventdate) : start;
        events.push({
          id: `${p.id}-out`,
          packingId: p.id,
          kind: "out",
          status: p.status,
          startDate: start,
          endDate: end < start ? start : end,
          label: baseLabel,
          bookingNum,
          client,
          shortAddr: street,
          isConsolidated,
          project_leader: p.project_leader ?? null,
        });
      }

      const inAnchor = p.booking?.rigdowndate || p.end_date;
      if (inAnchor) {
        const start = parseISO(inAnchor);
        events.push({
          id: `${p.id}-in`,
          packingId: p.id,
          kind: "in",
          status: p.status,
          startDate: start,
          endDate: start,
          label: baseLabel,
          bookingNum,
          client,
          shortAddr: street,
          isConsolidated,
          project_leader: p.project_leader ?? null,
        });
      }
    }

    return events;
  }, [packings]);

  const goto = (dir: 1 | -1) => {
    if (viewMode === "month") {
      setCurrentDate(dir === 1 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
    } else {
      setCurrentDate(dir === 1 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    }
  };

  const title = viewMode === "month"
    ? format(currentDate, "MMMM yyyy", { locale: sv })
    : `Vecka ${format(currentDate, "w", { locale: sv })}, ${format(currentDate, "yyyy")}`;

  const eventsForDay = (day: Date) => {
    return packingEvents.filter(e => {
      const s = e.startDate;
      const end = e.endDate || s;
      return isWithinInterval(day, { start: s, end }) || isSameDay(day, s) || isSameDay(day, end);
    });
  };

  const weekDayHeaders = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];

  // ===================== Sub-components =====================

  const EventChip = ({ e, dense = false }: { e: CalEvent; dense?: boolean }) => {
    const t = KIND_TOKENS[e.kind];
    const Icon = e.kind === "out" ? ArrowUpRight : ArrowDownLeft;
    return (
      <button
        onClick={(ev) => { ev.stopPropagation(); navigate(`/warehouse/packing/${e.packingId}`); }}
        className={cn(
          "group/chip w-full flex items-center gap-1.5 rounded-md text-left transition-all",
          "border shadow-[0_1px_0_rgba(0,0,0,0.02)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:-translate-y-[0.5px]",
          dense ? "px-1.5 py-0.5" : "px-2 py-1"
        )}
        style={{ backgroundColor: t.bg, borderColor: t.border, color: "#1a1a1a" }}
        title={`${KIND_LABELS[e.kind]} • ${e.bookingNum ? e.bookingNum + " — " : ""}${e.label}${e.shortAddr ? " • " + e.shortAddr : ""} — ${PACKING_STATUS_LABELS[e.status]}`}
      >
        <span
          className="shrink-0 inline-flex items-center justify-center rounded-[4px]"
          style={{
            backgroundColor: t.iconBg,
            color: t.iconFg,
            width: dense ? 14 : 16,
            height: dense ? 14 : 16,
          }}
        >
          <Icon className={dense ? "h-2.5 w-2.5" : "h-3 w-3"} strokeWidth={2.5} />
        </span>
        <span className={cn(
          "min-w-0 flex-1 truncate font-medium tracking-tight",
          dense ? "text-[10.5px] leading-tight" : "text-[11.5px] leading-tight"
        )}>
          {e.isConsolidated && <PackageIcon className="inline h-2.5 w-2.5 mr-1 -mt-px opacity-70" />}
          {e.bookingNum && <span className="opacity-60 mr-1 tabular-nums">{e.bookingNum}</span>}
          {e.label}
        </span>
      </button>
    );
  };

  const WeekEventCard = ({ e }: { e: CalEvent }) => {
    const t = KIND_TOKENS[e.kind];
    const Icon = e.kind === "out" ? ArrowUpRight : ArrowDownLeft;
    return (
      <button
        onClick={(ev) => { ev.stopPropagation(); navigate(`/warehouse/packing/${e.packingId}`); }}
        className="w-full text-left rounded-lg border p-2 transition-all hover:shadow-[0_4px_14px_rgba(0,0,0,0.08)] hover:-translate-y-[1px]"
        style={{ backgroundColor: t.bg, borderColor: t.border }}
      >
        <div className="flex items-start gap-2">
          <span
            className="shrink-0 inline-flex items-center justify-center rounded-md mt-0.5"
            style={{ backgroundColor: t.iconBg, color: t.iconFg, width: 22, height: 22 }}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: t.iconFg }}>
                {e.kind === "out" ? "UT" : "IN"}
              </span>
              {e.bookingNum && (
                <span className="text-[10px] tabular-nums opacity-60">#{e.bookingNum.replace(/^#/, "")}</span>
              )}
            </div>
            <div className="text-[12px] font-semibold text-foreground truncate mt-0.5 flex items-center gap-1">
              {e.isConsolidated && <PackageIcon className="h-3 w-3 opacity-70 shrink-0" />}
              {e.label}
            </div>
            {(e.shortAddr || e.project_leader) && (
              <div className="text-[10.5px] text-muted-foreground truncate mt-0.5">
                {e.shortAddr}{e.shortAddr && e.project_leader ? " • " : ""}{e.project_leader}
              </div>
            )}
            <div className="text-[10px] mt-1 inline-flex items-center px-1.5 py-0.5 rounded-full bg-white/60 border border-black/5 text-muted-foreground">
              {PACKING_STATUS_LABELS[e.status]}
            </div>
          </div>
        </div>
      </button>
    );
  };

  // ===================== Render =====================

  return (
    <section
      className="rounded-2xl border bg-card overflow-hidden"
      style={{
        borderColor: "hsl(var(--border) / 0.5)",
        boxShadow:
          "0 1px 0 hsl(0 0% 100% / 0.6) inset, 0 1px 2px rgba(15, 23, 42, 0.04), 0 12px 32px -16px rgba(15, 23, 42, 0.18)",
      }}
    >
      {/* Premium Header */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b"
        style={{
          borderColor: "hsl(var(--border) / 0.4)",
          background:
            "linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(200 15% 98%) 100%)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="h-9 w-9 rounded-xl inline-flex items-center justify-center shadow-sm"
            style={{
              background:
                "linear-gradient(135deg, hsl(38 92% 56%) 0%, hsl(32 95% 46%) 100%)",
              boxShadow:
                "0 1px 0 hsl(0 0% 100% / 0.4) inset, 0 4px 10px -2px hsl(38 92% 50% / 0.45)",
            }}
          >
            <CalendarIcon className="h-4.5 w-4.5 text-white" strokeWidth={2.25} />
          </div>
          <div className="leading-tight">
            <h3 className="font-semibold text-[15px] text-[hsl(var(--heading))] tracking-tight">
              Packningskalender
            </h3>
            <p className="text-[11.5px] text-muted-foreground mt-0.5">
              UT från lager och IN i retur — i realtid
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Segmented view toggle */}
          <div
            className="inline-flex p-0.5 rounded-lg border"
            style={{ borderColor: "hsl(var(--border) / 0.5)", backgroundColor: "hsl(200 15% 96%)" }}
          >
            {(["month", "week"] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                  viewMode === m
                    ? "bg-white text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {m === "month" ? "Månad" : "Vecka"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => goto(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="text-[13px] font-semibold min-w-[150px] text-center capitalize text-[hsl(var(--heading))] hover:text-primary transition-colors tracking-tight"
            >
              {title}
            </button>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => goto(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="text-xs h-8 rounded-lg font-medium"
            onClick={() => setCurrentDate(new Date())}
          >
            Idag
          </Button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 border-b" style={{ borderColor: "hsl(var(--border) / 0.4)", backgroundColor: "hsl(200 15% 98%)" }}>
        {weekDayHeaders.map((d, idx) => (
          <div
            key={d}
            className={cn(
              "text-center text-[10.5px] font-semibold uppercase tracking-[0.1em] py-2.5 text-muted-foreground",
              idx < 6 && "border-r",
              (d === "Lör" || d === "Sön") && "text-muted-foreground/70"
            )}
            style={{ borderColor: "hsl(var(--border) / 0.3)" }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className={cn("grid grid-cols-7", viewMode === "week" ? "min-h-[420px]" : "")}>
        {days.map((day, i) => {
          const inMonth = viewMode === "month" ? isSameMonth(day, currentDate) : true;
          const today = isToday(day);
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;
          const dayEvents = eventsForDay(day);

          // sort: OUT first, then IN; within each by booking_number
          const sorted = [...dayEvents].sort((a, b) => {
            if (a.kind !== b.kind) return a.kind === "out" ? -1 : 1;
            return a.bookingNum.localeCompare(b.bookingNum);
          });

          const visible = viewMode === "month" ? sorted.slice(0, MAX_EVENTS_PER_DAY_MONTH) : sorted;
          const overflow = viewMode === "month" ? sorted.length - visible.length : 0;
          const isLastCol = (i % 7) === 6;
          const isLastRow = i >= days.length - 7;

          return (
            <div
              key={i}
              className={cn(
                "relative group/day",
                !isLastCol && "border-r",
                !isLastRow && "border-b",
                viewMode === "week" ? "min-h-[420px] p-2" : "min-h-[112px] p-1.5",
              )}
              style={{
                borderColor: "hsl(var(--border) / 0.3)",
                backgroundColor: !inMonth
                  ? "hsl(200 15% 97%)"
                  : isWeekend
                  ? "hsl(200 15% 98.5%)"
                  : "hsl(0 0% 100%)",
              }}
            >
              {/* Day number */}
              <div className="flex items-center justify-between mb-1.5 px-0.5">
                <span
                  className={cn(
                    "text-[11px] font-semibold tabular-nums inline-flex items-center justify-center transition-colors",
                    today
                      ? "h-6 w-6 rounded-full text-white shadow-sm"
                      : inMonth
                      ? "text-foreground/80"
                      : "text-muted-foreground/40"
                  )}
                  style={today ? {
                    background: "linear-gradient(135deg, hsl(38 92% 56%), hsl(32 95% 46%))",
                    boxShadow: "0 2px 6px -1px hsl(38 92% 50% / 0.45)",
                  } : undefined}
                >
                  {format(day, "d")}
                </span>

                {sorted.length > 0 && viewMode === "month" && (
                  <span className="text-[9.5px] tabular-nums text-muted-foreground/70 font-medium">
                    {sorted.length}
                  </span>
                )}
              </div>

              {/* Events */}
              <div className="space-y-1">
                {viewMode === "month" ? (
                  <>
                    {visible.map((e) => (
                      <EventChip key={e.id} e={e} dense />
                    ))}
                    {overflow > 0 && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            onClick={(ev) => ev.stopPropagation()}
                            className="w-full text-left text-[10px] px-1.5 py-0.5 rounded-md font-medium text-muted-foreground hover:bg-muted/60 transition-colors"
                          >
                            + {overflow} till
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-72 p-2 rounded-xl border-border/60 shadow-2xl"
                        >
                          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                            {format(day, "EEEE d MMM", { locale: sv })} • {sorted.length} händelser
                          </div>
                          <div className="space-y-1 max-h-80 overflow-y-auto">
                            {sorted.map((e) => (
                              <EventChip key={e.id} e={e} />
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </>
                ) : (
                  sorted.map((e) => <WeekEventCard key={e.id} e={e} />)
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Premium Legend */}
      <div
        className="border-t px-5 py-3 flex flex-wrap gap-5 items-center justify-between"
        style={{
          borderColor: "hsl(var(--border) / 0.4)",
          background: "linear-gradient(180deg, hsl(200 15% 98%) 0%, hsl(200 15% 96%) 100%)",
        }}
      >
        <div className="flex flex-wrap gap-4">
          {(Object.keys(KIND_LABELS) as EventKind[]).map((k) => {
            const t = KIND_TOKENS[k];
            const Icon = k === "out" ? ArrowUpRight : ArrowDownLeft;
            return (
              <div key={k} className="flex items-center gap-2">
                <span
                  className="inline-flex items-center justify-center rounded-md border"
                  style={{ backgroundColor: t.bg, borderColor: t.border, width: 22, height: 22 }}
                >
                  <Icon className="h-3 w-3" style={{ color: t.iconFg }} strokeWidth={2.5} />
                </span>
                <span className="text-[11.5px] font-medium text-foreground/80">{KIND_LABELS[k]}</span>
              </div>
            );
          })}
        </div>
        <div className="text-[10.5px] text-muted-foreground/70 hidden sm:block">
          Klicka på en händelse för att öppna packningen
        </div>
      </div>
    </section>
  );
}
