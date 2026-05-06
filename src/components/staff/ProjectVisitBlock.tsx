/**
 * ProjectVisitBlock — tydligt "PÅ PROJEKT"-block för huvudjournalen.
 *
 * Renderas separat från den vanliga GPS-listan så att projektvistelser inte
 * blandas ihop med tekniska gps_arrival/visit/departure-rader. Källan är ALLTID
 * en `gps_visit` mot en känd plats av typ `booking:` eller `large:`
 * (från `useDayKnownSites` → `actualVisits.knownSiteId`).
 */
import React from 'react';
import { Briefcase, Clock, Activity, MapPin, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ActualEvent } from '@/lib/staff/actualStaffDayModel';

export interface ProjectBlock {
  id: string;
  /** booking | large — stamp i headern. */
  kind: 'booking' | 'large_project';
  /** Stabil placeKey (matchar gps_visit.meta.placeKey). */
  placeKey: string;
  /** Visuellt label från knownSite.name (oftast "BOK-NR · Klient" eller projektnamn). */
  title: string;
  /** Frivillig sekundär rad, t.ex. adress eller projekt. */
  subtitle?: string | null;
  startIso: string;
  endIso: string | null;
  /** Sant om vistelsen fortfarande pågår. */
  ongoing: boolean;
  /** Sant om vi har vistelse-data men inte vet om personen lämnat. */
  uncertain: boolean;
  durationMin: number;
  /** Senaste GPS-ping på platsen. */
  lastPingIso: string | null;
  /** Hade en timer/LTE som överlappade vistelsen. */
  hasTimer: boolean;
  timerStartedIso: string | null;
  timerStoppedIso: string | null;
  /** Är timer fortfarande aktiv? */
  timerActive: boolean;
  /** Workday startad innan vistelsen. */
  workdayStarted: boolean;
  /** Sant om vistelsen matchar en planerad rig/event/rigDown idag. */
  planned: boolean;
}

const fmtHm = (iso?: string | null) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('sv-SE', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm',
    });
  } catch { return iso.slice(11, 16); }
};

