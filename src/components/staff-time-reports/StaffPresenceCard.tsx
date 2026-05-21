import { Link } from 'react-router-dom';
import { AlertTriangle, Battery, BatteryCharging, MapPin, Wifi, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { compareVersion, formatAgo, minutesSince, OFFLINE_THRESHOLD_MIN, type PresenceRow } from './presenceUtils';

interface Props {
  row: PresenceRow;
  date: string;
  latestKnownVersion: string | null;
}

export const StaffPresenceCard = ({ row, date, latestKnownVersion }: Props) => {
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
                <span className="text-xs text-muted-foreground truncate">· {row.booking_label}</span>
              )}
            </div>

            <div className="mt-1 flex items-center gap-3 flex-wrap text-xs">
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

export default StaffPresenceCard;
