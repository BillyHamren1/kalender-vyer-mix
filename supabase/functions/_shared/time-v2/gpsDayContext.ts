/**
 * Planning → Time READ-ONLY snapshot for ONE staff member on ONE GPS day.
 *
 * Contract: `planning-gps-day-context.v1`
 *
 * Purpose: Time needs to recognise, for a single day, exactly which places a
 * worker may have been at. Planning is the source of truth for:
 *   - the Planning-owned project targets scheduled for that worker/date
 *     (derived from staff_assignments team ↔ calendar_events.resource_id, i.e.
 *     the same team model the staff calendar uses),
 *   - the exact coordinates/radius of those places,
 *   - the organization-bound Lager location (never a global fallback).
 *
 * Guarantees:
 *   - Pure module. No I/O, no Deno APIs (WebCrypto only for the version hash).
 *   - Single organization. Every row must already be tenant-scoped by caller;
 *     rows from another organization are dropped, never projected.
 *   - Planning asserts *permission to recognise a place*, never worked time:
 *     every target carries `requiresEvidence: true` and `isWorkEvidence: false`.
 *   - Nothing is fabricated. Missing coordinates → `isExact: false` + reasons.
 */

import type { InternalLagerLocationTarget } from './lagerProjection.ts';

export const PLANNING_GPS_DAY_CONTEXT_SCHEMA = 'planning-gps-day-context.v1' as const;

export interface GpsDayCalendarEventRow {
  id: string;
  organization_id: string;
  resource_id: string | null;
  source_date: string | null;
  event_type: string | null;
  title: string | null;
  booking_id: string | null;
  booking_number: string | null;
  delivery_address: string | null;
  start_time: string | null;
  end_time: string | null;
}

export interface GpsDayBookingRow {
  id: string;
  organization_id: string;
  booking_number: string | null;
  deliveryaddress: string | null;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
}

export interface GpsDayProjectRow {
  id: string;
  organization_id: string;
  booking_id: string | null;
  name: string | null;
  deliveryaddress: string | null;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  address_radius_meters: number | null;
  is_internal: boolean | null;
}

export interface GpsDayStaffAssignmentRow {
  organization_id: string;
  staff_id: string;
  team_id: string | null;
  assignment_date: string | null;
}

export interface GpsDayContextInput {
  organizationId: string;
  staffId: string;
  staffName: string | null;
  date: string;
  /** Default geofence radius used when a place has no explicit radius. */
  defaultRadiusMeters?: number;
  staffAssignments: GpsDayStaffAssignmentRow[];
  calendarEvents: GpsDayCalendarEventRow[];
  bookings: GpsDayBookingRow[];
  projects: GpsDayProjectRow[];
  /** Canonical org-bound Lager location, or null when Planning has none. */
  lagerLocation: InternalLagerLocationTarget | null;
}

export interface GpsDayProjectTarget {
  kind: 'planning_project';
  targetKey: string;
  organizationId: string;
  staffId: string;
  date: string;
  teamId: string;
  projectId: string | null;
  bookingId: string | null;
  bookingNumber: string | null;
  label: string;
  phase: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  isExact: boolean;
  missingFields: string[];
  /** Planning permits recognition of the place; Time still needs GPS evidence. */
  requiresEvidence: true;
  /** Planning never asserts hours worked through this contract. */
  isWorkEvidence: false;
  provenance: {
    calendarEventId: string;
    source: 'staff_assignments x calendar_events';
  };
}

export interface GpsDayLagerTarget {
  kind: 'org_bound_lager';
  targetKey: string;
  organizationId: string;
  locationId: string;
  internalProjectId: string | null;
  label: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
  isExact: boolean;
  missingFields: string[];
  requiresEvidence: true;
  isWorkEvidence: false;
}

export interface GpsDayContext {
  schema: typeof PLANNING_GPS_DAY_CONTEXT_SCHEMA;
  organizationId: string;
  staffId: string;
  staffName: string | null;
  date: string;
  teams: string[];
  projectTargets: GpsDayProjectTarget[];
  lagerTarget: GpsDayLagerTarget | null;
  warnings: string[];
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Deterministic key ordering so the same day always hashes identically. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

export function canonicalGpsDayContextJson(context: GpsDayContext): string {
  return JSON.stringify(canonicalize(context));
}

export async function gpsDayContextHash(context: GpsDayContext): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalGpsDayContextJson(context));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Builds the versioned one-day snapshot. Pure and idempotent: same rows in →
 * byte-identical document out.
 */
