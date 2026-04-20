import { MapPin, X } from 'lucide-react';
import type { UnplannedVisit } from '@/hooks/useUnplannedSiteVisit';
import { useEffect, useState } from 'react';

interface Props {
  visit: UnplannedVisit;
  onEnd: () => void;
}

function formatElapsed(startedAt: string, now: number): string {
  const startMs = new Date(startedAt).getTime();
  const sec = Math.max(0, Math.floor((now - startMs) / 1000));
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}min`;
  return `${m} min`;
}

/**
 * Persistent banner shown while an unplanned-site visit is open.
 * The banner tells the user they're currently registered at a planned job
 * (without being assigned to it) and lets them end the visit manually.
 * Auto-stop on geofence-exit is handled by the useUnplannedSiteVisit hook.
 */
export default function UnplannedVisitBanner({ visit, onEnd }: Props) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="px-3 py-2">
      <div className="rounded-2xl border border-primary/40 bg-primary/10 px-3 py-2 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
          <MapPin className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-foreground truncate">
            På plats — {visit.client}
          </p>
          <p className="text-[10px] text-muted-foreground truncate">
            {formatElapsed(visit.started_at, now)} · {visit.note}
          </p>
        </div>
        <button
          onClick={onEnd}
          className="px-2.5 py-1.5 rounded-lg bg-background border border-border text-[11px] font-semibold active:scale-[0.98]"
        >
          Avsluta besök
        </button>
      </div>
    </div>
  );
}
