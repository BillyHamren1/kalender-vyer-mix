/**
 * Shared worker projection for the Planning → Time boundary.
 *
 * ONE builder, used by both directions:
 *  - `worker.assignments.sync` — a Time worker pulls their own projection.
 *  - `worker.assignments.push` — Planning pushes after a relevant mutation.
 *
 * Planning stays the source of truth: nothing here writes a Planning row and
 * the payload is always the COMPLETE current projection for that worker
 * (including the full file list), so Time never has to guess what was removed.
 */

import {
  buildServiceProofClaims,
  deriveSigningKeyFromSeed,
  SERVICE_PROOF_HEADER,
  sha256Hex,
  signServiceProofJwt,
} from '../_shared/timeServiceProof.ts';
import { attachWorkOrders, type WorkOrderCandidate } from './workOrderAttach.ts';
import {
  assignmentLocation,
  assignmentVersionSeed,
  buildAssignmentPayload,
  type AssignmentShapeInput,
} from './assignmentShape.ts';
import type { WorkOrderBookingSource, WorkOrderProjectSource } from '../_shared/time-v2/workOrderV1Builder.ts';

export type Json = Record<string, unknown>;

/**
 * The Time worker route is currently pinned to the isolated Time staging
 * project. Supabase publishable keys are intentionally public credentials;
 * this fallback is host-pinned so it can never be used for another project.
 * TIME_ADAPTER_ANON_KEY still wins when configured server-side.
 */
export const TIME_STAGING_HOST = 'pklkhhfvgmexsrkkpkzt.supabase.co';
export const TIME_STAGING_PUBLISHABLE_KEY = 'sb_publishable_NhobrNS2pBx6ronR-aQIjg_msYtBS-c';

/**
 * Field-relevant booking columns for the assignment + work order. Deliberately
 * excludes internalnotes, economics_data and every cost/price column.
 */
export const BOOKING_COLUMNS = [
  'id', 'title', 'client', 'status', 'version', 'updated_at', 'booking_number',
  'deliveryaddress', 'delivery_latitude', 'delivery_longitude',
  'contact_name', 'contact_phone', 'contact_email',
  'assigned_project_id', 'assigned_project_name', 'organization_id',
  'rigdaydate', 'eventdate', 'rigdowndate',
  'rig_start_time', 'rig_end_time', 'event_start_time', 'event_end_time', 'rigdown_start_time', 'rigdown_end_time',
  'carry_more_than_10m', 'ground_nails_allowed', 'exact_time_needed', 'exact_time_info',
  'customer_pickup', 'rental_only', 'map_drawing_url',
].join(', ');

export const PROJECT_COLUMNS = [
  'id', 'booking_id', 'name', 'updated_at', 'deliveryaddress', 'delivery_latitude', 'delivery_longitude',
  'address_radius_meters', 'organization_id', 'deleted_at', 'project_leader',
].join(', ');

export const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

export const dateOffset = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** Default projection window — identical for pull and push. */
export const projectionWindow = () => ({ from: dateOffset(-14), to: dateOffset(60) });

export const timeProjectRoot = (adapterUrl: string) => new URL(adapterUrl).origin;

export const resolveGatewayKey = (adapterUrl: string, configuredKey?: string): string | null => {
  if (configuredKey?.trim()) return configuredKey.trim();
  try {
    return new URL(adapterUrl).host.toLowerCase() === TIME_STAGING_HOST
      ? TIME_STAGING_PUBLISHABLE_KEY
      : null;
  } catch {
    return null;
  }
};

