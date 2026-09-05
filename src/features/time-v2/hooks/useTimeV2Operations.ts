import { useMemo } from 'react';
import { useTimeV2ReviewQueue } from '@/features/time-v2/hooks/useTimeV2Review';
import { useTimeV2Expenses } from '@/features/time-v2/hooks/useTimeV2Expenses';
import { buildExpenseChains } from '@/features/time-v2/lib/expenseContract';
import {
  buildOperationsRows,
  filterOperationsRows,
  operationsCounts,
  type OperationsFilters,
  type OperationsRow,
} from '@/features/time-v2/lib/operations';

/**
 * The operational surface reads BOTH versioned Time contracts and joins them
 * purely in memory. Each source keeps its own truthful loading/error state —
 * one contract failing never fabricates the other side's rows.
 */
export function useTimeV2Operations(
  organizationId: string | null,
  enabled: boolean,
  filters: OperationsFilters,
) {
  const queue = useTimeV2ReviewQueue(organizationId, enabled, {
    from: filters.from,
    to: filters.to,
    group: 'all',
  });
  const expenses = useTimeV2Expenses(organizationId, enabled, 'all');

  const allRows = useMemo<OperationsRow[]>(
    () =>
      buildOperationsRows({
        queueRows: queue.data?.rows ?? [],
        expenseChains: expenses.data ? buildExpenseChains(expenses.data.rows) : [],
      }),
    [queue.data, expenses.data],
  );

  const rows = useMemo(() => filterOperationsRows(allRows, filters), [allRows, filters]);
  const counts = useMemo(() => operationsCounts(rows), [rows]);

  return {
    queue,
    expenses,
    allRows,
    rows,
    counts,
    isLoading: queue.isLoading || expenses.isLoading,
    isFetching: queue.isFetching || expenses.isFetching,
    refresh: () => {
      queue.refetch();
      expenses.refetch();
    },
  };
}
