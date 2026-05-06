/**
 * isConfirmedWorksitePresence — central regel för vad som räknas som
 * "bekräftad arbetsplatsnärvaro" och därför får starta eller tidigarelägga
 * arbetsdagen automatiskt.
 *
 * Bekräftad arbetsplats = någon av:
 *   - knownSiteId börjar med "booking:" / "large:" / "warehouse:" / "site:" / "location:" / "loc:"
 *   - workRelevance === 'work_confirmed' (matchad känd plats eller bekräftad timer/rapport)
 *   - location_time_entry / time_report som är knuten till booking_id, project_id
 *     eller en arbetsrelaterad location_id (presenceOnly=false eller is_work_location)
 *   - assistant arrival som accepterats mot känt projekt/lager/arbetsplats
 *
 * EJ bekräftad arbetsplats (får ALDRIG starta/tidigarelägga arbetsdag):
 *   - 'work_possible' (närliggande, ≤800m — kräver granskning)
 *   - 'unknown_requires_lookup'
 *   - 'private_or_background' (hem, natt)
 *   - 'raw_debug_only'
 *   - okänd adress utan knownSiteId
 *   - travel/förflyttning
 *   - rena GPS-pings utan matchad arbetsplats
 *   - "övrigt" / address-only visit
 *
 * Pure helper. Speglas av server-side process-location-auto-start
 * (target.kind === 'booking' | 'project' | 'location' med location.is_work_location).
 */

const CONFIRMED_PREFIXES = ['booking:', 'large:', 'warehouse:', 'site:', 'location:', 'loc:'];

export function isConfirmedSiteId(knownSiteId: string | null | undefined): boolean {
  if (!knownSiteId) return false;
  return CONFIRMED_PREFIXES.some(p => knownSiteId.startsWith(p));
}

export interface VisitLike {
  knownSiteId?: string | null;
  workRelevance?: string | null;
  /** Privat zon (hem, manual_ignore, recurring_night) – får aldrig räknas. */
  privateZone?: unknown;
}

export interface EventLike {
  kind?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface LocationEntryLike {
  booking_id?: string | null;
  project_id?: string | null;
  location_id?: string | null;
  isPresenceOnly?: boolean | null;
  /** location.is_work_location från organization_locations om det är resolvat. */
  is_work_location?: boolean | null;
  exited_at?: string | null;
}

export interface TimeReportLike {
  booking_id?: string | null;
  project_id?: string | null;
}

export function isConfirmedWorksiteVisit(v: VisitLike | null | undefined): boolean {
  if (!v) return false;
  if (v.privateZone) return false;
  if (isConfirmedSiteId(v.knownSiteId ?? null)) return true;
  // work_confirmed = matchad känd plats / hård evidens. work_possible räknas INTE.
  if (v.workRelevance === 'work_confirmed') return true;
  return false;
}

export function isConfirmedWorksiteEvent(ev: EventLike | null | undefined): boolean {
  if (!ev) return false;
  const m = (ev.meta ?? {}) as Record<string, unknown>;
  // Travel, raw GPS, anomalier, planeringssignaler räknas aldrig.
  if (
    ev.kind === 'gps_travel'
    || ev.kind === 'planned_signal_gap'
    || ev.kind === 'raw_ping'
  ) {
    return false;
  }
  if (m.workRelevance === 'private_or_background') return false;
  if (m.workRelevance === 'work_confirmed') return true;
  if (isConfirmedSiteId((m.knownSiteId as string | undefined) ?? null)) return true;
  return false;
}

export function isConfirmedWorksiteLocationEntry(e: LocationEntryLike | null | undefined): boolean {
  if (!e) return false;
  if (e.booking_id || e.project_id) return true;
  if (e.location_id && e.is_work_location === true) return true;
  // Ren presence-only (geofence-närvaro utan rapport-roll) får inte
  // tidigarelägga arbetsdagen.
  if (e.location_id && e.isPresenceOnly !== true && e.is_work_location !== false) {
    // Om vi inte vet säkert (is_work_location saknas) — håll oss strikta.
    return false;
  }
  return false;
}

export function isConfirmedWorksiteTimeReport(tr: TimeReportLike | null | undefined): boolean {
  if (!tr) return false;
  return !!(tr.booking_id || tr.project_id);
}

/** Generic dispatcher used by adminTimeReviewEngine och dayBlockTimeline. */
export function isConfirmedWorksitePresence(input: {
  visit?: VisitLike | null;
  event?: EventLike | null;
  locationEntry?: LocationEntryLike | null;
  timeReport?: TimeReportLike | null;
}): boolean {
  return (
    isConfirmedWorksiteVisit(input.visit ?? null)
    || isConfirmedWorksiteEvent(input.event ?? null)
    || isConfirmedWorksiteLocationEntry(input.locationEntry ?? null)
    || isConfirmedWorksiteTimeReport(input.timeReport ?? null)
  );
}
