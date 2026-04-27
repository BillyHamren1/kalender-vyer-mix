import { useMemo, useState } from 'react';
import { ArrowLeft, ClipboardCheck, RefreshCw } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAdminDayReviewRows } from '@/hooks/useAdminDayReviewRows';
import { AdminDayRowCard } from '@/components/admin-time-review/AdminDayRowCard';
import { StaffTimeReportDetail } from '@/components/staff/StaffTimeReportDetail';
import type { AdminDayRow, DayStatus } from '@/lib/timeReview/dayAggregation';
import { cn } from '@/lib/utils';

type RangePreset = 'today' | 'yesterday' | 'last7' | 'last30';
type StatusFilter = 'all' | DayStatus;

const presetRange = (p: RangePreset): { fromDate: string; toDate: string; label: string } => {
  const today = new Date();
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd');
  if (p === 'today') return { fromDate: fmt(today), toDate: fmt(today), label: 'Idag' };
  if (p === 'yesterday') {
    const y = subDays(today, 1);
    return { fromDate: fmt(y), toDate: fmt(y), label: 'Igår' };
  }
  if (p === 'last7') return { fromDate: fmt(subDays(today, 6)), toDate: fmt(today), label: '7 dagar' };
  return { fromDate: fmt(subDays(today, 29)), toDate: fmt(today), label: '30 dagar' };
};

const AdminTimeReviewDashboard = () => {
  const [preset, setPreset] = useState<RangePreset>('today');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selected, setSelected] = useState<{ staffId: string; name: string; date: Date } | null>(null);

  const range = useMemo(() => presetRange(preset), [preset]);
  const { data: rows = [], isLoading, isRefetching, refetch } = useAdminDayReviewRows({
    fromDate: range.fromDate,
    toDate: range.toDate,
  });

  const counts = useMemo(() => {
    const c: Record<DayStatus, number> = { in_progress: 0, needs_review: 0, ready: 0, approved: 0 };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);

  const filtered = useMemo(
    () => (statusFilter === 'all' ? rows : rows.filter(r => r.status === statusFilter)),
    [rows, statusFilter],
  );

  const handleOpen = (row: AdminDayRow) => {
    const [y, m, d] = row.day_key.split('-').map(Number);
    setSelected({
      staffId: row.staff_id,
      name: row.staff_name,
      date: new Date(y, (m || 1) - 1, d || 1),
    });
  };

  if (selected) {
    return (
      <PageContainer theme="purple">
        <PageHeader
          icon={ClipboardCheck}
          title={selected.name}
          subtitle={format(selected.date, 'yyyy-MM-dd')}
          variant="purple"
        >
          <Button variant="outline" size="sm" onClick={() => setSelected(null)} className="rounded-lg gap-1.5 h-8 px-3">
            <ArrowLeft className="h-3.5 w-3.5" />
            Tillbaka
          </Button>
        </PageHeader>
        <StaffTimeReportDetail
          staffId={selected.staffId}
          staffName={selected.name}
          initialDate={selected.date}
          autoOpenDailyOverviewDate={format(selected.date, 'yyyy-MM-dd')}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer theme="purple">
      <PageHeader
        icon={ClipboardCheck}
        title="Tidrapport — dagöversikt"
        subtitle="En rad per personal och dag — direkt synligt vad som pågår, behöver review eller är klart"
        variant="purple"
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isRefetching}
          className="rounded-lg gap-1.5 h-8 px-3"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isRefetching && 'animate-spin')} />
          Uppdatera
        </Button>
      </PageHeader>

      <div className="space-y-4">
        {/* Range presets */}
        <Tabs value={preset} onValueChange={v => setPreset(v as RangePreset)}>
          <TabsList className="grid grid-cols-4 w-full sm:w-auto sm:inline-grid">
            <TabsTrigger value="today">Idag</TabsTrigger>
            <TabsTrigger value="yesterday">Igår</TabsTrigger>
            <TabsTrigger value="last7">7 dagar</TabsTrigger>
            <TabsTrigger value="last30">30 dagar</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Status summary chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <StatusChip
            active={statusFilter === 'all'}
            onClick={() => setStatusFilter('all')}
            label={`Alla (${rows.length})`}
            tone="muted"
          />
          <StatusChip
            active={statusFilter === 'in_progress'}
            onClick={() => setStatusFilter('in_progress')}
            label={`Pågår (${counts.in_progress})`}
            tone="blue"
          />
          <StatusChip
            active={statusFilter === 'needs_review'}
            onClick={() => setStatusFilter('needs_review')}
            label={`Behöver review (${counts.needs_review})`}
            tone="destructive"
          />
          <StatusChip
            active={statusFilter === 'ready'}
            onClick={() => setStatusFilter('ready')}
            label={`Redo (${counts.ready})`}
            tone="amber"
          />
          <StatusChip
            active={statusFilter === 'approved'}
            onClick={() => setStatusFilter('approved')}
            label={`Godkänd (${counts.approved})`}
            tone="emerald"
          />
        </div>

        {/* Rows */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <ClipboardCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-semibold">Inga dagar matchar filtret</p>
            <p className="text-sm mt-1">Prova ett annat tidsspann eller status.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(row => (
              <AdminDayRowCard key={row.key} row={row} onOpen={handleOpen} />
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
};

interface ChipProps {
  active: boolean;
  onClick: () => void;
  label: string;
  tone: 'muted' | 'blue' | 'destructive' | 'amber' | 'emerald';
}
const StatusChip = ({ active, onClick, label, tone }: ChipProps) => {
  const tones: Record<ChipProps['tone'], string> = {
    muted: 'border-border bg-muted/30 text-foreground',
    blue: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300',
    destructive: 'border-destructive/30 bg-destructive/10 text-destructive',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-full text-xs font-semibold border transition-all active:scale-95',
        tones[tone],
        active ? 'ring-2 ring-primary/40 shadow-sm' : 'opacity-80 hover:opacity-100',
      )}
    >
      {label}
    </button>
  );
};

export default AdminTimeReviewDashboard;
