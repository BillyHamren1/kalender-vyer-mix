import React from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Clock3, FileText, Lock, Receipt } from 'lucide-react';
import { TIME_V2_ROUTE } from '@/features/time-v2/lib/moduleFlag';
import { formatMinutes } from '@/features/time-v2/lib/contract';
import { useTimeV2SubmissionDetail } from '@/features/time-v2/hooks/useTimeV2Review';
import TimeV2DecisionPanel from '@/features/time-v2/components/TimeV2DecisionPanel';
import ExpenseDecisionPanel from '@/features/time-v2/components/expenses/ExpenseDecisionPanel';
import ExpenseReceiptButton from '@/features/time-v2/components/expenses/ExpenseReceiptButton';
import ExpenseRevisionChain from '@/features/time-v2/components/expenses/ExpenseRevisionChain';
import TimeV2StateCard from '@/features/time-v2/components/TimeV2StateCard';
import {
  EXPENSE_STATE_LABELS,
  formatExpenseAmount,
  shortHash,
  type ExpenseChainView,
} from '@/features/time-v2/lib/expenseContract';
import { describeTargets, type OperationsRow } from '@/features/time-v2/lib/operations';
import OperationsActionReasons from '@/features/time-v2/components/operations/OperationsActionReasons';

interface Props {
  organizationId: string | null;
  enabled: boolean;
  row: OperationsRow;
  onRefresh: () => void;
}

const ExpenseBlock: React.FC<{ chain: ExpenseChainView; onRefresh: () => void }> = ({ chain, onRefresh }) => {
  const s = chain.latest;
  return (
    <Card className="p-4 space-y-3" data-testid="time-v2-ops-expense" data-submission-id={s.submissionId}>
      <div className="flex flex-wrap items-center gap-2">
        <Receipt className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">{formatExpenseAmount(s.money)}</span>
        <Badge variant="outline" className="text-[10px]">{EXPENSE_STATE_LABELS[s.state]}</Badge>
        <Badge variant="outline" className="text-[10px]">v{s.version}</Badge>
        <Badge variant="outline" className="text-[10px] font-mono gap-1">
          <Lock className="w-3 h-3" /> {shortHash(s.canonicalHash)}
        </Badge>
        <Button variant="ghost" size="sm" className="ml-auto" asChild>
          <Link to={`${TIME_V2_ROUTE}/expenses/${s.submissionId}`}>Öppna exakt inlämning</Link>
        </Button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {s.categoryRef && <span>Kategori: {s.categoryRef}</span>}
        {s.supplier && <span>Leverantör: {s.supplier}</span>}
        <span>Datum: {s.expenseDate}</span>
        <span>
          {chain.binding.status === 'bound'
            ? `Bunden: ${chain.binding.bookingNumber ?? chain.binding.projectName ?? 'okänd referens'}`
            : 'Ej bunden till bokning/projekt'}
        </span>
      </div>
      {s.workerStatement && <p className="text-sm text-foreground">”{s.workerStatement}”</p>}

      {s.attachments.length === 0 ? (
        <p className="text-xs text-muted-foreground">Inget kvitto registrerat i Time-snapshoten.</p>
      ) : (
        <div className="space-y-2">
          {s.attachments.map((a) => (
            <ExpenseReceiptButton
              key={a.attachmentId}
              submissionId={s.submissionId}
              attachment={a}
              disabled={chain.binding.status !== 'bound'}
            />
          ))}
        </div>
      )}

      {chain.revisions.length > 1 && <ExpenseRevisionChain revisions={chain.revisions} currentId={s.submissionId} />}

      <ExpenseDecisionPanel submission={s} binding={chain.binding} onRefresh={onRefresh} />
    </Card>
  );
};

/**
 * Right-hand operational detail for one worker + work date:
 * exact time submission (segments, deviations, immutable snapshot version) and
 * every expense chain, each decided against its own exact immutable version.
 */
