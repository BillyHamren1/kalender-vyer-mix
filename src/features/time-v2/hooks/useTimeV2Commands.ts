import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  attestTimeV2Payroll,
  attestTimeV2Project,
  requestTimeV2Correction,
  type TimeV2CommandResult,
} from '@/features/time-v2/lib/commands';
import type { TimeV2ClientError } from '@/features/time-v2/lib/client';

interface Ctx {
  organizationId: string | null;
  submissionId: string | undefined;
  /** Revision currently rendered in the UI — decisions are bound to it. */
  expectedRevision: number;
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['time-v2', 'submission'] });
    qc.invalidateQueries({ queryKey: ['time-v2', 'review-queue'] });
  };
}

export function useRequestCorrection(ctx: Ctx) {
  const invalidate = useInvalidate();
  return useMutation<TimeV2CommandResult, TimeV2ClientError, string>({
    mutationFn: (reason: string) =>
      requestTimeV2Correction({
        organizationId: ctx.organizationId as string,
        submissionId: ctx.submissionId as string,
        expectedRevision: ctx.expectedRevision,
        reason,
      }),
    onSuccess: invalidate,
  });
}

export function useAttestPayroll(ctx: Ctx) {
  const invalidate = useInvalidate();
  return useMutation<TimeV2CommandResult, TimeV2ClientError, void>({
    mutationFn: () =>
      attestTimeV2Payroll({
        organizationId: ctx.organizationId as string,
        submissionId: ctx.submissionId as string,
        expectedRevision: ctx.expectedRevision,
      }),
    onSuccess: invalidate,
  });
}

export function useAttestProject(ctx: Ctx) {
  const invalidate = useInvalidate();
  return useMutation<TimeV2CommandResult, TimeV2ClientError, void>({
    mutationFn: () =>
      attestTimeV2Project({
        organizationId: ctx.organizationId as string,
        submissionId: ctx.submissionId as string,
        expectedRevision: ctx.expectedRevision,
      }),
    onSuccess: invalidate,
  });
}
