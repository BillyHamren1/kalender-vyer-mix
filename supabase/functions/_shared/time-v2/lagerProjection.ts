/**
 * Planning → Time: additive, read-only projection of internal Lager/warehouse
 * context (`planning-lager-context.v1`).
 *
 * Why this exists
 * ---------------
 * Time cannot infer "Lager" from GPS, and Planning must never let a virtual
 * 07:00–16:00 Lager calendar block be mistaken for evidence of hours worked.
 * This module projects only Planning-owned records:
 *
 *   - the canonical internal Lager location  → `organization_locations`
 *     (linked from the internal Lager project `projects.is_internal = true`,
 *      `projects.location_id`)
 *   - per worker/date applicability          → `staff_assignments`
 *     (legacy Lager team ids: `transport`, `warehouse`, `lager-*`)
 *   - exact warehouse assignment targets     → `warehouse_assignments`
 *     and `warehouse_calendar_events`
 *
 * Hard rules encoded here:
 *  - PURE. No IO, no Supabase client, no writes to Planning or Time.
 *  - Never fabricate coordinates/labels. Missing canonical data is reported as
 *    `configuration.missingFields`, never guessed from GPS clusters.
 *  - Every projected item carries provenance so Time can tell *schedule
 *    context* apart from *work evidence*. Nothing in this contract is evidence.
 */

export const PLANNING_LAGER_CONTEXT_SCHEMA = "planning-lager-context.v1" as const;

/** Legacy Lager team ids in `staff_assignments.team_id`. Mirrors warehouseTeam.ts. */
const STATIC_WAREHOUSE_TEAM_IDS: ReadonlySet<string> = new Set(["transport", "warehouse"]);

export function isLagerTeamId(teamId: string | null | undefined): boolean {
  if (!teamId) return false;
  if (STATIC_WAREHOUSE_TEAM_IDS.has(teamId)) return true;
  return teamId.startsWith("lager-");
}

// ---------------------------------------------------------------------------
// Input row shapes (exactly the Planning columns that are read)
// ---------------------------------------------------------------------------

export interface OrganizationLocationRow {
  id: string;
  organization_id: string;
  name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number | null;
  geofence_mode: string | null;
  location_type: string | null;
  is_active: boolean | null;
}

export interface InternalLagerProjectRow {
  id: string;
  organization_id: string;
  name: string | null;
  is_internal: boolean | null;
  location_id: string | null;
}

export interface StaffAssignmentRow {
  id: string;
  organization_id: string;
  staff_id: string;
  team_id: string | null;
  assignment_date: string;
}

export interface WarehouseAssignmentRow {
  id: string;
  organization_id: string;
  staff_id: string;
  assignment_date: string;
  assignment_type: string | null;
  status: string | null;
  title: string | null;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  booking_id: string | null;
  booking_number: string | null;
  delivery_address: string | null;
  customer_name: string | null;
  warehouse_event_id: string | null;
  packing_id: string | null;
  source: string | null;
}

export interface WarehouseCalendarEventRow {
  id: string;
  organization_id: string;
  title: string | null;
  start_time: string | null;
  end_time: string | null;
  resource_id: string | null;
  event_type: string | null;
  booking_id: string | null;
  booking_number: string | null;
  delivery_address: string | null;
  warehouse_project_id: string | null;
}

export interface LagerProjectionInput {
  organizationId: string;
  /** Inclusive ISO date range (YYYY-MM-DD) the projection is asked for. */
  from: string;
  to: string;
  /** Optional worker filter (Planning `staff_members.id`). */
  staffIds?: string[] | null;
  locations: OrganizationLocationRow[];
  internalProjects: InternalLagerProjectRow[];
  staffAssignments: StaffAssignmentRow[];
  warehouseAssignments: WarehouseAssignmentRow[];
  warehouseCalendarEvents: WarehouseCalendarEventRow[];
}

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

/** How Time must treat the item. Nothing here is ever work evidence. */
export interface LagerProvenance {
  /** Planning table the row came from. */
  sourceTable:
    | "organization_locations"
    | "staff_assignments"
    | "warehouse_assignments"
    | "warehouse_calendar_events";
  sourceRecordId: string;
  /** `schedule_context` = planned/virtual. `planning_assignment` = an explicit Planning-owned task. */
  contextType: "schedule_context" | "planning_assignment";
  /** Always false: Planning never asserts hours worked through this contract. */
  isWorkEvidence: false;
}

