/**
 * SegmentDetailSheet — visar ALL data för EN tidslinje-rad (block).
 *
 * Klick på ett kort i tidrapport- eller idag-vyn öppnar denna sheet med:
 *   - Tider, plats/projekt, kind, status, varaktighet
 *   - Confidence + ev. warningLabel
 *   - GPS-pings + karta i samma tidsfönster (StaffPingDetailPanel)
 *
 * Sanningsregel: läser bara fält från `StaffDaySegment` som backend redan
 * skickar. Re-räknar inget. Pings hämtas via samma cache som ops-vyn
 * (`useStaffPingsForDay`) — ingen ny pipeline.
 */
import React from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Clock, MapPin, ShieldCheck, AlertTriangle } from 'lucide-react';
import type { StaffDaySegment } from '@/hooks/useStaffDaySnapshot';
import { formatStockholmHm } from '@/lib/staff/formatStockholmTime';
import { formatHoursMinutes } from '@/utils/formatHours';
import { cn } from '@/lib/utils';
import {
  SEG_ICON, SEG_TONE, SEG_KIND_LABEL, FallbackSegIcon,
} from './segmentVisuals';
import { StaffPingDetailPanel } from '@/components/staff/StaffPingDetailPanel';

interface Props {
  segment: StaffDaySegment | null;
  /** YYYY-MM-DD that the segment belongs to (used for the GPS query). */
  date: string | null;
  /** effectiveStaffId (admin "view as" aware). */
  staffId: string | null;
  staffName?: string | null;
  onClose: () => void;
}

function rangeLabel(s: StaffDaySegment): string {
  const start = formatStockholmHm(s.startedAt);
  if (s.isActive || !s.endedAt) return `${start} – pågår`;
  return `${start} – ${formatStockholmHm(s.endedAt)}`;
}

function confidenceLabel(c: StaffDaySegment['confidence'] | null | undefined) {
  if (c === 'high') return { label: 'Hög träffsäkerhet', tone: 'emerald' as const };
  if (c === 'low') return { label: 'Låg träffsäkerhet', tone: 'amber' as const };
  if (c === 'medium') return { label: 'Medel träffsäkerhet', tone: 'muted' as const };
  return null;
}

const Row: React.FC<{ label: string; value: React.ReactNode; mono?: boolean }> =
  ({ label, value, mono }) => (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-border/40 last:border-b-0">
      <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className={cn('text-sm font-semibold text-foreground text-right', mono && 'tabular-nums')}>
        {value}
      </span>
    </div>
  );

export const SegmentDetailSheet: React.FC<Props> = ({
  segment, date, staffId, staffName, onClose,
}) => {
  const open = !!segment;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[92vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="text-base flex items-center gap-2 min-w-0">
            <SegmentTitleIcon segment={segment} />
            <span className="truncate">{segment?.label ?? 'Block'}</span>
          </SheetTitle>
          <SheetDescription className="sr-only">Detaljer för tidslinjeblocket</SheetDescription>
        </SheetHeader>

        {!segment ? null : (
          <Body
            segment={segment}
            date={date}
            staffId={staffId}
            staffName={staffName ?? null}
          />
        )}
      </SheetContent>
    </Sheet>
  );
};

const SegmentTitleIcon: React.FC<{ segment: StaffDaySegment | null }> = ({ segment }) => {
  if (!segment) return null;
  const Icon = SEG_ICON[segment.kind] ?? FallbackSegIcon;
  return (
    <span className={cn('shrink-0 w-8 h-8 rounded-lg flex items-center justify-center', SEG_TONE[segment.kind])}>
      <Icon className="w-4 h-4" />
    </span>
  );
};

const Body: React.FC<{
  segment: StaffDaySegment;
  date: string | null;
  staffId: string | null;
  staffName: string | null;
}> = ({ segment, date, staffId, staffName }) => {
  const conf = confidenceLabel(segment.confidence);
  const status = segment.statusLabel;
  const warn = segment.warningLabel;
  const kindLabel = SEG_KIND_LABEL[segment.kind] ?? '';
  const isActive = !!segment.isActive || !segment.endedAt;

  return (
    <div className="space-y-4 mt-3 pb-6">
      {/* Översikt */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className={cn(
            'inline-block px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide',
            SEG_TONE[segment.kind],
          )}>
            {kindLabel}
          </span>
          {status && (
            <span className="inline-block px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-muted text-muted-foreground">
              {status}
            </span>
          )}
          {isActive && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-primary/15 text-primary">
              <ShieldCheck className="w-3 h-3" /> Pågår
            </span>
          )}
          {conf && (
            <span className={cn(
              'inline-block px-1.5 py-0.5 rounded-md text-[10px] font-semibold border',
              conf.tone === 'emerald' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
              conf.tone === 'amber' && 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
              conf.tone === 'muted' && 'bg-muted text-muted-foreground border-border',
            )}>
              {conf.label}
            </span>
          )}
        </div>

        <Row
          label="Tid"
          mono
          value={
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              {rangeLabel(segment)}
            </span>
          }
        />
        <Row
          label="Längd"
          mono
          value={formatHoursMinutes((segment.durationMinutes ?? 0) / 60)}
        />
        <Row label="Typ" value={kindLabel} />
        {segment.label && <Row label="Plats / projekt" value={segment.label} />}
        {segment.source && (
          <Row label="Källa" value={<span className="text-xs text-muted-foreground">{segment.source}</span>} />
        )}
      </section>

      {/* Varning */}
      {warn && (
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[12px] text-amber-800 dark:text-amber-300 font-semibold">
            {warn}
          </p>
        </section>
      )}

      {/* GPS + karta */}
      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-4 pt-3 pb-2 flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <MapPin className="w-3 h-3" /> GPS-pings i blocket
          </p>
        </div>
        {staffId && date ? (
          <StaffPingDetailPanel
            staffId={staffId}
            staffName={staffName ?? ''}
            date={date}
            fromIso={segment.startedAt}
            toIso={segment.endedAt ?? null}
          />
        ) : (
          <p className="px-4 pb-4 text-xs text-muted-foreground">
            GPS kräver inloggad personal.
          </p>
        )}
      </section>
    </div>
  );
};

export default SegmentDetailSheet;
