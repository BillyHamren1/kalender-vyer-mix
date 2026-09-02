import React from 'react';
import { Navigate, Link, useParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Clock3, FlaskConical, Lock, RefreshCw, WifiOff } from 'lucide-react';
import { useTimeV2Flag } from '@/features/time-v2/hooks/useTimeV2Flag';
import { useTimeV2SubmissionDetail } from '@/features/time-v2/hooks/useTimeV2Review';
import { getTimeV2BaseUrl, type TimeV2ClientError } from '@/features/time-v2/lib/client';
import { formatMinutes, TIME_V2_QUEUE_GROUP_LABELS } from '@/features/time-v2/lib/contract';
import { LEGACY_TIME_ROUTE, TIME_V2_ROUTE } from '@/features/time-v2/lib/moduleFlag';
import TimeV2StateCard from '@/features/time-v2/components/TimeV2StateCard';
import TimeV2DecisionPanel from '@/features/time-v2/components/TimeV2DecisionPanel';

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-lg border bg-card px-3 py-2">
    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="text-sm font-semibold tabular-nums text-foreground">{value}</p>
  </div>
);

/**
 * Immutable submitted snapshot detail.
 * Planning renders the exact Time snapshot: segments, totals/targets,
 * revision/decision chain, bounded evidence references, correction state and
 * independent payroll/project attestability. No decisions are executed here.
 */
