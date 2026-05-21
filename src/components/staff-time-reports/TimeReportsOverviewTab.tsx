import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import StaffMapView from '@/components/staff-dashboard/StaffMapView';
import { fetchStaffLocations } from '@/services/planningDashboardService';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { StaffPresenceCard } from './StaffPresenceCard';
import { compareVersion, fetchTodayPresence, minutesSince, OFFLINE_THRESHOLD_MIN } from './presenceUtils';

export const TimeReportsOverviewTab = () => {
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

  const latestKnownVersion = presence
    .map((p) => p.app_version)
    .filter((v): v is string => !!v)
    .reduce<string | null>((acc, v) => (acc && compareVersion(acc, v) >= 0 ? acc : v), null);

  const onlineCount = presence.filter(
    (p) => (minutesSince(p.updated_at) ?? 9999) <= OFFLINE_THRESHOLD_MIN,
  ).length;

  return (
    <div>
      <div className="text-sm text-muted-foreground mb-3">
        {format(today, 'EEEE d MMMM yyyy', { locale: sv })} — {presence.length} planerade, {onlineCount} online
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4">
        <Card className="h-[560px] overflow-hidden">
          <StaffMapView locations={mapLocations} isLoading={loadingMap} />
        </Card>

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
        <Link to="/staff-management/time-approvals" className="text-primary hover:underline">
          Gå till full attest →
        </Link>
        <Link to="/staff-management/time-reports/month" className="text-primary hover:underline">
          Månadsöversikt →
        </Link>
        <Link to="/staff-management/payroll-periods" className="text-primary hover:underline">
          Löneperioder →
        </Link>
        <Link to="/staff-management/gps-satellite-map" className="text-primary hover:underline">
          GPS-karta →
        </Link>
      </div>
    </div>
  );
};

export default TimeReportsOverviewTab;
