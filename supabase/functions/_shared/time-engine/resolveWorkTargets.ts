/**
 * Time Engine — resolveWorkTargets
 * ================================
 *
 * Pure-ish builder of the candidate WorkTarget list for a given staff/day.
 *
 * Reads ONLY from these public tables:
 *   - projects                   (active/standalone projects with delivery coords)
 *   - large_projects             (project-level address geofence)
 *   - organization_locations     (permanent locations / warehouses)
 *   - staff_assignments          (planned-today hint via team_id)
 *   - calendar_events            (planned-today hint via source_date)
 *
 * It MUST NOT touch (do not query, do not derive from):
 *   - workday / workdays
 *   - time_reports
 *   - location_time_entries
 *   - travel_time_logs
 *   - assistant_events
 *   - workday_flags / time_report_anomalies
 *   - old GPS/timeline snapshots
 *   - legacy activeTimers
 *
 * Robustness rules:
 *   - Always selects a fixed, safe column set. If a fetch fails, we collect
 *     a warning in `targetDiagnostics.warnings` and continue.
 *   - Targets without coordinates/polygon are NOT matchable; they appear in
 *     diagnostics with `targetValidity = 'missing_coordinates'`.
 *   - Test/demo, cancelled, archived → not matchable.
 *   - Multi-tenancy: every fetch is filtered by `organization_id`.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import type { ISODate, UUID } from './contracts.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type WorkTargetType = 'booking' | 'project' | 'large_project' | 'warehouse' | 'location';

export type TargetSource =
  | 'planned_today'
  | 'active_project'
  | 'permanent_location'
  | 'warehouse'
  | 'recent_confirmed'
  | 'explicit_time_tracking_location'
  | 'date_relevant_booking'
  | 'project_linked_booking'
  | 'large_project_linked_booking';

export type TargetValidity =
  | 'valid'
  | 'missing_coordinates'
  | 'invalid_radius'
  | 'test_data'
  | 'cancelled'
  | 'archived'
  | 'outside_date_window'
  | 'not_allowed_for_time_tracking';

export interface WorkTargetPolygonPoint { lat: number; lng: number }

/**
 * matchRole / assignmentAnchor / canAutoMatchAsWork
 * --------------------------------------------------
 * Tidigare matchade buildGpsDayTimeline GPS-pings mot ALLA returnerade
 * targets, vilket gjorde att samma adress kunde få fel bokningsnamn (en
 * "datumrelevant" booking utan staff-assignment vann över rätt rad).
 *
 * Nu klassar resolveWorkTargets varje target som PRIMARY eller SECONDARY:
 *
 *   PRIMARY  (canAutoMatchAsWork=true)  — får auto-matchas som arbete:
 *     - warehouse / organization_locations
 *     - booking där personen är direkt assignad på datumet (BSA staff_id)
 *     - booking där personens team äger calendar_event för datumet
 *     - large_project där personens team är assignad på datumet
 *     - project vars booking är PRIMARY enligt ovan
 *
 *   SECONDARY (canAutoMatchAsWork=false) — visas bara som review/evidence:
 *     - bokningar på samma datum utan staff-assignment
 *     - aktiva projekt utan staff-assignment
 *     - project-linked bookings utan staff-assignment
 *     - bokningar på samma adress utan staff-assignment
 *
 * `addressAnchorKey` används för att gruppera secondary kandidater på
 * samma adress som ett primary target (review-vyn kan då säga
 * "samma adress, men ingen assignment").
 */
export type WorkTargetMatchRole = 'primary' | 'secondary';

export type WorkTargetAssignmentAnchor =
  | 'warehouse'
  | 'direct_staff_assignment'
  | 'team_calendar_event'
  | 'large_project_staff_assignment'
  | 'date_address_candidate'
  | 'project_linked_unassigned'
  | 'active_project_unassigned';

export interface ResolvedWorkTarget {
  id: UUID;
  type: WorkTargetType;
  name: string;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
  polygon: WorkTargetPolygonPoint[] | null;
  targetSource: TargetSource;
  targetValidity: TargetValidity;
  timeTrackingAllowed: boolean;
  dateRelevance: 'today' | 'recent' | 'permanent' | 'unknown';
  status: string | null;
  matchRole?: WorkTargetMatchRole;
  assignmentAnchor?: WorkTargetAssignmentAnchor;
  canAutoMatchAsWork?: boolean;
  addressAnchorKey?: string | null;
  /** Raw address string (if any) — used to build anchor + display labels. */
  rawAddress?: string | null;
  /**
   * Engine 4 — when true this is a private residence / boende polygon
   * (organization_locations.is_private_residence). Residences are passed
   * to the GPS engine but are NEVER auto-matched as work, and they win
   * semantically over nearby warehouse/work targets.
   */
  isPrivateResidence?: boolean;
  diagnostics: {
    notes: string[];
  };
}

export interface TargetResolutionDiagnostics {
  primaryTargetsCount: number;
  secondaryTargetsCount: number;
  unsafeAutoMatchedTargetsCount: number;
  dateRelevantBookingsAsPrimaryCount: number;
  activeProjectsAsPrimaryCount: number;
  unassignedBookingsMatchedAsWorkCount: number;
  unassignedProjectsMatchedAsWorkCount: number;
  secondaryCandidatesNearGps: number;
  warnings: string[];
}

export interface TargetDiagnostics {
  totalFetched: number;
  validTargets: number;
  excludedTargets: number;
  excludedByReason: Record<string, number>;
  candidatesWithCoordinates: number;
  warnings: string[];
}