export interface InternalLagerLocationTarget {
  kind: "internal_location";
  /** Stable Planning-owned key Time can bind an entry to. */
  targetKey: string;
  organizationId: string;
  locationId: string;
  internalProjectId: string | null;
  label: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
  geofenceMode: string | null;
  /**
   * True when Planning owns a usable geofence identity: canonical label +
   * finite lat/lon + positive radius (address/location_type are metadata).
   */
  isExact: boolean;
  missingFields: string[];
  /** Nice-to-have Planning metadata; never blocks exactness. */
  recommendedFields: string[];
  provenance: LagerProvenance;
}

export interface LagerApplicability {
  staffId: string;
  date: string;
  teamId: string;
  provenance: LagerProvenance;
}

export interface WarehouseAssignmentTarget {
  kind: "warehouse_assignment";
  targetKey: string;
  organizationId: string;
  staffId: string | null;
  date: string;
  title: string | null;
  description: string | null;
  assignmentType: string | null;
  status: string | null;
  startTime: string | null;
  endTime: string | null;
  bookingId: string | null;
  bookingNumber: string | null;
  address: string | null;
  customerName: string | null;
  warehouseEventId: string | null;
  warehouseProjectId: string | null;
  resourceId: string | null;
  provenance: LagerProvenance;
}

export interface LagerProjection {
  schema: typeof PLANNING_LAGER_CONTEXT_SCHEMA;
  organizationId: string;
  range: { from: string; to: string };
  /** null when Planning has no canonical Lager location configured. Never fabricated. */
  location: InternalLagerLocationTarget | null;
  applicability: LagerApplicability[];
  warehouseAssignments: WarehouseAssignmentTarget[];
  configuration: {
    /** Human-supplied Planning fields still required before Time can bind exactly. */
    missingFields: string[];
    /** Recommended metadata (address, warehouse location_type). Not blockers. */
    recommendedFields: string[];
    /** Where an operator enters/selects the canonical location. */
    configPath: {
      locationTable: "organization_locations";
      locationTypeValue: "warehouse";
      linkTable: "projects";
      linkField: "location_id";
      linkFilter: "is_internal = true AND name = 'Lager'";
    };
  };
}

const inRange = (date: string | null | undefined, from: string, to: string) =>
  typeof date === "string" && date >= from && date <= to;

const dateOf = (iso: string | null | undefined): string | null =>
  typeof iso === "string" && iso.length >= 10 ? iso.slice(0, 10) : null;

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const text = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
};

/**
 * Resolve the canonical Lager location strictly from Planning records:
 * the internal Lager project's `location_id`, else an active
 * `location_type = 'warehouse'` row. No GPS, no heuristics on names.
 */
export function resolveCanonicalLagerLocation(
  organizationId: string,
  locations: OrganizationLocationRow[],
  internalProjects: InternalLagerProjectRow[],
): {
  location: InternalLagerLocationTarget | null;
  missingFields: string[];
  recommendedFields: string[];
} {
  const orgLocations = locations.filter((l) => l.organization_id === organizationId);
  const internal = internalProjects.filter(
    (p) => p.organization_id === organizationId && p.is_internal === true,
  );

  const linked = internal.find((p) => !!p.location_id);
  const byLink = linked
    ? orgLocations.find((l) => l.id === linked.location_id) ?? null
    : null;
  const byType = orgLocations.find(
    (l) => l.location_type === "warehouse" && l.is_active !== false,
  ) ?? null;

  const row = byLink ?? byType;
  if (!row) {
    return {
      location: null,
      missingFields: [
        "projects.location_id (internal Lager project → organization_locations)",
      ],
      recommendedFields: ["organization_locations.location_type = 'warehouse'"],
    };
  }

  const label = text(row.name);
  const address = text(row.address);
  const latitude = num(row.latitude);
  const longitude = num(row.longitude);
  const radiusMeters = num(row.radius_meters);

  // Geofence identity blockers only. A Planning-owned link + finite lat/lon +
  // positive radius IS an exact target; address and legacy location_type are
  // display/metadata, never identity requirements.
  const missingFields: string[] = [];
  if (!label) missingFields.push("organization_locations.name");
  if (latitude === null) missingFields.push("organization_locations.latitude");
  if (longitude === null) missingFields.push("organization_locations.longitude");
  if (radiusMeters === null || radiusMeters <= 0) {
    missingFields.push("organization_locations.radius_meters");
  }
  if (!linked) {
    missingFields.push("projects.location_id (internal Lager project → organization_locations)");
  }

  const recommendedFields: string[] = [];
  if (!address) recommendedFields.push("organization_locations.address");
  if (row.location_type !== "warehouse") {
    recommendedFields.push("organization_locations.location_type = 'warehouse'");
  }

  // Honest null: no usable geofence identity → Time gets nothing to bind to.
  if (missingFields.length > 0) {
    return { location: null, missingFields, recommendedFields };
  }

  return {
    location: {
      kind: "internal_location",
      targetKey: `planning:location:${row.id}`,
      organizationId,
      locationId: row.id,
      internalProjectId: linked?.id ?? internal[0]?.id ?? null,
      label: label as string,
      address,
      latitude,
      longitude,
      radiusMeters,
      geofenceMode: text(row.geofence_mode),
      isExact: true,
      missingFields,
      recommendedFields,
      provenance: {
        sourceTable: "organization_locations",
        sourceRecordId: row.id,
        contextType: "schedule_context",
        isWorkEvidence: false,
      },
    },
    missingFields,
    recommendedFields,
  };
}