const OperationsDetailPanel: React.FC<Props> = ({ organizationId, enabled, row, onRefresh }) => {
  const detail = useTimeV2SubmissionDetail(organizationId, row.time?.submissionId, enabled && !!row.time);

  return (
    <div className="space-y-4" data-testid="time-v2-ops-detail" data-row-key={row.key}>
      <Card className="p-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-foreground">{row.workerName}</h2>
          <span className="text-sm tabular-nums text-muted-foreground">{row.date}</span>
          {row.time && <Badge variant="outline" className="text-[10px]">{row.time.state}</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">{describeTargets(row)}</p>
        <OperationsActionReasons
          reasons={row.actionReasons}
          testId="time-v2-ops-detail-reasons"
          emptyLabel="Inget kräver åtgärd för den här dagen – arbetstid och utlägg är avslutade."
        />
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>Arbetstid {row.time ? formatMinutes(row.time.totalMinutes) : '—'}</span>
          <span>Resa {row.time ? formatMinutes(row.time.travelMinutes) : '—'}</span>
          <span>Rast {row.time ? formatMinutes(row.time.breakMinutes) : '—'}</span>
          <span>Utlägg {row.totals.expenseCount}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Planning ändrar aldrig bokningens eller projektets underlag härifrån, och ingen lön, bokföring eller
          projektkostnad posteras.
        </p>
      </Card>

      {!row.time && (
        <TimeV2StateCard
          testId="time-v2-ops-detail-no-time"
          icon={<AlertTriangle className="w-5 h-5 text-amber-600" />}
          title="Ingen arbetstid inlämnad för dagen"
          body="Time har inte lämnat in någon dagsrapport för den här medarbetaren och dagen. Utläggen nedan kan ändå granskas."
        />
      )}

      {row.time && detail.isLoading && (
        <TimeV2StateCard
          testId="time-v2-ops-detail-loading"
          icon={<Clock3 className="w-5 h-5 text-muted-foreground" />}
          title="Hämtar dagens exakta inlämning…"
          body="Läser Time-kontraktet (endast läsning)."
        />
      )}

      {row.time && detail.error && (
        <TimeV2StateCard
          testId="time-v2-ops-detail-error"
          icon={<AlertTriangle className="w-5 h-5 text-destructive" />}
          title="Dagens inlämning kunde inte läsas"
          body={`${detail.error.message} Inget innehåll visas — Planning hittar inte på data.`}
        >
          <Button variant="outline" size="sm" onClick={() => detail.refetch()}>Försök igen</Button>
        </TimeV2StateCard>
      )}

      {detail.data && (
        <>
          <Card className="p-4 space-y-3" data-testid="time-v2-ops-time-block">
            <div className="flex flex-wrap items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Inlämnad arbetstid · rev {detail.data.revision}</h3>
              {detail.data.snapshotVersion && (
                <Badge variant="outline" className="text-[10px] font-mono gap-1">
                  <Lock className="w-3 h-3" /> {detail.data.snapshotVersion}
                </Badge>
              )}
              <Button variant="ghost" size="sm" className="ml-auto" asChild>
                <Link to={`${TIME_V2_ROUTE}/review/${detail.data.submissionId}`}>Öppna hela dagen</Link>
              </Button>
            </div>
            <ul className="space-y-1" data-testid="time-v2-ops-segments">
              {detail.data.segments.map((seg) => (
                <li key={seg.id} className="flex flex-wrap items-center gap-2 rounded border bg-card px-2 py-1 text-xs">
                  <Badge variant="outline" className="text-[10px]">{seg.kind}</Badge>
                  <span className="text-foreground">{seg.label}</span>
                  {seg.targetName && <span className="text-muted-foreground">{seg.targetName}</span>}
                  <span className="ml-auto tabular-nums text-muted-foreground">{formatMinutes(seg.minutes)}</span>
                </li>
              ))}
              {detail.data.segments.length === 0 && (
                <li className="text-xs text-muted-foreground">Kontraktet innehåller inga segment för dagen.</li>
              )}
            </ul>
            {detail.data.correction.requested && (
              <p className="text-xs text-amber-700" data-testid="time-v2-ops-correction-open">
                Rättelse begärd{detail.data.correction.requestedAt ? ` ${detail.data.correction.requestedAt}` : ''}:{' '}
                {detail.data.correction.reason ?? 'utan angiven orsak'}
              </p>
            )}
            {detail.data.attestability.blockedReason && (
              <p className="text-xs text-destructive">Spärr: {detail.data.attestability.blockedReason}</p>
            )}
          </Card>

          <TimeV2DecisionPanel
            organizationId={organizationId}
            submissionId={detail.data.submissionId}
            detail={detail.data}
            onRefresh={() => {
              detail.refetch();
              onRefresh();
            }}
          />
        </>
      )}

      {row.expenses.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="time-v2-ops-no-expenses">
          Inga utlägg inlämnade för den här dagen.
        </p>
      ) : (
        row.expenses.map((chain) => <ExpenseBlock key={chain.rootId} chain={chain} onRefresh={onRefresh} />)
      )}
    </div>
  );
};

export default OperationsDetailPanel;
