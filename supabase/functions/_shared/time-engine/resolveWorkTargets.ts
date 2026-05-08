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

export type WorkTargetType = 'booking' | 'project' | 'warehouse' | 'location';

export type TargetSource =
  | 'planned_today'
  | 'active_project'
  | 'permanent_location'
  | 'warehouse'
  | 'recent_confirmed'
  | 'explicit_time_tracking_location';

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
  diagnostics: {
    notes: string[];
  };
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

  // Compute "planned today" hints up-front (used to bump source for projects/bookings).
  const todayProjectIds = new Set<UUID>();
  const todayBookingIds = new Set<UUID>();

  // ── Hint A: BSA — staff_assignments + calendar_events for `date` ─────────
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
      const teamIds = bsa.map((r) => r.team_id).filter(Boolean);
      if (teamIds.length > 0) {
        const { data: ce, error: ceErr } = await supabaseAdmin
          .from('calendar_events')
          .select('booking_id, source_date')
          .eq('organization_id', organizationId)
          .eq('source_date', date)
          .in('resource_id', teamIds);
        if (ceErr) diag.warnings.push(`calendar_events: ${ceErr.message}`);
        else (ce ?? []).forEach((r) => r.booking_id && todayBookingIds.add(r.booking_id));
      }
    }
  } catch (e) {
    diag.warnings.push(`bsa hint failed: ${(e as Error).message}`);
  }

  // ── Hint B: large_project_team_assignments for `date` ────────────────────
  const todayLargeProjectIds = new Set<UUID>();
  try {
    const { data, error } = await supabaseAdmin
      .from('large_project_team_assignments')
      .select('large_project_id')
      .eq('organization_id', organizationId)
      .eq('assignment_date', date);
    if (error) diag.warnings.push(`large_project_team_assignments: ${error.message}`);
    else (data ?? []).forEach((r) => r.large_project_id && todayLargeProjectIds.add(r.large_project_id));
  } catch (e) {
    diag.warnings.push(`large bsa hint failed: ${(e as Error).message}`);
  }

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
          diagnostics: { notes: coordsFromBooking ? ['coords_from_booking_fallback'] : [] },
        });
      }
    }
  } catch (e) {
    diag.warnings.push(`projects fetch failed: ${(e as Error).message}`);
  }

  // ─────────────────────────── Large projects ──────────────────────────────
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

        if (lat != null && lng != null) diag.candidatesWithCoordinates += 1;

        const key = `project:${r.id}`;
        if (seenKey.has(key)) continue;
        seenKey.add(key);

        if (validity !== 'valid') bumpExcluded(diag, validity);
        else diag.validTargets += 1;

        targets.push({
          id: r.id,
          type: 'project',
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
          diagnostics: { notes: [] },
        });
      }
    }
  } catch (e) {
    diag.warnings.push(`large_projects fetch failed: ${(e as Error).message}`);
  }

  // ─────────────────────────── Bookings (planned-today only) ───────────────
  if (todayBookingIds.size > 0) {
    try {
      const { data, error } = await supabaseAdmin
        .from('bookings')
        .select(
          'id, title, status, deliveryaddress, delivery_latitude, delivery_longitude, eventdate, rigdaydate, rigdowndate',
        )
        .eq('organization_id', organizationId)
        .in('id', Array.from(todayBookingIds));

      if (error) {
        diag.warnings.push(`bookings: ${error.message}`);
      } else {
        for (const r of data ?? []) {
          diag.totalFetched += 1;
          const lat = isFiniteNumber(r.delivery_latitude) ? r.delivery_latitude : null;
          const lng = isFiniteNumber(r.delivery_longitude) ? r.delivery_longitude : null;
          const radius = 150;
          const validity = classifyValidity(r.title, r.status, lat, lng, null, radius, true);

          if (lat != null && lng != null) diag.candidatesWithCoordinates += 1;

          const key = `booking:${r.id}`;
          if (seenKey.has(key)) continue;
          seenKey.add(key);

          if (validity !== 'valid') bumpExcluded(diag, validity);
          else diag.validTargets += 1;

          targets.push({
            id: r.id,
            type: 'booking',
            name: r.title ?? 'Bokning',
            latitude: lat,
            longitude: lng,
            radiusMeters: radius,
            polygon: null,
            targetSource: 'planned_today',
            targetValidity: validity,
            timeTrackingAllowed: true,
            dateRelevance: 'today',
            status: r.status ?? null,
            diagnostics: { notes: [] },
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
        'id, name, latitude, longitude, radius_meters, geofence_polygon, is_active, show_as_project',
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

        const lower = (r.name ?? '').toLowerCase();
        const isWarehouse = lower.includes('lager') || lower.includes('warehouse') || lower.includes('depå');
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
          name: r.name ?? (isWarehouse ? 'Lager' : 'Plats'),
          latitude: lat,
          longitude: lng,
          radiusMeters: radius,
          polygon,
          targetSource: source,
          targetValidity: validity,
          timeTrackingAllowed,
          dateRelevance: 'permanent',
          status,
          diagnostics: { notes: [] },
        });
      }
    }
  } catch (e) {
    diag.warnings.push(`organization_locations fetch failed: ${(e as Error).message}`);
  }

  return { targets, targetDiagnostics: diag };
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: convert ResolvedWorkTarget → WorkTarget contract type
// ─────────────────────────────────────────────────────────────────────────────

import type { WorkTarget, WorkTargetKind } from './contracts.ts';

export function toWorkTarget(rt: ResolvedWorkTarget): WorkTarget | null {
  if (rt.targetValidity !== 'valid') return null;
  if (rt.latitude == null || rt.longitude == null) return null;
  const kind: WorkTargetKind =
    rt.type === 'project' ? 'project'
    : rt.type === 'booking' ? 'booking'
    : rt.type === 'warehouse' ? 'warehouse'
    : 'organization_location';
  return {
    key: `${kind}:${rt.id}`,
    kind,
    refId: rt.id,
    label: rt.name,
    center: { lat: rt.latitude, lng: rt.longitude },
    radiusM: rt.radiusMeters ?? 100,
    assignedToUserToday: rt.dateRelevance === 'today',
  };
}
