import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Home, MapPin, Building2, CalendarClock, History } from 'lucide-react';
import type { ResolvedUnknownStop } from '@/hooks/useResolvedUnknownStops';

function relDayLabel(rel: number, dir: 'today' | 'future' | 'past', date: string): string {
  if (dir === 'today') return `Idag (${date})`;
  if (dir === 'future') return `Om ${rel} d (${date})`;
  return `För ${Math.abs(rel)} d sedan (${date})`;
}

function fmtMin(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

export interface UnknownStopEnrichmentProps {
  resolved: ResolvedUnknownStopEvidence;
  /** Mindre rubrik om panelen är inbäddad i en redan synlig blockrad. */
  compact?: boolean;
}

export const UnknownStopEnrichment: React.FC<UnknownStopEnrichmentProps> = ({ resolved, compact }) => {
  const { reverseGeocoded, knownLocation, privateZone, matchingBookings, priorVisits } = resolved;

  const hasAnything =
    !!reverseGeocoded ||
    !!knownLocation ||
    !!privateZone ||
    matchingBookings.length > 0 ||
    !!priorVisits;

  if (!hasAnything) {
    return (
      <div className="text-[11px] text-muted-foreground italic">
        Adress kunde inte slås upp.
      </div>
    );
  }

  return (
    <div className={compact ? 'space-y-1' : 'space-y-1.5 mt-1'}>
      {!compact && (
        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
          Vad vet vi om platsen?
        </div>
      )}

      {privateZone && (
        <div className="flex items-center gap-1.5 text-xs text-foreground">
          <Home className="h-3.5 w-3.5 text-sky-600 shrink-0" />
          <span className="font-medium">{privateZone.label}</span>
          <span className="text-muted-foreground">({privateZone.distanceMeters} m)</span>
          <Badge variant="outline" className="text-[10px] py-0 h-4 border-sky-300 text-sky-700">
            privat — räknas inte
          </Badge>
        </div>
      )}

      {knownLocation && (
        <div className="flex items-center gap-1.5 text-xs text-foreground">
          <Building2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
          <span className="font-medium">{knownLocation.name}</span>
          <span className="text-muted-foreground">
            ({knownLocation.distanceMeters} m
            {knownLocation.address ? ` · ${knownLocation.address}` : ''})
          </span>
        </div>
      )}

      {reverseGeocoded && !knownLocation && !privateZone && (
        <div className="flex items-center gap-1.5 text-xs text-foreground">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span>{reverseGeocoded.label}</span>
        </div>
      )}

      {matchingBookings.length > 0 && (
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CalendarClock className="h-3 w-3" />
            Matchande bokningar inom {Math.max(...matchingBookings.map((b) => b.distanceMeters))} m
          </div>
          <ul className="ml-4 space-y-0.5 text-xs">
            {matchingBookings.map((b) => (
              <li key={b.bookingId} className="text-foreground">
                <span className="text-muted-foreground">
                  {relDayLabel(b.relativeDays, b.direction, b.eventDate)}:
                </span>{' '}
                <span className="font-medium">{b.label}</span>
                {b.bookingNumber ? (
                  <span className="text-muted-foreground"> ({b.bookingNumber})</span>
                ) : null}
                <span className="text-muted-foreground"> · {b.distanceMeters} m</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {priorVisits && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <History className="h-3 w-3" />
          Personen har varit här {priorVisits.visitCount} dag
          {priorVisits.visitCount === 1 ? '' : 'ar'} (~{fmtMin(priorVisits.approxMinutes)}
          {priorVisits.lastSeenIso ? `, senast ${fmtDate(priorVisits.lastSeenIso)}` : ''})
        </div>
      )}
    </div>
  );
};
