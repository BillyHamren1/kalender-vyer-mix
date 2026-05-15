/**
 * DisplayTimelineV2Card — Lager 4.5 read-only förhandsvisning.
 *
 * Renderar Lager 4 Display Timeline från `get-staff-presence-day`:
 *   - Header (datum, status, total arbetstid)
 *   - Lista med display-block (titel, tid, badges för warnings)
 *   - Actions visas men är inaktiva (Lager 5 wirar ihop dem)
 *
 * Komponenten är read-only och får aldrig krascha den vanliga TodayTab-vyn.
 * Vid saknad/fel V2-data returneras `null` (fallback).
 */
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatStockholmHm } from '@/lib/staff/formatStockholmTime';
import { formatHoursMinutes } from '@/utils/formatHours';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import {
  useDisplayTimelineV2,
  type DisplayTimelineV2Block,
  type DisplayTimelineV2Action,
} from '@/hooks/useDisplayTimelineV2';

interface Props {
  /** Datum (YYYY-MM-DD). Default: idag i lokal tid. */
  date?: string;
}

const SEVERITY_DOT: Record<string, string> = {
  normal: 'bg-muted',
  info: 'bg-blue-400',
  warning: 'bg-amber-500',
  needs_user_review: 'bg-destructive',
};

const SEVERITY_BADGE: Record<string, string> = {
  normal: 'bg-muted text-muted-foreground',
  info: 'bg-blue-100 text-blue-900',
  warning: 'bg-amber-100 text-amber-900',
  needs_user_review: 'bg-destructive/10 text-destructive',
};

function blockRange(b: DisplayTimelineV2Block): string {
  return `${formatStockholmHm(b.startAt)}–${formatStockholmHm(b.endAt)}`;
}

const ActionPill: React.FC<{ a: DisplayTimelineV2Action }> = ({ a }) => {
  const tone = a.severity === 'primary'
    ? 'border-primary/40 text-primary'
    : a.severity === 'warning'
      ? 'border-amber-300 text-amber-900'
      : a.severity === 'critical'
        ? 'border-destructive/40 text-destructive'
        : 'border-muted text-muted-foreground';
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled
      title="Tillgängligt i Lager 5"
      className={cn('h-7 px-2 text-xs cursor-not-allowed', tone)}
    >
      {a.label}
      {a.requiresAiValidation && <span className="ml-1 opacity-70">·AI</span>}
      {a.requiresUserNote && <span className="ml-1 opacity-70">·notering</span>}
    </Button>
  );
};

const BlockRow: React.FC<{ block: DisplayTimelineV2Block }> = ({ block }) => {
  const dot = SEVERITY_DOT[block.severity] ?? 'bg-muted';
  return (
    <li className="rounded-xl border border-border/50 bg-background/60 p-3">
      <div className="flex items-start gap-3">
        <span className={cn('mt-1.5 inline-block h-2 w-2 rounded-full shrink-0', dot)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <div className="font-medium text-sm truncate">{block.title}</div>
            <div className="text-xs text-muted-foreground tabular-nums shrink-0">
              {blockRange(block)} · {formatHoursMinutes((block.durationMinutes ?? 0) / 60)}
            </div>
          </div>
          {block.subtitle && (
            <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {block.subtitle}
            </div>
          )}
          {block.humanWarnings?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {block.humanWarnings.map((w, i) => (
                <Badge
                  key={i}
                  variant="secondary"
                  className={cn('text-[10px] font-normal', SEVERITY_BADGE[block.severity] ?? '')}
                >
                  {w}
                </Badge>
              ))}
            </div>
          )}
          {block.actions?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {block.actions.map((a, i) => <ActionPill key={i} a={a} />)}
            </div>
          )}
        </div>
      </div>
    </li>
  );
};

const DisplayTimelineV2Card: React.FC<Props> = ({ date }) => {
  const { effectiveStaffId } = useMobileAuth();
  const today = date ?? new Date().toISOString().slice(0, 10);
  const { data, isLoading, error } = useDisplayTimelineV2({
    staffId: effectiveStaffId,
    date: today,
  });

  // Fallback: rendera ingenting när V2-data saknas eller ett tyst fel inträffat.
  if (!data) {
    if (isLoading) {
      return (
        <div className="rounded-2xl border border-dashed border-border/40 bg-muted/20 p-3 text-xs text-muted-foreground">
          Laddar V2-tidslinje…
        </div>
      );
    }
    return null;
  }

  const totalMin = data.blocks.reduce((s, b) => s + (b.durationMinutes ?? 0), 0);
  const status = data.diagnostics?.warnings?.includes('no_workday_allocation_input')
    ? 'Ingen arbetsdag'
    : data.blocks.length === 0
      ? 'Tom dag'
      : 'Klar för granskning';

  return (
    <section
      className="rounded-2xl border border-border/60 bg-card p-3 space-y-3"
      aria-label="Display Timeline V2 (förhandsvisning)"
    >
      <header className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Dagens översikt · V2 (förhandsvisning)
          </div>
          <div className="text-sm font-semibold">{today}</div>
          <div className="text-xs text-muted-foreground">{status}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Total tid
          </div>
          <div className="text-sm font-semibold tabular-nums">
            {formatHoursMinutes(totalMin / 60)}
          </div>
        </div>
      </header>

      {data.blocks.length === 0 ? (
        <div className="text-xs text-muted-foreground">Inga block för dagen.</div>
      ) : (
        <ul className="space-y-2">
          {data.blocks.map((b) => <BlockRow key={b.id} block={b} />)}
        </ul>
      )}

      {data.dayActions.length > 0 && (
        <div className="pt-1 border-t border-border/40">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
            Dagens åtgärder
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.dayActions.map((a, i) => <ActionPill key={i} a={a} />)}
          </div>
        </div>
      )}

      {error && (
        <div className="text-[10px] text-muted-foreground italic">
          (V2 kunde inte laddas — visar ingen data)
        </div>
      )}
    </section>
  );
};

export default DisplayTimelineV2Card;
