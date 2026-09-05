import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  decideTimeV2Expense,
  fetchTimeV2ExpenseChain,
  fetchTimeV2Expenses,
  fetchTimeV2ReceiptUrl,
  type DecideExpenseInput,
  type DecideExpenseResult,
  type ReceiptUrlResult,
} from '@/features/time-v2/lib/expenseClient';
import { TimeV2ClientError } from '@/features/time-v2/lib/errors';
import type { ExpenseListView, ExpenseScope } from '@/features/time-v2/lib/expenseContract';

/** Gate/config errors are terminal — retrying cannot open the external gate. */
const noRetryOnGate = (count: number, error: unknown) =>
  error instanceof TimeV2ClientError &&
  ['not_configured', 'upstream_missing', 'gate_closed', 'forbidden', 'not_found'].includes(error.kind)
    ? false
    : count < 1;

export const EXPENSE_QUERY_ROOT = ['time-v2', 'expenses'] as const;

export function useTimeV2Expenses(organizationId: string | null, enabled: boolean, scope: ExpenseScope) {
  return useQuery<ExpenseListView, TimeV2ClientError>({
    queryKey: [...EXPENSE_QUERY_ROOT, 'list', organizationId, scope],
    queryFn: () => fetchTimeV2Expenses(scope),
    enabled: enabled && !!organizationId,
    retry: noRetryOnGate,
    staleTime: 20_000,
    refetchOnWindowFocus: false,
  });
}

export function useTimeV2ExpenseChain(organizationId: string | null, submissionId: string | undefined, enabled: boolean) {
  return useQuery<ExpenseListView, TimeV2ClientError>({
    queryKey: [...EXPENSE_QUERY_ROOT, 'chain', organizationId, submissionId],
    queryFn: () => fetchTimeV2ExpenseChain(submissionId as string),
    enabled: enabled && !!organizationId && !!submissionId,
    retry: noRetryOnGate,
    staleTime: 20_000,
    refetchOnWindowFocus: false,
  });
}

export function useDecideExpense() {
  const qc = useQueryClient();
  return useMutation<DecideExpenseResult, TimeV2ClientError, DecideExpenseInput>({
    mutationFn: (input) => decideTimeV2Expense(input),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: [...EXPENSE_QUERY_ROOT] });
    },
  });
}

/** Mints a short-lived signed receipt read on demand; nothing is cached. */
export function useReceiptUrl() {
  return useMutation<ReceiptUrlResult, TimeV2ClientError, { submissionId: string; attachmentId: string }>({
    mutationFn: (input) => fetchTimeV2ReceiptUrl(input),
    gcTime: 0,
  });
}
