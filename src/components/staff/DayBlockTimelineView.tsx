import React, { useState } from 'react';
import { Briefcase, ChevronDown, ChevronRight, Clock, MapPin, Move, AlertTriangle, Activity, HelpCircle, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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

const Inner: React.FC<{ block: DayBlock }> = ({ block }) => {
  const [open, setOpen] = useState(false);
  if (block.innerEvents.length === 0) return null;
  return (
    <div className="mt-2 border-t pt-1.5">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {block.innerEvents.length} tekniska händelser
      </button>
      {open && (
        <ul className="mt-1.5 space-y-0.5 pl-4 border-l text-[11px] text-muted-foreground">
          {[...block.innerEvents]
            .sort((a, b) => a.at.localeCompare(b.at))
            .map(e => (
              <li key={e.id} className="flex gap-2">
                <span className="tabular-nums shrink-0">{fmtHm(e.at)}</span>
                <span className="truncate">
                  <span className="opacity-60">{e.kind}</span>
                  {' · '}
                  {typeof e.label === 'string' ? e.label : ''}
                </span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
};

const PresenceRow: React.FC<{ block: PresenceBlock }> = ({ block }) => {
  const range = block.endIso && !block.ongoing
    ? `${fmtHm(block.startIso)}–${fmtHm(block.endIso)}`
    : `${fmtHm(block.startIso)} → pågår`;

  const tone =
    block.strength === 'project'
      ? (block.ongoing
          ? 'border-emerald-500/60 bg-emerald-50/60 dark:bg-emerald-950/20'
          : 'border-primary/40 bg-primary/5')
      : block.strength === 'strong_visit'
        ? 'border-slate-300 bg-card'
        : block.strength === 'possible_visit'
          ? 'border-slate-200 bg-card'
          : block.strength === 'time_report_window'
            ? 'border-dashed border-blue-400/60 bg-blue-50/40 dark:bg-blue-950/20'
            : block.strength === 'inferred_between_journeys'
              ? 'border-dashed border-amber-400/60 bg-amber-50/30 dark:bg-amber-950/10'
              : 'border-amber-400/50 bg-amber-50/40 dark:bg-amber-950/10';

  const chipLabel =
    block.strength === 'project' ? (block.ongoing ? 'PÅ PROJEKT NU' : 'PÅ PROJEKT')
    : block.strength === 'strong_visit' ? 'Vistelse'
    : block.strength === 'possible_visit' ? 'Möjlig vistelse'
    : block.strength === 'time_report_window' ? 'Tidrapport-vistelse'
    : block.strength === 'inferred_between_journeys' ? 'Härledd vistelse'
    : 'Kort stopp';

  const chipClass =
    block.strength === 'project'
      ? 'bg-emerald-600 text-white hover:bg-emerald-600'
      : block.strength === 'time_report_window'
        ? 'border-blue-400 text-blue-900 dark:text-blue-100'
        : block.strength === 'short_stop'
          ? 'border-amber-400 text-amber-900 dark:text-amber-100'
          : '';

  return (
    <div className={`rounded-lg border-2 ${tone} px-3 py-2.5 shadow-sm`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="tabular-nums text-xs text-muted-foreground font-medium shrink-0">
            {range}
          </span>
          <Badge variant={block.strength === 'project' ? 'default' : 'outline'} className={`text-[10px] uppercase tracking-wider font-bold ${chipClass}`}>
            {block.isProject && <Briefcase className="h-3 w-3 mr-1" />}
            {chipLabel}
          </Badge>
          {block.requiresReview && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-amber-400 text-amber-700 dark:text-amber-300">
              Kräver granskning
            </Badge>
          )}
        </div>
        {block.requiresReview && <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />}
      </div>
      <div className="text-sm font-semibold text-foreground leading-tight truncate">
        {block.title}
      </div>
      {block.subtitle && (
        <div className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
          <MapPin className="h-3 w-3 shrink-0" />
          {block.subtitle}
        </div>
      )}
      <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
        <span className="inline-flex items-center gap-1 tabular-nums">
          <Clock className="h-3 w-3" />
          {fmtDur(block.durationMin)}
        </span>
        {block.timer.present && (
          <span className="inline-flex items-center gap-1">
            <Activity className="h-3 w-3" />
            {block.timer.active ? 'timer aktiv' : `timer ${fmtHm(block.timer.startedIso)}–${fmtHm(block.timer.stoppedIso)}`}
          </span>
        )}
        {block.ongoing && block.lastPingIso && (
          <span className="inline-flex items-center gap-1 tabular-nums">
            senaste GPS {fmtHm(block.lastPingIso)}
          </span>
        )}
      </div>
      <Inner block={block} />
    </div>
  );
};

const JourneyRow: React.FC<{ block: JourneyBlock }> = ({ block }) => {
  const range = `${fmtHm(block.startIso)}–${fmtHm(block.endIso)}`;
  const tone = block.uncertain
    ? 'border-amber-400/40 bg-amber-50/30 dark:bg-amber-950/10'
    : 'border-slate-200 bg-card/60';
  return (
    <div className={`rounded-lg border ${tone} px-3 py-2`}>
      <div className="flex items-center gap-2 mb-0.5">
        <span className="tabular-nums text-xs text-muted-foreground font-medium shrink-0">
          {range}
        </span>
        <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
          <Move className="h-3 w-3 mr-1" />
          {block.uncertain ? 'Möjlig förflyttning' : 'Förflyttning'}
        </Badge>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {fmtDur(block.durationMin)}
        </span>
      </div>
      <div className="text-sm font-medium text-foreground truncate">
        {block.fromLabel ?? 'okänd plats'} <span className="opacity-60">→</span> {block.toLabel ?? 'okänd plats'}
      </div>
      <Inner block={block} />
    </div>
  );
};

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
  const range = `${fmtHm(block.startIso)}–${fmtHm(block.endIso)}`;
  return (
    <div className="rounded-lg border border-dashed border-amber-400/60 bg-amber-50/30 dark:bg-amber-950/10 px-3 py-2">
      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
        <span className="tabular-nums text-xs text-muted-foreground font-medium shrink-0">{range}</span>
        <Badge variant="outline" className="text-[10px] uppercase tracking-wider border-amber-400 text-amber-800 dark:text-amber-200">
          <HelpCircle className="h-3 w-3 mr-1" />
          Vistelse saknas
        </Badge>
        <span className="text-[11px] text-muted-foreground tabular-nums">{fmtDur(block.durationMin)}</span>
        <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-amber-300 text-amber-700 dark:text-amber-300">
          {GAP_REASON_LABEL[block.reason]}
        </Badge>
      </div>
      <div className="text-sm text-foreground">
        {block.expectedLabel ? <>Förväntad: <span className="font-medium">{block.expectedLabel}</span></> : 'Plats okänd'}
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{block.explanation}</div>
      {block.innerEvents.length > 0 && (
        <div className="mt-1.5 border-t pt-1.5">
          <Inner block={block as unknown as DayBlock} />
        </div>
      )}
    </div>
  );
};

export const DayBlockTimeline: React.FC<{ blocks: DayBlock[] }> = ({ blocks }) => {
  if (blocks.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic py-2">
        Inga händelser registrerade för dagen.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {blocks.map(b =>
        b.kind === 'presence' ? <PresenceRow key={b.id} block={b} />
        : b.kind === 'journey' ? <JourneyRow key={b.id} block={b} />
        : <GapRow key={b.id} block={b} />
      )}
    </div>
  );
};

export default DayBlockTimeline;
