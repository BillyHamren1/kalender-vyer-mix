import React from 'react';
import { Navigate, Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  Clock3,
  RefreshCw,
  ShieldCheck,
  Users,
  WifiOff,
  FlaskConical,
} from 'lucide-react';
import { useTimeV2Flag } from '@/features/time-v2/hooks/useTimeV2Flag';
import { useTimeV2Overview } from '@/features/time-v2/hooks/useTimeV2Overview';
import { getTimeV2BaseUrl, TimeV2ClientError } from '@/features/time-v2/lib/client';
import { describeFreshness, TIME_V2_CONTRACT_VERSION } from '@/features/time-v2/lib/contract';
import { LEGACY_TIME_ROUTE, TIME_V2_ROUTE } from '@/features/time-v2/lib/moduleFlag';

const Stat: React.FC<{ label: string; value: number | string; hint?: string }> = ({ label, value, hint }) => (
  <div className="rounded-xl border bg-card p-4">
    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="mt-1 text-3xl font-extrabold tabular-nums leading-none text-foreground">{value}</p>
    {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
  </div>
);

const StateCard: React.FC<{ icon: React.ReactNode; title: string; body: string; children?: React.ReactNode }> = ({
  icon,
  title,
  body,
  children,
}) => (
  <Card className="p-6 flex items-start gap-4">
    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">{icon}</div>
    <div className="min-w-0">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      {children && <div className="mt-3">{children}</div>}
    </div>
  </Card>
);

/**
 * Time V2 — separate Planning desktop module, gated by a reversible tenant flag.
 * Read-only. Renders only what the Time contract actually returns.
 */
const TimeV2ModulePage: React.FC = () => {
  const flag = useTimeV2Flag();
  const overview = useTimeV2Overview(flag.organizationId, flag.enabled);
  const baseUrl = getTimeV2BaseUrl();

  if (flag.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Laddar modulstatus…</div>;
  }

  // Flag OFF → legacy remains the default path. No cutover, no silent module.
  if (!flag.enabled) {
    return <Navigate to={LEGACY_TIME_ROUTE} replace />;
  }

  const err = overview.error as TimeV2ClientError | null;

  return (
    <div className="p-6 space-y-5" data-testid="time-v2-module">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">Tid V2</h1>
            <Badge variant="secondary" className="text-[10px]">kontrakt {TIME_V2_CONTRACT_VERSION}</Badge>
            {flag.isTestOverride && (
              <Badge className="text-[10px] gap-1" variant="outline">
                <FlaskConical className="w-3 h-3" /> Testflagga
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Separat modul. Legacy <Link className="underline" to={LEGACY_TIME_ROUTE}>Tid &amp; Lön</Link> är
            fortsatt standard och påverkas inte.
          </p>
        </div>
        <div className="flex items-center gap-2">
        <Button asChild size="sm">
          <Link to={`${TIME_V2_ROUTE}/review`} data-testid="time-v2-open-queue">Öppna granskningskö</Link>
        </Button>
        <Button asChild size="sm" variant="secondary">
          <Link to={`${TIME_V2_ROUTE}/personnel`} data-testid="time-v2-open-personnel">Personal &amp; appkonton</Link>
        </Button>

        <Button variant="outline" size="sm" onClick={() => overview.refetch()} disabled={overview.isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${overview.isFetching ? 'animate-spin' : ''}`} />
          Uppdatera
        </Button>
        </div>
      </header>

      {!baseUrl && (
        <StateCard
          icon={<WifiOff className="w-5 h-5 text-muted-foreground" />}
          title="Time-källan är inte konfigurerad"
          body="VITE_TIME_V2_BASE_URL saknas. Inga siffror visas eftersom det inte finns någon verifierad källa att läsa från."
        />
      )}

      {baseUrl && overview.isLoading && (
        <StateCard
          icon={<Clock3 className="w-5 h-5 text-muted-foreground" />}
          title="Hämtar Time-kontraktet…"
          body={`Läser ${baseUrl} (endast läsning).`}
        />
      )}

      {baseUrl && err && (
        <StateCard
          icon={<AlertTriangle className="w-5 h-5 text-destructive" />}
          title={err.kind === 'not_configured' ? 'Time-källan är inte konfigurerad' : 'Time-källan kunde inte läsas'}
          body={`${err.message} Inga siffror visas — Planning hittar inte på data.`}
        >
          <Button variant="outline" size="sm" onClick={() => overview.refetch()}>Försök igen</Button>
        </StateCard>
      )}

      {overview.data && (
        <>
          <Card className="p-4 flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex h-2.5 w-2.5 rounded-full ${overview.data.source.healthy ? 'bg-emerald-500' : 'bg-destructive'}`}
            />
            <span className="text-sm font-medium text-foreground">
              {overview.data.source.healthy ? 'Time-källan svarar' : 'Time-källan rapporterar fel'}
            </span>
            <span className="text-sm text-muted-foreground">
              {describeFreshness(overview.data.source.generatedAt)}
            </span>
            {overview.data.source.staging && <Badge variant="outline" className="text-[10px]">staging</Badge>}
            {overview.data.source.message && (
              <span className="text-xs text-muted-foreground">{overview.data.source.message}</span>
            )}
          </Card>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4" /> Personalkonton
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Personal" value={overview.data.personnel.totalPersonnel} />
              <Stat label="Aktiva appkonton" value={overview.data.personnel.withActiveAppAccount} />
              <Stat label="Inbjudna, ej aktiverade" value={overview.data.personnel.invitedNotActivated} />
              <Stat label="Spärrade" value={overview.data.personnel.blocked} />
            </div>
            <p className="text-xs text-muted-foreground">
              HUB-/admin-identiteter och personalappens konton hålls separata. Inga lösenord, tokens eller sessioner delas.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> Granskningskö
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <Stat label="Inskickade" value={overview.data.reviewQueue.submitted} />
              <Stat label="Väntar korrigering" value={overview.data.reviewQueue.awaitingCorrection} />
              <Stat label="Omskickade" value={overview.data.reviewQueue.resubmitted} />
              <Stat label="Redo att attestera" value={overview.data.reviewQueue.readyForAttest} />
              <Stat label="Attesterade" value={overview.data.reviewQueue.attested} />
            </div>
            <p className="text-xs text-muted-foreground">
              {overview.data.independentlyAttestable
                ? 'Time rapporterar dagarna som självständigt attesterbara.'
                : 'Time rapporterar ingen självständig attestbarhet ännu.'}{' '}
              {overview.data.previewAvailable
                ? 'Löne-/projektförhandsvisning är tillgänglig via kontraktet.'
                : 'Ingen förhandsvisning exponerad av kontraktet ännu.'}
            </p>
          </section>
        </>
      )}
    </div>
  );
};

export default TimeV2ModulePage;