export interface ProjectionFailure {
  readonly ok: false;
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

export interface ProjectionSuccess {
  readonly ok: true;
  readonly assignments: Json[];
  readonly from: string;
  readonly to: string;
  readonly workOrder: unknown;
}

const readFailed = (message: string): ProjectionFailure => ({
  ok: false, status: 500, code: 'planning_read_failed', message, retryable: true,
});

/**
 * Build the COMPLETE current Planning projection for exactly one worker.
 * Read-only. Same binding rules as before (confirmed bookings, real calendar
 * rows, staff assigned to that team on that date).
 */
export async function buildWorkerProjection(input: {
  // deno-lint-ignore no-explicit-any
  admin: any;
  staff: Json;
  organizationId: string;
  from?: string;
  to?: string;
}): Promise<ProjectionSuccess | ProjectionFailure> {
  const { admin, staff, organizationId } = input;
  const window = projectionWindow();
  const from = input.from ?? window.from;
  const to = input.to ?? window.to;

  const { data: staffAssignments, error: assignmentError } = await admin
    .from('staff_assignments')
    .select('id, staff_id, team_id, assignment_date, updated_at, organization_id')
    .eq('organization_id', organizationId)
    .eq('staff_id', String(staff.id))
    .gte('assignment_date', from)
    .lte('assignment_date', to);
  if (assignmentError) return readFailed('Planning-tilldelningarna kunde inte läsas.');

  const pairs = new Set((staffAssignments ?? []).map((row: Json) => `${row.assignment_date}:${row.team_id}`));
  const teamIds = [...new Set((staffAssignments ?? []).map((row: Json) => String(row.team_id)))];
  const { data: calendarRows, error: calendarError } = teamIds.length
    ? await admin.from('calendar_events')
      .select('id, resource_id, booking_id, title, start_time, end_time, event_type, delivery_address, booking_number, organization_id, source_date')
      .eq('organization_id', organizationId)
      .in('resource_id', teamIds)
      .gte('source_date', from)
      .lte('source_date', to)
    : { data: [], error: null };
  if (calendarError) return readFailed('Planning-kalendern kunde inte läsas.');
  const calendar = (calendarRows ?? []).filter((row: Json) => pairs.has(`${row.source_date}:${row.resource_id}`));

  const bookingIds = [...new Set(calendar.map((row: Json) => text(row.booking_id)).filter(Boolean))] as string[];
  const { data: bookings, error: bookingError } = bookingIds.length
    ? await admin.from('bookings').select(BOOKING_COLUMNS).eq('organization_id', organizationId).in('id', bookingIds)
    : { data: [], error: null };
  if (bookingError) return readFailed('Planning-bokningarna kunde inte läsas.');
  const { data: projects, error: projectError } = bookingIds.length
    ? await admin.from('projects').select(PROJECT_COLUMNS)
      .eq('organization_id', organizationId).in('booking_id', bookingIds).is('deleted_at', null)
    : { data: [], error: null };
  if (projectError) return readFailed('Planning-projekten kunde inte läsas.');

  const bookingById = new Map<string, Json>((bookings ?? []).map((row: Json) => [String(row.id), row] as [string, Json]));
  const projectByBooking = new Map<string, Json>();
  for (const project of projects ?? []) {
    const row = project as Json;
    if (!projectByBooking.has(String(row.booking_id))) projectByBooking.set(String(row.booking_id), row);
  }

  const shapes: AssignmentShapeInput[] = [];
  for (const event of calendar) {
    const startsAt = text(event.start_time);
    const endsAt = text(event.end_time);
    const bookingId = text(event.booking_id);
    if (!startsAt || !endsAt || !bookingId || Date.parse(startsAt) >= Date.parse(endsAt)) continue;
    const booking = bookingById.get(bookingId);
    if (!booking || String(booking.status).toUpperCase() !== 'CONFIRMED') continue;
    shapes.push({ event, booking, project: projectByBooking.get(bookingId) ?? null, staff, startsAt, endsAt });
  }

  const candidates: WorkOrderCandidate[] = shapes.map((shape) => ({
    sourceAssignmentId: String(shape.event.id),
    workDate: String(shape.event.source_date),
    booking: shape.booking as unknown as WorkOrderBookingSource,
    project: (shape.project as unknown as WorkOrderProjectSource | null) ?? null,
  }));
  const { byAssignment: workOrders, report: workOrderReport } = await attachWorkOrders({
    admin,
    organizationId,
    staffId: String(staff.id),
    candidates,
  });

  const assignments: Json[] = [];
  for (const shape of shapes) {
    const attached = workOrders.get(String(shape.event.id));
    const location = assignmentLocation(shape);
    const sourceVersion = await sha256Hex(JSON.stringify(
      assignmentVersionSeed(shape, location, attached?.workOrderHash ?? null),
    ));
    assignments.push(buildAssignmentPayload(shape, sourceVersion, location, attached?.workOrder ?? null));
  }
  assignments.sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)));

  return { ok: true, assignments, from, to, workOrder: workOrderReport };
}

/** Signed `worker.assignments.sync` call to Time's deployed adapter. */
export async function callTimeAdapter(input: {
  adapterUrl: string;
  anonKey?: string;
  signingSeed: string;
  organizationId: string;
  personnelId: string;
  assignments: readonly Json[];
}) {
  const payload = {
    schema: 'time-planning-boundary.v1',
    organizationId: input.organizationId,
    operation: 'worker.assignments.sync',
    personnelId: input.personnelId,
    assignments: input.assignments,
  };
  const body = JSON.stringify(payload);
  const { key, keyId } = await deriveSigningKeyFromSeed(input.signingSeed);
  const proof = await signServiceProofJwt(key, keyId, buildServiceProofClaims({
    operation: payload.operation,
    organizationId: input.organizationId,
    bodySha256: await sha256Hex(body),
  }));
  return fetch(`${input.adapterUrl.replace(/\/+$/, '')}/time-planning-adapter`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [SERVICE_PROOF_HEADER]: proof,
      ...(input.anonKey ? { apikey: input.anonKey } : {}),
    },
    body,
  });
}
