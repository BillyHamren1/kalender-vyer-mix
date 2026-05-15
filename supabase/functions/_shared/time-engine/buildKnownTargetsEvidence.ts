// @ts-nocheck
/**
 * buildKnownTargetsEvidence (Time Engine — Lager 1.6)
 * ───────────────────────────────────────────────────
 *
 * Samlar alla FYSISKA targets som finns för en staff/dag, normaliserar dem
 * och flaggar data quality. Detta är ren read-only context-insamling.
 *
 * PRODUKTREGEL — KNOWN TARGETS ÄR INTE BEVIS PÅ NÄRVARO.
 *   Den här helpern säger BARA vilka platser som *kan* matchas senare. Den
 *   säger ALDRIG att personen var där. Output får INTE användas för
 *   display-block, time_reports, payroll eller transport-beslut.
 *
 * Stora projekt-regler:
 *   - Large project är primary work target och geo target om det har egen geo.
 *   - Child bookings inom large project är INTE primary work target.
 *   - Child bookings inom large project är INTE geo fallback.
 *   - Om large project saknar geo → dataQuality.largeProjectsMissingGeo.
 *
 * Källor som läses (read-only):
 *   - organization_locations (warehouse + locations + private residences)
 *   - large_projects
 *   - projects
 *   - bookings (datum-relevanta + de som assignments refererar till)
 *   - staff_private_zones
 *   - staff_home_observations
 *   - staff_inferred_home_locations
 */

export type KnownTargetType =
  | 'warehouse'
  | 'organization_location'
  | 'large_project'
  | 'project'
  | 'booking'
  | 'private_zone'
  | 'home_observation'
  | 'inferred_home';

export type KnownTargetStatus = string | null;

export type KnownTargetSuppressedReason =
  | 'child_booking_inside_large_project'
  | 'child_project_inside_large_project'
  | 'large_project_missing_geo'
  | 'missing_coordinates'
  | 'missing_radius_and_polygon'
  | 'cancelled'
  | 'archived'
  | 'test_data'
  | 'outside_date_window'
  | null;

export interface KnownTargetPolygonPoint { lat: number; lng: number }

export interface KnownTargetEvidenceItem {
  targetType: KnownTargetType;
  targetId: string;
  label: string;
  lat: number | null;
  lng: number | null;
  radiusMeters: number | null;
  polygon: KnownTargetPolygonPoint[] | null;
  hasCoordinates: boolean;
  hasRadius: boolean;
  sourceTable: string;
  status: KnownTargetStatus;
  dateWindow: { startUtc: string | null; endUtc: string | null } | null;
  parentLargeProjectId: string | null;
  belongsToLargeProject: boolean;
  canBePrimaryWorkTarget: boolean;
  canBeGeoTarget: boolean;
  suppressedReason: KnownTargetSuppressedReason;
}

export interface LargeProjectMissingGeoEntry {
  targetId: string;
  largeProjectId: string;
  label: string;
  largeProjectName: string;
  reason: 'large_project_missing_own_geo';
  childObjectsCount: number;
  hasChildBookingGeo: boolean;
  hasChildProjectGeo: boolean;
}

export interface KnownTargetsDataQuality {
  targetsMissingCoordinates: Array<{ targetType: KnownTargetType; targetId: string; label: string }>;
  targetsMissingRadius: Array<{ targetType: KnownTargetType; targetId: string; label: string }>;
  largeProjectsMissingGeo: LargeProjectMissingGeoEntry[];
  bookingsInsideLargeProjects: Array<{ bookingId: string; largeProjectId: string; label: string }>;
  projectsInsideLargeProjects: Array<{ projectId: string; largeProjectId: string; label: string }>;
  childBookingsSuppressedAsTargets: Array<{ bookingId: string; largeProjectId: string }>;
  childProjectsSuppressedAsTargets: Array<{ projectId: string; largeProjectId: string }>;
  ambiguousLargeProjectChildProjects: Array<{ projectId: string; largeProjectId: string; reason: string }>;
  assignmentsWithoutMatchingTarget: Array<{ assignmentId: string | null; bookingId: string | null; largeProjectId: string | null }>;
  calendarEventsWithoutTarget: Array<{ calendarEventId: string | null; bookingId: string | null; reason: 'no_booking_ref' | 'booking_not_in_targets' | 'no_target_relation' }>;
  /** Lager 1.9 — calendar_events vars booking tillhör ett large project. */
  calendarEventsWithLargeProjectContext: Array<{ calendarEventId: string | null; bookingId: string | null; largeProjectId: string }>;
  /** Lager 1.9 — calendar_events som pekar på child booking (suppressed). */
  calendarEventsPointingToChildBooking: Array<{ calendarEventId: string | null; bookingId: string; largeProjectId: string }>;
  /** Lager 1.9 — calendar_events vars LP-context saknar egen geo. */
  calendarEventsPointingToMissingGeoLargeProject: Array<{ calendarEventId: string | null; bookingId: string | null; largeProjectId: string }>;
  targetsWithNullRadius: Array<{ targetType: KnownTargetType; targetId: string; label: string }>;
}

