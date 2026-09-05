import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Clock3, Lock, PlugZap, ShieldAlert, WifiOff } from 'lucide-react';
import TimeV2StateCard from '@/features/time-v2/components/TimeV2StateCard';
import type { TimeV2ClientError } from '@/features/time-v2/lib/errors';

interface Props {
  error: TimeV2ClientError | null | undefined;
  isLoading?: boolean;
  onRetry?: () => void;
  loadingTitle?: string;
}

/**
 * Truthful loading / gate / error surface for the expense views. The external
 * gate (Time's adapter not yet exposing the expense operations) is rendered as
 * its own explicit state — never as an empty list.
 */
const ExpenseStateNotice: React.FC<Props> = ({ error, isLoading, onRetry, loadingTitle }) => {
  if (isLoading) {
    return (
      <TimeV2StateCard
        testId="time-v2-expenses-loading"
        icon={<Clock3 className="w-5 h-5 text-muted-foreground" />}
        title={loadingTitle ?? 'Hämtar utlägg från Time…'}
        body="Läser Time-kontraktet planning-expense-review.v1 via Plannings egen gräns (endast läsning)."
      />
    );
  }
  if (!error) return null;

  const retry = onRetry ? (
    <Button variant="outline" size="sm" onClick={onRetry}>Försök igen</Button>
  ) : null;

  switch (error.kind) {
    case 'upstream_missing':
      return (
        <TimeV2StateCard
          testId="time-v2-expenses-gate"
          icon={<PlugZap className="w-5 h-5 text-amber-600" />}
          title="Extern gate: Time exponerar inte utläggsoperationerna ännu"
          body={error.message}
        >
          <p className="text-xs text-muted-foreground">
            Planning är klart att läsa och besluta så snart Times <code>time-planning-adapter</code> lägger till
            <code> expenses.list</code>, <code>expenses.decide</code> och <code>expenses.receiptUrl</code>.
            Ingen mock visas i väntan på det.
          </p>
        </TimeV2StateCard>
      );
    case 'gate_closed':
      return (
        <TimeV2StateCard
          testId="time-v2-expenses-gate-closed"
          icon={<Lock className="w-5 h-5 text-muted-foreground" />}
          title="Utläggsgranskning är låst till Times isolerade staging"
          body={error.message}
        />
      );
    case 'not_configured':
      return (
        <TimeV2StateCard
          testId="time-v2-expenses-unconfigured"
          icon={<WifiOff className="w-5 h-5 text-muted-foreground" />}
          title="Time-källan är inte konfigurerad"
          body={error.message}
        />
      );
    case 'forbidden':
      return (
        <TimeV2StateCard
          testId="time-v2-expenses-forbidden"
          icon={<ShieldAlert className="w-5 h-5 text-destructive" />}
          title="Spärrat"
          body={error.message}
        />
      );
    case 'unreachable':
      return (
        <TimeV2StateCard
          testId="time-v2-expenses-unreachable"
          icon={<WifiOff className="w-5 h-5 text-destructive" />}
          title="Time-gränsen gick inte att nå"
          body={`${error.message} Inget innehåll visas — Planning hittar inte på data.`}
        >
          {retry}
        </TimeV2StateCard>
      );
    default:
      return (
        <TimeV2StateCard
          testId="time-v2-expenses-error"
          icon={<AlertTriangle className="w-5 h-5 text-destructive" />}
          title="Utläggen kunde inte läsas"
          body={`${error.message} Inget innehåll visas — Planning hittar inte på data.`}
        >
          {retry}
        </TimeV2StateCard>
      );
  }
};

export default ExpenseStateNotice;
