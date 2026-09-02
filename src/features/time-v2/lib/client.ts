/**
 * Read-only Time V2 client — bound to the REAL Time boundary.
 *
 * Reads go through Planning's own same-origin edge function
 * (`time-planning-proxy`), which calls Time's deployed
 * `time-planning-adapter` (`time-planning-boundary.v1` /
 * `time-planning-adapter.v2`) with a server-held credential. The browser never
 * calls Time directly and never holds a Time credential.
 *
 * Read-only: no Planning source record is written and nothing is published.
 */

import {
  TIME_V2_CONTRACT_VERSION,
  type TimeV2Overview,
  type TimeV2PreviewBundle,
  type TimeV2QueueFilters,
  type TimeV2ReviewQueue,
  type TimeV2SubmissionDetail,
} from './contract';
import { TimeV2ClientError, type TimeV2ClientErrorKind } from './errors';
import { callTimeBoundary, TIME_OPERATIONS, TIME_PROXY_FUNCTION, type TimeBoundaryOptions } from './boundary';
import {
  mapDayDetail,
  mapPersonnelAccountsToOverviewCounts,
  mapPreviewBundle,
  mapReviewQueue,
  mapStatusToOverview,
} from './v2Mappers';

export { TimeV2ClientError };
export type { TimeV2ClientErrorKind };
export { TIME_V2_CONTRACT_VERSION };

/**
 * The Time source is now reached through Planning's own same-origin proxy, so
 * no browser base URL exists. The transport target is reported instead; the
 * real server-side configuration gate (TIME_ADAPTER_URL /
 * TIME_ADAPTER_SYSTEM_TOKEN) is enforced by the proxy and surfaces truthfully
 * as a `not_configured` error.
 */
export function getTimeV2BaseUrl(): string {
  return `same-origin:${TIME_PROXY_FUNCTION}`;
}

export interface TimeV2ClientOptions extends TimeBoundaryOptions {
  signal?: AbortSignal;
}

/** Landing overview: real Time status + queue counts + personnel accounts. */
export async function fetchTimeV2Overview(
  organizationId: string,
  opts: TimeV2ClientOptions = {},
): Promise<TimeV2Overview> {
  const [status, queue, accounts] = await Promise.all([
    callTimeBoundary(TIME_OPERATIONS.status, {}, opts),
    callTimeBoundary(TIME_OPERATIONS.daysQueue, {}, opts),
    callTimeBoundary(TIME_OPERATIONS.personnelAccounts, {}, opts),
  ]);
  const overview = mapStatusToOverview(status.data, queue.data);
  return {
    ...overview,
    source: { ...overview.source, generatedAt: overview.source.generatedAt ?? status.generatedAt },
    personnel: mapPersonnelAccountsToOverviewCounts(accounts.data),
  };
}

const inRange = (value: string | null, from?: string, to?: string) =>
  (!from || (value ?? '') >= from) && (!to || (value ?? '') <= to);

/** Review queue rows exactly as Time groups them (`time-review-queue.v1`). */
export async function fetchTimeV2ReviewQueue(
  organizationId: string,
  filters: TimeV2QueueFilters = {},
  opts: TimeV2ClientOptions = {},
): Promise<TimeV2ReviewQueue> {
  const env = await callTimeBoundary(TIME_OPERATIONS.daysQueue, {}, opts);
  const queue = mapReviewQueue(env.data);
  const rows = queue.rows.filter((row) =>
    inRange(row.date, filters.from, filters.to) &&
    (!filters.personnelId || row.personnelId === filters.personnelId) &&
    (!filters.projectId || row.projectId === filters.projectId) &&
    (!filters.group || filters.group === 'all' || row.group === filters.group));
  return { ...queue, generatedAt: queue.generatedAt ?? env.generatedAt, rows };
}

/** Immutable submitted snapshot for one day (`time-day-detail.v1`). */
export async function fetchTimeV2SubmissionDetail(
  organizationId: string,
  submissionId: string,
  opts: TimeV2ClientOptions = {},
): Promise<TimeV2SubmissionDetail> {
  const env = await callTimeBoundary(TIME_OPERATIONS.dayDetail, { submissionId }, opts);
  const detail = mapDayDetail(env.data);
  if (!detail) {
    throw new TimeV2ClientError('bad_payload', 'Time-källan returnerade ingen giltig dagsnapshot.');
  }
  return detail;
}

/**
 * Payroll / project-cost preview for one attested snapshot
 * (two `publication-preview.v1` payloads). Preview only: Planning renders what
 * Time reports and never posts to a payroll or project system.
 */
export async function fetchTimeV2Preview(
  organizationId: string,
  submissionId: string,
  opts: TimeV2ClientOptions = {},
): Promise<TimeV2PreviewBundle> {
  const [payroll, project, detail] = await Promise.all([
    callTimeBoundary(TIME_OPERATIONS.previewPayroll, { submissionId }, opts),
    callTimeBoundary(TIME_OPERATIONS.previewProject, { submissionId }, opts),
    callTimeBoundary(TIME_OPERATIONS.dayDetail, { submissionId }, opts),
  ]);
  const head = mapDayDetail(detail.data);
  return mapPreviewBundle(
    payroll.data,
    project.data,
    submissionId,
    head?.revision ?? 0,
    head?.snapshotVersion ?? null,
  );
}
