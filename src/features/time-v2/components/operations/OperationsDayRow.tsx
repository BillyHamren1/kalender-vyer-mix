import React from 'react';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, FlaskConical, Receipt, Timer } from 'lucide-react';
import { formatMinutes, TIME_V2_QUEUE_GROUP_LABELS } from '@/features/time-v2/lib/contract';
import { formatExpenseAmount } from '@/features/time-v2/lib/expenseContract';
import { describeTargets, type OperationsRow } from '@/features/time-v2/lib/operations';
import OperationsActionReasons from '@/features/time-v2/components/operations/OperationsActionReasons';

interface Props {
  row: OperationsRow;
  selected: boolean;
  onSelect: () => void;
}

/** One worker + work date in the operational list. Contract fields only. */
const OperationsDayRow: React.FC<Props> = ({ row, selected, onSelect }) => (
  <button
    type="button"
    onClick={onSelect}
    data-testid="time-v2-ops-row"
    data-row-key={row.key}
    data-needs-action={row.needsAction ? 'true' : 'false'}
    aria-pressed={selected}
    className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
      selected ? 'border-primary/60 bg-accent/50' : 'bg-card hover:bg-accent/30'
    }`}
  >
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-foreground">{row.workerName}</span>
      <span className="text-xs tabular-nums text-muted-foreground">{row.date}</span>
      {row.needsAction ? (
        <Badge className="text-[10px]" data-testid="time-v2-ops-needs-action">Kräver åtgärd</Badge>
      ) : (
        <Badge variant="outline" className="text-[10px]" data-testid="time-v2-ops-settled">Klar</Badge>
      )}
      {row.flags.isTestFixture && (
        <Badge variant="outline" className="text-[10px] gap-1"><FlaskConical className="w-3 h-3" /> TEST</Badge>
      )}
      <span className="ml-auto text-sm font-medium tabular-nums text-foreground">
        {row.time ? formatMinutes(row.time.totalMinutes) : 'Ingen tid inlämnad'}
      </span>
    </div>

    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {row.time ? (
        <>
          <span className="inline-flex items-center gap-1">
            <Timer className="w-3 h-3" /> {TIME_V2_QUEUE_GROUP_LABELS[row.time.group]} · {row.time.state} · rev {row.time.revision}
          </span>
          <span>Resa {formatMinutes(row.time.travelMinutes)}</span>
          <span>Rast {formatMinutes(row.time.breakMinutes)}</span>
        </>
      ) : (
        <span className="inline-flex items-center gap-1 text-amber-600" data-testid="time-v2-ops-no-time">
          <AlertTriangle className="w-3 h-3" /> Utlägg utan inlämnad arbetstid
        </span>
      )}
      {row.totals.expenseCount > 0 && (
        <span className="inline-flex items-center gap-1" data-testid="time-v2-ops-expense-total">
          <Receipt className="w-3 h-3" /> {row.totals.expenseCount} utlägg ·{' '}
          {row.totals.expenseByCurrency
            .map((m) => formatExpenseAmount({ amountMinor: m.amountMinor, currency: m.currency }))
            .join(' + ')}
          {row.flags.openExpenses > 0 ? ` · ${row.flags.openExpenses} obeslutade` : ''}
        </span>
      )}
    </div>

    {row.actionReasons.length > 0 && (
      <div className="mt-1.5">
        <OperationsActionReasons reasons={row.actionReasons} />
      </div>
    )}

    <p className="mt-1 text-[11px] text-foreground/80">{describeTargets(row)}</p>
  </button>
);

export default OperationsDayRow;
