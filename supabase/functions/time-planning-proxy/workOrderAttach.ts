/**
 * Attaches `work-order.v1` to the assignments produced by
 * `worker.assignments.sync`. Additive: the assignment binding (tenant, worker,
 * booking, project, sourceAssignmentId) is decided by the sync and reused
 * here untouched. This module only reads field-relevant Planning data for the
 * already-bound bookings/projects and builds one work order per assignment.
 */

import { sha256Hex } from '../_shared/timeServiceProof.ts';
import {
  buildWorkOrderV1,
  mergeWorkOrderGaps,
  type WorkOrderBookingSource,
  type WorkOrderGaps,
  type WorkOrderProjectSource,
} from '../_shared/time-v2/workOrderV1Builder.ts';
import type { WorkOrderV1 } from '../_shared/time-v2/workOrderV1.ts';
import { readWorkOrderSources, type WorkOrderSourceBundle } from './workOrderReads.ts';

export interface WorkOrderCandidate {
  readonly sourceAssignmentId: string;
  readonly workDate: string;
  readonly booking: WorkOrderBookingSource;
  readonly project: WorkOrderProjectSource | null;
}

export interface AttachedWorkOrder {
  readonly workOrder: WorkOrderV1 | null;
  /** Stable content hash folded into the assignment `sourceVersion` so Time sees work-order changes. */
  readonly workOrderHash: string | null;
  readonly gaps: WorkOrderGaps;
}

export interface WorkOrderAttachReport {
  readonly schema: 'planning-work-order-report.v1';
  readonly attached: number;
  readonly omitted: number;
  readonly gaps: ReadonlyArray<{ code: string; count: number }>;
  readonly readFailures: readonly string[];
}

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Deterministic JSON (sorted keys) so equal content always hashes equal. */
export const canonicalWorkOrderJson = (value: unknown): string =>
  JSON.stringify(value, (_key, v) => (
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v
  ));

export const buildAttachedWorkOrders = async (
  candidates: readonly WorkOrderCandidate[],
  staffId: string,
  sources: WorkOrderSourceBundle,
): Promise<{ byAssignment: Map<string, AttachedWorkOrder>; report: WorkOrderAttachReport }> => {
  const byAssignment = new Map<string, AttachedWorkOrder>();
  const allGaps: WorkOrderGaps[] = [];
  let attached = 0;
  for (const candidate of candidates) {
    const { workOrder, gaps } = buildWorkOrderV1({
      workerStaffId: staffId,
      workDate: candidate.workDate,
      booking: candidate.booking,
      project: candidate.project,
      products: sources.products,
      calendarPhases: sources.calendarPhases,
      attachments: sources.attachments,
      projectFiles: sources.projectFiles,
      establishmentTasks: sources.establishmentTasks,
      projectTasks: sources.projectTasks,
      teamRows: sources.teamRows,
      staffById: sources.staffById,
    });
    for (const table of sources.readFailures) gaps[`source_read_failed:${table}`] = (gaps[`source_read_failed:${table}`] ?? 0) + 1;
    allGaps.push(gaps);
    const workOrderHash = workOrder ? await sha256Hex(canonicalWorkOrderJson(workOrder)) : null;
    if (workOrder) attached += 1;
    byAssignment.set(candidate.sourceAssignmentId, { workOrder, workOrderHash, gaps });
  }
  return {
    byAssignment,
    report: {
      schema: 'planning-work-order-report.v1',
      attached,
      omitted: candidates.length - attached,
      gaps: mergeWorkOrderGaps(allGaps),
      readFailures: [...new Set(sources.readFailures)],
    },
  };
};

/** Read sources for the bound bookings/projects, then build. One org, one worker. */
export const attachWorkOrders = async (input: {
  // deno-lint-ignore no-explicit-any
  admin: any;
  organizationId: string;
  staffId: string;
  candidates: readonly WorkOrderCandidate[];
}) => {
  const sources = await readWorkOrderSources({
    admin: input.admin,
    organizationId: input.organizationId,
    staffId: input.staffId,
    bookingIds: input.candidates.map((c) => c.booking.id),
    projectIds: input.candidates.flatMap((c) => (c.project ? [c.project.id] : [])),
    dates: input.candidates.map((c) => c.workDate),
    leaderRefs: input.candidates.flatMap((c) => {
      const leader = typeof c.project?.project_leader === 'string' ? c.project.project_leader.trim() : '';
      return leader && UUID_LIKE.test(leader) ? [leader] : [];
    }),
  });
  return buildAttachedWorkOrders(input.candidates, input.staffId, sources);
};
