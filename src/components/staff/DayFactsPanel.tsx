import React from 'react';
import { format } from 'date-fns';
import { Loader2, MapPin, LogIn, LogOut, Coffee, Clock, AlertTriangle, Building2 } from 'lucide-react';
import { useStaffPingsForDay } from '@/hooks/useStaffPingsForDay';
import { buildDayFacts, type DayFact } from '@/lib/staff/dayFacts';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StaffMovementMap } from './StaffMovementMap';
import { useState } from 'react';

interface Props {
  staffId: string;
  staffName: string;
  date: string;
  /** Reported start of the session (ISO). */
  reportedStart: string;
  /** Reported end of the session (ISO) or null if open. */
  reportedEnd: string | null;
  /** Optional human label for the base (e.g. "FA Warehouse"). */
  baseLabel?: string | null;
  /** Optional fixed base coordinates (workplace anchor). */
  base?: { lat: number; lng: number } | null;
}

const fmt = (iso: string) => {
  try { return format(new Date(iso), 'HH:mm'); } catch { return '—'; }
};

const fmtDur = (min?: number) => {
  if (!min || min < 1) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};

const iconFor = (f: DayFact): React.ComponentType<{ className?: string }> => {
  if (f.kind === 'arrival') return LogIn;
  if (f.kind === 'departure') return LogOut;
  if (f.kind === 'at_base') return Building2;
  if (f.kind === 'away') return f.awaySubtype === 'likely_lunch' ? Coffee : Clock;
  return AlertTriangle;
};

export const DayFactsPanel: React.FC<Props> = ({
  staffId, staffName, date, reportedStart, reportedEnd, baseLabel, base,
}) => {
  const [mapOpen, setMapOpen] = useState(false);
  const { data: pings = [], isLoading, error } = useStaffPingsForDay(staffId, date, true);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Hämtar GPS-data…
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-3 py-2 text-xs text-destructive">
        Kunde inte hämta GPS-data
      </div>
    );
  }

  const facts = buildDayFacts({
    pings,
    reportedStart,
    reportedEnd,
    base: base ?? null,
    baseLabel: baseLabel ?? null,
  });

  const flaggedCount = facts.filter(f => f.flagged).length;

  return (
    <div className="px-3 py-2 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] text-muted-foreground">
          GPS-fakta för rapport {fmt(reportedStart)}–{reportedEnd ? fmt(reportedEnd) : 'pågår'}
          {' · '}
          <span className="tabular-nums">{pings.length} pings</span>
          {flaggedCount > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 text-destructive font-medium">
              <AlertTriangle className="h-3 w-3" />
              {flaggedCount} avvikelse{flaggedCount === 1 ? '' : 'r'}
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={(e) => { e.stopPropagation(); setMapOpen(true); }}
        >
          <MapPin className="h-3 w-3" />
          Visa på karta
        </Button>
      </div>

      {/* Facts list */}
      <ul className="border-l-2 border-border pl-3 space-y-1.5">
        {facts.map((f, i) => {
          const Icon = iconFor(f);
          const isPeriod = !!f.until;
          const timeLabel = isPeriod ? `${fmt(f.at)} – ${fmt(f.until!)}` : fmt(f.at);
          return (
            <li
              key={i}
              className={`flex items-start gap-2 text-xs ${f.flagged ? 'text-destructive' : 'text-foreground'}`}
            >
              <Icon className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${f.flagged ? 'text-destructive' : 'text-muted-foreground'}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="tabular-nums font-medium">{timeLabel}</span>
                  <span className={f.flagged ? 'font-medium' : ''}>{f.label}</span>
                  {f.durationMin != null && (
                    <span className="tabular-nums text-muted-foreground">
                      · {fmtDur(f.durationMin)}
                    </span>
                  )}
                </div>
                {f.detail && (
                  <div className={`text-[11px] mt-0.5 ${f.flagged ? 'text-destructive/80' : 'text-muted-foreground'}`}>
                    {f.detail}
                  </div>
                )}
              </div>
            </li>
          );
        })}
        {facts.length === 0 && (
          <li className="text-xs text-muted-foreground py-1">
            Ingen fakta att visa.
          </li>
        )}
      </ul>

      {/* Map dialog */}
      <Dialog open={mapOpen} onOpenChange={setMapOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              {staffName} · {date}
              <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">
                {fmt(reportedStart)} → {reportedEnd ? fmt(reportedEnd) : 'pågår'}
              </span>
            </DialogTitle>
          </DialogHeader>
          <StaffMovementMap
            staffId={staffId}
            date={date}
            fromIso={reportedStart}
            toIso={reportedEnd ?? undefined}
            className="h-[480px]"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};
