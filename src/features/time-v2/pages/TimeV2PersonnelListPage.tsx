import React, { useMemo, useState } from 'react';
import { Navigate, Link, useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { AlertTriangle, Clock3, FlaskConical, RefreshCw, Users, WifiOff } from 'lucide-react';
import { useTimeV2Flag } from '@/features/time-v2/hooks/useTimeV2Flag';
import { useTimeV2PersonnelDirectory } from '@/features/time-v2/hooks/useTimeV2Personnel';
import { getTimeV2BaseUrl, type TimeV2ClientError } from '@/features/time-v2/lib/client';
import {
  describeActivation,
  describeFreshness,
  TIME_V2_APP_ACCOUNT_LABELS,
  TIME_V2_CONTRACT_VERSION,
  type TimeV2PersonnelRow,
} from '@/features/time-v2/lib/contract';
import { LEGACY_TIME_ROUTE, TIME_V2_ROUTE } from '@/features/time-v2/lib/moduleFlag';
import TimeV2StateCard from '@/features/time-v2/components/TimeV2StateCard';

const stamp = (v: string | null) => (v ? new Date(v).toLocaleString('sv-SE') : 'aldrig');

const Row: React.FC<{ row: TimeV2PersonnelRow; onOpen: () => void }> = ({ row, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    data-testid={`time-v2-personnel-row-${row.personnelId}`}
    className="w-full text-left rounded-lg border bg-card px-3 py-2 hover:bg-accent/40 transition-colors"
  >
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-foreground">{row.personnelName}</span>
      <Badge variant="outline" className="text-[10px]">
        App: {TIME_V2_APP_ACCOUNT_LABELS[row.appAccount.state]}
      </Badge>
      <Badge variant="secondary" className="text-[10px]">
        HUB: {row.hubAccount.present ? row.hubAccount.state ?? 'finns' : 'saknas'}
      </Badge>
      {row.isTestFixture && (
        <Badge className="text-[10px] gap-1" variant="outline"><FlaskConical className="w-3 h-3" /> TEST</Badge>
      )}
    </div>
    <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
      <span>{describeActivation(row)}</span>
      <span>Senaste appåtkomst {stamp(row.lastAppAccessAt)}</span>
      <span>Uppdrag synliga {row.visibleAssignments}</span>
    </div>
  </button>
);

/**
 * Administrator-facing personnel/app-account support list.
 * HUB identity and personnel-app identity are shown as separate states and no
 * credential, session, token or role is ever copied between them.
 */
const TimeV2PersonnelListPage: React.FC = () => {
  const flag = useTimeV2Flag();
  const navigate = useNavigate();
  const baseUrl = getTimeV2BaseUrl();
  const [query, setQuery] = useState('');

  const dir = useTimeV2PersonnelDirectory(flag.organizationId, flag.enabled);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = dir.data?.rows ?? [];
    if (!q) return all;
    return all.filter(
      (r) => r.personnelName.toLowerCase().includes(q) || r.personnelId.toLowerCase().includes(q),
    );
  }, [dir.data, query]);

  if (flag.isLoading) return <div className="p-8 text-sm text-muted-foreground">Laddar modulstatus…</div>;
  if (!flag.enabled) return <Navigate to={LEGACY_TIME_ROUTE} replace />;

  const err = dir.error as TimeV2ClientError | null;

  return (
    <div className="p-6 space-y-5" data-testid="time-v2-personnel-list">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">Personal & appkonton</h1>
            <Badge variant="secondary" className="text-[10px]">kontrakt {TIME_V2_CONTRACT_VERSION}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            <Link className="underline" to={TIME_V2_ROUTE}>Tid V2</Link> · appkontostatus från Time.
            Aktiveringsbiljetter visas aldrig i Planning.
            {dir.data && ` ${describeFreshness(dir.data.generatedAt)}`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => dir.refetch()} disabled={dir.isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${dir.isFetching ? 'animate-spin' : ''}`} /> Uppdatera
        </Button>
      </header>

      <Card className="p-3">
        <Input
          className="h-9 w-full max-w-md"
          placeholder="Sök personal"
          aria-label="Sök personal"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </Card>

      {!baseUrl && (
        <TimeV2StateCard
          testId="time-v2-unconfigured"
          icon={<WifiOff className="w-5 h-5 text-muted-foreground" />}
          title="Time-källan är inte konfigurerad"
          body="VITE_TIME_V2_BASE_URL saknas. Ingen personal visas eftersom det inte finns någon verifierad källa."
        />
      )}

      {baseUrl && dir.isLoading && (
        <TimeV2StateCard
          testId="time-v2-loading"
          icon={<Clock3 className="w-5 h-5 text-muted-foreground" />}
          title="Hämtar personal…"
          body="Läser Time-kontraktet (endast läsning)."
        />
      )}

      {baseUrl && err && (
        <TimeV2StateCard
          testId="time-v2-error"
          icon={<AlertTriangle className="w-5 h-5 text-destructive" />}
          title="Personallistan kunde inte läsas"
          body={err.message}
        />
      )}

      {baseUrl && !dir.isLoading && !err && rows.length === 0 && (
        <TimeV2StateCard
          testId="time-v2-empty"
          icon={<Users className="w-5 h-5 text-muted-foreground" />}
          title="Ingen personal i kontraktet"
          body="Time rapporterar inga personalposter för den här organisationen."
        />
      )}

      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((r) => (
            <Row key={r.personnelId} row={r} onOpen={() => navigate(`${TIME_V2_ROUTE}/personnel/${r.personnelId}`)} />
          ))}
        </div>
      )}
    </div>
  );
};

export default TimeV2PersonnelListPage;
