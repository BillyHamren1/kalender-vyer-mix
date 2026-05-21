import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Clock, AlertTriangle, Battery, BatteryCharging, Wifi, WifiOff, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import StaffMapView from '@/components/staff-dashboard/StaffMapView';
import { fetchStaffLocations } from '@/services/planningDashboardService';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Bryt ut typer (importeras av andra komponenter)
export type {
  SegmentKind,
  DaySegment,
  LatestPing,
  PresenceDebug,
  PlanningStatus,
  ProjectInfo,
  StaffWithDayReport,
} from './StaffTimeReports.types';

// ── Konfiguration ───────────────────────────────────────────────────────────
const OFFLINE_THRESHOLD_MIN = 10;
// Senaste kända app-version. Allt äldre flaggas som "appen behöver uppdateras".
// Hämtas från senaste värdet i fältet — vi tar maxvärdet bland alla rapporterande
// enheter idag som "current" så vi slipper hårdkoda.

interface PresenceRow {
  staff_id: string;
  name: string;
  color: string | null;
  team_label: string | null;
  booking_label: string | null;
  latitude: number | null;
  longitude: number | null;
  updated_at: string | null;
  last_address: string | null;
  app_version: string | null;
  app_platform: string | null;
  battery_percent: number | null;
  is_charging: boolean | null;
}

async function fetchTodayPresence(dateStr: string): Promise<PresenceRow[]> {
  // Planerad personal idag = booking_staff_assignments (samma källa
  // som personalkalendern). team_id='project' ignoreras (projektmedlemskap,
  // inte dagsplanering).
  const [bsaRes, saRes, staffRes, locRes, bookingsRes] = await Promise.all([
    supabase
      .from('booking_staff_assignments')
      .select('staff_id, booking_id, team_id, assignment_date')
      .eq('assignment_date', dateStr),
    supabase
      .from('staff_assignments')
      .select('staff_id, team_id, assignment_date')
      .eq('assignment_date', dateStr),
    supabase.from('staff_members').select('id, name, color, role'),
    supabase
      .from('staff_locations')
      .select(
        'staff_id, latitude, longitude, updated_at, last_address, app_version, app_platform, battery_percent, is_charging',
      ),
    supabase.from('bookings').select('id, client, booking_number'),
  ]);

  const bsa = (bsaRes.data || []).filter((r: any) => r?.team_id && r.team_id !== 'project');
  const sa = saRes.data || [];
  const staff = staffRes.data || [];
  const locs = locRes.data || [];
  const bookings = bookingsRes.data || [];

  const bookingById = new Map<string, any>(bookings.map((b: any) => [b.id, b]));
  const locByStaff = new Map<string, any>(locs.map((l: any) => [l.staff_id, l]));
  const staffById = new Map<string, any>(staff.map((s: any) => [s.id, s]));

  const out = new Map<string, PresenceRow>();
  const ensure = (sid: string): PresenceRow | null => {
    const s = staffById.get(sid);
    if (!s) return null;
    if (out.has(sid)) return out.get(sid)!;
    const l = locByStaff.get(sid);
    const row: PresenceRow = {
      staff_id: sid,
      name: s.name,
      color: s.color ?? null,
      team_label: null,
      booking_label: null,
      latitude: l?.latitude ?? null,
      longitude: l?.longitude ?? null,
      updated_at: l?.updated_at ?? null,
      last_address: l?.last_address ?? null,
      app_version: l?.app_version ?? null,
      app_platform: l?.app_platform ?? null,
      battery_percent: l?.battery_percent ?? null,
      is_charging: l?.is_charging ?? null,
    };
    out.set(sid, row);
    return row;
  };

  for (const r of bsa as any[]) {
    const row = ensure(r.staff_id);
    if (!row) continue;
    const b = bookingById.get(r.booking_id);
    if (b && !row.booking_label) {
      row.booking_label = b.client || b.booking_number || null;
    }
    if (!row.team_label) row.team_label = teamLabel(r.team_id);
  }
  for (const r of sa as any[]) {
    const row = ensure(r.staff_id);
    if (!row) continue;
    if (!row.team_label) row.team_label = teamLabel(r.team_id);
  }

  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name, 'sv'));
}

function teamLabel(teamId: string | null): string | null {
  if (!teamId) return null;
  if (teamId.startsWith('team-')) return `Team ${teamId.slice(5)}`;
  return teamId;
}

function minutesSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 60000));
}