export interface LargeProjectRulesDiagnostics {
  largeProjectCount: number;
  largeProjectsWithGeoCount: number;
  largeProjectsMissingGeoCount: number;
  childBookingsSuppressedCount: number;
  childProjectsSuppressedCount: number;
  ambiguousLargeProjectChildProjectCount: number;
}

export interface CalendarEventTargetDiagnostics {
  calendarEventCount: number;
  calendarEventsWithTargetCount: number;
  calendarEventsWithoutTargetCount: number;
  calendarEventsWithLargeProjectContextCount: number;
  calendarEventsPointingToChildBookingCount: number;
  calendarEventsPointingToMissingGeoLargeProjectCount: number;
  examples: Array<{
    calendarEventId: string | null;
    bookingId: string | null;
    largeProjectId: string | null;
    teamId: string | null;
    title: string | null;
    plannedPhase: string | null;
    classification: 'with_target' | 'no_booking_ref' | 'booking_not_in_targets' | 'child_booking_inside_lp' | 'lp_missing_geo';
  }>;
}

export interface KnownTargetsDiagnostics {
  warehouseCount: number;
  organizationLocationCount: number;
  largeProjectCount: number;
  projectCount: number;
  bookingCount: number;
  privateZoneCount: number;
  childBookingsSuppressedCount: number;
  childProjectsSuppressedCount: number;
  largeProjectsMissingGeoCount: number;
  targetsMissingRadiusCount: number;
  /** Lager 1.8 — konsoliderade large project-regler. */
  largeProjectRules: LargeProjectRulesDiagnostics;
  /** Lager 1.9 — calendar_event ↔ target-matchning. */
  calendarEventTargetDiagnostics: CalendarEventTargetDiagnostics;
  warnings: string[];
  examples: Array<{
    targetType: KnownTargetType;
    targetId: string;
    label: string;
    canBePrimaryWorkTarget: boolean;
    canBeGeoTarget: boolean;
    suppressedReason: KnownTargetSuppressedReason;
  }>;
}

export interface BuildKnownTargetsEvidenceInput {
  supabaseAdmin: any;
  organizationId: string;
  staffId: string;
  /** YYYY-MM-DD (Stockholm-local). */
  date: string;
  /** Optional list of booking ids referenced by assignment evidence (Lager 1.5). */
  assignmentBookingIds?: string[];
  /** Optional list of large project ids referenced by assignment evidence (Lager 1.5). */
  assignmentLargeProjectIds?: string[];
  /** Optional list of calendar events referenced by assignment evidence — rich
   *  shape from Lager 1.9. Used for diagnostics only. */
  assignmentCalendarEvents?: Array<{
    id?: string | null;
    eventId?: string | null;
    bookingId: string | null;
    largeProjectId?: string | null;
    teamId?: string | null;
    title?: string | null;
    plannedPhase?: string | null;
  }>;
  /** Optional raw assignment items for diagnostics (assignmentsWithoutMatchingTarget). */
  assignmentItems?: Array<{ assignmentId: string | null; bookingId: string | null; largeProjectId: string | null }>;
}

export interface BuildKnownTargetsEvidenceResult {
  items: KnownTargetEvidenceItem[];
  dataQuality: KnownTargetsDataQuality;
  diagnostics: KnownTargetsDiagnostics;
}

const TEST_HINTS = ['test', 'demo', 'sandbox', 'playground'];
const CANCELLED_STATUSES = new Set(['cancelled', 'canceled', 'avbokad', 'avbokat']);
const ARCHIVED_STATUSES = new Set(['archived', 'arkiverad', 'closed', 'stängd', 'stangd']);

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isTestName(name: string | null | undefined) {
  return !!name && TEST_HINTS.some((h) => String(name).toLowerCase().includes(h));
}

function classifyStatusReason(name: string | null, status: string | null): KnownTargetSuppressedReason | null {
  if (isTestName(name)) return 'test_data';
  const s = (status ?? '').toLowerCase();
  if (CANCELLED_STATUSES.has(s)) return 'cancelled';
  if (ARCHIVED_STATUSES.has(s)) return 'archived';
  return null;
}

function normalizePolygon(raw: unknown): KnownTargetPolygonPoint[] | null {
  if (!raw) return null;
  if (
    typeof raw === 'object' &&
    raw !== null &&
    (raw as { type?: string }).type === 'Polygon' &&
    Array.isArray((raw as { coordinates?: unknown }).coordinates)
  ) {
    const rings = (raw as { coordinates: unknown[] }).coordinates;
    const outer = Array.isArray(rings[0]) ? (rings[0] as unknown[]) : [];
    const out: KnownTargetPolygonPoint[] = [];
    for (const pt of outer) {
      if (Array.isArray(pt) && pt.length >= 2) {
        const lng = pt[0];
        const lat = pt[1];
        if (isFiniteNumber(lat) && isFiniteNumber(lng)) out.push({ lat, lng });
      }
    }
    return out.length >= 3 ? out : null;
  }
  if (!Array.isArray(raw) || raw.length < 3) return null;
  const out: KnownTargetPolygonPoint[] = [];
  for (const p of raw as any[]) {
    const lat = p?.lat ?? p?.latitude;
    const lng = p?.lng ?? p?.longitude;
    if (isFiniteNumber(lat) && isFiniteNumber(lng)) out.push({ lat, lng });
  }
  return out.length >= 3 ? out : null;
}