export function buildGpsDayContext(input: GpsDayContextInput): GpsDayContext {
  const orgId = input.organizationId;
  const defaultRadius = input.defaultRadiusMeters ?? 150;
  const warnings: string[] = [];

  const teams = Array.from(
    new Set(
      input.staffAssignments
        .filter(
          (row) =>
            row.organization_id === orgId &&
            row.staff_id === input.staffId &&
            row.assignment_date === input.date &&
            typeof row.team_id === 'string' &&
            row.team_id.length > 0,
        )
        .map((row) => row.team_id as string),
    ),
  ).sort();

  if (teams.length === 0) {
    warnings.push('no_team_assignment_for_date');
  }

  const bookingById = new Map(
    input.bookings.filter((b) => b.organization_id === orgId).map((b) => [b.id, b]),
  );
  const projectByBookingId = new Map<string, GpsDayProjectRow>();
  for (const project of input.projects) {
    if (project.organization_id !== orgId) continue;
    if (project.is_internal) continue;
    if (!project.booking_id) continue;
    if (!projectByBookingId.has(project.booking_id)) {
      projectByBookingId.set(project.booking_id, project);
    }
  }

  const targets: GpsDayProjectTarget[] = [];
  for (const event of input.calendarEvents) {
    if (event.organization_id !== orgId) continue;
    if (event.source_date !== input.date) continue;
    const teamId = event.resource_id ?? '';
    if (!teams.includes(teamId)) continue;

    const booking = event.booking_id ? bookingById.get(event.booking_id) ?? null : null;
    const project = event.booking_id ? projectByBookingId.get(event.booking_id) ?? null : null;

    const latitude = isFiniteNumber(project?.delivery_latitude)
      ? (project?.delivery_latitude as number)
      : isFiniteNumber(booking?.delivery_latitude)
        ? (booking?.delivery_latitude as number)
        : null;
    const longitude = isFiniteNumber(project?.delivery_longitude)
      ? (project?.delivery_longitude as number)
      : isFiniteNumber(booking?.delivery_longitude)
        ? (booking?.delivery_longitude as number)
        : null;
    const explicitRadius = isFiniteNumber(project?.address_radius_meters)
      ? (project?.address_radius_meters as number)
      : null;
    const radiusMeters =
      explicitRadius !== null && explicitRadius > 0 ? explicitRadius : latitude !== null && longitude !== null ? defaultRadius : null;

    const missingFields: string[] = [];
    if (latitude === null || longitude === null) missingFields.push('coordinates');
    if (!project) missingFields.push('planning_project');

    const label =
      project?.name?.trim() ||
      event.title?.trim() ||
      booking?.booking_number ||
      event.booking_number ||
      'Planning-uppdrag';

    const target: GpsDayProjectTarget = {
      kind: 'planning_project',
      targetKey: `planning:project:${project?.id ?? event.booking_id ?? event.id}`,
      organizationId: orgId,
      staffId: input.staffId,
      date: input.date,
      teamId,
      projectId: project?.id ?? null,
      bookingId: event.booking_id ?? null,
      bookingNumber: booking?.booking_number ?? event.booking_number ?? null,
      label,
      phase: event.event_type ?? null,
      address:
        project?.deliveryaddress?.trim() ||
        booking?.deliveryaddress?.trim() ||
        event.delivery_address?.trim() ||
        null,
      latitude,
      longitude,
      radiusMeters,
      plannedStart: event.start_time ?? null,
      plannedEnd: event.end_time ?? null,
      isExact: latitude !== null && longitude !== null && radiusMeters !== null && radiusMeters > 0,
      missingFields,
      requiresEvidence: true,
      isWorkEvidence: false,
      provenance: { calendarEventId: event.id, source: 'staff_assignments x calendar_events' },
    };
    targets.push(target);
  }

  targets.sort((a, b) => (a.targetKey < b.targetKey ? -1 : a.targetKey > b.targetKey ? 1 : 0));

  if (targets.length === 0) warnings.push('no_planning_project_targets_for_date');
  if (targets.some((t) => !t.isExact)) warnings.push('project_target_missing_exact_location');

  let lagerTarget: GpsDayLagerTarget | null = null;
  const lager = input.lagerLocation;
  if (lager) {
    if (lager.organizationId !== orgId) {
      warnings.push('lager_location_rejected_wrong_organization');
    } else {
      lagerTarget = {
        kind: 'org_bound_lager',
        targetKey: lager.targetKey,
        organizationId: lager.organizationId,
        locationId: lager.locationId,
        internalProjectId: lager.internalProjectId,
        label: lager.label,
        address: lager.address,
        latitude: lager.latitude,
        longitude: lager.longitude,
        radiusMeters: lager.radiusMeters,
        isExact: lager.isExact,
        missingFields: lager.missingFields,
        requiresEvidence: true,
        isWorkEvidence: false,
      };
    }
  } else {
    warnings.push('no_org_bound_lager_location');
  }

  return {
    schema: PLANNING_GPS_DAY_CONTEXT_SCHEMA,
    organizationId: orgId,
    staffId: input.staffId,
    staffName: input.staffName ?? null,
    date: input.date,
    teams,
    projectTargets: targets,
    lagerTarget,
    warnings: Array.from(new Set(warnings)).sort(),
  };
}
