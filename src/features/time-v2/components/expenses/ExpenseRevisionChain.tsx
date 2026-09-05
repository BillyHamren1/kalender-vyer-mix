import React from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Lock } from 'lucide-react';
import { TIME_V2_ROUTE } from '@/features/time-v2/lib/moduleFlag';
import {
  EXPENSE_STATE_LABELS,
  formatExpenseAmount,
  shortHash,
  type ExpenseSubmissionV1,
} from '@/features/time-v2/lib/expenseContract';

interface Props {
  revisions: ExpenseSubmissionV1[];
  currentId: string;
}

/**
 * Immutable revision chain oldest → newest. Each version is its own snapshot
 * with its own hash and decision; nothing is merged or overwritten.
 */
const ExpenseRevisionChain: React.FC<Props> = ({ revisions, currentId }) => (
  <section className="space-y-2" data-testid="time-v2-expense-chain">
    <h2 className="text-sm font-semibold text-foreground">Revisionskedja (oföränderlig)</h2>
    <ol className="space-y-2">
      {revisions.map((r) => {
        const current = r.submissionId === currentId;
        return (
          <li
            key={r.submissionId}
            className={`rounded-lg border px-3 py-2 text-sm ${current ? 'bg-accent/40 border-primary/40' : 'bg-card'}`}
            data-testid="time-v2-expense-revision"
            data-version={r.version}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={current ? 'default' : 'outline'} className="text-[10px]">v{r.version}</Badge>
              <span className="font-medium text-foreground">{EXPENSE_STATE_LABELS[r.state]}</span>
              <span className="text-xs tabular-nums text-muted-foreground">{formatExpenseAmount(r.money)}</span>
              <span className="text-[10px] font-mono text-muted-foreground inline-flex items-center gap-1">
                <Lock className="w-3 h-3" /> {shortHash(r.canonicalHash)}
              </span>
              {r.submittedAt && <span className="text-xs text-muted-foreground">{r.submittedAt}</span>}
              {!current && (
                <Link className="ml-auto text-xs underline" to={`${TIME_V2_ROUTE}/expenses/${r.submissionId}`}>
                  Visa v{r.version}
                </Link>
              )}
            </div>
            {r.decision && (
              <p className="mt-1 text-xs text-muted-foreground">
                Beslut: {r.decision.decision} · v{r.decision.submissionVersion} · {shortHash(r.decision.snapshotHash)}
                {r.decision.decidedAt ? ` · ${r.decision.decidedAt}` : ''}
                {r.decision.reason ? ` · ”${r.decision.reason}”` : ''}
              </p>
            )}
            {r.previousSubmissionId && (
              <p className="text-[10px] text-muted-foreground font-mono">ersätter {r.previousSubmissionId}</p>
            )}
          </li>
        );
      })}
    </ol>
  </section>
);

export default ExpenseRevisionChain;
