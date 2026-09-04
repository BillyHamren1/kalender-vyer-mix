/**
 * Pure shape of ONE `worker.assignments.sync` assignment (work-context.v1).
 * Extracted from the sync handler so the binding (worker × calendar event ×
 * booking × project) stays byte-identical while `workOrder` is attached as an
 * additive optional field. No I/O.
 */

import type { WorkOrderV1 } from '../_shared/time-v2/workOrderV1.ts';

type Json = Record<string, unknown>;

const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null;
const finite = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined;

export const phaseLabel = (value: unknown) => {
  const code = text(value) ?? 'arbete';
  const labels: Record<string, string> = { rig: 'Montering', event: 'Genomförande', rigDown: 'Nedmontering' };
  return { code, label: labels[code] ?? code };
};

export interface AssignmentLocation {
  readonly address?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly radiusM: number;
}

export interface AssignmentShapeInput {
  readonly event: Json;
  readonly booking: Json;
  readonly project: Json | null;
  readonly staff: Json;
  readonly startsAt: string;
  readonly endsAt: string;
}

export const assignmentLocation = ({ event, booking, project }: AssignmentShapeInput): AssignmentLocation => ({
  address: text(project?.deliveryaddress) ?? text(booking.deliveryaddress) ?? text(event.delivery_address) ?? undefined,
  latitude: finite(project?.delivery_latitude) ?? finite(booking.delivery_latitude),
  longitude: finite(project?.delivery_longitude) ?? finite(booking.delivery_longitude),
  radiusM: finite(project?.address_radius_meters) ?? 100,
});

/**
 * Seed for the assignment `sourceVersion`. Includes the work-order content hash
 * so a changed booking row / task / file re-versions the assignment in Time.
 */
export const assignmentVersionSeed = (
  input: AssignmentShapeInput,
  location: AssignmentLocation,
  workOrderHash: string | null,
): Json => ({
  eventId: input.event.id,
  startsAt: input.startsAt,
  endsAt: input.endsAt,
  eventType: input.event.event_type,
  bookingVersion: input.booking.version,
  bookingUpdatedAt: input.booking.updated_at,
  projectId: input.project?.id ?? null,
  projectUpdatedAt: input.project?.updated_at ?? null,
  location,
  ...(workOrderHash ? { workOrderHash } : {}),
});

export const buildAssignmentPayload = (
  input: AssignmentShapeInput,
  sourceVersion: string,
  location: AssignmentLocation,
  workOrder: WorkOrderV1 | null,
): Json => {
  const { event, booking, project, staff } = input;
  return {
    sourceAssignmentId: String(event.id),
    sourceVersion,
    workerExternalId: String(staff.id),
    workDate: String(event.source_date),
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    roleLabel: text(staff.role) ?? 'Tilldelad',
    teamLabel: String(event.resource_id),
    target: {
      sourceSystem: 'planning',
      kind: project ? 'project' : 'booking',
      externalId: String(project?.id ?? booking.id),
      version: sourceVersion,
      label: text(project?.name) ?? text(booking.assigned_project_name) ?? text(event.title) ?? text(booking.title) ?? String(booking.booking_number),
      bookingNumber: text(booking.booking_number) ?? text(event.booking_number) ?? undefined,
      phase: phaseLabel(event.event_type),
      location,
      reporting: { state: 'allowed' },
    },
    workerDetail: {
      address: location.address,
      contactName: text(booking.contact_name) ?? undefined,
      contactPhone: text(booking.contact_phone) ?? undefined,
    },
    ...(workOrder ? { workOrder } : {}),
  };
};