const TimeV2SubmissionDetailPage: React.FC = () => {
  const flag = useTimeV2Flag();
  const { submissionId } = useParams<{ submissionId: string }>();
  const baseUrl = getTimeV2BaseUrl();
  const detail = useTimeV2SubmissionDetail(flag.organizationId, submissionId, flag.enabled);

  if (flag.isLoading) return <div className="p-8 text-sm text-muted-foreground">Laddar modulstatus…</div>;
  if (!flag.enabled) return <Navigate to={LEGACY_TIME_ROUTE} replace />;

  const err = detail.error as TimeV2ClientError | null;
  const d = detail.data;

  return (
    <div className="p-6 space-y-5" data-testid="time-v2-submission-detail">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {d ? `${d.personnelName} · ${d.date}` : 'Dagsnapshot'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <Link className="underline" to={`${TIME_V2_ROUTE}/review`}>Tillbaka till granskningskön</Link> ·
            oförändrad snapshot från Time. Planning tolkar inte GPS och bygger inte om dagen.
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
          body="VITE_TIME_V2_BASE_URL saknas. Ingen snapshot kan läsas."
        />
      )}
      {baseUrl && detail.isLoading && (
        <TimeV2StateCard
          testId="time-v2-loading"
          icon={<Clock3 className="w-5 h-5 text-muted-foreground" />}
          title="Hämtar dagsnapshot…"
          body="Läser Time-kontraktet (endast läsning)."
        />
      )}
      {baseUrl && err && (
        <TimeV2StateCard
          testId="time-v2-error"
          icon={<AlertTriangle className="w-5 h-5 text-destructive" />}
          title="Snapshoten kunde inte läsas"
          body={`${err.message} Inget innehåll visas — Planning hittar inte på data.`}
        >
          <Button variant="outline" size="sm" onClick={() => detail.refetch()}>Försök igen</Button>
        </TimeV2StateCard>
      )}

      {d && (
        <>
          <Card className="p-4 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{TIME_V2_QUEUE_GROUP_LABELS[d.group]}</Badge>
            <Badge variant="outline" className="text-[10px]">{d.state}</Badge>
            <Badge variant="outline" className="text-[10px]">rev {d.revision}</Badge>
            {d.immutable && (
              <Badge variant="secondary" className="text-[10px] gap-1"><Lock className="w-3 h-3" /> låst snapshot</Badge>
            )}
            {d.snapshotVersion && (
              <span className="text-xs text-muted-foreground">snapshot {d.snapshotVersion}</span>
            )}
            {d.submittedAt && <span className="text-xs text-muted-foreground">inskickad {d.submittedAt}</span>}
            {d.isTestFixture && (
              <Badge className="text-[10px] gap-1" variant="outline"><FlaskConical className="w-3 h-3" /> TEST</Badge>
            )}
          </Card>

          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="time-v2-detail-totals">
            <Row label="Totalt" value={formatMinutes(d.totals.totalMinutes)} />
            <Row label="Arbete" value={formatMinutes(d.totals.workMinutes)} />
            <Row label="Resa" value={formatMinutes(d.totals.travelMinutes)} />
            <Row label="Rast" value={formatMinutes(d.totals.breakMinutes)} />
          </section>

          <Card className="p-4 space-y-2" data-testid="time-v2-detail-attestability">
            <h2 className="text-sm font-semibold text-foreground">Attesterbarhet</h2>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant={d.attestability.payroll ? 'default' : 'outline'}>
                Lön: {d.attestability.payroll ? 'attesterbar' : 'ej attesterbar'}
              </Badge>
              <Badge variant={d.attestability.project ? 'default' : 'outline'}>
                Projekt: {d.attestability.project ? 'attesterbar' : 'ej attesterbar'}
              </Badge>
            </div>
            {d.attestability.blockedReason && (
              <p className="text-xs text-muted-foreground">{d.attestability.blockedReason}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Attesterbarheten kommer från Time-kontraktet; besluten utförs i panelen nedan.
            </p>

          </Card>

          <TimeV2DecisionPanel
            organizationId={flag.organizationId}
            submissionId={submissionId}
            detail={d}
            onRefresh={() => detail.refetch()}
          />

          <Card className="p-4 space-y-2" data-testid="time-v2-detail-correction">
            <h2 className="text-sm font-semibold text-foreground">Korrigering</h2>
            {d.correction.requested ? (
              <p className="text-sm text-muted-foreground">
                Begärd {d.correction.requestedAt ?? 'okänd tid'}
                {d.correction.reason ? ` · ${d.correction.reason}` : ''}
                {d.correction.resubmittedAt ? ` · omskickad ${d.correction.resubmittedAt}` : ' · ej omskickad än'}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Ingen korrigering begärd enligt kontraktet.</p>
            )}
          </Card>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Tidslinje (exakt från Time)</h2>
            {d.segments.length === 0 ? (
              <p className="text-xs text-muted-foreground">Snapshoten innehåller inga segment.</p>
            ) : (
              <div className="space-y-2" data-testid="time-v2-detail-segments">
                {d.segments.map((s) => (
                  <div key={s.id} className="rounded-lg border bg-card px-3 py-2 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{s.kind}</Badge>
                    <span className="text-sm font-medium text-foreground">{s.label}</span>
                    {s.targetName && <span className="text-xs text-muted-foreground">{s.targetName}</span>}
                    {s.locked && <Lock className="w-3 h-3 text-muted-foreground" />}
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                      {(s.startsAt ?? '–')} – {(s.endsAt ?? '–')} · {formatMinutes(s.minutes)}
                    </span>
                    {s.note && <p className="w-full text-xs text-muted-foreground">{s.note}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Mål och fördelning</h2>
            {d.targets.length === 0 ? (
              <p className="text-xs text-muted-foreground">Inga mål i snapshoten.</p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2" data-testid="time-v2-detail-targets">
                {d.targets.map((t, i) => (
                  <Row key={t.targetId ?? `t-${i}`} label={t.targetName} value={formatMinutes(t.minutes)} />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Revisions- och beslutskedja</h2>
            {d.decisions.length === 0 ? (
              <p className="text-xs text-muted-foreground">Inga beslut registrerade i kontraktet.</p>
            ) : (
              <ol className="space-y-2" data-testid="time-v2-detail-decisions">
                {d.decisions.map((dec) => (
                  <li key={dec.id} className="rounded-lg border bg-card px-3 py-2 text-sm">
                    <span className="font-medium text-foreground">{dec.action}</span>
                    <span className="text-xs text-muted-foreground"> · rev {dec.revision} · {dec.at ?? 'okänd tid'} · {dec.actor ?? 'okänd aktör'}</span>
                    {dec.comment && <p className="text-xs text-muted-foreground">{dec.comment}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Bevisreferenser</h2>
            {d.evidence.length === 0 ? (
              <p className="text-xs text-muted-foreground">Inga bevisreferenser i snapshoten.</p>
            ) : (
              <ul className="space-y-1" data-testid="time-v2-detail-evidence">
                {d.evidence.map((e) => (
                  <li key={e.id} className="text-sm text-muted-foreground">
                    <Badge variant="outline" className="text-[10px] mr-2">{e.kind}</Badge>
                    {e.label} {e.at ? `· ${e.at}` : ''} {e.reference ? `· ${e.reference}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default TimeV2SubmissionDetailPage;
