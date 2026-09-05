import React from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FlaskConical, Link2Off, Lock, RefreshCw } from 'lucide-react';
import { useTimeV2Flag } from '@/features/time-v2/hooks/useTimeV2Flag';
import { useTimeV2ExpenseChain } from '@/features/time-v2/hooks/useTimeV2Expenses';
import {
  EXPENSE_BINDING_REASON_LABELS,
  EXPENSE_STATE_LABELS,
  formatExpenseAmount,
  orderRevisionChain,
  shortHash,
} from '@/features/time-v2/lib/expenseContract';
import { LEGACY_TIME_ROUTE, TIME_V2_ROUTE } from '@/features/time-v2/lib/moduleFlag';
import ExpenseStateNotice from '@/features/time-v2/components/expenses/ExpenseStateNotice';
import ExpenseDecisionPanel from '@/features/time-v2/components/expenses/ExpenseDecisionPanel';
import ExpenseReceiptButton from '@/features/time-v2/components/expenses/ExpenseReceiptButton';
import ExpenseRevisionChain from '@/features/time-v2/components/expenses/ExpenseRevisionChain';
import TimeV2StateCard from '@/features/time-v2/components/TimeV2StateCard';

const Row: React.FC<{ label: string; value: string; testId?: string; mono?: boolean }> = ({ label, value, testId, mono }) => (
  <div className="rounded-lg border bg-card px-3 py-2" data-testid={testId}>
    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className={`text-sm font-semibold text-foreground break-all ${mono ? 'font-mono' : 'tabular-nums'}`}>{value}</p>
  </div>
);

