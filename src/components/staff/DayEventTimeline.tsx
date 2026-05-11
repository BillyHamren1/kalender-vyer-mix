import { useState } from "react";
import { RefreshCw, Activity, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDayTimeline } from "@/hooks/admin/useDayTimeline";
import { DayTimelineEventRow } from "./DayTimelineEventRow";

interface Props {
  staffId: string;
  date: string;
  selectedEventId?: string | null;
  onSelectEvent?: (eventId: string) => void;
}

const fmtHm = (iso: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("sv-SE", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Stockholm",
    });
  } catch {
    return "—";
  }
};

export function DayEventTimeline({ staffId, date, selectedEventId, onSelectEvent }: Props) {
  const { events, coverage, isLoading, isFetching, error, refresh } = useDayTimeline({ staffId, date });
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  };

  const showCoverageBanner = !!coverage && coverage.gap_minutes > 30 && !!coverage.last_ping_ts;

  return (
    <section className="space-y-3 rounded-lg border border-border/60 bg-card p-4">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Händelseförlopp för dagen</h3>
          {isFetching && !isLoading && (
            <span className="text-[10px] text-muted-foreground">Uppdaterar…</span>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing || isLoading}
          className="h-7 text-xs gap-1"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          Räkna om
        </Button>
      </header>

      {showCoverageBanner && coverage && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <div className="font-medium">Tidslinjen kan vara ofullständig</div>
            <div className="opacity-90">
              Senaste händelse slutar {fmtHm(coverage.last_event_end_ts)} men GPS-pings finns till {fmtHm(coverage.last_ping_ts)} ({coverage.gap_minutes} min glapp).
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing || isLoading}
            className="h-7 text-xs gap-1"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            Bygg om dagen
          </Button>
        </div>
      )}

      {isLoading && (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-5 w-5 rounded-full" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-md p-3">
          Kunde inte ladda händelseförloppet: {error.message}
        </div>
      )}

      {!isLoading && !error && events.length === 0 && (
        <p className="text-xs text-muted-foreground italic py-4 text-center">
          Inga händelser kunde härledas för denna dag.
        </p>
      )}

      {!isLoading && events.length > 0 && (
        <ol className="relative space-y-2 before:absolute before:left-4 before:top-1 before:bottom-1 before:w-px before:bg-border">
          {events.map((e) => (
            <DayTimelineEventRow
              key={e.id}
              event={e}
              selected={e.id === selectedEventId}
              onSelect={onSelectEvent}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

export default DayEventTimeline;
