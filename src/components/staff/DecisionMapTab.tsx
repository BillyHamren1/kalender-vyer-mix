/**
 * DecisionMapTab
 * ──────────────────────────────────────────────────────────────────
 * Read-only karta i DecisionTraceDrawer som visar exakt var personen
 * varit under en dag, med tidsfönster-filter (från–till). Återanvänder
 * StaffMovementMap som redan stödjer fromIso/toIso.
 */

import React, { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StaffMovementMap } from './StaffMovementMap';
import { formatStockholmHm } from '@/lib/staff/formatStockholmTime';
import type { ReportCandidateBlockUI } from './ReportCandidateTimeline';

interface Props {
  staffId: string;
  date: string; // YYYY-MM-DD
  reportCandidateBlocks: ReportCandidateBlockUI[];
  /** Initial filter range (typically the clicked block's start/end ISO). */
  initialFromIso?: string | null;
  initialToIso?: string | null;
}

// Build a local-time ISO string from "YYYY-MM-DD" + "HH:MM"
function combineLocal(date: string, hhmm: string): string | null {
  if (!date || !hhmm) return null;
  const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const d = new Date(`${date}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

// Extract HH:MM (Stockholm) from an ISO timestamp
function isoToHm(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return formatStockholmHm(String(iso));
  } catch {
    return '';
  }
}

export const DecisionMapTab: React.FC<Props> = ({
  staffId,
  date,
  reportCandidateBlocks,
  initialFromIso,
  initialToIso,
}) => {
  const [from, setFrom] = useState<string>(() => isoToHm(initialFromIso));
  const [to, setTo] = useState<string>(() => isoToHm(initialToIso));

  // Sync time-window when the caller's initial ISO range changes
  // (e.g. user clicks a different block in BlockDetailDialog).
  React.useEffect(() => {
    setFrom(isoToHm(initialFromIso));
    setTo(isoToHm(initialToIso));
  }, [initialFromIso, initialToIso]);

  const fromIso = useMemo(
    () => combineLocal(date, from) ?? (initialFromIso || null),
    [date, from, initialFromIso],
  );
  const toIso = useMemo(
    () => combineLocal(date, to) ?? (initialToIso || null),
    [date, to, initialToIso],
  );

  const setRange = (f: string, t: string) => {
    setFrom(f);
    setTo(t);
  };

  const blockChips = useMemo(() => {
    return (reportCandidateBlocks || [])
      .filter((b) => b?.startAt && b?.endAt)
      .slice(0, 12)
      .map((b) => ({
        id: b.id,
        from: isoToHm(b.startAt),
        to: isoToHm(b.endAt),
        label:
          (b as any).primaryTargetLabel ||
          (b as any).targetLabel ||
          (b as any).title ||
          b.kind ||
          'Block',
      }));
  }, [reportCandidateBlocks]);

  return (
    <div className="space-y-3">
      {/* Filterrad */}
      <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-muted-foreground">Från</label>
            <Input
              type="time"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8 w-28 text-xs"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-muted-foreground">Till</label>
            <Input
              type="time"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-8 w-28 text-xs"
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => setRange('', '')}
            disabled={!from && !to}
          >
            Rensa
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="text-[11px] text-muted-foreground self-center mr-1">Snabbval:</span>
          {[
            { label: 'Hela dagen', f: '', t: '' },
            { label: 'Förmiddag 06–12', f: '06:00', t: '12:00' },
            { label: 'Eftermiddag 12–18', f: '12:00', t: '18:00' },
            { label: 'Kväll 18–24', f: '18:00', t: '23:59' },
          ].map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setRange(p.f, p.t)}
              className="rounded-md border border-border/60 bg-background px-2 py-0.5 text-[11px] hover:bg-accent"
            >
              {p.label}
            </button>
          ))}
        </div>

        {blockChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[11px] text-muted-foreground self-center mr-1">Block:</span>
            {blockChips.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setRange(c.from, c.to)}
                className="rounded-md border border-border/60 bg-background px-2 py-0.5 text-[11px] hover:bg-accent"
                title={c.label}
              >
                <span className="font-mono tabular-nums">{c.from}–{c.to}</span>
                <span className="text-muted-foreground"> · {c.label}</span>
              </button>
            ))}
          </div>
        )}

        {(from || to) && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[11px]">
              Fönster: {from || '00:00'} – {to || '23:59'}
            </Badge>
          </div>
        )}
      </div>

      {/* Karta */}
      <StaffMovementMap
        staffId={staffId}
        date={date}
        fromIso={fromIso}
        toIso={toIso}
        className="h-[520px]"
      />

      <p className="text-[11px] text-muted-foreground">
        Kartan visar alla GPS-pings för dagen, filtrerade av tidsfönstret. Grön markör = första
        ping i fönstret, röd = sista. Historiken kan vara rensad ~7 dagar efter att tidrapporten
        godkänts.
      </p>
    </div>
  );
};

export default DecisionMapTab;
