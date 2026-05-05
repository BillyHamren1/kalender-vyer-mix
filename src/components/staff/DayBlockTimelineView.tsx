import React, { useState } from 'react';
import { Building2, ChevronDown, ChevronRight, Car, ArrowRight, HelpCircle, AlertTriangle } from 'lucide-react';
import type { DayBlock, PresenceBlock, JourneyBlock, GapBlock, GapReason } from '@/lib/staff/dayBlockTimeline';

const fmtHm = (iso?: string | null) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('sv-SE', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm',
    });
  } catch { return iso.slice(11, 16); }
};

const fmtDur = (m: number) => {
  if (!m || m < 1) return '0m';
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h}h ${r}m`;
  if (h) return `${h}h`;
  return `${r}m`;
};

/* ------------------------------------------------------------------ */
/*  Shared row primitives                                             */
/* ------------------------------------------------------------------ */

const TimeCell: React.FC<{ startIso: string; endIso?: string | null; durationMin: number; ongoing?: boolean }> = ({ startIso, endIso, durationMin, ongoing }) => {
  const range = endIso && !ongoing
    ? `${fmtHm(startIso)}–${fmtHm(endIso)}`
    : `${fmtHm(startIso)} → pågår`;
  return (
    <div className="flex items-baseline gap-2 tabular-nums">
      <span className="text-sm font-semibold text-foreground">{range}</span>
      <span className="text-xs text-muted-foreground">·</span>
      <span className="text-xs text-muted-foreground">{fmtDur(durationMin)}</span>
    </div>
  );
};

type RowAccent = 'project' | 'location' | 'journey' | 'gap';

const accentDot: Record<RowAccent, string> = {
  project: 'bg-emerald-500',
  location: 'bg-blue-500',
  journey: 'bg-slate-400',
  gap: 'bg-amber-400',
};

const accentBorder: Record<RowAccent, string> = {
  project: 'border-l-emerald-500',
  location: 'border-l-transparent',
  journey: 'border-l-transparent',
  gap: 'border-l-transparent',
};

const accentIconBg: Record<RowAccent, string> = {
  project: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  location: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  journey: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  gap: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

const RowShell: React.FC<{
  accent: RowAccent;
  active?: boolean;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
}> = ({ accent, active, expandable, expanded, onToggle, children }) => {
  return (
    <div
      className={`
        grid grid-cols-[160px_1fr_auto_24px] items-center gap-3
        px-3 py-3
        border-b border-border last:border-b-0
        border-l-4 ${accentBorder[accent]}
        ${active ? 'bg-emerald-50/40 dark:bg-emerald-950/15' : ''}
        ${expandable ? 'cursor-pointer hover:bg-muted/40' : ''}
        transition-colors
      `}
      onClick={expandable ? onToggle : undefined}
      role={expandable ? 'button' : undefined}
      tabIndex={expandable ? 0 : undefined}
    >
      {children}
      <div className="flex justify-end text-muted-foreground">
        {expandable
          ? (expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)
          : <span className="w-4" />}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Inner technical events                                            */
/* ------------------------------------------------------------------ */

const InnerEvents: React.FC<{ block: DayBlock }> = ({ block }) => {
  if (block.innerEvents.length === 0) return null;
  return (
    <div className="bg-muted/30 border-b border-border px-3 py-2 pl-[180px]">
      <ul className="space-y-0.5 text-[11px] text-muted-foreground">
        {[...block.innerEvents]
          .sort((a, b) => a.at.localeCompare(b.at))
          .map(e => (
            <li key={e.id} className="flex gap-2">
              <span className="tabular-nums shrink-0 w-12">{fmtHm(e.at)}</span>
              <span className="opacity-60 shrink-0 min-w-[120px]">{e.kind}</span>
              <span className="truncate">{typeof e.label === 'string' ? e.label : ''}</span>
            </li>
          ))}
      </ul>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  PresenceRow (PÅ PLATS / PÅ PROJEKT)                               */
/* ------------------------------------------------------------------ */

const PresenceRow: React.FC<{ block: PresenceBlock }> = ({ block }) => {
  const [open, setOpen] = useState(false);
  const isProject = block.presenceKind === 'project';
  const accent: RowAccent = isProject ? 'project' : 'location';

  const chipLabel = isProject
    ? (block.ongoing ? 'PÅ PROJEKT' : 'PÅ PROJEKT')
    : block.strength === 'short_stop' ? 'KORT STOPP'
    : block.strength === 'time_report_window' ? 'TIDRAPPORT'
    : 'PÅ PLATS';

  const chipClass = isProject
    ? 'bg-emerald-600 text-white'
    : block.strength === 'short_stop'
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
      : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200';

  const statusPillLabel = isProject
    ? 'På projekt'
    : block.strength === 'short_stop' ? 'Kort stopp'
    : 'Vistelse';

  const statusPillClass = isProject
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800'
    : block.strength === 'short_stop'
      ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800'
      : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800';

  const contextBits = [
    fmtDur(block.durationMin),
    isProject ? 'projekt' : 'arbete / vistelse',
    block.timer.present ? (block.timer.active ? `timer aktiv sedan ${fmtHm(block.timer.startedIso)}` : `timer ${fmtHm(block.timer.startedIso)}–${fmtHm(block.timer.stoppedIso)}`) : null,
  ].filter(Boolean) as string[];

  return (
    <>
      <RowShell
        accent={accent}
        active={isProject && block.ongoing}
        expandable={block.innerEvents.length > 0}
        expanded={open}
        onToggle={() => setOpen(o => !o)}
      >
        {/* TID */}
        <TimeCell startIso={block.startIso} endIso={block.endIso} durationMin={block.durationMin} ongoing={block.ongoing} />

        {/* HÄNDELSE */}
        <div className="flex items-center gap-3 min-w-0">
          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${accentDot[accent]}`} />
          <span className={`flex items-center justify-center h-8 w-8 rounded-full shrink-0 ${accentIconBg[accent]}`}>
            <Building2 className="h-4 w-4" />
          </span>
          <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded shrink-0 ${chipClass}`}>
            {chipLabel}
          </span>
          <div className="flex items-center gap-2 min-w-0 text-sm">
            <span className="font-semibold text-foreground truncate">{block.title}</span>
            {contextBits.map((b, i) => (
              <React.Fragment key={i}>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground truncate">{b}</span>
              </React.Fragment>
            ))}
            {block.requiresReview && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-3 w-3" /> granska
                </span>
              </>
            )}
          </div>
        </div>

        {/* STATUS */}
        <div className="flex items-center">
          <span className={`text-xs px-2.5 py-1 rounded-full border ${statusPillClass}`}>
            {statusPillLabel}
          </span>
        </div>
      </RowShell>
      {open && <InnerEvents block={block} />}
    </>
  );
};

/* ------------------------------------------------------------------ */
/*  JourneyRow (FÖRFLYTTNING)                                         */
/* ------------------------------------------------------------------ */

const JourneyRow: React.FC<{ block: JourneyBlock }> = ({ block }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <RowShell
        accent="journey"
        expandable={block.innerEvents.length > 0}
        expanded={open}
        onToggle={() => setOpen(o => !o)}
      >
        {/* TID */}
        <TimeCell startIso={block.startIso} endIso={block.endIso} durationMin={block.durationMin} />

        {/* HÄNDELSE */}
        <div className="flex items-center gap-3 min-w-0">
          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${accentDot.journey}`} />
          <span className={`flex items-center justify-center h-8 w-8 rounded-full shrink-0 ${accentIconBg.journey}`}>
            <Car className="h-4 w-4" />
          </span>
          <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded shrink-0 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            FÖRFLYTTNING
          </span>
          <div className="flex items-center gap-2 min-w-0 text-sm">
            <span className="text-muted-foreground">Från:</span>
            <span className="font-medium text-foreground truncate">{block.fromLabel ?? 'okänd plats'}</span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Till:</span>
            <span className="font-medium text-foreground truncate">{block.toLabel ?? 'okänd plats'}</span>
          </div>
        </div>

        {/* STATUS */}
        <div className="flex items-center">
          <span className={`text-xs px-2.5 py-1 rounded-full border ${
            block.uncertain
              ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800'
              : 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-700'
          }`}>
            {block.uncertain ? 'Möjlig' : 'Förflyttning'}
          </span>
        </div>
      </RowShell>
      {open && <InnerEvents block={block} />}
    </>
  );
};

