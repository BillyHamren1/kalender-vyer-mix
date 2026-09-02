import React from 'react';
import { Navigate, Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Clock3, Download, FlaskConical, RefreshCw, WifiOff } from 'lucide-react';
import { useTimeV2Flag } from '@/features/time-v2/hooks/useTimeV2Flag';
import { fetchTimeV2Preview, getTimeV2BaseUrl, TimeV2ClientError } from '@/features/time-v2/lib/client';
import {
  formatMinutes,
  previewSectionToCsv,
  TIME_V2_CONTRACT_VERSION,
  type TimeV2PreviewBundle,
  type TimeV2PreviewSection,
} from '@/features/time-v2/lib/contract';
import { LEGACY_TIME_ROUTE, TIME_V2_ROUTE } from '@/features/time-v2/lib/moduleFlag';
import TimeV2StateCard from '@/features/time-v2/components/TimeV2StateCard';

function downloadCsv(section: TimeV2PreviewSection, bundle: TimeV2PreviewBundle) {
  const csv = previewSectionToCsv(section, bundle);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `TEST-preview-${section.domain}-${bundle.submissionId}-rev${bundle.revision}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const Section: React.FC<{ section: TimeV2PreviewSection; bundle: TimeV2PreviewBundle; title: string }> = ({
  section,
  bundle,
  title,
}) => (
  <Card className="p-4 space-y-3" data-testid={`time-v2-preview-${section.domain}`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <Badge variant="outline" className="text-[10px]">FÖRHANDSVISNING</Badge>
        <Badge variant={section.attested ? 'secondary' : 'outline'} className="text-[10px]">
          {section.attested ? 'Attesterad' : 'Ej attesterad'}
        </Badge>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={!section.attested || section.lines.length === 0}
        data-testid={`time-v2-export-${section.domain}`}
        onClick={() => downloadCsv(section, bundle)}
      >
        <Download className="w-4 h-4 mr-2" /> Exportera CSV
      </Button>
    </div>

    {!section.attested ? (
      <p className="text-sm text-muted-foreground" data-testid={`time-v2-preview-blocked-${section.domain}`}>
        {section.blockedReason ?? 'Time rapporterar att domänen inte är attesterad ännu. Ingen förhandsvisning visas.'}
      </p>
    ) : (
      <>
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span data-testid={`time-v2-preview-minutes-${section.domain}`}>
            Tid {formatMinutes(section.totalMinutes)}
          </span>
          <span>
            {section.amountsAvailable && section.totalAmount !== null
              ? `Belopp ${section.totalAmount} ${section.currency ?? ''}`.trim()
              : 'Inget belopp rapporterat av Time'}
          </span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase text-muted-foreground">
              <th className="py-1">Rad</th>
              <th className="py-1">Mål</th>
              <th className="py-1 text-right">Tid</th>
              <th className="py-1 text-right">Belopp</th>
            </tr>
          </thead>
          <tbody>
            {section.lines.map((l) => (
              <tr key={l.lineId} className="border-t" data-testid={`time-v2-preview-line-${l.lineId}`}>
                <td className="py-1 text-foreground">{l.label}</td>
                <td className="py-1 text-muted-foreground">{l.targetId ?? '—'}</td>
                <td className="py-1 text-right tabular-nums">{formatMinutes(l.minutes)}</td>
                <td className="py-1 text-right tabular-nums">
                  {l.amount === null ? '—' : `${l.amount} ${l.currency ?? section.currency ?? ''}`.trim()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {section.lines.length === 0 && (
          <p className="text-sm text-muted-foreground">Time rapporterar inga rader för den här domänen.</p>
        )}
      </>
    )}
  </Card>
);

/**
 * Payroll / project-cost preview for one attested Time snapshot.
 * Preview only: nothing is posted to payroll or project systems, no pay,
 * retention or GPS policy is invented and no Planning source record is written.
 */
const TimeV2PreviewPage: React.FC = () => {
  const flag = useTimeV2Flag();
  const { submissionId } = useParams<{ submissionId: string }>();
  const baseUrl = getTimeV2BaseUrl();

  const preview = useQuery<TimeV2PreviewBundle, TimeV2ClientError>({
    queryKey: ['time-v2', 'preview', flag.organizationId, submissionId, baseUrl],
    queryFn: () => fetchTimeV2Preview(flag.organizationId as string, submissionId as string),
    enabled: flag.enabled && !!flag.organizationId && !!submissionId,
    retry: (count, error) =>
      error instanceof TimeV2ClientError && error.kind === 'not_configured' ? false : count < 1,
    refetchOnWindowFocus: false,
  });

  if (flag.isLoading) return <div className="p-8 text-sm text-muted-foreground">Laddar modulstatus…</div>;
  if (!flag.enabled) return <Navigate to={LEGACY_TIME_ROUTE} replace />;

  const err = preview.error as TimeV2ClientError | null;
  const data = preview.data;

  return (
    <div className="p-6 space-y-5" data-testid="time-v2-preview">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">Lön & projektkostnad – förhandsvisning</h1>
            <Badge variant="secondary" className="text-[10px]">kontrakt {TIME_V2_CONTRACT_VERSION}</Badge>
            {data?.isTestFixture && (
              <Badge variant="outline" className="text-[10px] gap-1"><FlaskConical className="w-3 h-3" /> TEST</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            <Link className="underline" to={`${TIME_V2_ROUTE}/review/${submissionId}`}>Tillbaka till dagsnapshoten</Link>
            {' · '}Ingen bokföring, ingen lönekörning och ingen publicering sker härifrån.
            {data && ` Revision ${data.revision}.`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => preview.refetch()} disabled={preview.isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${preview.isFetching ? 'animate-spin' : ''}`} /> Uppdatera
        </Button>
      </header>

      {!baseUrl && (
        <TimeV2StateCard
          testId="time-v2-unconfigured"
          icon={<WifiOff className="w-5 h-5 text-muted-foreground" />}
          title="Time-källan är inte konfigurerad"
          body="VITE_TIME_V2_BASE_URL saknas. Ingen förhandsvisning kan läsas."
        />
      )}
      {baseUrl && preview.isLoading && (
        <TimeV2StateCard
          testId="time-v2-loading"
          icon={<Clock3 className="w-5 h-5 text-muted-foreground" />}
          title="Hämtar förhandsvisning…"
          body="Läser Time-kontraktet (endast läsning)."
        />
      )}
      {baseUrl && err && (
        <TimeV2StateCard
          testId="time-v2-error"
          icon={<AlertTriangle className="w-5 h-5 text-destructive" />}
          title="Förhandsvisningen kunde inte läsas"
          body={err.message}
        />
      )}

      {data && (
        <>
          <Section section={data.payroll} bundle={data} title="Lön" />
          <Section section={data.project} bundle={data} title="Projektkostnad" />
        </>
      )}
    </div>
  );
};

export default TimeV2PreviewPage;
