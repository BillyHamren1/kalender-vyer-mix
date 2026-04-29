import { useState } from "react";
import { RefreshCw, Activity } from "lucide-react";
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

export function DayEventTimeline({ staffId, date, selectedEventId, onSelectEvent }: Props) {
  const { events, isLoading, isFetching, error, refresh } = useDayTimeline({ staffId, date });
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  };

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