export interface ResolveWorkTargetsInput {
  organizationId: UUID;
  staffId: UUID;
  date: ISODate;
  supabaseAdmin: SupabaseClient;
}

export interface ResolveWorkTargetsResult {
  targets: ResolvedWorkTarget[];
  targetDiagnostics: TargetDiagnostics;
  /** Anchor-aware diagnostics. Health check failer på flera av dessa. */
  targetResolution: TargetResolutionDiagnostics;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const TEST_HINTS = ['test', 'demo', 'sandbox', 'playground'];
const CANCELLED_STATUSES = new Set(['cancelled', 'canceled', 'avbokad', 'avbokat']);
const ARCHIVED_STATUSES = new Set(['archived', 'arkiverad', 'closed', 'stängd', 'stangd']);

const isTestName = (name: string | null | undefined) =>
  !!name && TEST_HINTS.some((h) => name.toLowerCase().includes(h));

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function normalizePolygon(raw: unknown): WorkTargetPolygonPoint[] | null {
  if (!raw) return null;
  // Accept GeoJSON Polygon: { type: 'Polygon', coordinates: [[[lng,lat], ...], ...] }
  if (
    typeof raw === 'object' &&
    raw !== null &&
    (raw as { type?: string }).type === 'Polygon' &&
    Array.isArray((raw as { coordinates?: unknown }).coordinates)
  ) {
    const rings = (raw as { coordinates: unknown[] }).coordinates;
    const outer = Array.isArray(rings[0]) ? (rings[0] as unknown[]) : [];
    const out: WorkTargetPolygonPoint[] = [];
    for (const pt of outer) {
      if (Array.isArray(pt) && pt.length >= 2) {
        const lng = pt[0];
        const lat = pt[1];
        if (isFiniteNumber(lat) && isFiniteNumber(lng)) out.push({ lat, lng });
      }
    }
    return out.length >= 3 ? out : null;
  }
  // Accept legacy array of {lat,lng} (or {latitude,longitude})
  if (!Array.isArray(raw) || raw.length < 3) return null;
  const out: WorkTargetPolygonPoint[] = [];
  for (const p of raw) {
    const lat = (p as { lat?: number; latitude?: number })?.lat
      ?? (p as { latitude?: number })?.latitude;
    const lng = (p as { lng?: number; longitude?: number })?.lng
      ?? (p as { longitude?: number })?.longitude;
    if (isFiniteNumber(lat) && isFiniteNumber(lng)) out.push({ lat, lng });
  }
  return out.length >= 3 ? out : null;
}

function classifyValidity(
  name: string | null,
  status: string | null,
  lat: number | null,
  lng: number | null,
  polygon: WorkTargetPolygonPoint[] | null,
  radius: number | null,
  timeTrackingAllowed: boolean,
): TargetValidity {
  if (isTestName(name)) return 'test_data';
  const s = (status ?? '').toLowerCase();
  if (CANCELLED_STATUSES.has(s)) return 'cancelled';
  if (ARCHIVED_STATUSES.has(s)) return 'archived';
  if (!timeTrackingAllowed) return 'not_allowed_for_time_tracking';
  const hasCoords = isFiniteNumber(lat) && isFiniteNumber(lng);
  if (!hasCoords && !polygon) return 'missing_coordinates';
  if (!polygon && (!isFiniteNumber(radius) || radius! <= 0)) return 'invalid_radius';
  return 'valid';
}

function bumpExcluded(diag: TargetDiagnostics, reason: TargetValidity) {
  diag.excludedTargets += 1;
  diag.excludedByReason[reason] = (diag.excludedByReason[reason] ?? 0) + 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// resolveWorkTargets
// ─────────────────────────────────────────────────────────────────────────────

export async function resolveWorkTargets(
  input: ResolveWorkTargetsInput,
): Promise<ResolveWorkTargetsResult> {
  const { organizationId, staffId, date, supabaseAdmin } = input;

  const diag: TargetDiagnostics = {
    totalFetched: 0,
    validTargets: 0,
    excludedTargets: 0,
    excludedByReason: {},
    candidatesWithCoordinates: 0,
    warnings: [],
  };

  const targets: ResolvedWorkTarget[] = [];
  const seenKey = new Set<string>(); // dedupe by `${type}:${id}`

  // ── Anchor sets — driver matchRole/canAutoMatchAsWork senare i funktionen ──
  // direct_staff_assignment: bokningar där personen står direkt på BSA-raden
  // team_calendar_event:      bokningar via personens team + calendar_event
  // large_project_staff_assignment: stora projekt där personens team är assignat
  const directlyAssignedBookingIds = new Set<UUID>();
  const teamCalendarBookingIds = new Set<UUID>();
  const todayProjectIds = new Set<UUID>(); // (kvar för planned_today-hint)
  const todayBookingIds = new Set<UUID>(); // primary booking-set (union)
  const assignedLargeProjectIds = new Set<UUID>();

  // Personens team_ids för datumet — används för att korrekt filtrera
  // large_project_team_assignments per staff (tabellen saknar staff_id).
  const myTeamIdsToday = new Set<string>();

  // ── A1. Direkt staff↔booking via booking_staff_assignments ────────────────
  try {
    const { data, error } = await supabaseAdmin
      .from('booking_staff_assignments')
      .select('booking_id, team_id, staff_id, assignment_date')
      .eq('organization_id', organizationId)
      .eq('staff_id', staffId)
      .eq('assignment_date', date);
    if (error) {
      diag.warnings.push(`booking_staff_assignments: ${error.message}`);
    } else {
      for (const r of data ?? []) {
        if (r.team_id && r.team_id !== 'project') myTeamIdsToday.add(String(r.team_id));
        if (r.booking_id && r.team_id && r.team_id !== 'project') {
          // team_id='project' = projektmedlemskap, INTE dagsplanering. Får
          // aldrig räknas som direct_staff_assignment.
          directlyAssignedBookingIds.add(r.booking_id);
        }
      }
    }
  } catch (e) {
    diag.warnings.push(`booking_staff_assignments failed: ${(e as Error).message}`);
  }

  // ── A2. Team-resurs via staff_assignments + calendar_events för datumet ──
  try {
    const { data: bsa, error } = await supabaseAdmin
      .from('staff_assignments')
      .select('team_id, assignment_date')
      .eq('organization_id', organizationId)
      .eq('staff_id', staffId)
      .eq('assignment_date', date);
    if (error) {
      diag.warnings.push(`staff_assignments: ${error.message}`);
    } else if (bsa && bsa.length > 0) {
      for (const r of bsa) if (r.team_id) myTeamIdsToday.add(String(r.team_id));
      const teamIds = bsa.map((r) => r.team_id).filter(Boolean);
      if (teamIds.length > 0) {
        const { data: ce, error: ceErr } = await supabaseAdmin
          .from('calendar_events')
          .select('booking_id, source_date')
          .eq('organization_id', organizationId)
          .eq('source_date', date)
          .in('resource_id', teamIds);
        if (ceErr) diag.warnings.push(`calendar_events: ${ceErr.message}`);
        else (ce ?? []).forEach((r) => r.booking_id && teamCalendarBookingIds.add(r.booking_id));
      }
    }
  } catch (e) {
    diag.warnings.push(`bsa hint failed: ${(e as Error).message}`);
  }

  // Union → primary booking-set (för senare PRIMARY-klassning).
  for (const id of directlyAssignedBookingIds) todayBookingIds.add(id);
  for (const id of teamCalendarBookingIds) todayBookingIds.add(id);

  // ── B. large_project_team_assignments för datumet — FILTRERA PÅ PERSONENS TEAM ─
  // Tabellen saknar staff_id; staff↔team-relationen kommer från staff_assignments.
  // Att hämta alla LP-team-rader för datumet (gamla beteendet) gjorde att stora
  // projekt utan personens team flaggades som planned_today.
  const todayLargeProjectIds = new Set<UUID>(); // alla LP-team-rader datumet (för secondary)
  try {
    const { data, error } = await supabaseAdmin
      .from('large_project_team_assignments')
      .select('large_project_id, team_id')
      .eq('organization_id', organizationId)
      .eq('assignment_date', date);
    if (error) {
      diag.warnings.push(`large_project_team_assignments: ${error.message}`);
    } else {
      for (const r of (data ?? [])) {
        if (!r.large_project_id) continue;
        todayLargeProjectIds.add(r.large_project_id);
        if (r.team_id && myTeamIdsToday.has(String(r.team_id))) {
          assignedLargeProjectIds.add(r.large_project_id);
        }
      }
    }
  } catch (e) {
    diag.warnings.push(`large bsa hint failed: ${(e as Error).message}`);
  }

  // Track booking_ids referenced by local projects → resolved as bookings later
  // even if they are not "planned today" via BSA.
  const projectLinkedBookingIds = new Set<UUID>();
  // Map projectId → booking_id (för anchor-klassning av projekt: projekt blir
  // PRIMARY endast om dess underliggande booking är PRIMARY).
  const projectIdToBookingId = new Map<UUID, UUID>();

  // ─────────────────────────── Projects ────────────────────────────────────
  try {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .select(
        'id, name, status, planning_status, deliveryaddress, delivery_latitude, delivery_longitude, address_radius_meters, address_geofence_polygon, eventdate, rigdaydate, rigdowndate, deleted_at, is_internal, booking_id',
      )
      .eq('organization_id', organizationId)
      .is('deleted_at', null);

    if (error) {
      diag.warnings.push(`projects: ${error.message}`);
    } else {
      for (const r of data ?? []) {
        if (r.booking_id) {
          projectLinkedBookingIds.add(r.booking_id);
          projectIdToBookingId.set(r.id, r.booking_id);
        }
      }
      // Fallback: för projekt utan coords men med booking_id, hämta booking-coords.
      // Triggern (inherit_booking_coords_to_project) sköter normalfallet, men för
      // historisk data eller race conditions behåller vi en runtime-safety net.
      const projectsMissingCoords = (data ?? []).filter(
        (r: any) =>
          r.booking_id &&
          (!isFiniteNumber(r.delivery_latitude) || !isFiniteNumber(r.delivery_longitude)) &&
          !normalizePolygon(r.address_geofence_polygon),
      );
      const bookingCoordsByProjectId = new Map<string, { lat: number; lng: number; addr: string | null }>();
      if (projectsMissingCoords.length > 0) {
        const bookingIds = [...new Set(projectsMissingCoords.map((r: any) => r.booking_id))];
        try {
          const { data: bRows, error: bErr } = await supabaseAdmin
            .from('bookings')
            .select('id, delivery_latitude, delivery_longitude, deliveryaddress')
            .in('id', bookingIds);
          if (bErr) {
            diag.warnings.push(`booking coords fallback: ${bErr.message}`);
          } else {
            const byBookingId = new Map<string, any>();
            for (const b of bRows ?? []) byBookingId.set(b.id, b);
            for (const p of projectsMissingCoords) {
              const b = byBookingId.get((p as any).booking_id);
              if (b && isFiniteNumber(b.delivery_latitude) && isFiniteNumber(b.delivery_longitude)) {
                bookingCoordsByProjectId.set((p as any).id, {
                  lat: b.delivery_latitude,
                  lng: b.delivery_longitude,
                  addr: b.deliveryaddress ?? null,
                });
              }
            }
          }
        } catch (e) {
          diag.warnings.push(`booking coords fallback failed: ${(e as Error).message}`);
        }
      }

      for (const r of data ?? []) {
        diag.totalFetched += 1;
        const polygon = normalizePolygon(r.address_geofence_polygon);
        let lat = isFiniteNumber(r.delivery_latitude) ? r.delivery_latitude : null;
        let lng = isFiniteNumber(r.delivery_longitude) ? r.delivery_longitude : null;
        let coordsFromBooking = false;
        if ((lat == null || lng == null) && bookingCoordsByProjectId.has(r.id)) {
          const fb = bookingCoordsByProjectId.get(r.id)!;
          lat = fb.lat;
          lng = fb.lng;
          coordsFromBooking = true;
        }
        const radius = isFiniteNumber(r.address_radius_meters) ? r.address_radius_meters : 150;

        const isPlannedToday =
          r.eventdate === date ||
          r.rigdaydate === date ||
          r.rigdowndate === date ||
          todayProjectIds.has(r.id);

        const status = (r.planning_status as string | null) ?? r.status ?? null;
        const validity = classifyValidity(r.name, status, lat, lng, polygon, radius, true);

        if (lat != null && lng != null) diag.candidatesWithCoordinates += 1;

        const source: TargetSource = isPlannedToday
          ? 'planned_today'
          : 'active_project';

        const key = `project:${r.id}`;
        if (seenKey.has(key)) continue;
        seenKey.add(key);

        if (validity !== 'valid') bumpExcluded(diag, validity);
        else diag.validTargets += 1;

        const notes: string[] = [];
        if (coordsFromBooking) notes.push('coords_from_booking_fallback');
        if (validity === 'missing_coordinates' && r.deliveryaddress) {
          notes.push('address_exists_but_missing_coordinates');
        }

        targets.push({
          id: r.id,
          type: 'project',
          name: r.name ?? 'Projekt',
          latitude: lat,
          longitude: lng,
          radiusMeters: radius,
          polygon,
          targetSource: source,
          targetValidity: validity,
          timeTrackingAllowed: true,
          dateRelevance: isPlannedToday ? 'today' : 'recent',
          status,
          rawAddress: (r.deliveryaddress as string | null) ?? null,
          diagnostics: { notes },
        });
      }
    }
  } catch (e) {
    diag.warnings.push(`projects fetch failed: ${(e as Error).message}`);
  }

  // ─────────────────────────── Large projects ──────────────────────────────
  // PRODUKTREGEL: Stora projekt äger platsen. Tid får ALDRIG attribueras
  // till child-bokningar — varken via GPS-match eller via auto-start.
  // Vi laddar därför LP-info först, sedan promotar vi child-bookings till
  // LP-targets (med bokningens geo) om LP saknar egen geo. Om LP har egen
  // geo undertrycks child-booking-targets helt.
  type LpInfo = {
    id: string;
    name: string;
    status: string | null;
    rawAddress: string | null;
    hasOwnGeo: boolean;
  };
  const lpInfoById = new Map<string, LpInfo>();

  try {
    const { data, error } = await supabaseAdmin
      .from('large_projects')
      .select(
        'id, name, status, planning_status, address, address_latitude, address_longitude, address_radius_meters, address_geofence_polygon',
      )
      .eq('organization_id', organizationId);

    if (error) {
      diag.warnings.push(`large_projects: ${error.message}`);
    } else {
      for (const r of data ?? []) {
        diag.totalFetched += 1;
        const polygon = normalizePolygon(r.address_geofence_polygon);
        const lat = isFiniteNumber(r.address_latitude) ? r.address_latitude : null;
        const lng = isFiniteNumber(r.address_longitude) ? r.address_longitude : null;
        const radius = isFiniteNumber(r.address_radius_meters) ? r.address_radius_meters : 150;
        const isPlannedToday = todayLargeProjectIds.has(r.id);
        const status = (r.planning_status as string | null) ?? r.status ?? null;
        const validity = classifyValidity(r.name, status, lat, lng, polygon, radius, true);
        const hasOwnGeo = validity === 'valid' && (polygon !== null || (lat !== null && lng !== null));

        lpInfoById.set(r.id, {
          id: r.id,
          name: r.name ?? 'Stort projekt',
          status,
          rawAddress: (r.address as string | null) ?? null,
          hasOwnGeo,
        });

        if (lat != null && lng != null) diag.candidatesWithCoordinates += 1;

        const key = `large_project:${r.id}`;
        if (seenKey.has(key)) continue;
        seenKey.add(key);

        if (validity !== 'valid') bumpExcluded(diag, validity);
        else diag.validTargets += 1;

        const lpNotes: string[] = [];
        if (validity === 'missing_coordinates' && r.address) {
          lpNotes.push('address_exists_but_missing_coordinates');
        }

        targets.push({
          id: r.id,
          type: 'large_project',
          name: r.name ?? 'Stort projekt',
          latitude: lat,
          longitude: lng,
          radiusMeters: radius,
          polygon,
          targetSource: isPlannedToday ? 'planned_today' : 'active_project',
          targetValidity: validity,
          timeTrackingAllowed: true,
          dateRelevance: isPlannedToday ? 'today' : 'recent',
          status,
          rawAddress: (r.address as string | null) ?? null,
          diagnostics: { notes: lpNotes },
        });
      }
    }
  } catch (e) {
    diag.warnings.push(`large_projects fetch failed: ${(e as Error).message}`);
  }

  // ─────────────────────────── Bookings (expanded) ────────────────────────
  // We resolve bookings from multiple sources, in priority order:
  //   1. planned_today              — BSA + calendar_events for `date`
  //   2. date_relevant_booking      — bookings with eventdate/rigdaydate/rigdowndate = date
  //   3. project_linked_booking     — bookings referenced by local projects
  //   4. large_project_linked_booking — bookings referenced by today-relevant LP
  // The first source that contributes a booking_id wins (priority via priorityMap).
  const bookingSourceMap = new Map<UUID, TargetSource>();
  for (const id of todayBookingIds) bookingSourceMap.set(id, 'planned_today');

  // 2) date-relevant bookings (eventdate/rigdaydate/rigdowndate = date)
  try {
    const { data, error } = await supabaseAdmin
      .from('bookings')
      .select('id')
      .eq('organization_id', organizationId)
      .or(`eventdate.eq.${date},rigdaydate.eq.${date},rigdowndate.eq.${date}`);
    if (error) diag.warnings.push(`date-relevant bookings: ${error.message}`);
    else (data ?? []).forEach((r: any) => {
      if (!bookingSourceMap.has(r.id)) bookingSourceMap.set(r.id, 'date_relevant_booking');
    });
  } catch (e) {
    diag.warnings.push(`date-relevant bookings failed: ${(e as Error).message}`);
  }

  // 3) project-linked bookings (referenced by local projects)
  for (const id of projectLinkedBookingIds) {
    if (!bookingSourceMap.has(id)) bookingSourceMap.set(id, 'project_linked_booking');
  }

  // 4) bookings linked to today-relevant large projects
  if (todayLargeProjectIds.size > 0) {
    try {
      const { data, error } = await supabaseAdmin
        .from('large_project_bookings')
        .select('booking_id')
        .in('large_project_id', Array.from(todayLargeProjectIds));
      if (error) diag.warnings.push(`large_project_bookings: ${error.message}`);
      else (data ?? []).forEach((r: any) => {
        if (r.booking_id && !bookingSourceMap.has(r.booking_id)) {
          bookingSourceMap.set(r.booking_id, 'large_project_linked_booking');
        }
      });
    } catch (e) {
      diag.warnings.push(`large_project_bookings failed: ${(e as Error).message}`);
    }
  }

  // bookingToLp: COMPLETE map across ALL known LPs (not just today). Detta
  // krävs för att kunna promota child-bokningar till LP-targets även när
  // LP:n inte är "planerad idag" via BSA. Källa A: large_project_bookings.
  // Källa B (kompletteras nedan): bookings.large_project_id-kolumnen.
  const bookingToLp = new Map<string, string>();
  if (lpInfoById.size > 0) {
    try {
      const { data, error } = await supabaseAdmin
        .from('large_project_bookings')
        .select('booking_id, large_project_id')
        .eq('organization_id', organizationId);
      if (error) diag.warnings.push(`large_project_bookings (all): ${error.message}`);
      else (data ?? []).forEach((r: any) => {
        if (r.booking_id && r.large_project_id && lpInfoById.has(r.large_project_id)) {
          bookingToLp.set(r.booking_id, r.large_project_id);
        }
      });
    } catch (e) {
      diag.warnings.push(`large_project_bookings (all) failed: ${(e as Error).message}`);
    }
  }


  if (bookingSourceMap.size > 0) {
    try {
      const { data, error } = await supabaseAdmin
        .from('bookings')
        .select(
          'id, title, client, booking_number, status, deliveryaddress, delivery_latitude, delivery_longitude, eventdate, rigdaydate, rigdowndate, large_project_id',
        )
        .eq('organization_id', organizationId)
        .in('id', Array.from(bookingSourceMap.keys()));

      if (error) {
        diag.warnings.push(`bookings: ${error.message}`);
      } else {
        // Komplettera bookingToLp med direktkolumnen.
        for (const r of data ?? []) {
          if (r.large_project_id && lpInfoById.has(r.large_project_id) && !bookingToLp.has(r.id)) {
            bookingToLp.set(r.id, r.large_project_id);
          }
        }

        for (const r of data ?? []) {
          diag.totalFetched += 1;
          const lat = isFiniteNumber(r.delivery_latitude) ? r.delivery_latitude : null;
          const lng = isFiniteNumber(r.delivery_longitude) ? r.delivery_longitude : null;
          const radius = 150;
          const validity = classifyValidity(r.title, r.status, lat, lng, null, radius, true);

          if (lat != null && lng != null) diag.candidatesWithCoordinates += 1;

          const source = bookingSourceMap.get(r.id) ?? 'date_relevant_booking';
          const isDateMatch =
            r.eventdate === date || r.rigdaydate === date || r.rigdowndate === date;
          const dateRelevance: ResolvedWorkTarget['dateRelevance'] =
            source === 'planned_today' || isDateMatch ? 'today' : 'recent';

          const bNotes: string[] = [];
          if (validity === 'missing_coordinates' && r.deliveryaddress) {
            bNotes.push('address_exists_but_missing_coordinates');
          }

          const titleTrim = (r.title ?? '').trim();
          const clientTrim = (r.client ?? '').trim();
          const bookingNumTrim = (r.booking_number ?? '').trim();
          const resolvedName =
            titleTrim ||
            (clientTrim && bookingNumTrim ? `${clientTrim} (#${bookingNumTrim})` : clientTrim) ||
            (bookingNumTrim ? `Bokning #${bookingNumTrim}` : `Bokning ${r.id.slice(0, 8)}`);

          // PRODUKTREGEL: child-bokning under stort projekt får ALDRIG bli
          // eget primary work target. LP äger platsen och tiden.
          //   - Om LP har EGEN geo  → undertryck bokningen helt (LP-target matchar).
          //   - Om LP saknar geo    → PROMOTERA: emittera som large_project-target
          //                            med LP:s id+namn men bokningens geo, så
          //                            GPS-matchen attribueras till LP istället.
          const parentLpId = bookingToLp.get(r.id) ?? null;
          if (parentLpId) {
            const lp = lpInfoById.get(parentLpId);
            if (lp) {
              if (lp.hasOwnGeo) {
                // LP-target redan emitterad med egen geo — släng bokningen.
                bNotes.push(`suppressed_child_of_large_project:${parentLpId}`);
                if (validity !== 'valid') bumpExcluded(diag, validity);
                continue;
              }
              // LP saknar geo → promotera bokningens geo till LP-target.
              if (validity !== 'valid') {
                bumpExcluded(diag, validity);
                continue;
              }
              const promotedKey = `large_project:${parentLpId}:via-booking:${r.id}`;
              if (seenKey.has(promotedKey)) continue;
              seenKey.add(promotedKey);
              diag.validTargets += 1;
              targets.push({
                id: parentLpId,
                type: 'large_project',
                name: lp.name,
                latitude: lat,
                longitude: lng,
                radiusMeters: radius,
                polygon: null,
                targetSource: 'large_project_linked_booking',
                targetValidity: 'valid',
                timeTrackingAllowed: true,
                dateRelevance,
                status: lp.status,
                rawAddress: (r.deliveryaddress as string | null) ?? lp.rawAddress,
                diagnostics: { notes: [...bNotes, `promoted_from_booking:${r.id}`] },
              });
              continue;
            }
          }

          const key = `booking:${r.id}`;
          if (seenKey.has(key)) continue;
          seenKey.add(key);

          if (validity !== 'valid') bumpExcluded(diag, validity);
          else diag.validTargets += 1;

          targets.push({
            id: r.id,
            type: 'booking',
            name: resolvedName,
            latitude: lat,
            longitude: lng,
            radiusMeters: radius,
            polygon: null,
            targetSource: source,
            targetValidity: validity,
            timeTrackingAllowed: true,
            dateRelevance,
            status: r.status ?? null,
            rawAddress: (r.deliveryaddress as string | null) ?? null,
            diagnostics: { notes: bNotes },
          });
        }
      }
    } catch (e) {
      diag.warnings.push(`bookings fetch failed: ${(e as Error).message}`);
    }
  }


  // ─────────────────────────── Permanent locations / warehouses ────────────
  try {
    const { data, error } = await supabaseAdmin
      .from('organization_locations')
      .select(
        // Engine 4: also pull is_private_residence + location_type so we can
        // mark Boende polygons. Falls back gracefully if columns are missing.
        'id, name, latitude, longitude, radius_meters, geofence_polygon, is_active, show_as_project, is_private_residence, location_type',
      )
      .eq('organization_id', organizationId);

    if (error) {
      diag.warnings.push(`organization_locations: ${error.message}`);
    } else {
      for (const r of data ?? []) {
        diag.totalFetched += 1;
        const polygon = normalizePolygon(r.geofence_polygon);
        const lat = isFiniteNumber(r.latitude) ? r.latitude : null;
        const lng = isFiniteNumber(r.longitude) ? r.longitude : null;
        const radius = isFiniteNumber(r.radius_meters) ? r.radius_meters : 100;
        const isActive = r.is_active !== false;
        const status = isActive ? 'active' : 'inactive';
        const timeTrackingAllowed = isActive;
        const validity = classifyValidity(r.name, status, lat, lng, polygon, radius, timeTrackingAllowed);

        if (lat != null && lng != null) diag.candidatesWithCoordinates += 1;

        // Engine 4 — Boende / private residence detection.
        const isResidence =
          r.is_private_residence === true ||
          (typeof r.location_type === 'string' &&
            (r.location_type === 'private_residence' || r.location_type === 'boende'));

        const lower = (r.name ?? '').toLowerCase();
        const isWarehouse =
          !isResidence &&
          (lower.includes('lager') || lower.includes('warehouse') || lower.includes('depå'));
        const type: WorkTargetType = isWarehouse ? 'warehouse' : 'location';
        const source: TargetSource = isWarehouse
          ? 'warehouse'
          : (r.show_as_project ? 'explicit_time_tracking_location' : 'permanent_location');

        const key = `${type}:${r.id}`;
        if (seenKey.has(key)) continue;
        seenKey.add(key);

        if (validity !== 'valid') bumpExcluded(diag, validity);
        else diag.validTargets += 1;

        targets.push({
          id: r.id,
          type,
          name: r.name ?? (isResidence ? 'Boende' : isWarehouse ? 'Lager' : 'Plats'),
          latitude: lat,
          longitude: lng,
          radiusMeters: radius,
          polygon,
          targetSource: source,
          targetValidity: validity,
          timeTrackingAllowed,
          dateRelevance: 'permanent',
          status,
          rawAddress: (r.name as string | null) ?? null,
          isPrivateResidence: isResidence,
          diagnostics: { notes: isResidence ? ['private_residence'] : [] },
        });
      }
    }
  } catch (e) {
    diag.warnings.push(`organization_locations fetch failed: ${(e as Error).message}`);
  }

  // ─────────── Post-process: matchRole / assignmentAnchor / canAutoMatchAsWork ─
  // resolveWorkTargets är medvetet generös i datalagret (för att kunna visa
  // secondary-kandidater i review/evidence). Här klassar vi varje target som
  // PRIMARY (auto-matchbar arbete) eller SECONDARY (review only).
  const resolution: TargetResolutionDiagnostics = {
    primaryTargetsCount: 0,
    secondaryTargetsCount: 0,
    unsafeAutoMatchedTargetsCount: 0,
    dateRelevantBookingsAsPrimaryCount: 0,
    activeProjectsAsPrimaryCount: 0,
    unassignedBookingsMatchedAsWorkCount: 0,
    unassignedProjectsMatchedAsWorkCount: 0,
    secondaryCandidatesNearGps: 0, // populeras inte här (kräver pings)
    warnings: [],
  };

  // Normalisera adress: lowercase, strip diakritik, collapse whitespace, remove
  // trailing punctuation. Räcker för att FA Warehouse-adressen ska få samma
  // location-key oavsett om den kommer från en booking eller en location.
  function normalizeAddress(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const s = raw
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[.,;:!?()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return s.length > 0 ? s : null;
  }

  // Location-key utan tier/datum: används för att gruppera primary+secondary
  // på samma fysiska adress. ~4 decimaler ≈ 11 m vilket ligger inom det
  // önskade 20–30 m-fönstret.
  function locationKey(t: ResolvedWorkTarget): string | null {
    const norm = normalizeAddress(t.rawAddress);
    if (norm) return `addr:${norm}`;
    if (t.latitude != null && t.longitude != null) {
      return `gps:${t.latitude.toFixed(4)},${t.longitude.toFixed(4)}`;
    }
    return null;
  }

  // Steg 1: klassa role/anchor per target.
  for (const t of targets) {
    let role: WorkTargetMatchRole = 'secondary';
    let anchor: WorkTargetAssignmentAnchor;

    if (t.type === 'warehouse' || t.type === 'location') {
      role = 'primary';
      anchor = 'warehouse';
    } else if (t.type === 'booking') {
      if (directlyAssignedBookingIds.has(t.id)) {
        role = 'primary';
        anchor = 'direct_staff_assignment';
      } else if (teamCalendarBookingIds.has(t.id)) {
        role = 'primary';
        anchor = 'team_calendar_event';
      } else if (t.targetSource === 'date_relevant_booking') {
        anchor = 'date_address_candidate';
      } else if (t.targetSource === 'project_linked_booking') {
        anchor = 'project_linked_unassigned';
      } else if (t.targetSource === 'large_project_linked_booking') {
        anchor = 'project_linked_unassigned';
      } else {
        anchor = 'date_address_candidate';
      }
    } else {
      // type === 'project' | 'large_project'
      const linkedBookingId = projectIdToBookingId.get(t.id);
      if (assignedLargeProjectIds.has(t.id)) {
        role = 'primary';
        anchor = 'large_project_staff_assignment';
      } else if (linkedBookingId && directlyAssignedBookingIds.has(linkedBookingId)) {
        role = 'primary';
        anchor = 'direct_staff_assignment';
      } else if (linkedBookingId && teamCalendarBookingIds.has(linkedBookingId)) {
        role = 'primary';
        anchor = 'team_calendar_event';
      } else if (linkedBookingId) {
        anchor = 'project_linked_unassigned';
      } else {
        anchor = 'active_project_unassigned';
      }
    }

    t.matchRole = role;
    t.assignmentAnchor = anchor;
    t.canAutoMatchAsWork = role === 'primary';
    // Engine 4 — Boende / private_residence: aldrig auto-matchas som arbete,
    // även om location-typen normalt skulle räknas som primary.
    if (t.isPrivateResidence === true) {
      t.canAutoMatchAsWork = false;
      t.matchRole = 'secondary';
    }
  }

  // Steg 2: gruppera per location-key och välj kanonisk label.
  // Mål: samma fysiska adress får inte byta bokning mellan rader. Den primary
  // target som är "starkast" (direct > team > large_project > warehouse >
  // date_address_candidate) sätter labeln för alla andra primary targets på
  // samma adress. Secondary-only grupper får review-label och behåller
  // canAutoMatchAsWork=false.
  const ANCHOR_PRIORITY: Record<WorkTargetAssignmentAnchor, number> = {
    direct_staff_assignment: 1,
    team_calendar_event: 2,
    large_project_staff_assignment: 3,
    warehouse: 4,
    date_address_candidate: 5,
    project_linked_unassigned: 6,
    active_project_unassigned: 7,
  };

  type Group = {
    locKey: string;
    addressDisplay: string | null;
    targets: ResolvedWorkTarget[];
  };
  const groups = new Map<string, Group>();
  for (const t of targets) {
    const lk = locationKey(t);
    if (!lk) continue;
    let g = groups.get(lk);
    if (!g) {
      g = { locKey: lk, addressDisplay: t.rawAddress ?? null, targets: [] };
      groups.set(lk, g);
    } else if (!g.addressDisplay && t.rawAddress) {
      g.addressDisplay = t.rawAddress;
    }
    g.targets.push(t);
  }

  for (const g of groups.values()) {
    const primaries = g.targets.filter((x) => x.matchRole === 'primary');
    if (primaries.length > 0) {
      const winner = [...primaries].sort((a, b) =>
        (ANCHOR_PRIORITY[a.assignmentAnchor!] ?? 99) -
        (ANCHOR_PRIORITY[b.assignmentAnchor!] ?? 99)
      )[0];
      // Alla primary targets på samma adress visar winner-labeln. Detta
      // hindrar att FA Warehouse-adressen flippar mellan "Booking X" och
      // "Booking Y" beroende på vilken rad GPS råkar matcha.
      for (const t of primaries) {
        if (t !== winner) {
          t.diagnostics.notes.push(`label_overridden_by_anchor:${winner.id}`);
          t.name = winner.name;
        }
      }
    } else {
      // Endast secondary kandidater på adressen → får inte se ut som säker work.
      const addrDisplay = g.addressDisplay ?? g.locKey.replace(/^gps:/, '');
      for (const t of g.targets) {
        const safeLabel = t.rawAddress
          ? `Ej assignad plats · ${addrDisplay} · granska`
          : `Okänd arbetsplats nära ${addrDisplay}`;
        t.diagnostics.notes.push(`secondary_only_anchor_relabel:${t.name}`);
        t.name = safeLabel;
      }
    }
  }

  // Steg 3: sätt addressAnchorKey (med datum + tier) och bumpa diagnostics.
  // Unsafe-räknarna baseras på assignmentAnchor — INTE targetSource ensam.
  // Säkra anchors: warehouse, direct_staff_assignment, team_calendar_event,
  // large_project_staff_assignment.
  // Osäkra anchors: date_address_candidate, project_linked_unassigned,
  // active_project_unassigned.
  const UNSAFE_ANCHORS = new Set<WorkTargetAssignmentAnchor>([
    'date_address_candidate',
    'project_linked_unassigned',
    'active_project_unassigned',
  ]);

  for (const t of targets) {
    const lk = locationKey(t);
    const tier = t.matchRole === 'primary' ? 'assigned' : 'secondary';
    t.addressAnchorKey = lk ? `${date}|${tier}|${lk}` : null;

    if (t.matchRole === 'primary') resolution.primaryTargetsCount += 1;
    else resolution.secondaryTargetsCount += 1;

    // Hard-fail-detektorer för health check ───────────────────────────────
    // Endast primary targets med osäker anchor räknas — det innebär att en
    // booking som råkar ha targetSource='date_relevant_booking' MEN är
    // direct_staff_assignment / team_calendar_event INTE flaggas.
    if (t.canAutoMatchAsWork === true && t.assignmentAnchor && UNSAFE_ANCHORS.has(t.assignmentAnchor)) {
      resolution.unsafeAutoMatchedTargetsCount += 1;
      if (t.type === 'booking' && t.assignmentAnchor === 'date_address_candidate') {
        resolution.unassignedBookingsMatchedAsWorkCount += 1;
        if (t.targetSource === 'date_relevant_booking') {
          resolution.dateRelevantBookingsAsPrimaryCount += 1;
        }
      }
      if (
        t.type === 'project' &&
        (t.assignmentAnchor === 'active_project_unassigned' ||
          t.assignmentAnchor === 'project_linked_unassigned')
      ) {
        resolution.unassignedProjectsMatchedAsWorkCount += 1;
        if (t.targetSource === 'active_project') {
          resolution.activeProjectsAsPrimaryCount += 1;
        }
      }
    }
  }

  return { targets, targetDiagnostics: diag, targetResolution: resolution };
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: convert ResolvedWorkTarget → WorkTarget contract type
// ─────────────────────────────────────────────────────────────────────────────

import type { WorkTarget, WorkTargetKind } from './contracts.ts';

export function toWorkTarget(rt: ResolvedWorkTarget): WorkTarget | null {
  if (rt.targetValidity !== 'valid') return null;
  if (rt.latitude == null || rt.longitude == null) return null;
  // SECONDARY targets får inte auto-matchas som arbete — de exponeras bara via
  // diagnostics/reviewSuggestions. buildGpsDayTimeline tar emot resultatet
  // från `targets.map(toWorkTarget).filter(Boolean)`, så vi blockar här.
  // SECONDARY targets får inte auto-matchas som arbete — de exponeras bara via
  // diagnostics/reviewSuggestions. buildGpsDayTimeline tar emot resultatet
  // från `targets.map(toWorkTarget).filter(Boolean)`, så vi blockar här.
  // UNDANTAG (Engine 4): private_residence/Boende släpps igenom även när
  // canAutoMatchAsWork=false — GPS-motorn behöver känna till polygonen för
  // att kunna klassa pings som privat zon (vinner över närliggande Warehouse).
  if (rt.canAutoMatchAsWork === false && rt.isPrivateResidence !== true) return null;
  const kind: WorkTargetKind =
    rt.type === 'project' ? 'project'
    : rt.type === 'large_project' ? 'large_project'
    : rt.type === 'booking' ? 'booking'
    : rt.type === 'warehouse' ? 'warehouse'
    : 'organization_location';

  // Convert internal {lat,lng}[] outer ring to GeoJSON Polygon ([lng,lat] pairs,
  // closed ring). buildGpsDayTimeline / geofenceEval expect this shape.
  let polygonGeoJSON: { type: 'Polygon'; coordinates: number[][][] } | null = null;
  if (rt.polygon && rt.polygon.length >= 3) {
    const ring: number[][] = rt.polygon.map((p) => [p.lng, p.lat]);
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
    polygonGeoJSON = { type: 'Polygon', coordinates: [ring] };
  }

  return {
    key: `${kind}:${rt.id}`,
    kind,
    refId: rt.id,
    label: rt.name,
    center: { lat: rt.latitude, lng: rt.longitude },
    radiusM: rt.radiusMeters ?? 100,
    polygon: polygonGeoJSON,
    assignedToUserToday: rt.dateRelevance === 'today',
    assignmentAnchor: rt.assignmentAnchor ?? undefined,
    isPrivateResidence: rt.isPrivateResidence === true ? true : undefined,
  };
}