/** One immutable expense snapshot with its chain, receipts and decisions. */
const TimeV2ExpenseDetailPage: React.FC = () => {
  const flag = useTimeV2Flag();
  const { submissionId } = useParams<{ submissionId: string }>();
  const chain = useTimeV2ExpenseChain(flag.organizationId, submissionId, flag.enabled);

  if (flag.isLoading) return <div className="p-8 text-sm text-muted-foreground">Laddar modulstatus…</div>;
  if (!flag.enabled) return <Navigate to={LEGACY_TIME_ROUTE} replace />;

  const row = chain.data?.rows.find((r) => r.submission.submissionId === submissionId) ?? null;
  const revisions = chain.data ? orderRevisionChain(chain.data.rows.map((r) => r.submission)) : [];
  const s = row?.submission ?? null;
  const b = row?.binding ?? null;
  const latest = revisions[revisions.length - 1] ?? null;
  const isLatest = !!s && !!latest && latest.submissionId === s.submissionId;

  return (
    <div className="p-6 space-y-5" data-testid="time-v2-expense-detail">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {s ? `${s.worker?.displayName ?? 'Okänd medarbetare'} · ${s.expenseDate} · ${formatExpenseAmount(s.money)}` : 'Utlägg'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <Link className="underline" to={`${TIME_V2_ROUTE}/expenses`}>Tillbaka till Tid &amp; utlägg</Link> ·
            oförändrad snapshot från Time. Planning skriver aldrig om en version.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => chain.refetch()} disabled={chain.isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${chain.isFetching ? 'animate-spin' : ''}`} /> Uppdatera
        </Button>
      </header>

      <ExpenseStateNotice error={chain.error} isLoading={chain.isLoading} onRetry={() => chain.refetch()} loadingTitle="Hämtar utläggets snapshot…" />

      {chain.data && !row && (
        <TimeV2StateCard
          testId="time-v2-expense-not-found"
          icon={<Link2Off className="w-5 h-5 text-muted-foreground" />}
          title="Snapshoten finns inte i din organisations Time-tenant"
          body="Time returnerade ingen version med det här id:t för din organisation."
        />
      )}

      {s && b && (
        <>
          <Card className="p-4 flex flex-wrap items-center gap-2" data-testid="time-v2-expense-head">
            <Badge variant={s.state === 'submitted' ? 'default' : 'outline'} className="text-[10px]">{EXPENSE_STATE_LABELS[s.state]}</Badge>
            <Badge variant="outline" className="text-[10px]">v{s.version}</Badge>
            <Badge variant="secondary" className="text-[10px] gap-1"><Lock className="w-3 h-3" /> låst snapshot</Badge>
            {!isLatest && <Badge variant="destructive" className="text-[10px]" data-testid="time-v2-expense-not-latest">äldre version — nyare finns</Badge>}
            {s.isTestFixture && <Badge variant="outline" className="text-[10px] gap-1"><FlaskConical className="w-3 h-3" /> TEST/PREVIEW</Badge>}
            {s.submittedAt && <span className="text-xs text-muted-foreground">inskickad {s.submittedAt}</span>}
            <span className="ml-auto text-[10px] font-mono text-muted-foreground" data-testid="time-v2-expense-hash">{s.canonicalHash}</span>
          </Card>

          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="time-v2-expense-facts">
            <Row label="Belopp" value={formatExpenseAmount(s.money)} testId="time-v2-expense-detail-amount" />
            <Row label="Valuta" value={s.money.currency} />
            <Row label="Datum" value={s.expenseDate} />
            <Row label="Kategori" value={s.categoryRef ?? '—'} />
            <Row label="Leverantör" value={s.supplier ?? '—'} />
            <Row label="Medarbetare" value={s.worker?.displayName ?? s.personnelAccountId ?? '—'} />
            <Row label="Submission" value={s.submissionId} mono />
            <Row label="Hash" value={shortHash(s.canonicalHash)} mono />
          </section>

          <Card className="p-4 space-y-1" data-testid="time-v2-expense-binding">
            <h2 className="text-sm font-semibold text-foreground">Planning-koppling</h2>
            {b.status === 'bound' ? (
              <p className="text-sm text-foreground">
                {b.bookingNumber ? `Bokning ${b.bookingNumber}` : 'Bokning saknas'}
                {b.bookingTitle ? ` · ${b.bookingTitle}` : ''}
                {b.projectName ? ` · Projekt ${b.projectName}` : ''}
              </p>
            ) : (
              <p className="text-sm text-destructive inline-flex items-center gap-1">
                <Link2Off className="w-4 h-4" /> Ej bunden: {EXPENSE_BINDING_REASON_LABELS[b.reason ?? ''] ?? b.reason}
              </p>
            )}
            <p className="text-xs text-muted-foreground font-mono">
              Time-lineage · assignment {s.lineage.assignmentId ?? '—'} · bookingRef {s.lineage.bookingRef ?? '—'} · projectRef {s.lineage.projectRef ?? '—'} · sourceVersion {s.lineage.sourceVersion ?? '—'}
            </p>
          </Card>

          {s.workerStatement && (
            <Card className="p-4">
              <h2 className="text-sm font-semibold text-foreground">Medarbetarens kommentar</h2>
              <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap" data-testid="time-v2-expense-statement">{s.workerStatement}</p>
            </Card>
          )}

          <section className="space-y-2" data-testid="time-v2-expense-receipts">
            <h2 className="text-sm font-semibold text-foreground">Kvitton (kortlivad signerad läsning)</h2>
            {s.attachments.length === 0 ? (
              <p className="text-xs text-muted-foreground">Snapshoten innehåller inget kvitto.</p>
            ) : (
              s.attachments.map((a) => (
                <ExpenseReceiptButton key={a.attachmentId} submissionId={s.submissionId} attachment={a} disabled={b.status !== 'bound'} />
              ))
            )}
          </section>

          <ExpenseDecisionPanel submission={s} binding={b} onRefresh={() => chain.refetch()} />

          <ExpenseRevisionChain revisions={revisions} currentId={s.submissionId} />
        </>
      )}
    </div>
  );
};

export default TimeV2ExpenseDetailPage;
