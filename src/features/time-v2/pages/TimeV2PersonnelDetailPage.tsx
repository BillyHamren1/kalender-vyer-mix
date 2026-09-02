import React from 'react';
import { Navigate, Link, useParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Clock3, FlaskConical, RefreshCw, ShieldCheck, WifiOff } from 'lucide-react';
import { useTimeV2Flag } from '@/features/time-v2/hooks/useTimeV2Flag';
import {
  useIssueActivation,
  useReactivateAppAccess,
  useSuspendAppAccess,
  useTimeV2PersonnelDetail,
} from '@/features/time-v2/hooks/useTimeV2Personnel';
import { getTimeV2BaseUrl, type TimeV2ClientError } from '@/features/time-v2/lib/client';
import {
  describeActivation,
  TIME_V2_APP_ACCOUNT_LABELS,
  TIME_V2_CONTRACT_VERSION,
} from '@/features/time-v2/lib/contract';
import { LEGACY_TIME_ROUTE, TIME_V2_ROUTE } from '@/features/time-v2/lib/moduleFlag';
import TimeV2StateCard from '@/features/time-v2/components/TimeV2StateCard';

const stamp = (v: string | null) => (v ? new Date(v).toLocaleString('sv-SE') : 'aldrig');

const TimeV2PersonnelDetailPage: React.FC = () => {
  const flag = useTimeV2Flag();
  const { personnelId } = useParams<{ personnelId: string }>();
  const baseUrl = getTimeV2BaseUrl();

  const detail = useTimeV2PersonnelDetail(flag.organizationId, personnelId, flag.enabled);
  const ctx = { organizationId: flag.organizationId, personnelId };
  const issue = useIssueActivation(ctx);
  const suspend = useSuspendAppAccess(ctx);
  const reactivate = useReactivateAppAccess(ctx);

  if (flag.isLoading) return <div className="p-8 text-sm text-muted-foreground">Laddar modulstatus…</div>;
  if (!flag.enabled) return <Navigate to={LEGACY_TIME_ROUTE} replace />;

  const err = detail.error as TimeV2ClientError | null;
  const p = detail.data;
  const busy = issue.isPending || suspend.isPending || reactivate.isPending;
  const cmdError =
    (issue.error as TimeV2ClientError | null) ??
    (suspend.error as TimeV2ClientError | null) ??
    (reactivate.error as TimeV2ClientError | null);

  return (
    <div className="p-6 space-y-5" data-testid="time-v2-personnel-detail">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">{p?.personnelName ?? 'Personal'}</h1>
            <Badge variant="secondary" className="text-[10px]">kontrakt {TIME_V2_CONTRACT_VERSION}</Badge>
            {p?.isTestFixture && (
              <Badge variant="outline" className="text-[10px] gap-1"><FlaskConical className="w-3 h-3" /> TEST</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            <Link className="underline" to={`${TIME_V2_ROUTE}/personnel`}>Personal & appkonton</Link>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => detail.refetch()} disabled={detail.isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${detail.isFetching ? 'animate-spin' : ''}`} /> Uppdatera
        </Button>
      </header>

      {!baseUrl && (
        <TimeV2StateCard
          testId="time-v2-unconfigured"
          icon={<WifiOff className="w-5 h-5 text-muted-foreground" />}
          title="Time-källan är inte konfigurerad"
          body="VITE_TIME_V2_BASE_URL saknas."
        />
      )}
      {baseUrl && detail.isLoading && (
        <TimeV2StateCard
          testId="time-v2-loading"
          icon={<Clock3 className="w-5 h-5 text-muted-foreground" />}
          title="Hämtar personalposten…"
          body="Läser Time-kontraktet (endast läsning)."
        />
      )}
      {baseUrl && err && (
        <TimeV2StateCard
          testId="time-v2-error"
          icon={<AlertTriangle className="w-5 h-5 text-destructive" />}
          title="Personalposten kunde inte läsas"
          body={err.message}
        />
      )}

      {p && (
        <>
          <Card className="p-4 grid gap-4 md:grid-cols-2" data-testid="time-v2-identity">
            <div>
              <h2 className="text-sm font-semibold text-foreground">HUB-konto</h2>
              <p className="mt-1 text-sm text-muted-foreground" data-testid="time-v2-hub-state">
                {p.hubAccount.present ? `Finns (${p.hubAccount.state ?? 'okänd status'})` : 'Saknas'}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Separat identitet. Inga lösenord, sessioner, tokens eller roller delas med appkontot.
              </p>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Personal-appkonto</h2>
              <p className="mt-1 text-sm text-muted-foreground" data-testid="time-v2-app-state">
                {TIME_V2_APP_ACCOUNT_LABELS[p.appAccount.state]} — {describeActivation(p)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Utfärdad {stamp(p.appAccount.activationIssuedAt)} · giltig t.o.m.{' '}
                {stamp(p.appAccount.activationExpiresAt)} · använd {stamp(p.appAccount.activationConsumedAt)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Aktiveringskoden visas aldrig här.
              </p>
            </div>
          </Card>

          <Card className="p-4 space-y-3" data-testid="time-v2-account-actions">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={busy}
                data-testid="time-v2-issue-activation"
                onClick={() => issue.mutate(p.appAccount.state !== 'none')}
              >
                {p.appAccount.state === 'none' ? 'Utfärda aktivering' : 'Utfärda ny aktivering'}
              </Button>
              {p.appAccount.state !== 'suspended' ? (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy || p.appAccount.state === 'none'}
                  data-testid="time-v2-suspend"
                  onClick={() => suspend.mutate()}
                >
                  Spärra appåtkomst
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  data-testid="time-v2-reactivate"
                  onClick={() => reactivate.mutate()}
                >
                  Återaktivera appåtkomst
                </Button>
              )}
            </div>
            {cmdError && (
              <p className="text-sm text-destructive" data-testid="time-v2-command-error">{cmdError.message}</p>
            )}
          </Card>

          <Card className="p-4" data-testid="time-v2-diagnostics">
            <h2 className="text-sm font-semibold text-foreground">Diagnostik</h2>
            <div className="mt-2 grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
              <span data-testid="time-v2-last-access">Senaste lyckade appåtkomst: {stamp(p.lastAppAccessAt)}</span>
              <span>Senaste evidenssynk: {stamp(p.lastEvidenceSyncAt)}</span>
              <span>Senaste inlämningssynk: {stamp(p.lastSubmissionSyncAt)}</span>
              <span data-testid="time-v2-visible-assignments">Synliga uppdrag i appen: {p.visibleAssignments}</span>
            </div>
            {p.diagnostics.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {p.diagnostics.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-2">
                    <Badge variant={d.ok ? 'secondary' : 'destructive'} className="text-[10px]">
                      {d.ok ? 'OK' : 'Problem'}
                    </Badge>
                    <span className="text-foreground">{d.label}</span>
                    {d.detail && <span className="text-muted-foreground">{d.detail}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-4" data-testid="time-v2-assignment-visibility">
            <h2 className="text-sm font-semibold text-foreground">Uppdragssynlighet</h2>
            {p.assignments.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">Time rapporterar inga uppdrag för den här personen.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {p.assignments.map((a) => (
                  <li key={a.assignmentId} className="flex flex-wrap items-center gap-2" data-testid={`time-v2-assignment-${a.assignmentId}`}>
                    <Badge variant={a.visibleInApp ? 'secondary' : 'outline'} className="text-[10px]">
                      {a.visibleInApp ? 'Synligt' : 'Dolt'}
                    </Badge>
                    <span className="text-foreground">{a.label}</span>
                    {a.date && <span className="text-muted-foreground tabular-nums">{a.date}</span>}
                    {a.reasonHidden && <span className="text-muted-foreground">{a.reasonHidden}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
};

export default TimeV2PersonnelDetailPage;
