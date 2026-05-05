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

/**
 * Härled en säker label för en endpoint (presence eller journey).
 * Huvudvyn får ALDRIG visa "okänd plats" ensam — vi mappar alltid
 * lookupStatus + lat/lng till en meningsfull text.
 */
const safePlaceLabel = (
  place?: { label?: string | null; lat?: number | null; lng?: number | null; lookupStatus?: string } | null,
  fallback?: string | null,
): string => {
  const raw = (place?.label ?? fallback ?? '').trim();
  const isUnknownOnly = !raw || /^okänd plats$/i.test(raw);
  if (!isUnknownOnly) return raw;
  const status = place?.lookupStatus;
  const hasCoord = place?.lat != null && place?.lng != null;
  if (status === 'failed') return 'Okänd plats – adress kunde inte hämtas';
  if (status === 'pending') return 'Slår upp adress…';
  if (hasCoord) return 'Slår upp adress…';
  return 'Okänd plats – saknar koordinat';
};

/* ------------------------------------------------------------------ */
/*  Shared row primitives — kompakta rader (~34–40px höga)            */
/* ------------------------------------------------------------------ */

const GRID = 'grid grid-cols-[190px_minmax(0,1fr)_110px_20px] items-center gap-2';

const TimeCell: React.FC<{ startIso: string; endIso?: string | null; durationMin: number; ongoing?: boolean }> = ({ startIso, endIso, durationMin, ongoing }) => {
  const range = endIso && !ongoing
    ? `${fmtHm(startIso)}–${fmtHm(endIso)}`
    : `${fmtHm(startIso)} → pågår`;
  // Alltid en rad: "06:51–07:33 · 42m"
  return (
    <div className="text-xs tabular-nums whitespace-nowrap truncate">
      <span className="font-semibold text-foreground">{range}</span>
      <span className="text-muted-foreground"> · {fmtDur(durationMin)}</span>
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
        ${GRID}
        px-2.5 py-1
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
          ? (expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />)
          : <span className="w-3.5" />}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Inner technical events + extra badges (expand)                    */
/* ------------------------------------------------------------------ */

const badgeClass = (tone: 'ok' | 'warn' | 'info' | 'planned' | 'review') => {
  switch (tone) {
    case 'ok': return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800';
    case 'warn': return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800';
    case 'review': return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800';
    case 'planned': return 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-800';
    case 'info':
    default: return 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-700';
  }
};

const ExtraBadges: React.FC<{ badges: { label: string; tone: Parameters<typeof badgeClass>[0] }[] }> = ({ badges }) => {
  if (badges.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 px-3 pb-1.5 pt-0.5 pl-[200px]">
      {badges.map((b, i) => (
        <span key={i} className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full border ${badgeClass(b.tone)}`}>
          {b.label}
        </span>
      ))}
    </div>
  );
};

const InnerEvents: React.FC<{ block: DayBlock }> = ({ block }) => {
  if (block.innerEvents.length === 0) return null;
  return (
    <div className="bg-muted/30 border-b border-border px-3 py-1.5 pl-[200px]">
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
/*  PresenceRow                                                       */
/* ------------------------------------------------------------------ */

type StatusBadge = { label: string; tone: 'ok' | 'warn' | 'info' | 'planned' | 'review' };

const PresenceRow: React.FC<{ block: PresenceBlock }> = ({ block }) => {
  const [open, setOpen] = useState(false);
  const isProject = block.presenceKind === 'project';
  const accent: RowAccent = isProject ? 'project' : 'location';

  // Bygg alla badges
  const badges: StatusBadge[] = [];
  if (isProject) {
    if (block.timer.active) badges.push({ label: 'TIMER AKTIV', tone: 'ok' });
    else if (!block.timer.present && !block.timeReport.present) badges.push({ label: 'TIMER SAKNAS', tone: 'warn' });
    if (!block.timeReport.present && !block.timer.present) badges.push({ label: 'ARBETSDAG SAKNAS', tone: 'warn' });
    if (block.plannedStartIso) badges.push({ label: 'PLANERAD', tone: 'planned' });
    else if (block.sources.gpsVisit || block.arrivalIso) badges.push({ label: 'OPLANERAD', tone: 'info' });
    if (block.sources.gpsVisit || block.arrivalIso) badges.push({ label: 'GPS', tone: 'info' });
  }
  if (block.requiresReview) badges.push({ label: 'GRANSKA', tone: 'review' });

  // Default-status om inga badges
  if (badges.length === 0) {
    badges.push({ label: isProject ? 'PÅ PROJEKT' : block.strength === 'short_stop' ? 'KORT STOPP' : 'VISTELSE', tone: 'info' });
  }

  // Max 1 huvudbadge i raden, övriga visas i expand
  const headBadge = badges[0];
  const extraBadges = badges.slice(1);

  // Kompakt subtitle — endast viktigaste signalen
  const subtitle = isProject
    ? (block.timer.active
        ? `timer sedan ${fmtHm(block.timer.startedIso)}`
        : block.timeReport.present
          ? `tidrapport ${fmtHm(block.timeReport.startedIso)}${block.timeReport.closedIso ? `–${fmtHm(block.timeReport.closedIso)}` : ''}`
          : block.arrivalIso
            ? `GPS ${fmtHm(block.arrivalIso)}${block.departureIso ? `–${fmtHm(block.departureIso)}` : ''}`
            : 'projekt')
    : block.subtitle ?? '';

  const expandable = block.innerEvents.length > 0 || extraBadges.length > 0;

  return (
    <>
      <RowShell
        accent={accent}
        active={isProject && block.ongoing}
        expandable={expandable}
        expanded={open}
        onToggle={() => setOpen(o => !o)}
      >
        <TimeCell startIso={block.startIso} endIso={block.endIso} durationMin={block.durationMin} ongoing={block.ongoing} />

        {/* HÄNDELSE — en rad, inga wraps */}
        <div className="flex items-center gap-2 min-w-0 text-xs whitespace-nowrap">
          <span className={`h-2 w-2 rounded-full shrink-0 ${accentDot[accent]}`} />
          <span className={`flex items-center justify-center h-6 w-6 rounded-full shrink-0 ${accentIconBg[accent]}`}>
            <Building2 className="h-3.5 w-3.5" />
          </span>
          <span className="font-semibold text-foreground truncate">{block.resolvedPlace?.label ?? block.title}</span>
          {subtitle && (
            <>
              <span className="text-muted-foreground shrink-0">·</span>
              <span className="text-muted-foreground truncate">{subtitle}</span>
            </>
          )}
          {block.requiresReview && (
            <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
          )}
        </div>

        {/* STATUS — exakt 1 badge, ingen wrap */}
        <div className="flex items-center justify-end overflow-hidden">
          <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full border whitespace-nowrap truncate ${badgeClass(headBadge.tone)}`}>
            {headBadge.label}
          </span>
        </div>
      </RowShell>
      {open && (
        <>
          <ExtraBadges badges={extraBadges} />
          <InnerEvents block={block} />
        </>
      )}
    </>
  );
};

/* ------------------------------------------------------------------ */
/*  JourneyRow                                                        */
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
        <TimeCell startIso={block.startIso} endIso={block.endIso} durationMin={block.durationMin} />

        <div className="flex items-center gap-2 min-w-0 text-xs whitespace-nowrap">
          <span className={`h-2 w-2 rounded-full shrink-0 ${accentDot.journey}`} />
          <span className={`flex items-center justify-center h-6 w-6 rounded-full shrink-0 ${accentIconBg.journey}`}>
            <Car className="h-3.5 w-3.5" />
          </span>
          <span className="font-medium text-foreground truncate">{block.fromPlace?.label ?? block.fromLabel ?? 'okänd plats'}</span>
          <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="font-medium text-foreground truncate">{block.toPlace?.label ?? block.toLabel ?? 'okänd plats'}</span>
        </div>

        <div className="flex items-center justify-end overflow-hidden">
          <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full border whitespace-nowrap ${
            block.uncertain ? badgeClass('review') : badgeClass('info')
          }`}>
            {block.uncertain ? 'MÖJLIG' : 'RESA'}
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

        <div className="flex items-center gap-2 min-w-0 text-xs whitespace-nowrap">
          <span className={`h-2 w-2 rounded-full shrink-0 ${accentDot.gap}`} />
          <span className={`flex items-center justify-center h-6 w-6 rounded-full shrink-0 ${accentIconBg.gap}`}>
            <HelpCircle className="h-3.5 w-3.5" />
          </span>
          <span className="font-medium text-foreground truncate">{block.expectedLabel ?? 'Plats okänd'}</span>
          <span className="text-muted-foreground shrink-0">·</span>
          <span className="text-muted-foreground truncate">{GAP_REASON_LABEL[block.reason]}</span>
        </div>

        <div className="flex items-center justify-end overflow-hidden">
          <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full border whitespace-nowrap ${badgeClass('review')}`}>
            GRANSKA
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
      <div className={`${GRID} px-2.5 py-1.5 bg-muted/40 border-b border-border text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>
        <div className="pl-1">Tid</div>
        <div>Händelse</div>
        <div className="text-right">Status</div>
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
