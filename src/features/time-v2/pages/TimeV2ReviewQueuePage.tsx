import React, { useMemo, useState } from 'react';
import { Navigate, Link, useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { AlertTriangle, Clock3, FlaskConical, Inbox, RefreshCw, WifiOff } from 'lucide-react';
import { useTimeV2Flag } from '@/features/time-v2/hooks/useTimeV2Flag';
import { useTimeV2ReviewQueue } from '@/features/time-v2/hooks/useTimeV2Review';
import { getTimeV2BaseUrl, type TimeV2ClientError } from '@/features/time-v2/lib/client';
import {
  describeFreshness,
  filterQueueRows,
  formatMinutes,
  groupQueueRows,
  TIME_V2_CONTRACT_VERSION,
  TIME_V2_QUEUE_GROUPS,
  TIME_V2_QUEUE_GROUP_LABELS,
  type TimeV2QueueFilters,
  type TimeV2QueueRow,
} from '@/features/time-v2/lib/contract';
import { LEGACY_TIME_ROUTE, TIME_V2_ROUTE } from '@/features/time-v2/lib/moduleFlag';
import TimeV2StateCard from '@/features/time-v2/components/TimeV2StateCard';

const QueueRow: React.FC<{ row: TimeV2QueueRow; onOpen: () => void }> = ({ row, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    data-testid={`time-v2-queue-row-${row.submissionId}`}
    className="w-full text-left rounded-lg border bg-card px-3 py-2 hover:bg-accent/40 transition-colors"
  >
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-foreground">{row.personnelName}</span>
      <span className="text-xs text-muted-foreground tabular-nums">{row.date}</span>
      {row.projectName && <Badge variant="secondary" className="text-[10px]">{row.projectName}</Badge>}
      <Badge variant="outline" className="text-[10px]">{row.state}</Badge>
      {row.revision > 0 && <Badge variant="outline" className="text-[10px]">rev {row.revision}</Badge>}
      {row.isTestFixture && (
        <Badge className="text-[10px] gap-1" variant="outline"><FlaskConical className="w-3 h-3" /> TEST</Badge>
      )}
      <span className="ml-auto text-sm font-medium tabular-nums text-foreground">
        {formatMinutes(row.totalMinutes)}
      </span>
    </div>
    <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
      <span>Resa {formatMinutes(row.travelMinutes)}</span>
      <span>Rast {formatMinutes(row.breakMinutes)}</span>
      <span>Lön {row.payrollAttestable ? 'attesterbar' : 'ej attesterbar'}</span>
      <span>Projekt {row.projectAttestable ? 'attesterbar' : 'ej attesterbar'}</span>
    </div>
  </button>
);

/**
 * Planning-owned Time V2 review queue.
 * Renders exactly the Time contract's groups and fields. Planning never
 * reinterprets GPS, never rebuilds a day and executes no decisions here.
 */
const TimeV2ReviewQueuePage: React.FC = () => {
  const flag = useTimeV2Flag();
  const navigate = useNavigate();
  const baseUrl = getTimeV2BaseUrl();

  const [filters, setFilters] = useState<TimeV2QueueFilters>({ group: 'all' });
  const set = <K extends keyof TimeV2QueueFilters>(k: K, v: TimeV2QueueFilters[K]) =>
    setFilters((f) => ({ ...f, [k]: v || undefined }));

  const queue = useTimeV2ReviewQueue(flag.organizationId, flag.enabled, filters);
  const rows = useMemo(() => filterQueueRows(queue.data?.rows ?? [], filters), [queue.data, filters]);
  const grouped = useMemo(() => groupQueueRows(rows), [rows]);

  if (flag.isLoading) return <div className="p-8 text-sm text-muted-foreground">Laddar modulstatus…</div>;
  if (!flag.enabled) return <Navigate to={LEGACY_TIME_ROUTE} replace />;

  const err = queue.error as TimeV2ClientError | null;

  return (
    <div className="p-6 space-y-5" data-testid="time-v2-review-queue">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">Granskningskö</h1>
            <Badge variant="secondary" className="text-[10px]">kontrakt {TIME_V2_CONTRACT_VERSION}</Badge>
            {queue.data?.stale && <Badge variant="outline" className="text-[10px]">inaktuell källa</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            <Link className="underline" to={TIME_V2_ROUTE}>Tid V2</Link> · endast läsning från Time-kontraktet.
            {queue.data && ` ${describeFreshness(queue.data.generatedAt)}`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => queue.refetch()} disabled={queue.isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${queue.isFetching ? 'animate-spin' : ''}`} /> Uppdatera
        </Button>
      </header>

      <Card className="p-3 flex flex-wrap items-center gap-2">
        <Input type="date" className="h-9 w-[160px]" value={filters.from ?? ''} onChange={(e) => set('from', e.target.value)} aria-label="Från datum" />
        <span className="text-muted-foreground text-sm">→</span>
        <Input type="date" className="h-9 w-[160px]" value={filters.to ?? ''} onChange={(e) => set('to', e.target.value)} aria-label="Till datum" />
        <Input className="h-9 w-[200px]" placeholder="Personal-ID" value={filters.personnelId ?? ''} onChange={(e) => set('personnelId', e.target.value)} aria-label="Personal" />
        <Input className="h-9 w-[200px]" placeholder="Projekt-ID" value={filters.projectId ?? ''} onChange={(e) => set('projectId', e.target.value)} aria-label="Projekt" />
        <Input className="h-9 w-[200px]" placeholder="Sök personal/projekt/status" value={filters.query ?? ''} onChange={(e) => set('query', e.target.value)} aria-label="Fritext" />
        <div className="flex flex-wrap gap-1">
          {(['all', ...TIME_V2_QUEUE_GROUPS] as const).map((g) => (
            <Button
              key={g}
              size="sm"
              variant={(filters.group ?? 'all') === g ? 'default' : 'outline'}
              className="h-9"
              onClick={() => setFilters((f) => ({ ...f, group: g }))}
            >
              {g === 'all' ? 'Alla' : TIME_V2_QUEUE_GROUP_LABELS[g]}
            </Button>
          ))}
        </div>
      </Card>

      {!baseUrl && (
        <TimeV2StateCard
          testId="time-v2-unconfigured"
          icon={<WifiOff className="w-5 h-5 text-muted-foreground" />}
          title="Time-källan är inte konfigurerad"
          body="VITE_TIME_V2_BASE_URL saknas. Kön visas inte eftersom det inte finns någon verifierad källa att läsa från."
        />
      )}

      {baseUrl && queue.isLoading && (
        <TimeV2StateCard
          testId="time-v2-loading"
          icon={<Clock3 className="w-5 h-5 text-muted-foreground" />}
          title="Hämtar granskningskön…"
          body="Läser Time-kontraktet (endast läsning)."
        />
      )}

      {baseUrl && err && (
        <TimeV2StateCard
          testId="time-v2-error"
          icon={<AlertTriangle className="w-5 h-5 text-destructive" />}
          title="Granskningskön kunde inte läsas"
          body={`${err.message} Inga rader visas — Planning hittar inte på data.`}
        >
          <Button variant="outline" size="sm" onClick={() => queue.refetch()}>Försök igen</Button>
        </TimeV2StateCard>
      )}

      {queue.data && rows.length === 0 && (
        <TimeV2StateCard
          testId="time-v2-empty"
          icon={<Inbox className="w-5 h-5 text-muted-foreground" />}
          title="Inga dagar matchar filtret"
          body="Time-kontraktet returnerade inga rader för den valda perioden och filtreringen."
        />
      )}

      {queue.data && rows.length > 0 && (
        <div className="space-y-4">
          {TIME_V2_QUEUE_GROUPS.map((g) => (
            <section key={g} data-testid={`time-v2-group-${g}`} className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                {TIME_V2_QUEUE_GROUP_LABELS[g]}
                <Badge variant="secondary" className="text-[10px] tabular-nums">{grouped[g].length}</Badge>
              </h2>
              {grouped[g].length === 0 ? (
                <p className="text-xs text-muted-foreground">Inga dagar i denna grupp.</p>
              ) : (
                <div className="space-y-2">
                  {grouped[g].map((row) => (
                    <QueueRow
                      key={row.submissionId}
                      row={row}
                      onOpen={() => navigate(`${TIME_V2_ROUTE}/review/${row.submissionId}`)}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default TimeV2ReviewQueuePage;
