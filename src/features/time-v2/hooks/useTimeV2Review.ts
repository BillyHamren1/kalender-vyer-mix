import { useQuery } from '@tanstack/react-query';
import {
  fetchTimeV2ReviewQueue,
  fetchTimeV2SubmissionDetail,
  getTimeV2BaseUrl,
  TimeV2ClientError,
} from '@/features/time-v2/lib/client';
import type {
  TimeV2QueueFilters,
  TimeV2ReviewQueue,
  TimeV2SubmissionDetail,
} from '@/features/time-v2/lib/contract';

const noRetryWhenUnconfigured = (count: number, error: unknown) =>
  error instanceof TimeV2ClientError && error.kind === 'not_configured' ? false : count < 1;

/** Server-side filters (date/personnel/project/group) are passed to Time. */
export function useTimeV2ReviewQueue(
  organizationId: string | null,
  enabled: boolean,
  filters: TimeV2QueueFilters,
) {
  const baseUrl = getTimeV2BaseUrl();
  return useQuery<TimeV2ReviewQueue, TimeV2ClientError>({
    queryKey: [
      'time-v2',
      'review-queue',
      organizationId,
      baseUrl,
      filters.from,
      filters.to,
      filters.personnelId,
      filters.projectId,
      filters.group,
    ],
    queryFn: () => fetchTimeV2ReviewQueue(organizationId as string, filters),
    enabled: enabled && !!organizationId,
    retry: noRetryWhenUnconfigured,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useTimeV2SubmissionDetail(
  organizationId: string | null,
  submissionId: string | undefined,
  enabled: boolean,
) {
  const baseUrl = getTimeV2BaseUrl();
  return useQuery<TimeV2SubmissionDetail, TimeV2ClientError>({
    queryKey: ['time-v2', 'submission', organizationId, submissionId, baseUrl],
    queryFn: () => fetchTimeV2SubmissionDetail(organizationId as string, submissionId as string),
    enabled: enabled && !!organizationId && !!submissionId,
    retry: noRetryWhenUnconfigured,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
