import React from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { FlaskConical, Link2Off, Lock, Paperclip } from 'lucide-react';
import { TIME_V2_ROUTE } from '@/features/time-v2/lib/moduleFlag';
import {
  EXPENSE_BINDING_REASON_LABELS,
  EXPENSE_STATE_LABELS,
  formatExpenseAmount,
  shortHash,
  type ExpenseChainView,
} from '@/features/time-v2/lib/expenseContract';

/** One expense chain in the list: exact Time snapshot + exact Planning binding. */
const ExpenseChainCard: React.FC<{ chain: ExpenseChainView }> = ({ chain }) => {
  const s = chain.latest;
  const b = chain.binding;
  const receipts = s.attachments.length;
  return (
    <Link
      to={`${TIME_V2_ROUTE}/expenses/${s.submissionId}`}
      className="block rounded-lg border bg-card px-4 py-3 hover:bg-accent/40 transition-colors"
      data-testid="time-v2-expense-row"
      data-submission-id={s.submissionId}
      data-version={s.version}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-foreground">
          {s.worker?.displayName ?? 'Okänd medarbetare'}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">{s.expenseDate}</span>
        <Badge variant={s.state === 'submitted' ? 'default' : 'outline'} className="text-[10px]">
          {EXPENSE_STATE_LABELS[s.state]}
        </Badge>
        <Badge variant="outline" className="text-[10px]">v{s.version}</Badge>
        {chain.revisions.length > 1 && (
          <Badge variant="secondary" className="text-[10px]">{chain.revisions.length} versioner</Badge>
        )}
        {s.isTestFixture && (
          <Badge variant="outline" className="text-[10px] gap-1"><FlaskConical className="w-3 h-3" /> TEST</Badge>
        )}
        <span className="ml-auto text-sm font-semibold tabular-nums text-foreground" data-testid="time-v2-expense-amount">
          {formatExpenseAmount(s.money)}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {s.categoryRef && <span>Kategori: {s.categoryRef}</span>}
        {s.supplier && <span>Leverantör: {s.supplier}</span>}
        <span className="inline-flex items-center gap-1"><Paperclip className="w-3 h-3" /> {receipts} kvitto{receipts === 1 ? '' : 'n'}</span>
        <span className="inline-flex items-center gap-1 font-mono"><Lock className="w-3 h-3" /> {shortHash(s.canonicalHash)}</span>
      </div>
      <div className="mt-1 text-xs">
        {b.status === 'bound' ? (
          <span className="text-foreground">
            {b.bookingNumber ? `Bokning ${b.bookingNumber}` : 'Utan bokningsnummer'}
            {b.bookingTitle ? ` · ${b.bookingTitle}` : ''}
            {b.projectName ? ` · Projekt ${b.projectName}` : ''}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-destructive" data-testid="time-v2-expense-unbound">
            <Link2Off className="w-3 h-3" /> Ej bunden: {EXPENSE_BINDING_REASON_LABELS[b.reason ?? ''] ?? b.reason}
          </span>
        )}
      </div>
      {s.workerStatement && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">”{s.workerStatement}”</p>
      )}
    </Link>
  );
};

export default ExpenseChainCard;