function formatAgo(min: number | null): string {
  if (min == null) return 'aldrig';
  if (min < 1) return 'just nu';
  if (min < 60) return `${min} min sedan`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} tim sedan`;
  return `${Math.floor(h / 24)} d sedan`;
}

function compareVersion(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const pa = a.split('.').map((p) => parseInt(p, 10) || 0);
  const pb = b.split('.').map((p) => parseInt(p, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

const StaffTimeReports = () => {
  const today = new Date();
  const dateStr = format(today, 'yyyy-MM-dd');

  useRealtimeInvalidation({
    channelName: 'time-reports-dashboard',
    tables: ['staff_locations', 'booking_staff_assignments', 'staff_assignments'],
    queryKeys: [['time-reports-dashboard', dateStr]],
    debounceMs: 800,
  });

  const { data: presence = [], isLoading: loadingPresence } = useQuery({
    queryKey: ['time-reports-dashboard', dateStr],
    queryFn: () => fetchTodayPresence(dateStr),
    refetchInterval: 60_000,
  });

  const { data: mapLocations = [], isLoading: loadingMap } = useQuery({
    queryKey: ['time-reports-dashboard-map'],
    queryFn: fetchStaffLocations,
    refetchInterval: 60_000,
  });

  // Senaste rapporterade version idag = "aktuell" → äldre flaggas
  const latestKnownVersion = presence
    .map((p) => p.app_version)
    .filter((v): v is string => !!v)
    .reduce<string | null>((acc, v) => (acc && compareVersion(acc, v) >= 0 ? acc : v), null);

  const onlineCount = presence.filter(
    (p) => (minutesSince(p.updated_at) ?? 9999) <= OFFLINE_THRESHOLD_MIN,
  ).length;

  return (
    <PageContainer>
      <PageHeader
        title="Tidrapporter"
        subtitle={`${format(today, 'EEEE d MMMM yyyy', { locale: sv })} — ${presence.length} planerade, ${onlineCount} online`}
        icon={Clock}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4 mt-4">
        {/* Karta */}
        <Card className="h-[560px] overflow-hidden">
          <StaffMapView locations={mapLocations} isLoading={loadingMap} />
        </Card>

        {/* Planerad personal idag */}
        <Card className="p-4 max-h-[560px] overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Planerade idag</h2>
            <Badge variant="outline">{presence.length}</Badge>
          </div>
          {loadingPresence ? (
            <div className="text-sm text-muted-foreground">Laddar…</div>
          ) : presence.length === 0 ? (
            <div className="text-sm text-muted-foreground">Ingen planerad personal idag.</div>
          ) : (
            <ul className="space-y-2">
              {presence.map((p) => (
                <StaffPresenceCard
                  key={p.staff_id}
                  row={p}
                  date={dateStr}
                  latestKnownVersion={latestKnownVersion}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 flex flex-wrap gap-3 text-sm">
        <Link
          to="/staff-management/time-approvals"
          className="text-primary hover:underline"
        >
          Gå till attest →
        </Link>
        <Link
          to="/staff-management/time-reports/month"
          className="text-primary hover:underline"
        >
          Månadsöversikt →
        </Link>
        <Link
          to="/staff-management/payroll-periods"
          className="text-primary hover:underline"
        >
          Löneperioder →
        </Link>
        <Link
          to="/staff-management/gps-satellite-map"
          className="text-primary hover:underline"
        >
          GPS-karta →
        </Link>
      </div>
    </PageContainer>
  );
};

interface StaffPresenceCardProps {
  row: PresenceRow;
  date: string;
  latestKnownVersion: string | null;
}

const StaffPresenceCard = ({ row, date, latestKnownVersion }: StaffPresenceCardProps) => {
  const pingAgeMin = minutesSince(row.updated_at);
  const offline = (pingAgeMin ?? 9999) > OFFLINE_THRESHOLD_MIN;
  const stale = (pingAgeMin ?? 0) > 60;
  const versionOutdated =
    latestKnownVersion && row.app_version
      ? compareVersion(row.app_version, latestKnownVersion) < 0
      : false;
  const versionMissing = !row.app_version;

  const battery = row.battery_percent;
  const batteryLow = battery != null && battery <= 20 && !row.is_charging;

  return (
    <li>
      <Link
        to={`/staff-management/time-reports/${row.staff_id}/${date}`}
        className="block rounded-lg border border-border bg-card hover:bg-accent/30 transition p-3"
      >
        <div className="flex items-start gap-3">
          <div className="relative shrink-0 mt-0.5">
            <div
              className="w-3 h-3 rounded-full ring-2 ring-background"
              style={{ background: row.color || 'hsl(var(--muted-foreground))' }}
            />
            <div
              className={cn(
                'absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-1 ring-background',
                offline ? 'bg-muted-foreground' : 'bg-emerald-500',
              )}
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-foreground truncate">{row.name}</span>
              {row.team_label && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {row.team_label}
                </Badge>
              )}
              {row.booking_label && (
                <span className="text-xs text-muted-foreground truncate">
                  · {row.booking_label}
                </span>
              )}
            </div>

            <div className="mt-1 flex items-center gap-3 flex-wrap text-xs">
              {/* Ping-status */}
              <span
                className={cn(
                  'inline-flex items-center gap-1',
                  offline ? 'text-muted-foreground' : 'text-emerald-600 dark:text-emerald-400',
                )}
                title={row.updated_at ? new Date(row.updated_at).toLocaleString('sv-SE') : 'Inga pings'}
              >
                {offline ? <WifiOff className="w-3 h-3" /> : <Wifi className="w-3 h-3" />}
                {formatAgo(pingAgeMin)}
              </span>

              {/* Batteri */}
              {battery != null ? (
                <span
                  className={cn(
                    'inline-flex items-center gap-1',
                    batteryLow ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
                  )}
                >
                  {row.is_charging ? (
                    <BatteryCharging className="w-3 h-3" />
                  ) : (
                    <Battery className="w-3 h-3" />
                  )}
                  {battery}%
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-muted-foreground/60">
                  <Battery className="w-3 h-3" />—
                </span>
              )}

              {/* App-version */}
              {(versionOutdated || versionMissing) && (
                <span
                  className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"
                  title={
                    versionMissing
                      ? 'Ingen app-version rapporterad'
                      : `App v${row.app_version} (senaste v${latestKnownVersion})`
                  }
                >
                  <AlertTriangle className="w-3 h-3" />
                  {versionMissing ? 'App ej rapporterad' : `v${row.app_version}`}
                </span>
              )}
              {!versionOutdated && !versionMissing && row.app_version && (
                <span className="text-muted-foreground/70">v{row.app_version}</span>
              )}

              {/* Plats */}
              {row.last_address && (
                <span className="inline-flex items-center gap-1 text-muted-foreground truncate max-w-[200px]">
                  <MapPin className="w-3 h-3" />
                  <span className="truncate">{row.last_address}</span>
                </span>
              )}
              {stale && !offline && (
                <span className="text-amber-600 dark:text-amber-400">⚠ gammal signal</span>
              )}
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
};

export default StaffTimeReports;
