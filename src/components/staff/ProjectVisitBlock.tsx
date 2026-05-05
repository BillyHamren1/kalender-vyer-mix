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

  // Index timer events per placeKey för att korsreferera
  const timerStartByPlaceKey = new Map<string, string>();
  const timerStopByPlaceKey = new Map<string, string>();
  const timerActiveByPlaceKey = new Map<string, boolean>();
  for (const ev of events) {
    const placeKey = (ev.meta as any)?.placeKey as string | undefined;
    if (!placeKey) continue;
    if (ev.kind === 'timer_started') {
      if (!timerStartByPlaceKey.has(placeKey)) timerStartByPlaceKey.set(placeKey, ev.at);
      // Om vi inte ser en stop, då är den aktiv
      timerActiveByPlaceKey.set(placeKey, true);
    }
    if (ev.kind === 'timer_stopped') {
      timerStopByPlaceKey.set(placeKey, ev.at);
      timerActiveByPlaceKey.set(placeKey, false);
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

    const timerStartedIso = timerStartByPlaceKey.get(placeKey) ?? null;
    const timerStoppedIso = timerStopByPlaceKey.get(placeKey) ?? null;
    const timerActive = !!timerActiveByPlaceKey.get(placeKey);
    const hasTimer = !!timerStartedIso || !!timerStoppedIso;

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