const fmtDuration = (min: number): string => {
  if (min <= 0) return '0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};

interface Props {
  block: ProjectBlock;
}

const ProjectVisitBlock: React.FC<Props> = ({ block }) => {
  const stateLabel = block.ongoing
    ? 'PÅ PROJEKT NU'
    : block.uncertain
      ? 'OSÄKERT — KAN HA LÄMNAT'
      : 'PÅ PROJEKT';

  const stateClass = block.ongoing
    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40'
    : block.uncertain
      ? 'bg-amber-500/20 text-amber-800 dark:text-amber-200 border-amber-500/40'
      : 'bg-primary/15 text-primary border-primary/30';

  const timeRange = block.endIso && !block.ongoing
    ? `${fmtHm(block.startIso)}–${fmtHm(block.endIso)}`
    : `${fmtHm(block.startIso)} → pågår`;

  const evidenceParts: string[] = [];
  if (block.hasTimer) {
    if (block.timerActive) {
      evidenceParts.push('timer aktiv');
    } else if (block.timerStartedIso) {
      evidenceParts.push(`timer startad ${fmtHm(block.timerStartedIso)}`);
    } else {
      evidenceParts.push('timer registrerad');
    }
  }
  // GPS bekräftad om vi har en faktisk visit (det är ju källan)
  evidenceParts.unshift('GPS bekräftad');
  if (block.ongoing && block.lastPingIso) {
    evidenceParts.push(`senaste GPS ${fmtHm(block.lastPingIso)}`);
  }

  return (
    <div className={`rounded-lg border-2 ${stateClass.split(' ').filter(c => c.startsWith('border-')).join(' ')} bg-card/80 px-3 py-2.5 shadow-sm`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="tabular-nums text-xs text-muted-foreground font-medium shrink-0">
            {timeRange}
          </span>
          <Badge variant="outline" className={`text-[10px] uppercase tracking-wider font-bold ${stateClass}`}>
            <Briefcase className="h-3 w-3 mr-1" />
            {stateLabel}
          </Badge>
          {block.planned ? (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-blue-400 text-blue-700 dark:text-blue-300">
              Planerat
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-slate-300 text-muted-foreground">
              Oplanerat
            </Badge>
          )}
        </div>
        {block.uncertain && (
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
        )}
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

      <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1 tabular-nums">
          <Clock className="h-3 w-3" />
          {fmtDuration(block.durationMin)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Activity className="h-3 w-3" />
          {evidenceParts.join(' · ')}
        </span>
        {!block.workdayStarted && (
          <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-amber-400 text-amber-700 dark:text-amber-300">
            Saknar arbetsdag
          </Badge>
        )}
        {block.timerActive && block.lastPingIso && (Date.now() - new Date(block.lastPingIso).getTime()) > 30 * 60 * 1000 && (
          <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-amber-500 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3 w-3 mr-0.5" />
            Misstänkt glömd timer
          </Badge>
        )}
      </div>
    </div>
  );
};

/**
 * Bygg projektblock från huvudjournalens gps_visit-rader (matchade mot
 * known sites av typ booking:/large:).
 */
export interface BuildProjectBlocksInput {
  events: ActualEvent[];
  /** model.actualVisits, indexerad på placeKey. Vi tar knownSiteId därifrån. */
  visitByKey: Map<string, import('@/lib/staff/dayBlockTimeline').VisitInfo>;
  /** Planerade items från model.planningItems — bara behöver veta vilka booking/lp som är planerade idag. */
  plannedTargetIds: Set<string>;
  workdayStartedIso: string | null;
}

export const buildProjectBlocks = (input: BuildProjectBlocksInput): ProjectBlock[] => {
  const { events, visitByKey, plannedTargetIds, workdayStartedIso } = input;
  const blocks: ProjectBlock[] = [];

  // Bygg lista över timer-intervall per placeKey: starts paras med första
  // efterföljande stop (samma placeKey). En öppen start ger end=null = aktiv.
  // Detta gör att två besök på samma plats kan få olika timer-status.
  type TimerInterval = { placeKey: string; start: string; end: string | null };
  const timerIntervals: TimerInterval[] = [];
  const openStartsByKey = new Map<string, number[]>(); // index i timerIntervals
  const sortedTimerEvents = events
    .filter(e => e.kind === 'timer_started' || e.kind === 'timer_stopped')
    .filter(e => !!(e.meta as any)?.placeKey)
    .slice()
    .sort((a, b) => a.at.localeCompare(b.at));
  for (const ev of sortedTimerEvents) {
    const placeKey = (ev.meta as any).placeKey as string;
    if (ev.kind === 'timer_started') {
      const idx = timerIntervals.length;
      timerIntervals.push({ placeKey, start: ev.at, end: null });
      const list = openStartsByKey.get(placeKey) ?? [];
      list.push(idx);
      openStartsByKey.set(placeKey, list);
    } else {
      const list = openStartsByKey.get(placeKey);
      if (list && list.length > 0) {
        const idx = list.shift()!;
        timerIntervals[idx].end = ev.at;
        openStartsByKey.set(placeKey, list);
      } else {
        // stop utan känd start — registrera som "punkt"-intervall så hasTimer fångar den
        timerIntervals.push({ placeKey, start: ev.at, end: ev.at });
      }
    }
  }

  for (const ev of events) {
    if (ev.kind !== 'gps_visit') continue;
    const m = (ev.meta ?? {}) as any;
    const placeKey: string | undefined = m.placeKey;
    if (!placeKey) continue;
    const visit = visitByKey.get(placeKey);
    const knownSiteId = visit?.knownSiteId;
    if (!knownSiteId) continue;
    const isBooking = knownSiteId.startsWith('booking:');
    const isLarge = knownSiteId.startsWith('large:');
    if (!isBooking && !isLarge) continue;

    const ongoing = m.ongoing === true;
    const lastSeenAt: string | null = m.visit_last_seen_at ?? m.lastPingAt ?? visit?.end ?? null;
    const departedAt: string | null = m.departed_at ?? null;
    const uncertain = !ongoing && !departedAt;

    const targetId = knownSiteId.replace(/^(booking:|large:)/, '');
    const planned = plannedTargetIds.has(targetId) || plannedTargetIds.has(knownSiteId);

    const startIso = ev.at;
    const endIso = ongoing ? null : (departedAt || visit?.end || ev.until || null);
    const durationMin = visit?.durationMin ?? ev.durationMin ?? 0;

    // Match timer-intervall mot blockets fönster (overlap).
    const blockStartMs = new Date(startIso).getTime();
    const blockEndMs = endIso ? new Date(endIso).getTime() : Date.now();
    const overlapping = timerIntervals.filter(t => {
      if (t.placeKey !== placeKey) return false;
      const ts = new Date(t.start).getTime();
      const te = t.end ? new Date(t.end).getTime() : Date.now();
      return te >= blockStartMs && ts <= blockEndMs;
    });
    const timerStartedIso = overlapping.length > 0
      ? overlapping.reduce((min, t) => (!min || t.start < min ? t.start : min), '' as string) || null
      : null;
    const stops = overlapping.filter(t => t.end !== null);
    const timerStoppedIso = stops.length > 0
      ? stops.reduce((max, t) => (!max || (t.end as string) > max ? (t.end as string) : max), '' as string) || null
      : null;
    const timerActive = overlapping.some(t => t.end === null);
    const hasTimer = overlapping.length > 0;

    blocks.push({
      id: `pblock:${ev.id}`,
      kind: isLarge ? 'large_project' : 'booking',
      placeKey,
      title: visit?.label || ev.place || 'Projekt',
      subtitle: null,
      startIso,
      endIso,
      ongoing,
      uncertain,
      durationMin,
      lastPingIso: lastSeenAt,
      hasTimer,
      timerStartedIso,
      timerStoppedIso,
      timerActive: hasTimer && timerActive,
      workdayStarted: !!workdayStartedIso && workdayStartedIso <= startIso,
      planned,
    });
  }
  // Sortera kronologiskt
  return blocks.sort((a, b) => a.startIso.localeCompare(b.startIso));
};

export default ProjectVisitBlock;
