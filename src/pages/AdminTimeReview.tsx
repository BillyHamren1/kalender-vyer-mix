import React, { Suspense, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Loader2, Clock } from 'lucide-react';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { fetchDayReviewRows, type DayReviewRow } from '@/lib/admin/timeReviewQueries';
import { SummaryCards, type SummaryCounts } from '@/components/admin/time-review/SummaryCards';
import { FilterBar, type FilterState } from '@/components/admin/time-review/FilterBar';
import { DayRow } from '@/components/admin/time-review/DayRow';
import { EmptyState, type EmptyKind } from '@/components/admin/time-review/EmptyState';
import { computeCounts, matchesFilter, computeEmptyKind } from '@/lib/admin/adminTimeReviewFilters';

const LazyDailyOverviewDialog = React.lazy(async () => {
  const mod = await import('@/components/staff/DailyOverviewDialog');
  return { default: mod.DailyOverviewDialog };
});

const AdminTimeReview: React.FC = () => {
  const [filter, setFilter] = useState<FilterState>({
    from: new Date(),
    to: new Date(),
    staffId: 'all',
    status: 'all',
    anomaly: 'all',
    projectQuery: '',
  });
  const [topFilter, setTopFilter] = useState<keyof SummaryCounts | null>(null);
  const [openRow, setOpenRow] = useState<DayReviewRow | null>(null);

  const fromYmd = format(filter.from, 'yyyy-MM-dd');
  const toYmd = format(filter.to, 'yyyy-MM-dd');

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ['admin-time-review-rows', fromYmd, toYmd],
    queryFn: () => fetchDayReviewRows({ fromDate: fromYmd, toDate: toYmd }),
    refetchInterval: 60_000,
  });

  const counts = useMemo(() => computeCounts(rows), [rows]);

  const staffOptions = useMemo(() => {
    const seen = new Map<string, string>();
    rows.forEach((r) => seen.set(r.staffId, r.staffName));
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const base = rows.filter((r) => matchesFilter(r, filter));
    if (!topFilter) return base;
    return base.filter((r) => {
      switch (topFilter) {
        case 'total':          return true;
        case 'ongoing':        return r.workdayStart && !r.workdayEnd;
        case 'needsReview':    return r.reviewStatus === 'needs_review' || r.result.status === 'critical';
        case 'readyToApprove': return r.reviewStatus !== 'approved' && r.result.status === 'ok' && r.workdayEnd;
        case 'approved':       return r.reviewStatus === 'approved';
        default:               return true;
      }
    });
  }, [rows, filter, topFilter]);

  const emptyKind: EmptyKind | null = computeEmptyKind(rows, filteredRows, filter, topFilter);

  const resetFilter = () => {
    setFilter((prev) => ({ ...prev, staffId: 'all', status: 'all', anomaly: 'all', projectQuery: '' }));
    setTopFilter(null);
  };

  return (
    <PageContainer theme="purple">
      <PageHeader title="Tidkontroll" subtitle="Granska och godkänn arbetsdagar i en samlad vy" icon={Clock} />

      <div className="space-y-4">
        <SummaryCards counts={counts} activeFilter={topFilter} onFilterChange={setTopFilter} />

        <FilterBar value={filter} onChange={setFilter} staffOptions={staffOptions} onReset={resetFilter} />

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Laddar dagar…
          </div>
        ) : error ? (
          <div className="text-destructive text-sm py-8 text-center">Kunde inte ladda data: {(error as Error).message}</div>
        ) : emptyKind ? (
          <EmptyState kind={emptyKind} />
        ) : (
          <div className="space-y-2">
            {filteredRows.map((row) => (
              <DayRow key={`${row.staffId}-${row.date}`} row={row} onClick={setOpenRow} />
            ))}
          </div>
        )}
      </div>

      {openRow && (
        <Suspense fallback={null}>
          <LazyDailyOverviewDialog
            open={!!openRow}
            onOpenChange={(o) => !o && setOpenRow(null)}
            date={openRow.date}
            staffId={openRow.staffId}
            staffName={openRow.staffName}
            reviewRow={openRow}
            travelSegments={openRow.travelSegments.map((t) => ({
              id: t.id,
              start_time: t.start_time,
              end_time: t.end_time,
              hours_worked: t.hours_worked,
              from_address: null, to_address: null,
              from_latitude: null, from_longitude: null,
              to_latitude: null, to_longitude: null,
              destination_booking_id: null,
            }))}
            workEntries={openRow.workEntries.map((e) => ({
              id: e.id,
              start_time: e.start_time,
              end_time: e.end_time,
              hours_worked: e.hours_worked,
              booking_client: '',
              booking_number: null,
              description: null,
              delivery_lat: null,
              delivery_lng: null,
            }))}
          />
        </Suspense>
      )}
    </PageContainer>
  );
};

export default AdminTimeReview;
