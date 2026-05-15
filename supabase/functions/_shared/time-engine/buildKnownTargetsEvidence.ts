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
  calendarEventsWithoutTarget: Array<{ calendarEventId: string | null; bookingId: string | null }>;
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
  /** Optional list of calendar events referenced by assignment evidence — used for
   *  diagnostics only (calendarEventsWithoutTarget). */
  assignmentCalendarEvents?: Array<{ id: string | null; bookingId: string | null }>;
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
    childBookingsSuppressedAsTargets: [],
    assignmentsWithoutMatchingTarget: [],
    calendarEventsWithoutTarget: [],
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
    largeProjectsMissingGeoCount: 0,
    targetsMissingRadiusCount: 0,
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
        'id, name, location_type, status, latitude, longitude, radius_meters, geofence_polygon, is_private_residence',
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
        let suppressed: KnownTargetSuppressedReason = classifyStatusReason(r.name, r.status);
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
          status: r.status ?? null,
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
  const largeProjectGeoById = new Map<string, { hasGeo: boolean; label: string }>();
  try {
    const { data, error } = await supabaseAdmin
      .from('large_projects')
      .select(
        'id, project_name, status, latitude, longitude, address_radius_meters, address_geofence_polygon, start_date, end_date, deleted_at',
      )
      .eq('organization_id', organizationId)
      .is('deleted_at', null);
    if (error) {
      diag.warnings.push(`large_projects: ${error.message}`);
    } else {
      for (const r of data ?? []) {
        const lat = isFiniteNumber(r.latitude) ? r.latitude : null;
        const lng = isFiniteNumber(r.longitude) ? r.longitude : null;
        const polygon = normalizePolygon(r.address_geofence_polygon);
        const radius = isFiniteNumber(r.address_radius_meters) ? r.address_radius_meters : null;
        const hasCoords = lat !== null && lng !== null;
        const hasRadius = radius !== null && radius > 0;
        const usableGeo = (polygon !== null) || (hasCoords && hasRadius);
        let suppressed: KnownTargetSuppressedReason = classifyStatusReason(r.project_name, r.status);
        if (!suppressed && !usableGeo) suppressed = 'large_project_missing_geo';
        const label = r.project_name ?? `LP ${r.id.slice(0, 8)}`;
        largeProjectGeoById.set(r.id, { hasGeo: usableGeo, label });
        if (!usableGeo) {
          dq.largeProjectsMissingGeo.push({ targetId: r.id, label });
          diag.largeProjectsMissingGeoCount += 1;
        }
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

  // ── 3. projects ─────────────────────────────────────────────────────────
  // Hämta projekt som är aktiva för datumet (eventdate/rigday/rigdown rör
  // datumet) eller som refereras av assignments. Stand-alone projekt är
  // primary work target. Projekt knutna till booking inom large project
  // ärver large project som parent.
  const projectIdToBookingId = new Map<string, string>();
  try {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .select(
        'id, name, status, deliveryaddress, delivery_latitude, delivery_longitude, address_radius_meters, address_geofence_polygon, eventdate, rigdaydate, rigdowndate, deleted_at, booking_id, large_project_id',
      )
      .eq('organization_id', organizationId)
      .is('deleted_at', null);
    if (error) {
      diag.warnings.push(`projects: ${error.message}`);
    } else {
      for (const r of data ?? []) {
        if (r.booking_id) projectIdToBookingId.set(r.id, r.booking_id);
        const dateRelevant = r.eventdate === date || r.rigdaydate === date || r.rigdowndate === date;
        const referenced = (input.assignmentBookingIds ?? []).includes(r.booking_id);
        if (!dateRelevant && !referenced) continue;
        const lat = isFiniteNumber(r.delivery_latitude) ? r.delivery_latitude : null;
        const lng = isFiniteNumber(r.delivery_longitude) ? r.delivery_longitude : null;
        const polygon = normalizePolygon(r.address_geofence_polygon);
        const radius = isFiniteNumber(r.address_radius_meters) ? r.address_radius_meters : null;
        const hasCoords = lat !== null && lng !== null;
        const hasRadius = radius !== null && radius > 0;
        const usableGeo = polygon !== null || (hasCoords && hasRadius);
        const parentLp = r.large_project_id ?? null;
        const belongsToLp = !!parentLp;
        let suppressed: KnownTargetSuppressedReason = classifyStatusReason(r.name, r.status);
        if (!suppressed && belongsToLp) {
          // Projekt som tillhör LP är fortfarande primary work target i UI,
          // men deras geo räknas via LP. Vi undertrycker geo fallback om
          // LP saknar geo eller om projektet saknar egen geo.
        }
        if (!suppressed && !usableGeo) suppressed = 'missing_coordinates';
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
          canBePrimaryWorkTarget: !suppressed,
          canBeGeoTarget: usableGeo && !suppressed,
          suppressedReason: suppressed,
        });
        diag.projectCount += 1;
      }
    }
  } catch (e) {
    diag.warnings.push(`projects exception: ${(e as Error).message}`);
  }

  // ── 4. bookings ─────────────────────────────────────────────────────────
  // Datum-relevanta bokningar + bokningar som assignments refererar till.
  try {
    const referencedBookingIds = new Set<string>(input.assignmentBookingIds ?? []);
    let bookingsData: any[] = [];

    // 4a: date-relevant via OR filter.
    try {
      const { data, error } = await supabaseAdmin
        .from('bookings')
        .select(
          'id, booking_number, project_name, status, delivery_latitude, delivery_longitude, address_radius_meters, address_geofence_polygon, deliveryaddress, eventdate, rigdaydate, rigdowndate, large_project_id',
        )
        .eq('organization_id', organizationId)
        .or(`eventdate.eq.${date},rigdaydate.eq.${date},rigdowndate.eq.${date}`);
      if (error) diag.warnings.push(`bookings (date): ${error.message}`);
      else bookingsData = data ?? [];
    } catch (e) {
      diag.warnings.push(`bookings (date) exception: ${(e as Error).message}`);
    }

    // 4b: referenced booking ids not yet covered.
    const haveIds = new Set<string>(bookingsData.map((b) => b.id));
    const missing = [...referencedBookingIds].filter((id) => !haveIds.has(id));
    if (missing.length > 0) {
      try {
        const { data, error } = await supabaseAdmin
          .from('bookings')
          .select(
            'id, booking_number, project_name, status, delivery_latitude, delivery_longitude, address_radius_meters, address_geofence_polygon, deliveryaddress, eventdate, rigdaydate, rigdowndate, large_project_id',
          )
          .eq('organization_id', organizationId)
          .in('id', missing);
        if (error) diag.warnings.push(`bookings (referenced): ${error.message}`);
        else bookingsData = bookingsData.concat(data ?? []);
      } catch (e) {
        diag.warnings.push(`bookings (referenced) exception: ${(e as Error).message}`);
      }
    }

    for (const r of bookingsData) {
      const parentLp = r.large_project_id ?? null;
      const belongsToLp = !!parentLp;
      const lat = isFiniteNumber(r.delivery_latitude) ? r.delivery_latitude : null;
      const lng = isFiniteNumber(r.delivery_longitude) ? r.delivery_longitude : null;
      const polygon = normalizePolygon(r.address_geofence_polygon);
      const radius = isFiniteNumber(r.address_radius_meters) ? r.address_radius_meters : null;
      const hasCoords = lat !== null && lng !== null;
      const hasRadius = radius !== null && radius > 0;
      const usableGeo = polygon !== null || (hasCoords && hasRadius);
      const label = r.project_name
        ? `${r.project_name}${r.booking_number ? ` (${r.booking_number})` : ''}`
        : (r.booking_number ?? `BK ${r.id.slice(0, 8)}`);

      let suppressed: KnownTargetSuppressedReason = classifyStatusReason(r.project_name, r.status);

      // PRODUKTREGEL: child bookings inom large project är inte primary
      // work target och inte geo fallback.
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

  // ── 5. staff_private_zones ──────────────────────────────────────────────
  try {
    const { data, error } = await supabaseAdmin
      .from('staff_private_zones')
      .select('id, label, kind, latitude, longitude, radius_meters, geofence_polygon')
      .eq('organization_id', organizationId)
      .eq('staff_id', staffId);
    if (error) {
      diag.warnings.push(`staff_private_zones: ${error.message}`);
    } else {
      for (const r of data ?? []) {
        const lat = isFiniteNumber(r.latitude) ? r.latitude : null;
        const lng = isFiniteNumber(r.longitude) ? r.longitude : null;
        const polygon = normalizePolygon(r.geofence_polygon);
        const radius = isFiniteNumber(r.radius_meters) ? r.radius_meters : null;
        const hasCoords = lat !== null && lng !== null;
        const hasRadius = radius !== null && radius > 0;
        const usableGeo = polygon !== null || (hasCoords && hasRadius);
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
      .select('id, latitude, longitude, accuracy_meters, observed_at')
      .eq('organization_id', organizationId)
      .eq('staff_id', staffId);
    if (error) {
      // Tabellen kan saknas i vissa miljöer — varna men krascha inte.
      diag.warnings.push(`staff_home_observations: ${error.message}`);
    } else {
      for (const r of data ?? []) {
        const lat = isFiniteNumber(r.latitude) ? r.latitude : null;
        const lng = isFiniteNumber(r.longitude) ? r.longitude : null;
        const radius = isFiniteNumber(r.accuracy_meters) ? r.accuracy_meters : null;
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
      .select('id, latitude, longitude, radius_meters, confidence')
      .eq('organization_id', organizationId)
      .eq('staff_id', staffId);
    if (error) {
      diag.warnings.push(`staff_inferred_home_locations: ${error.message}`);
    } else {
      for (const r of data ?? []) {
        const lat = isFiniteNumber(r.latitude) ? r.latitude : null;
        const lng = isFiniteNumber(r.longitude) ? r.longitude : null;
        const radius = isFiniteNumber(r.radius_meters) ? r.radius_meters : null;
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
  for (const ce of input.assignmentCalendarEvents ?? []) {
    if (!ce.bookingId || !targetBookingIds.has(ce.bookingId)) {
      dq.calendarEventsWithoutTarget.push({ calendarEventId: ce.id, bookingId: ce.bookingId });
    }
  }

  diag.targetsMissingRadiusCount = dq.targetsMissingRadius.length;

  return { items, dataQuality: dq, diagnostics: diag };
}