export function buildLagerContextProjection(input: LagerProjectionInput): LagerProjection {
  const { organizationId, from, to } = input;
  const staffFilter =
    input.staffIds && input.staffIds.length > 0 ? new Set(input.staffIds) : null;

  const { location, missingFields, recommendedFields } = resolveCanonicalLagerLocation(
    organizationId,
    input.locations ?? [],
    input.internalProjects ?? [],
  );

  const applicability: LagerApplicability[] = (input.staffAssignments ?? [])
    .filter(
      (row) =>
        row.organization_id === organizationId &&
        isLagerTeamId(row.team_id) &&
        inRange(row.assignment_date, from, to) &&
        (!staffFilter || staffFilter.has(row.staff_id)),
    )
    .map((row): LagerApplicability => ({
      staffId: row.staff_id,
      date: row.assignment_date,
      teamId: row.team_id as string,
      provenance: {
        sourceTable: "staff_assignments",
        sourceRecordId: row.id,
        contextType: "schedule_context",
        isWorkEvidence: false,
      },
    }))
    .sort((a, b) => (a.date === b.date ? a.staffId.localeCompare(b.staffId) : a.date < b.date ? -1 : 1));

  const fromAssignments: WarehouseAssignmentTarget[] = (input.warehouseAssignments ?? [])
    .filter(
      (row) =>
        row.organization_id === organizationId &&
        inRange(row.assignment_date, from, to) &&
        (!staffFilter || staffFilter.has(row.staff_id)),
    )
    .map((row) => ({
      kind: "warehouse_assignment" as const,
      targetKey: `planning:warehouse_assignment:${row.id}`,
      organizationId,
      staffId: row.staff_id,
      date: row.assignment_date,
      title: text(row.title),
      description: text(row.description),
      assignmentType: text(row.assignment_type),
      status: text(row.status),
      startTime: text(row.start_time),
      endTime: text(row.end_time),
      bookingId: text(row.booking_id),
      bookingNumber: text(row.booking_number),
      address: text(row.delivery_address),
      customerName: text(row.customer_name),
      warehouseEventId: row.warehouse_event_id ?? null,
      warehouseProjectId: null,
      resourceId: null,
      provenance: {
        sourceTable: "warehouse_assignments",
        sourceRecordId: row.id,
        contextType: "planning_assignment",
        isWorkEvidence: false,
      },
    }));

  const fromEvents: WarehouseAssignmentTarget[] = (input.warehouseCalendarEvents ?? [])
    .filter((row) => {
      const day = dateOf(row.start_time);
      return row.organization_id === organizationId && !!day && inRange(day, from, to);
    })
    .map((row) => ({
      kind: "warehouse_assignment" as const,
      targetKey: `planning:warehouse_event:${row.id}`,
      organizationId,
      staffId: null,
      date: dateOf(row.start_time) as string,
      title: text(row.title),
      description: null,
      assignmentType: text(row.event_type),
      status: null,
      startTime: row.start_time ?? null,
      endTime: row.end_time ?? null,
      bookingId: text(row.booking_id),
      bookingNumber: text(row.booking_number),
      address: text(row.delivery_address),
      customerName: null,
      warehouseEventId: row.id,
      warehouseProjectId: row.warehouse_project_id ?? null,
      resourceId: text(row.resource_id),
      provenance: {
        sourceTable: "warehouse_calendar_events",
        sourceRecordId: row.id,
        contextType: "planning_assignment",
        isWorkEvidence: false,
      },
    }));

  const warehouseAssignments = [...fromAssignments, ...fromEvents].sort((a, b) =>
    a.date === b.date ? a.targetKey.localeCompare(b.targetKey) : a.date < b.date ? -1 : 1,
  );

  return {
    schema: PLANNING_LAGER_CONTEXT_SCHEMA,
    organizationId,
    range: { from, to },
    location,
    applicability,
    warehouseAssignments,
    configuration: {
      missingFields,
      configPath: {
        locationTable: "organization_locations",
        locationTypeValue: "warehouse",
        linkTable: "projects",
        linkField: "location_id",
        linkFilter: "is_internal = true AND name = 'Lager'",
      },
    },
  };
}
