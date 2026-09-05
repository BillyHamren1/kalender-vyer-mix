import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Inbox, MousePointerClick, RefreshCw } from 'lucide-react';
import { useTimeV2Flag } from '@/features/time-v2/hooks/useTimeV2Flag';
import { useTimeV2Operations } from '@/features/time-v2/hooks/useTimeV2Operations';
import { LEGACY_TIME_ROUTE, TIME_V2_ROUTE } from '@/features/time-v2/lib/moduleFlag';
import { describeFreshness, TIME_V2_CONTRACT_VERSION } from '@/features/time-v2/lib/contract';
import {
  OPERATIONS_VIEW_LABELS,
  type OperationsFilters,
  type OperationsView,
} from '@/features/time-v2/lib/operations';
import OperationsDayRow from '@/features/time-v2/components/operations/OperationsDayRow';
import OperationsDetailPanel from '@/features/time-v2/components/operations/OperationsDetailPanel';
import ExpenseStateNotice from '@/features/time-v2/components/expenses/ExpenseStateNotice';
import TimeV2StateCard from '@/features/time-v2/components/TimeV2StateCard';

const Stat: React.FC<{ label: string; value: number; testId: string }> = ({ label, value, testId }) => (
  <Card className="p-3" data-testid={testId}>
    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="text-lg font-semibold tabular-nums text-foreground">{value}</p>
  </Card>
);

/**
 * "Tid & utlägg — drift": the planner's single operational surface.
 *
 * Left: every worker + work date with submitted work time, travel, expenses,
 * deviations and immutable version/hash. Right: the exact submission with
 * receipts and the decisions Planning is allowed to take (request correction,
 * attest payroll/project output, approve/reject/correct an expense against its
 * exact immutable version). Nothing here mutates Booking/Planning source data
 * and nothing posts payroll, bookkeeping or project cost.
 */
const TimeV2OperationsPage: React.FC = () => {
  const flag = useTimeV2Flag();
  const [filters, setFilters] = React.useState<OperationsFilters>({ view: 'needs_action' });
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);

  const ops = useTimeV2Operations(flag.organizationId, flag.enabled, filters);

  const set = <K extends keyof OperationsFilters>(k: K, v: OperationsFilters[K]) =>
    setFilters((f) => ({ ...f, [k]: (v || undefined) as OperationsFilters[K] }));

  const selected = ops.rows.find((r) => r.key === selectedKey) ?? null;

  if (flag.isLoading) return <div className="p-8 text-sm text-muted-foreground">Laddar modulstatus…</div>;
  if (!flag.enabled) return <Navigate to={LEGACY_TIME_ROUTE} replace />;

  return (
    <div className="p-6 space-y-5" data-testid="time-v2-operations-page">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">Tid &amp; utlägg — drift</h1>
            <Badge variant="secondary" className="text-[10px]">kontrakt {TIME_V2_CONTRACT_VERSION}</Badge>
            <Badge variant="outline" className="text-[10px]">planning-expense-review.v1</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            <Link className="underline" to={TIME_V2_ROUTE}>Tid V2</Link> · en yta per medarbetare och arbetsdag:
            inlämnad arbetstid, resa, utlägg med kvitto, avvikelser och exakt oföränderlig version.
            {ops.queue.data ? ` ${describeFreshness(ops.queue.data.generatedAt)}` : ''}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={ops.refresh} disabled={ops.isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${ops.isFetching ? 'animate-spin' : ''}`} /> Uppdatera
        </Button>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3" data-testid="time-v2-ops-counts">
        <Stat label="Dagar" value={ops.counts.rows} testId="time-v2-ops-count-rows" />
        <Stat label="Kräver åtgärd" value={ops.counts.needsAction} testId="time-v2-ops-count-action" />
        <Stat label="Tid att granska" value={ops.counts.timeNeedsReview} testId="time-v2-ops-count-time" />
        <Stat label="Obeslutade utlägg" value={ops.counts.openExpenses} testId="time-v2-ops-count-expenses" />
        <Stat label="Ej bundna utlägg" value={ops.counts.unboundExpenses} testId="time-v2-ops-count-unbound" />
      </section>

      <Card className="p-3 flex flex-wrap items-center gap-2">
        <Input type="date" className="h-9 w-[160px]" value={filters.from ?? ''} onChange={(e) => set('from', e.target.value)} aria-label="Från datum" />
        <span className="text-muted-foreground text-sm">→</span>
        <Input type="date" className="h-9 w-[160px]" value={filters.to ?? ''} onChange={(e) => set('to', e.target.value)} aria-label="Till datum" />
        <Input
          className="h-9 w-[260px]"
          placeholder="Sök medarbetare, bokning, projekt, leverantör"
          value={filters.query ?? ''}
          onChange={(e) => set('query', e.target.value)}
          aria-label="Fritext"
        />
        <div className="flex flex-wrap gap-1">
          {(Object.keys(OPERATIONS_VIEW_LABELS) as OperationsView[]).map((v) => (
            <Button
              key={v}
              size="sm"
              className="h-9"
              variant={(filters.view ?? 'needs_action') === v ? 'default' : 'outline'}
              data-testid={`time-v2-ops-view-${v}`}
              onClick={() => setFilters((f) => ({ ...f, view: v }))}
            >
              {OPERATIONS_VIEW_LABELS[v]}
            </Button>
          ))}
        </div>
      </Card>

      <ExpenseStateNotice
        error={ops.expenses.error}
        isLoading={ops.isLoading}
        onRetry={ops.refresh}
        loadingTitle="Hämtar dagar och utlägg från Time…"
      />
      {ops.queue.error && (
        <TimeV2StateCard
          testId="time-v2-ops-queue-error"
          icon={<Inbox className="w-5 h-5 text-destructive" />}
          title="Tidkontraktet kunde inte läsas"
          body={`${ops.queue.error.message} Utläggen nedan visas ändå, men utan dagens arbetstid.`}
        />
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(360px,460px)_1fr] gap-4 items-start">
        <div className="space-y-2" data-testid="time-v2-ops-list">
          {ops.rows.length === 0 && !ops.isLoading ? (
            <TimeV2StateCard
              testId="time-v2-ops-empty"
              icon={<Inbox className="w-5 h-5 text-muted-foreground" />}
              title="Inga dagar matchar filtret"
              body="Time-kontrakten returnerade inga dagar eller utlägg för den här perioden. Planning visar aldrig påhittade rader."
            />
          ) : (
            ops.rows.map((row) => (
              <OperationsDayRow
                key={row.key}
                row={row}
                selected={row.key === selectedKey}
                onSelect={() => setSelectedKey(row.key)}
              />
            ))
          )}
        </div>

        <div className="xl:sticky xl:top-4">
          {selected ? (
            <OperationsDetailPanel
              organizationId={flag.organizationId}
              enabled={flag.enabled}
              row={selected}
              onRefresh={ops.refresh}
            />
          ) : (
            <TimeV2StateCard
              testId="time-v2-ops-no-selection"
              icon={<MousePointerClick className="w-5 h-5 text-muted-foreground" />}
              title="Välj en dag till vänster"
              body="Här visas den exakta inlämningen: arbetstid, resa, utlägg med kvitto och besluten som gäller exakt den oföränderliga versionen."
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default TimeV2OperationsPage;
