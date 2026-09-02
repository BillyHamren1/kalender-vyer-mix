import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getTimeV2BaseUrl, TimeV2ClientError } from '@/features/time-v2/lib/client';
import {
  fetchTimeV2PersonnelDetail,
  fetchTimeV2PersonnelDirectory,
  issueTimeV2AppActivation,
  reactivateTimeV2AppAccess,
  suspendTimeV2AppAccess,
  type TimeV2PersonnelCommandResult,
} from '@/features/time-v2/lib/personnelClient';
import type { TimeV2PersonnelDetail, TimeV2PersonnelDirectory } from '@/features/time-v2/lib/contract';

const noRetryWhenUnconfigured = (count: number, error: unknown) =>
  error instanceof TimeV2ClientError && error.kind === 'not_configured' ? false : count < 1;

export function useTimeV2PersonnelDirectory(organizationId: string | null, enabled: boolean) {
  const baseUrl = getTimeV2BaseUrl();
  return useQuery<TimeV2PersonnelDirectory, TimeV2ClientError>({
    queryKey: ['time-v2', 'personnel-directory', organizationId, baseUrl],
    queryFn: () => fetchTimeV2PersonnelDirectory(organizationId as string),
    enabled: enabled && !!organizationId,
    retry: noRetryWhenUnconfigured,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useTimeV2PersonnelDetail(
  organizationId: string | null,
  personnelId: string | undefined,
  enabled: boolean,
) {
  const baseUrl = getTimeV2BaseUrl();
  return useQuery<TimeV2PersonnelDetail, TimeV2ClientError>({
    queryKey: ['time-v2', 'personnel-detail', organizationId, personnelId, baseUrl],
    queryFn: () => fetchTimeV2PersonnelDetail(organizationId as string, personnelId as string),
    enabled: enabled && !!organizationId && !!personnelId,
    retry: noRetryWhenUnconfigured,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
}

interface Ctx {
  organizationId: string | null;
  personnelId: string | undefined;
}

function useInvalidatePersonnel() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['time-v2', 'personnel-detail'] });
    qc.invalidateQueries({ queryKey: ['time-v2', 'personnel-directory'] });
  };
}

export function useIssueActivation(ctx: Ctx) {
  const invalidate = useInvalidatePersonnel();
  return useMutation<TimeV2PersonnelCommandResult, TimeV2ClientError, boolean | void>({
    mutationFn: (reissue) =>
      issueTimeV2AppActivation({
        organizationId: ctx.organizationId as string,
        personnelId: ctx.personnelId as string,
        reissue: reissue === true,
      }),
    onSuccess: invalidate,
  });
}

export function useSuspendAppAccess(ctx: Ctx) {
  const invalidate = useInvalidatePersonnel();
  return useMutation<TimeV2PersonnelCommandResult, TimeV2ClientError, void>({
    mutationFn: () =>
      suspendTimeV2AppAccess({
        organizationId: ctx.organizationId as string,
        personnelId: ctx.personnelId as string,
      }),
    onSuccess: invalidate,
  });
}

export function useReactivateAppAccess(ctx: Ctx) {
  const invalidate = useInvalidatePersonnel();
  return useMutation<TimeV2PersonnelCommandResult, TimeV2ClientError, void>({
    mutationFn: () =>
      reactivateTimeV2AppAccess({
        organizationId: ctx.organizationId as string,
        personnelId: ctx.personnelId as string,
      }),
    onSuccess: invalidate,
  });
}