/* ------------------------------------------------------------------ */
/*  GapRow                                                            */
/* ------------------------------------------------------------------ */

const GAP_REASON_LABEL: Record<GapReason, string> = {
  no_visit_generated: 'Ingen vistelse genererades',
  filtered_as_too_short: 'För kort — filtrerades bort',
  swallowed_by_travel: 'Slukat av förflyttning',
  target_unknown: 'Okänd destination',
  merged_into_previous: 'Slogs ihop med föregående',
  raw_only_only: 'Endast tekniska events',
  no_signal: 'Ingen GPS-signal',
};

const GapRow: React.FC<{ block: GapBlock }> = ({ block }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <RowShell
        accent="gap"
        expandable={block.innerEvents.length > 0}
        expanded={open}
        onToggle={() => setOpen(o => !o)}
      >
        <TimeCell startIso={block.startIso} endIso={block.endIso} durationMin={block.durationMin} />

        <div className="flex items-center gap-3 min-w-0">
          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${accentDot.gap}`} />
          <span className={`flex items-center justify-center h-8 w-8 rounded-full shrink-0 ${accentIconBg.gap}`}>
            <HelpCircle className="h-4 w-4" />
          </span>
          <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded shrink-0 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            VISTELSE SAKNAS
          </span>
          <div className="flex items-center gap-2 min-w-0 text-sm">
            <span className="font-medium text-foreground truncate">
              {block.expectedLabel ?? 'Plats okänd'}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground truncate">{GAP_REASON_LABEL[block.reason]}</span>
          </div>
        </div>

        <div className="flex items-center">
          <span className="text-xs px-2.5 py-1 rounded-full border bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800">
            Granska
          </span>
        </div>
      </RowShell>
      {open && <InnerEvents block={block} />}
    </>
  );
};

/* ------------------------------------------------------------------ */
/*  Main export                                                       */
/* ------------------------------------------------------------------ */

export const DayBlockTimeline: React.FC<{ blocks: DayBlock[] }> = ({ blocks }) => {
  if (blocks.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic py-4 text-center">
        Inga händelser registrerade för dagen.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[160px_1fr_auto_24px] items-center gap-3 px-3 py-2 bg-muted/40 border-b border-border text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        <div className="pl-1">Tid</div>
        <div>Händelse</div>
        <div>Status</div>
        <div />
      </div>
      {blocks.map(b =>
        b.kind === 'presence' ? <PresenceRow key={b.id} block={b} />
        : b.kind === 'journey' ? <JourneyRow key={b.id} block={b} />
        : <GapRow key={b.id} block={b} />
      )}
    </div>
  );
};

export default DayBlockTimeline;
