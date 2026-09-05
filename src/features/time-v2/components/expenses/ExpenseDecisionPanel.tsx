import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, CheckCircle2, FlaskConical, Lock } from 'lucide-react';
import { useDecideExpense } from '@/features/time-v2/hooks/useTimeV2Expenses';
import {
  EXPENSE_BINDING_REASON_LABELS,
  EXPENSE_LIMITS,
  EXPENSE_OPEN_STATES,
  EXPENSE_STATE_LABELS,
  shortHash,
  type ExpenseDecision,
  type ExpensePlanningBindingV1,
  type ExpenseSubmissionV1,
} from '@/features/time-v2/lib/expenseContract';

interface Props {
  submission: ExpenseSubmissionV1;
  binding: ExpensePlanningBindingV1;
  onRefresh: () => void;
}

const STALE_KINDS = new Set(['stale_revision', 'stale_hash', 'already_decided']);

/**
 * Decisions bound to the EXACT rendered snapshot (submissionId + version +
 * canonicalHash). A stale/decided snapshot surfaces truthfully with a re-read
 * action — never a silent retry. No payroll or project-cost posting happens.
 */
const ExpenseDecisionPanel: React.FC<Props> = ({ submission: s, binding, onRefresh }) => {
  const decide = useDecideExpense();
  const [reason, setReason] = React.useState('');
  const trimmed = reason.trim();
  const reasonOk = trimmed.length >= EXPENSE_LIMITS.reasonMin && trimmed.length <= EXPENSE_LIMITS.reasonMax;

  const isOpen = EXPENSE_OPEN_STATES.includes(s.state);
  const isBound = binding.status === 'bound';
  const locked = !isOpen || !isBound;

  const run = (decision: ExpenseDecision) =>
    decide.mutate(
      {
        submissionId: s.submissionId,
        submissionVersion: s.version,
        expectedSnapshotHash: s.canonicalHash,
        decision,
        reason: trimmed || undefined,
      },
      { onSuccess: () => setReason('') },
    );

  return (
    <Card className="p-4 space-y-4" data-testid="time-v2-expense-decision-panel">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">Beslut · v{s.version}</h2>
        <Badge variant="outline" className="text-[10px] font-mono gap-1">
          <Lock className="w-3 h-3" /> {shortHash(s.canonicalHash)}
        </Badge>
        <Badge variant="outline" className="text-[10px]">Time äger snapshoten</Badge>
        {s.isTestFixture && (
          <Badge variant="outline" className="text-[10px] gap-1"><FlaskConical className="w-3 h-3" /> TEST/PREVIEW</Badge>
        )}
      </div>

      {!isOpen && (
        <p className="text-sm text-muted-foreground" data-testid="time-v2-expense-closed">
          Den här versionen är {EXPENSE_STATE_LABELS[s.state].toLowerCase()} och kan inte beslutas igen.
          En ny version från medarbetaren visas som egen revision.
        </p>
      )}
      {!isBound && (
        <p className="text-sm text-destructive" data-testid="time-v2-expense-unbound-block">
          Spärrat: {EXPENSE_BINDING_REASON_LABELS[binding.reason ?? ''] ?? binding.reason}. Ett utlägg utan exakt
          Planning-bokning/projekt kan varken beslutas eller få kvittot öppnat.
        </p>
      )}

      {decide.error && (
        <div
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
          data-testid={STALE_KINDS.has(decide.error.kind) ? 'time-v2-expense-stale' : 'time-v2-expense-command-error'}
        >
          <p className="flex items-center gap-2 font-medium text-destructive">
            <AlertTriangle className="w-4 h-4" /> {decide.error.message}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => { decide.reset(); onRefresh(); }}>
            Läs om snapshoten
          </Button>
        </div>
      )}

      {decide.isSuccess && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-sm" data-testid="time-v2-expense-decided">
          <p className="flex items-center gap-2 font-medium text-emerald-700">
            <CheckCircle2 className="w-4 h-4" /> Beslut registrerat i Time
          </p>
          <p className="text-xs text-muted-foreground font-mono">
            {decide.data.decision.decision} · v{decide.data.decision.submissionVersion} · {shortHash(decide.data.decision.snapshotHash)}
            {decide.data.decision.decidedAt ? ` · ${decide.data.decision.decidedAt}` : ''}
          </p>
          <p className="text-xs text-muted-foreground">idempotens: {decide.data.idempotencyKey}</p>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="time-v2-expense-reason">
          Motivering (krävs för avslag och rättelse, visas för medarbetaren)
        </label>
        <Textarea
          id="time-v2-expense-reason"
          data-testid="time-v2-expense-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Beskriv exakt vad som ska rättas eller varför utlägget avslås."
          rows={2}
          disabled={locked || decide.isPending}
          maxLength={EXPENSE_LIMITS.reasonMax}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          data-testid="time-v2-expense-approve"
          disabled={locked || decide.isPending}
          onClick={() => run('approved')}
        >
          Godkänn v{s.version}
        </Button>
        <Button
          size="sm"
          variant="outline"
          data-testid="time-v2-expense-request-correction"
          disabled={locked || decide.isPending || !reasonOk}
          onClick={() => run('correction_requested')}
        >
          Begär rättelse
        </Button>
        <Button
          size="sm"
          variant="destructive"
          data-testid="time-v2-expense-reject"
          disabled={locked || decide.isPending || !reasonOk}
          onClick={() => run('rejected')}
        >
          Avslå
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Beslutet gäller exakt v{s.version} med hash {shortHash(s.canonicalHash)}. Ingen bokföring, lön eller
        projektkostnad posteras härifrån.
      </p>
    </Card>
  );
};

export default ExpenseDecisionPanel;
