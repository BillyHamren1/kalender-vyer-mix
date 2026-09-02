import { Link } from 'react-router-dom';
import { TIME_V2_ROUTE } from '@/features/time-v2/lib/moduleFlag';
import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { TimeV2SubmissionDetail } from '@/features/time-v2/lib/contract';
import type { TimeV2ClientError } from '@/features/time-v2/lib/client';
import {
  useAttestPayroll,
  useAttestProject,
  useRequestCorrection,
} from '@/features/time-v2/hooks/useTimeV2Commands';

interface Props {
  organizationId: string | null;
  submissionId: string | undefined;
  detail: TimeV2SubmissionDetail;
  onRefresh: () => void;
}

const errText = (e: unknown) =>
  e && typeof e === 'object' && 'message' in e ? String((e as TimeV2ClientError).message) : 'Okänt fel';

const isStale = (e: unknown) =>
  !!e && typeof e === 'object' && (e as TimeV2ClientError).kind === 'stale_revision';

/**
 * Planning-owned review actions issued through the versioned Time commands.
 * Every command is bound to the exact rendered revision; a stale revision is
 * surfaced truthfully with a re-read action instead of a silent retry.
 */
const TimeV2DecisionPanel: React.FC<Props> = ({ organizationId, submissionId, detail, onRefresh }) => {
  const ctx = { organizationId, submissionId, expectedRevision: detail.revision };
  const correction = useRequestCorrection(ctx);
  const payroll = useAttestPayroll(ctx);
  const project = useAttestProject(ctx);
  const [reason, setReason] = React.useState('');

  const busy = correction.isPending || payroll.isPending || project.isPending;
  const activeError = correction.error ?? payroll.error ?? project.error;

  return (
    <Card className="p-4 space-y-4" data-testid="time-v2-decision-panel">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">Beslut (rev {detail.revision})</h2>
        <Badge variant="outline" className="text-[10px]">Time äger snapshoten</Badge>
      </div>

      {activeError && (
        <div
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
          data-testid={isStale(activeError) ? 'time-v2-stale-revision' : 'time-v2-command-error'}
        >
          <p className="flex items-center gap-2 font-medium text-destructive">
            <AlertTriangle className="w-4 h-4" /> {errText(activeError)}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => {
              correction.reset();
              payroll.reset();
              project.reset();
              onRefresh();
            }}
          >
            Läs om snapshoten
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="time-v2-correction-reason">
          Motivering till korrigering (visas för medarbetaren)
        </label>
        <Textarea
          id="time-v2-correction-reason"
          data-testid="time-v2-correction-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Beskriv exakt vad som behöver justeras i dagen."
          rows={2}
        />
        <Button
          size="sm"
          data-testid="time-v2-request-correction"
          disabled={busy || reason.trim().length === 0}
          onClick={() => correction.mutate(reason.trim(), { onSuccess: () => setReason('') })}
        >
          Begär korrigering
        </Button>
        {correction.isSuccess && (
          <p className="text-xs text-emerald-600 flex items-center gap-1" data-testid="time-v2-correction-sent">
            <CheckCircle2 className="w-3 h-3" /> Korrigering skickad till Time mot rev {detail.revision}.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          data-testid="time-v2-attest-payroll"
          disabled={busy || !detail.attestability.payroll || detail.attestability.payrollAttested}
          onClick={() => payroll.mutate()}
        >
          {detail.attestability.payrollAttested ? 'Lön attesterad' : 'Attestera lön'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          data-testid="time-v2-attest-project"
          disabled={busy || !detail.attestability.project || detail.attestability.projectAttested}
          onClick={() => project.mutate()}
        >
          {detail.attestability.projectAttested ? 'Projekt attesterat' : 'Attestera projekt'}
        </Button>
        {(detail.attestability.payrollAttested || detail.attestability.projectAttested) && (
          <Button size="sm" variant="secondary" asChild data-testid="time-v2-open-preview">
            <Link to={`${TIME_V2_ROUTE}/preview/${detail.submissionId}`}>
              Visa lön/projekt-förhandsvisning
            </Link>
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Lön och projekt attesteras oberoende och endast när Time-kontraktet säger att domänen är attesterbar.
        Ingen extern lön- eller projektpublicering sker härifrån.
      </p>
    </Card>
  );
};

export default TimeV2DecisionPanel;