function pushExample(diag: KnownTargetsDiagnostics, item: KnownTargetEvidenceItem) {
  if (diag.examples.length >= 8) return;
  diag.examples.push({
    targetType: item.targetType,
    targetId: item.targetId,
    label: item.label,
    canBePrimaryWorkTarget: item.canBePrimaryWorkTarget,
    canBeGeoTarget: item.canBeGeoTarget,
    suppressedReason: item.suppressedReason,
  });
}

export async function buildKnownTargetsEvidence(
  input: BuildKnownTargetsEvidenceInput,
): Promise<BuildKnownTargetsEvidenceResult> {
  const { supabaseAdmin, organizationId, staffId, date } = input;

  const items: KnownTargetEvidenceItem[] = [];
  const dq: KnownTargetsDataQuality = {
    targetsMissingCoordinates: [],
    targetsMissingRadius: [],
    largeProjectsMissingGeo: [],
    bookingsInsideLargeProjects: [],
    projectsInsideLargeProjects: [],
    childBookingsSuppressedAsTargets: [],
    childProjectsSuppressedAsTargets: [],
    ambiguousLargeProjectChildProjects: [],
    assignmentsWithoutMatchingTarget: [],
    calendarEventsWithoutTarget: [],
    calendarEventsWithLargeProjectContext: [],
    calendarEventsPointingToChildBooking: [],
    calendarEventsPointingToMissingGeoLargeProject: [],
    targetsWithNullRadius: [],
  };
  const diag: KnownTargetsDiagnostics = {
    warehouseCount: 0,
    organizationLocationCount: 0,
    largeProjectCount: 0,
    projectCount: 0,
    bookingCount: 0,
    privateZoneCount: 0,
    childBookingsSuppressedCount: 0,
    childProjectsSuppressedCount: 0,
    largeProjectsMissingGeoCount: 0,
    targetsMissingRadiusCount: 0,
    largeProjectRules: {
      largeProjectCount: 0,
      largeProjectsWithGeoCount: 0,
      largeProjectsMissingGeoCount: 0,
      childBookingsSuppressedCount: 0,
      childProjectsSuppressedCount: 0,
      ambiguousLargeProjectChildProjectCount: 0,
    },
    calendarEventTargetDiagnostics: {
      calendarEventCount: 0,
      calendarEventsWithTargetCount: 0,
      calendarEventsWithoutTargetCount: 0,
      calendarEventsWithLargeProjectContextCount: 0,
      calendarEventsPointingToChildBookingCount: 0,
      calendarEventsPointingToMissingGeoLargeProjectCount: 0,
      examples: [],
    },
    warnings: [],
    examples: [],
  };

  function record(item: KnownTargetEvidenceItem) {
    if (!item.hasCoordinates && !item.polygon) {
      dq.targetsMissingCoordinates.push({ targetType: item.targetType, targetId: item.targetId, label: item.label });
    }
    if (!item.polygon && !item.hasRadius) {
      dq.targetsMissingRadius.push({ targetType: item.targetType, targetId: item.targetId, label: item.label });
    }
    if (item.radiusMeters === null && !item.polygon) {
      dq.targetsWithNullRadius.push({ targetType: item.targetType, targetId: item.targetId, label: item.label });
    }
    items.push(item);
    pushExample(diag, item);
  }

  // ── 1. organization_locations (warehouse + permanent locations + residences) ─
  try {
    const { data, error } = await supabaseAdmin
      .from('organization_locations')
      .select(
        'id, name, location_type, is_active, latitude, longitude, radius_meters, geofence_polygon, is_private_residence',
      )
      .eq('organization_id', organizationId);
    if (error) {
      diag.warnings.push(`organization_locations: ${error.message}`);
    } else {
      for (const r of data ?? []) {
        const isWarehouse = String(r.location_type ?? '').toLowerCase().includes('warehouse')
          || String(r.location_type ?? '').toLowerCase().includes('lager');
        const targetType: KnownTargetType = r.is_private_residence
          ? 'private_zone'
          : isWarehouse
            ? 'warehouse'
            : 'organization_location';
        const lat = isFiniteNumber(r.latitude) ? r.latitude : null;
        const lng = isFiniteNumber(r.longitude) ? r.longitude : null;
        const polygon = normalizePolygon(r.geofence_polygon);
        const radius = isFiniteNumber(r.radius_meters) ? r.radius_meters : null;
        const hasCoords = lat !== null && lng !== null;
        const hasRadius = radius !== null && radius > 0;
        const olStatus = r.is_active === false ? 'inactive' : 'active';
        let suppressed: KnownTargetSuppressedReason = classifyStatusReason(r.name, olStatus);
        if (!suppressed && !hasCoords && !polygon) suppressed = 'missing_coordinates';
        if (!suppressed && !polygon && !hasRadius) suppressed = 'missing_radius_and_polygon';
        const usableGeo = !suppressed && (polygon !== null || (hasCoords && hasRadius));
        const isResidence = !!r.is_private_residence;
        record({
          targetType,
          targetId: r.id,
          label: r.name ?? '(unnamed location)',
          lat,
          lng,
          radiusMeters: radius,
          polygon,
          hasCoordinates: hasCoords,
          hasRadius,
          sourceTable: 'organization_locations',
          status: olStatus,
          dateWindow: null,
          parentLargeProjectId: null,
          belongsToLargeProject: false,
          // Residenser auto-matchas aldrig som arbete.
          canBePrimaryWorkTarget: !isResidence && usableGeo,
          canBeGeoTarget: usableGeo,
          suppressedReason: suppressed,
        });
        if (targetType === 'warehouse') diag.warehouseCount += 1;
        else if (targetType === 'organization_location') diag.organizationLocationCount += 1;
        else diag.privateZoneCount += 1;
      }
    }
  } catch (e) {
    diag.warnings.push(`organization_locations exception: ${(e as Error).message}`);
  }

  // ── 2. large_projects ────────────────────────────────────────────────────
  // Samlar bara LP-info här. dataQuality.largeProjectsMissingGeo populeras
  // i post-pass när vi vet hur många child-objekt varje LP har.
  interface LpInfo { id: string; label: string; hasGeo: boolean; suppressed: KnownTargetSuppressedReason }
  const largeProjectInfoById = new Map<string, LpInfo>();
  try {
    const { data, error } = await supabaseAdmin
      .from('large_projects')
      .select(
        'id, name, status, address_latitude, address_longitude, address_radius_meters, address_geofence_polygon, start_date, end_date, deleted_at',
      )
      .eq('organization_id', organizationId)
      .is('deleted_at', null);
    if (error) {
      diag.warnings.push(`large_projects: ${error.message}`);
    } else {
      for (const r of data ?? []) {
        const lat = isFiniteNumber(r.address_latitude) ? r.address_latitude : null;
        const lng = isFiniteNumber(r.address_longitude) ? r.address_longitude : null;
        const polygon = normalizePolygon(r.address_geofence_polygon);
        const radius = isFiniteNumber(r.address_radius_meters) ? r.address_radius_meters : null;
        const hasCoords = lat !== null && lng !== null;
        const hasRadius = radius !== null && radius > 0;
        const usableGeo = (polygon !== null) || (hasCoords && hasRadius);
        let suppressed: KnownTargetSuppressedReason = classifyStatusReason(r.name, r.status);
        if (!suppressed && !usableGeo) suppressed = 'large_project_missing_geo';
        const label = r.name ?? `LP ${r.id.slice(0, 8)}`;
        largeProjectInfoById.set(r.id, { id: r.id, label, hasGeo: usableGeo, suppressed });
        record({
          targetType: 'large_project',
          targetId: r.id,
          label,
          lat,
          lng,
          radiusMeters: radius,
          polygon,
          hasCoordinates: hasCoords,
          hasRadius,
          sourceTable: 'large_projects',
          status: r.status ?? null,
          dateWindow: { startUtc: r.start_date ?? null, endUtc: r.end_date ?? null },
          parentLargeProjectId: null,
          belongsToLargeProject: false,
          // PRODUKTREGEL: large project = primary work target.
          canBePrimaryWorkTarget: true,
          // Geo target endast om den har egen geo.
          canBeGeoTarget: usableGeo,
          suppressedReason: suppressed,
        });
        diag.largeProjectCount += 1;
      }
    }
  } catch (e) {
    diag.warnings.push(`large_projects exception: ${(e as Error).message}`);
  }

  // ── 2.5. Bygg bookingToLp-map FÖRE bookings/projects ─────────────────────
  // Källa A: large_project_bookings (join-tabell, sanning)
  // Källa B: bookings.large_project_id (direkt kolumn)
  // Båda läses; vi använder unionen så projekt-relationen kan härledas
  // transitivt via project.booking_id → booking.large_project_id.
  const bookingToLp = new Map<string, string>();
  try {
    const { data, error } = await supabaseAdmin
      .from('large_project_bookings')
      .select('booking_id, large_project_id')
      .eq('organization_id', organizationId);
    if (error) {
      diag.warnings.push(`large_project_bookings: ${error.message}`);
    } else {
      for (const r of data ?? []) {
        if (r.booking_id && r.large_project_id) {
          bookingToLp.set(r.booking_id, r.large_project_id);
        }
      }
    }
  } catch (e) {
    diag.warnings.push(`large_project_bookings exception: ${(e as Error).message}`);
  }

  // ── 3. bookings ─────────────────────────────────────────────────────────
  // Hämtas FÖRE projects så bookingToLp är komplett innan vi härleder
  // child_project-relationen. Datum-relevanta + assignment-refererade.
  // Spar booking-info för projects-loopen och post-pass.
  const referencedBookingIds = new Set<string>(input.assignmentBookingIds ?? []);
  const bookingsData: any[] = [];
  try {
    try {
      const { data, error } = await supabaseAdmin
        .from('bookings')
        .select(
          'id, booking_number, assigned_project_name, status, delivery_latitude, delivery_longitude, address_radius_meters, address_geofence_polygon, deliveryaddress, eventdate, rigdaydate, rigdowndate, large_project_id',
        )
        .eq('organization_id', organizationId)
        .or(`eventdate.eq.${date},rigdaydate.eq.${date},rigdowndate.eq.${date}`);
      if (error) diag.warnings.push(`bookings (date): ${error.message}`);
      else for (const b of (data ?? [])) bookingsData.push(b);
    } catch (e) {
      diag.warnings.push(`bookings (date) exception: ${(e as Error).message}`);
    }

    const haveIds = new Set<string>(bookingsData.map((b) => b.id));
    const missing = [...referencedBookingIds].filter((id) => !haveIds.has(id));
    if (missing.length > 0) {
      try {
        const { data, error } = await supabaseAdmin
          .from('bookings')
          .select(
            'id, booking_number, assigned_project_name, status, delivery_latitude, delivery_longitude, address_radius_meters, address_geofence_polygon, deliveryaddress, eventdate, rigdaydate, rigdowndate, large_project_id',
          )
          .eq('organization_id', organizationId)
          .in('id', missing);
        if (error) diag.warnings.push(`bookings (referenced): ${error.message}`);
        else for (const b of (data ?? [])) bookingsData.push(b);
      } catch (e) {
        diag.warnings.push(`bookings (referenced) exception: ${(e as Error).message}`);
      }
    }

    // Komplettera bookingToLp med direktkolumnen.
    for (const r of bookingsData) {
      if (r.large_project_id && !bookingToLp.has(r.id)) {
        bookingToLp.set(r.id, r.large_project_id);
      }
    }

    for (const r of bookingsData) {
      const parentLp = bookingToLp.get(r.id) ?? r.large_project_id ?? null;
      const belongsToLp = !!parentLp;
      const lat = isFiniteNumber(r.delivery_latitude) ? r.delivery_latitude : null;
      const lng = isFiniteNumber(r.delivery_longitude) ? r.delivery_longitude : null;
      const polygon = normalizePolygon(r.address_geofence_polygon);
      const radius = isFiniteNumber(r.address_radius_meters) ? r.address_radius_meters : null;
      const hasCoords = lat !== null && lng !== null;
      const hasRadius = radius !== null && radius > 0;
      const usableGeo = polygon !== null || (hasCoords && hasRadius);
      const projectName = r.assigned_project_name ?? null;
      const label = projectName
        ? `${projectName}${r.booking_number ? ` (${r.booking_number})` : ''}`
        : (r.booking_number ?? `BK ${r.id.slice(0, 8)}`);

      let suppressed: KnownTargetSuppressedReason = classifyStatusReason(projectName, r.status);

      // PRODUKTREGEL: child bookings inom large project är inte primary
      // work target och inte geo fallback. Aldrig tyst geo-fallback.
      let canPrimary = !suppressed;
      let canGeo = usableGeo && !suppressed;
      if (!suppressed && belongsToLp) {
        suppressed = 'child_booking_inside_large_project';
        canPrimary = false;
        canGeo = false;
        dq.bookingsInsideLargeProjects.push({ bookingId: r.id, largeProjectId: parentLp, label });
        dq.childBookingsSuppressedAsTargets.push({ bookingId: r.id, largeProjectId: parentLp });
        diag.childBookingsSuppressedCount += 1;
      } else if (!suppressed && !usableGeo) {
        suppressed = 'missing_coordinates';
        canPrimary = false;
      }

      record({
        targetType: 'booking',
        targetId: r.id,
        label,
        lat,
        lng,
        radiusMeters: radius,
        polygon,
        hasCoordinates: hasCoords,
        hasRadius,
        sourceTable: 'bookings',
        status: r.status ?? null,
        dateWindow: { startUtc: r.rigdaydate ?? r.eventdate ?? null, endUtc: r.rigdowndate ?? r.eventdate ?? null },
        parentLargeProjectId: parentLp,
        belongsToLargeProject: belongsToLp,
        canBePrimaryWorkTarget: canPrimary,
        canBeGeoTarget: canGeo,
        suppressedReason: suppressed,
      });
      diag.bookingCount += 1;
    }
  } catch (e) {
    diag.warnings.push(`bookings exception: ${(e as Error).message}`);
  }

  // ── 4. projects ─────────────────────────────────────────────────────────
  // Hämta projekt aktiva för datumet eller refererade av assignments.
  // SCHEMAT har INTE projects.large_project_id — relation till LP härleds
  // transitivt via project.booking_id → bookingToLp. Stand-alone projects
  // som hör till en booking inom LP undertrycks som primary/geo target.
  const projectIdToBookingId = new Map<string, string>();
  try {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .select(
        'id, name, status, deliveryaddress, delivery_latitude, delivery_longitude, address_radius_meters, address_geofence_polygon, eventdate, rigdaydate, rigdowndate, deleted_at, booking_id',
      )
      .eq('organization_id', organizationId)
      .is('deleted_at', null);
    if (error) {
      diag.warnings.push(`projects: ${error.message}`);
    } else {
      for (const r of data ?? []) {
        if (r.booking_id) projectIdToBookingId.set(r.id, r.booking_id);
        const dateRelevant = r.eventdate === date || r.rigdaydate === date || r.rigdowndate === date;
        const referenced = r.booking_id && (input.assignmentBookingIds ?? []).includes(r.booking_id);
        if (!dateRelevant && !referenced) continue;
        const lat = isFiniteNumber(r.delivery_latitude) ? r.delivery_latitude : null;
        const lng = isFiniteNumber(r.delivery_longitude) ? r.delivery_longitude : null;
        const polygon = normalizePolygon(r.address_geofence_polygon);
        const radius = isFiniteNumber(r.address_radius_meters) ? r.address_radius_meters : null;
        const hasCoords = lat !== null && lng !== null;
        const hasRadius = radius !== null && radius > 0;
        const usableGeo = polygon !== null || (hasCoords && hasRadius);
        const parentLp = r.booking_id ? (bookingToLp.get(r.booking_id) ?? null) : null;
        const belongsToLp = !!parentLp;
        let suppressed: KnownTargetSuppressedReason = classifyStatusReason(r.name, r.status);

        // PRODUKTREGEL: child projects inom large project är inte primary
        // work target och inte geo target. LP äger platsen.
        let canPrimary = !suppressed;
        let canGeo = usableGeo && !suppressed;
        if (!suppressed && belongsToLp) {
          suppressed = 'child_project_inside_large_project';
          canPrimary = false;
          canGeo = false;
          dq.projectsInsideLargeProjects.push({ projectId: r.id, largeProjectId: parentLp, label: r.name ?? '(unnamed project)' });
          dq.childProjectsSuppressedAsTargets.push({ projectId: r.id, largeProjectId: parentLp });
          diag.childProjectsSuppressedCount += 1;
          // Specialfall: child project har egen geo trots LP-tillhörighet.
          // Vi tystar det inte här (det vore att tyst använda fallback) men
          // flaggar för senare granskning.
          if (usableGeo) {
            dq.ambiguousLargeProjectChildProjects.push({
              projectId: r.id,
              largeProjectId: parentLp,
              reason: 'child_project_has_own_geo_but_lp_owns_location',
            });
          }
        } else if (!suppressed && !usableGeo) {
          suppressed = 'missing_coordinates';
          canPrimary = false;
        }

        record({
          targetType: 'project',
          targetId: r.id,
          label: r.name ?? '(unnamed project)',
          lat,
          lng,
          radiusMeters: radius,
          polygon,
          hasCoordinates: hasCoords,
          hasRadius,
          sourceTable: 'projects',
          status: r.status ?? null,
          dateWindow: { startUtc: r.rigdaydate ?? r.eventdate ?? null, endUtc: r.rigdowndate ?? r.eventdate ?? null },
          parentLargeProjectId: parentLp,
          belongsToLargeProject: belongsToLp,
          canBePrimaryWorkTarget: canPrimary,
          canBeGeoTarget: canGeo,
          suppressedReason: suppressed,
        });
        diag.projectCount += 1;
      }
    }
  } catch (e) {
    diag.warnings.push(`projects exception: ${(e as Error).message}`);
  }

  // ── 5. staff_private_zones ──────────────────────────────────────────────
  try {
    const { data, error } = await supabaseAdmin
      .from('staff_private_zones')
      .select('id, label, kind, lat, lng, radius_m, active')
      .eq('organization_id', organizationId)
      .eq('staff_id', staffId);
    if (error) {
      diag.warnings.push(`staff_private_zones: ${error.message}`);
    } else {
      for (const r of data ?? []) {
        if (r.active === false) continue;
        const lat = isFiniteNumber(r.lat) ? r.lat : null;
        const lng = isFiniteNumber(r.lng) ? r.lng : null;
        const polygon = null as any;
        const radius = isFiniteNumber(r.radius_m) ? r.radius_m : null;
        const hasCoords = lat !== null && lng !== null;
        const hasRadius = radius !== null && radius > 0;
        const usableGeo = hasCoords && hasRadius;
        record({
          targetType: 'private_zone',
          targetId: r.id,
          label: r.label ?? r.kind ?? 'private_zone',
          lat,
          lng,
          radiusMeters: radius,
          polygon,
          hasCoordinates: hasCoords,
          hasRadius,
          sourceTable: 'staff_private_zones',
          status: r.kind ?? null,
          dateWindow: null,
          parentLargeProjectId: null,
          belongsToLargeProject: false,
          // Privata zoner auto-matchas aldrig som arbete.
          canBePrimaryWorkTarget: false,
          canBeGeoTarget: usableGeo,
          suppressedReason: usableGeo ? null : 'missing_coordinates',
        });
        diag.privateZoneCount += 1;
      }
    }
  } catch (e) {
    diag.warnings.push(`staff_private_zones exception: ${(e as Error).message}`);
  }

  // ── 6. staff_home_observations (read-only signal) ───────────────────────
  try {
    const { data, error } = await supabaseAdmin
      .from('staff_home_observations')
      .select('id, lat, lng, dwell_minutes, observed_date')
      .eq('organization_id', organizationId)
      .eq('staff_id', staffId);
    if (error) {
      // Tabellen kan saknas i vissa miljöer — varna men krascha inte.
      diag.warnings.push(`staff_home_observations: ${error.message}`);
    } else {
      for (const r of data ?? []) {
        const lat = isFiniteNumber(r.lat) ? r.lat : null;
        const lng = isFiniteNumber(r.lng) ? r.lng : null;
        const radius = null as number | null;
        const hasCoords = lat !== null && lng !== null;
        record({
          targetType: 'home_observation',
          targetId: r.id,
          label: 'home_observation',
          lat,
          lng,
          radiusMeters: radius,
          polygon: null,
          hasCoordinates: hasCoords,
          hasRadius: radius !== null && radius > 0,
          sourceTable: 'staff_home_observations',
          status: null,
          dateWindow: null,
          parentLargeProjectId: null,
          belongsToLargeProject: false,
          canBePrimaryWorkTarget: false,
          canBeGeoTarget: false, // observations är råsignal, inte target
          suppressedReason: null,
        });
      }
    }
  } catch (e) {
    diag.warnings.push(`staff_home_observations exception: ${(e as Error).message}`);
  }

  // ── 7. staff_inferred_home_locations (read-only signal) ─────────────────
  try {
    const { data, error } = await supabaseAdmin
      .from('staff_inferred_home_locations')
      .select('id, lat, lng, radius_m, confidence')
      .eq('organization_id', organizationId)
      .eq('staff_id', staffId);
    if (error) {
      diag.warnings.push(`staff_inferred_home_locations: ${error.message}`);
    } else {
      for (const r of data ?? []) {
        const lat = isFiniteNumber(r.lat) ? r.lat : null;
        const lng = isFiniteNumber(r.lng) ? r.lng : null;
        const radius = isFiniteNumber(r.radius_m) ? r.radius_m : null;
        const hasCoords = lat !== null && lng !== null;
        const hasRadius = radius !== null && radius > 0;
        const usableGeo = hasCoords && hasRadius;
        record({
          targetType: 'inferred_home',
          targetId: r.id,
          label: 'inferred_home',
          lat,
          lng,
          radiusMeters: radius,
          polygon: null,
          hasCoordinates: hasCoords,
          hasRadius,
          sourceTable: 'staff_inferred_home_locations',
          status: null,
          dateWindow: null,
          parentLargeProjectId: null,
          belongsToLargeProject: false,
          canBePrimaryWorkTarget: false,
          canBeGeoTarget: usableGeo,
          suppressedReason: usableGeo ? null : 'missing_coordinates',
        });
      }
    }
  } catch (e) {
    diag.warnings.push(`staff_inferred_home_locations exception: ${(e as Error).message}`);
  }

  // ── 8. Diagnostics: assignments without matching target ─────────────────
  const targetBookingIds = new Set(items.filter((i) => i.targetType === 'booking').map((i) => i.targetId));
  const targetLpIds = new Set(items.filter((i) => i.targetType === 'large_project').map((i) => i.targetId));
  for (const a of input.assignmentItems ?? []) {
    const haveBooking = a.bookingId && targetBookingIds.has(a.bookingId);
    const haveLp = a.largeProjectId && targetLpIds.has(a.largeProjectId);
    if (!haveBooking && !haveLp) {
      dq.assignmentsWithoutMatchingTarget.push({
        assignmentId: a.assignmentId,
        bookingId: a.bookingId,
        largeProjectId: a.largeProjectId,
      });
    }
  }
  // ── Lager 1.9: calendar_event ↔ target-matchning ────────────────────────
  // Bygg index för LP-context (booking → lp + lp_geo_status).
  const bookingItemsById = new Map<string, KnownTargetEvidenceItem>();
  for (const it of items) if (it.targetType === 'booking') bookingItemsById.set(it.targetId, it);
  const lpItemsById = new Map<string, KnownTargetEvidenceItem>();
  for (const it of items) if (it.targetType === 'large_project') lpItemsById.set(it.targetId, it);

  const ceDiag = diag.calendarEventTargetDiagnostics;
  for (const ce of input.assignmentCalendarEvents ?? []) {
    ceDiag.calendarEventCount += 1;
    const ceId = ce.eventId ?? ce.id ?? null;
    const bookingItem = ce.bookingId ? bookingItemsById.get(ce.bookingId) : null;
    const lpId =
      bookingItem?.parentLargeProjectId ??
      ce.largeProjectId ??
      null;
    const lpItem = lpId ? lpItemsById.get(lpId) : null;

    let classification: 'with_target' | 'no_booking_ref' | 'booking_not_in_targets' | 'child_booking_inside_lp' | 'lp_missing_geo' = 'with_target';

    if (!ce.bookingId) {
      classification = 'no_booking_ref';
      dq.calendarEventsWithoutTarget.push({ calendarEventId: ceId, bookingId: null, reason: 'no_booking_ref' });
      ceDiag.calendarEventsWithoutTargetCount += 1;
    } else if (!bookingItem) {
      classification = 'booking_not_in_targets';
      dq.calendarEventsWithoutTarget.push({ calendarEventId: ceId, bookingId: ce.bookingId, reason: 'booking_not_in_targets' });
      ceDiag.calendarEventsWithoutTargetCount += 1;
    } else {
      ceDiag.calendarEventsWithTargetCount += 1;
    }

    if (lpId) {
      ceDiag.calendarEventsWithLargeProjectContextCount += 1;
      dq.calendarEventsWithLargeProjectContext.push({
        calendarEventId: ceId,
        bookingId: ce.bookingId,
        largeProjectId: lpId,
      });
      // Child booking suppressed?
      if (bookingItem && bookingItem.suppressedReason === 'child_booking_inside_large_project' && ce.bookingId) {
        classification = 'child_booking_inside_lp';
        ceDiag.calendarEventsPointingToChildBookingCount += 1;
        dq.calendarEventsPointingToChildBooking.push({
          calendarEventId: ceId,
          bookingId: ce.bookingId,
          largeProjectId: lpId,
        });
      }
      // LP saknar egen geo?
      if (lpItem && !lpItem.canBeGeoTarget) {
        if (classification === 'with_target') classification = 'lp_missing_geo';
        ceDiag.calendarEventsPointingToMissingGeoLargeProjectCount += 1;
        dq.calendarEventsPointingToMissingGeoLargeProject.push({
          calendarEventId: ceId,
          bookingId: ce.bookingId,
          largeProjectId: lpId,
        });
      }
    }

    if (ceDiag.examples.length < 8) {
      ceDiag.examples.push({
        calendarEventId: ceId,
        bookingId: ce.bookingId ?? null,
        largeProjectId: lpId,
        teamId: ce.teamId ?? null,
        title: ce.title ?? null,
        plannedPhase: ce.plannedPhase ?? null,
        classification,
      });
    }
  }

  diag.targetsMissingRadiusCount = dq.targetsMissingRadius.length;

  // ── 9. Post-pass: enrich largeProjectsMissingGeo + largeProjectRules ───
  // Räkna child-objekt per LP och flagga LP utan egen geo. Vi använder
  // ALDRIG child-geo som tyst fallback; vi rapporterar bara om det finns.
  const childBookingsByLp = new Map<string, { count: number; anyGeo: boolean }>();
  for (const it of items) {
    if (it.targetType === 'booking' && it.parentLargeProjectId) {
      const cur = childBookingsByLp.get(it.parentLargeProjectId) ?? { count: 0, anyGeo: false };
      cur.count += 1;
      if (it.hasCoordinates || it.polygon !== null) cur.anyGeo = true;
      childBookingsByLp.set(it.parentLargeProjectId, cur);
    }
  }
  const childProjectsByLp = new Map<string, { count: number; anyGeo: boolean }>();
  for (const it of items) {
    if (it.targetType === 'project' && it.parentLargeProjectId) {
      const cur = childProjectsByLp.get(it.parentLargeProjectId) ?? { count: 0, anyGeo: false };
      cur.count += 1;
      if (it.hasCoordinates || it.polygon !== null) cur.anyGeo = true;
      childProjectsByLp.set(it.parentLargeProjectId, cur);
    }
  }

  let lpWithGeoCount = 0;
  for (const lp of largeProjectInfoById.values()) {
    if (lp.hasGeo) {
      lpWithGeoCount += 1;
      continue;
    }
    const cb = childBookingsByLp.get(lp.id) ?? { count: 0, anyGeo: false };
    const cp = childProjectsByLp.get(lp.id) ?? { count: 0, anyGeo: false };
    dq.largeProjectsMissingGeo.push({
      targetId: lp.id,
      largeProjectId: lp.id,
      label: lp.label,
      largeProjectName: lp.label,
      reason: 'large_project_missing_own_geo',
      childObjectsCount: cb.count + cp.count,
      hasChildBookingGeo: cb.anyGeo,
      hasChildProjectGeo: cp.anyGeo,
    });
    diag.largeProjectsMissingGeoCount += 1;
  }

  diag.largeProjectRules = {
    largeProjectCount: diag.largeProjectCount,
    largeProjectsWithGeoCount: lpWithGeoCount,
    largeProjectsMissingGeoCount: diag.largeProjectsMissingGeoCount,
    childBookingsSuppressedCount: diag.childBookingsSuppressedCount,
    childProjectsSuppressedCount: diag.childProjectsSuppressedCount,
    ambiguousLargeProjectChildProjectCount: dq.ambiguousLargeProjectChildProjects.length,
  };

  return { items, dataQuality: dq, diagnostics: diag };
}
