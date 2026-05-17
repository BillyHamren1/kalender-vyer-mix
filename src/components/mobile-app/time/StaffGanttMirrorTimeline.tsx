/**
 * StaffGanttMirrorTimeline — mobil-tidslinje som speglar admin-Gantten
 * (`/staff-management/time-reports`) bit-för-bit för inloggad personal+datum.
 *
 * Renderar samma GanttBlock[] (samma källval, fas-färgning, absorberade
 * chips, rubriker/tider) som admin — bara staplat vertikalt istället för
 * horisontellt.
 */
import React from 'react';
import { Loader2, Sun, Wrench, Plane, AlertTriangle, Package, Map, Coffee, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatStockholmHm } from '@/lib/staff/formatStockholmTime';
import { formatHoursMinutes } from '@/utils/formatHours';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useStaffGanttMirror } from '@/hooks/useStaffGanttMirror';
import type { GanttKind, MirrorGanttBlock } from '@/lib/staff/buildStaffGanttMirrorBlocks';

interface Props {
  date?: string;
}

const KIND_META: Record<GanttKind, {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone: string;
  badgeTone: string;
}> = {
  work:       { Icon: Building2,     label: 'Arbete',    tone: 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-900', badgeTone: 'bg-emerald-100 text-emerald-900' },
  rig:        { Icon: Wrench,        label: 'Rigg',      tone: 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-900', badgeTone: 'bg-emerald-100 text-emerald-900' },
  rigdown:    { Icon: Wrench,        label: 'Rigdown',   tone: 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-900',           badgeTone: 'bg-amber-100 text-amber-900' },
  warehouse:  { Icon: Package,       label: 'Lager',     tone: 'bg-violet-50 border-violet-200 text-violet-900 dark:bg-violet-950/40 dark:border-violet-900',     badgeTone: 'bg-violet-100 text-violet-900' },
  transport:  { Icon: Plane,         label: 'Transport', tone: 'bg-sky-50 border-sky-200 text-sky-900 dark:bg-sky-950/40 dark:border-sky-900',                    badgeTone: 'bg-sky-100 text-sky-900' },
  review:     { Icon: AlertTriangle, label: 'Granska',   tone: 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-900',          badgeTone: 'bg-amber-100 text-amber-900' },
  unknown:    { Icon: Map,           label: 'Okänd',     tone: 'bg-muted/40 border-border text-muted-foreground',                                                 badgeTone: 'bg-muted text-muted-foreground' },
  break:      { Icon: Coffee,        label: 'Rast',      tone: 'bg-muted/30 border-border text-muted-foreground',                                                 badgeTone: 'bg-muted text-muted-foreground' },
  pre_work:   { Icon: Sun,           label: 'Före dag',  tone: 'bg-muted/30 border-border text-muted-foreground',                                                 badgeTone: 'bg-muted text-muted-foreground' },
};

function blockTimeRange(b: MirrorGanttBlock): string {
  return `${formatStockholmHm(b.startAt)}–${formatStockholmHm(b.endAt)}`;
}

const BlockRow: React.FC<{ block: MirrorGanttBlock; isLast: boolean }> = ({ block, isLast }) => {
  const meta = KIND_META[block.kind] ?? KIND_META.unknown;
  const Icon = meta.Icon;
  const minutes = block.countedDurationMinutes ?? block.durationMinutes;
  const isNight = block.isNightGpsOnly === true;

  return (
    <li className={cn(
      'rounded-xl border px-3 py-2.5 flex items-start gap-3',
      meta.tone,
      isNight && 'opacity-60',
    )}>
      <div className="shrink-0 mt-0.5">
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <div className="font-semibold text-sm truncate">{block.title}</div>
          <div className="text-[11px] tabular-nums opacity-80 shrink-0">
            {blockTimeRange(block)}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide', meta.badgeTone)}>
            {meta.label}
          </span>
          <span className="text-[11px] opacity-70 tabular-nums">
            {formatHoursMinutes(minutes / 60)}
          </span>
          {block.plannedBadgeLabel && (
            <span className="text-[10px] rounded bg-background/60 border border-border px-1.5 py-0.5 opacity-80">
              Planerat: {block.plannedBadgeLabel}
            </span>
          )}
        </div>
        {block.subtitle && (
          <div className="text-[11px] opacity-70 mt-0.5 line-clamp-1">{block.subtitle}</div>
        )}
        {block.attachedChips && block.attachedChips.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {block.attachedChips.map((chip, i) => (
              <span key={i} className="text-[10px] rounded-full bg-background/70 border border-border px-1.5 py-0.5 opacity-85">
                {chip}
              </span>
            ))}
          </div>
        )}
      </div>
    </li>
  );
};

export const StaffGanttMirrorTimeline: React.FC<Props> = ({ date }) => {
  const { effectiveStaffId, staff } = useMobileAuth();
  const dateStr = date ?? new Date().toISOString().slice(0, 10);

  const { blocks, isLoading, error } = useStaffGanttMirror({
    staffId: effectiveStaffId,
    date: dateStr,
    staffName: staff?.name ?? null,
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-3 shadow-sm space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Dagens tidslinje
        </p>
        {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
      </div>

      {error && (
        <div className="text-xs text-destructive italic">
          Kunde inte hämta tidslinjen ({error.message}).
        </div>
      )}

      {!isLoading && blocks.length === 0 && !error && (
        <div className="text-xs text-muted-foreground italic">
          Inga händelser registrerade ännu för dagen.
        </div>
      )}

      {blocks.length > 0 && (
        <ul className="space-y-1.5">
          {blocks.map((b, i) => (
            <BlockRow key={b.id} block={b} isLast={i === blocks.length - 1} />
          ))}
        </ul>
      )}
    </section>
  );
};

export default StaffGanttMirrorTimeline;
