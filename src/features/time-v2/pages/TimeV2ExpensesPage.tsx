import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Inbox, RefreshCw } from 'lucide-react';
import { useTimeV2Flag } from '@/features/time-v2/hooks/useTimeV2Flag';
import { useTimeV2Expenses } from '@/features/time-v2/hooks/useTimeV2Expenses';
import { buildExpenseChains, type ExpenseScope } from '@/features/time-v2/lib/expenseContract';
import { describeFreshness } from '@/features/time-v2/lib/contract';
import { LEGACY_TIME_ROUTE, TIME_V2_ROUTE } from '@/features/time-v2/lib/moduleFlag';
import TimeV2StateCard from '@/features/time-v2/components/TimeV2StateCard';
import ExpenseStateNotice from '@/features/time-v2/components/expenses/ExpenseStateNotice';
import ExpenseChainCard from '@/features/time-v2/components/expenses/ExpenseChainCard';

const Stat: React.FC<{ label: string; value: number; testId: string }> = ({ label, value, testId }) => (
  <Card className="p-3" data-testid={testId}>
    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="text-lg font-semibold tabular-nums text-foreground">{value}</p>
  </Card>
);

/**
 * "Tid & utlägg" — the planner's real Time V2 expense inbox.
 * Rows are exact Time snapshots bound to exact Planning bookings/projects.
 * No mocks, no demo rows: gate/config/error states are rendered as such.
 */
const TimeV2ExpensesPage: React.FC = () => {
  const flag = useTimeV2Flag();
  const [scope, setScope] = React.useState<ExpenseScope>('open');
  const list = useTimeV2Expenses(flag.organizationId, flag.enabled, scope);

  if (flag.isLoading) return <div className="p-8 text-sm text-muted-foreground">Laddar modulstatus…</div>;
  if (!flag.enabled) return <Navigate to={LEGACY_TIME_ROUTE} replace />;

  const chains = list.data ? buildExpenseChains(list.data.rows) : [];

  return (
    <div className="p-6 space-y-5" data-testid="time-v2-expenses-page">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tid &amp; utlägg</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <Link className="underline" to={TIME_V2_ROUTE}>Tid V2</Link> · verkliga Time V2-utlägg kopplade till
            Plannings bokningar/projekt. Time äger varje version; Planning beslutar mot exakt version och hash.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border overflow-hidden" role="tablist" aria-label="Omfattning">
            {(['open', 'all'] as ExpenseScope[]).map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={scope === s}
                data-testid={`time-v2-expenses-scope-${s}`}
                className={`px-3 py-1.5 text-xs ${scope === s ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}
                onClick={() => setScope(s)}
              >
                {s === 'open' ? 'Väntar på beslut' : 'Alla versioner'}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => list.refetch()} disabled={list.isFetching}>
            <RefreshCw className={`w-4 h-4 mr-2 ${list.isFetching ? 'animate-spin' : ''}`} /> Uppdatera
          </Button>
        </div>
      </header>

      <ExpenseStateNotice error={list.error} isLoading={list.isLoading} onRetry={() => list.refetch()} />

      {list.data && (
        <>
          <section className="grid grid-cols-2 lg:grid-cols-5 gap-3" data-testid="time-v2-expenses-counts">
            <Stat label="Väntar" value={list.data.counts.open} testId="time-v2-expenses-count-open" />
            <Stat label="Totalt" value={list.data.counts.total} testId="time-v2-expenses-count-total" />
            <Stat label="Bundna" value={list.data.counts.bound} testId="time-v2-expenses-count-bound" />
            <Stat label="Ej bundna" value={list.data.counts.unbound} testId="time-v2-expenses-count-unbound" />
            <Stat label="Oläsbara" value={list.data.counts.unreadable} testId="time-v2-expenses-count-unreadable" />
          </section>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-[10px]">planning-expense-review.v1</Badge>
            <span>{describeFreshness(list.data.generatedAt)}</span>
            {list.data.counts.foreignTenantDropped > 0 && (
              <Badge variant="destructive" className="text-[10px]" data-testid="time-v2-expenses-foreign-dropped">
                {list.data.counts.foreignTenantDropped} från annan tenant bortfiltrerade
              </Badge>
            )}
            <span>Moms/valuta visas endast när Time-kontraktet anger dem (valuta ja, moms saknas i kontraktet).</span>
          </div>

          {chains.length === 0 ? (
            <TimeV2StateCard
              testId="time-v2-expenses-empty"
              icon={<Inbox className="w-5 h-5 text-muted-foreground" />}
              title={scope === 'open' ? 'Inga utlägg väntar på beslut' : 'Inga utlägg i Time för din organisation'}
              body="Time returnerade noll snapshots för den här omfattningen. Planning visar aldrig påhittade rader."
            />
          ) : (
            <div className="space-y-2" data-testid="time-v2-expenses-list">
              {chains.map((c) => <ExpenseChainCard key={c.rootId} chain={c} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TimeV2ExpensesPage;
