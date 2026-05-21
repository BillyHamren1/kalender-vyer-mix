import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Search, AlertTriangle, Battery, BatteryCharging, Wifi, WifiOff } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import {
  compareVersion,
  fetchAllStaffWithPresence,
  formatAgo,
  minutesSince,
  OFFLINE_THRESHOLD_MIN,
  type PresenceRow,
} from './presenceUtils';
import { StaffWeekPanel } from './StaffWeekPanel';

export const StaffListTab = () => {
  const today = format(new Date(), 'yyyy-MM-dd');

  useRealtimeInvalidation({
    channelName: 'time-reports-staff-list',
    tables: ['staff_locations', 'staff_members'],
    queryKeys: [['time-reports-staff-list']],
    debounceMs: 800,
  });

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ['time-reports-staff-list', today],
    queryFn: fetchAllStaffWithPresence,
    refetchInterval: 60_000,
  });

  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const latestKnownVersion = useMemo(
    () =>
      staff
        .map((p) => p.app_version)
        .filter((v): v is string => !!v)
        .reduce<string | null>(
          (acc, v) => (acc && compareVersion(acc, v) >= 0 ? acc : v),
          null,
        ),
    [staff],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? staff.filter((s) => s.name.toLowerCase().includes(q) || (s.role || '').toLowerCase().includes(q))
      : staff;
    return [...list].sort((a, b) => {
      const aOnline = (minutesSince(a.updated_at) ?? 9999) <= OFFLINE_THRESHOLD_MIN ? 0 : 1;
      const bOnline = (minutesSince(b.updated_at) ?? 9999) <= OFFLINE_THRESHOLD_MIN ? 0 : 1;
      if (aOnline !== bOnline) return aOnline - bOnline;
      return a.name.localeCompare(b.name, 'sv');
    });
  }, [staff, query]);

  const selected = filtered.find((s) => s.staff_id === selectedId) || filtered[0] || null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 h-[640px]">
      <Card className="flex flex-col min-h-0 p-3">
        <div className="relative mb-3">
          <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Sök personal…"
            className="pl-8"
          />
        </div>
        <div className="text-xs text-muted-foreground mb-2 px-1">
          {filtered.length} personer
        </div>
        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {isLoading && <div className="text-sm text-muted-foreground p-2">Laddar…</div>}
          {!isLoading && filtered.length === 0 && (
            <div className="text-sm text-muted-foreground p-2">Ingen personal hittad.</div>
          )}
          {filtered.map((row) => (
            <StaffListRow
              key={row.staff_id}
              row={row}
              selected={selected?.staff_id === row.staff_id}
              latestKnownVersion={latestKnownVersion}
              onClick={() => setSelectedId(row.staff_id)}
            />
          ))}
        </div>
      </Card>

      <Card className="p-4 min-h-0 overflow-hidden">
        {selected ? (
          <StaffWeekPanel person={selected} />
        ) : (
          <div className="text-sm text-muted-foreground">Välj en person för att se rapporter.</div>
        )}
      </Card>
    </div>
  );
};

interface StaffListRowProps {
  row: PresenceRow;
  selected: boolean;
  latestKnownVersion: string | null;
  onClick: () => void;
}

const StaffListRow = ({ row, selected, latestKnownVersion, onClick }: StaffListRowProps) => {
  const pingAgeMin = minutesSince(row.updated_at);
  const offline = (pingAgeMin ?? 9999) > OFFLINE_THRESHOLD_MIN;
  const versionOutdated =
    latestKnownVersion && row.app_version
      ? compareVersion(row.app_version, latestKnownVersion) < 0
      : false;
  const battery = row.battery_percent;
  const batteryLow = battery != null && battery <= 20 && !row.is_charging;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-md border border-border bg-card hover:bg-accent/30 transition p-2.5',
        selected && 'border-primary bg-accent/30',
      )}
    >
      <div className="flex items-center gap-2">
        <div className="relative shrink-0">
          <div
            className="w-2.5 h-2.5 rounded-full ring-2 ring-background"
            style={{ background: row.color || 'hsl(var(--muted-foreground))' }}
          />
          <div
            className={cn(
              'absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ring-1 ring-background',
              offline ? 'bg-muted-foreground' : 'bg-emerald-500',
            )}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{row.name}</div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {row.role && <span className="truncate">{row.role}</span>}
          </div>
        </div>
        {versionOutdated && (
          <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400 text-[10px] px-1.5 py-0">
            <AlertTriangle className="w-3 h-3 mr-1" />
            uppdatera
          </Badge>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-3 text-[11px]">
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
        {battery != null ? (
          <span
            className={cn(
              'inline-flex items-center gap-1',
              batteryLow ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
            )}
          >
            {row.is_charging ? <BatteryCharging className="w-3 h-3" /> : <Battery className="w-3 h-3" />}
            {battery}%
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-muted-foreground/60">
            <Battery className="w-3 h-3" />—
          </span>
        )}
        {row.app_version && (
          <span className={cn('text-muted-foreground/70', versionOutdated && 'text-amber-600 dark:text-amber-400')}>
            v{row.app_version}
          </span>
        )}
      </div>
    </button>
  );
};

export default StaffListTab;
