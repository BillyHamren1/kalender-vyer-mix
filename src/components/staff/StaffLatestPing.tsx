import React from 'react';
import { MapPin, AlertTriangle } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { sv } from 'date-fns/locale';

export interface LatestPing {
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  updated_at: string | null;
}

interface Props {
  ping: LatestPing | null | undefined;
  className?: string;
}

/**
 * Compact "senast pingad" row.
 *
 * NOTE — explicit no-rerender contract: this component renders ONE time per
 * data fetch. We deliberately do NOT use a 1s ticker for the relative time;
 * the user wants this row to update only when the page is refreshed or a
 * realtime event arrives (per product decision 2026-04-21).
 */
export const StaffLatestPing: React.FC<Props> = ({ ping, className }) => {
  if (!ping || !ping.updated_at) {
    return (
      <div className={`flex items-center gap-1.5 text-[11px] text-muted-foreground ${className || ''}`}>
        <MapPin className="h-3 w-3" />
        <span>Ingen GPS-ping ännu idag</span>
      </div>
    );
  }

  const ageMs = Date.now() - new Date(ping.updated_at).getTime();
  const isStale = ageMs > 2 * 60 * 1000; // > 2 min
  const relative = formatDistanceToNowStrict(new Date(ping.updated_at), {
    addSuffix: true,
    locale: sv,
  });
  const label = ping.address
    || (ping.latitude != null && ping.longitude != null
        ? `${ping.latitude.toFixed(4)}, ${ping.longitude.toFixed(4)}`
        : 'Okänd plats');

  return (
    <div
      className={`flex items-center gap-1.5 text-[11px] rounded-md px-1.5 py-0.5 ${
        isStale
          ? 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border border-red-200/70 dark:border-red-900/40'
          : 'text-muted-foreground'
      } ${className || ''}`}
      title={`Senaste GPS-ping ${new Date(ping.updated_at).toLocaleTimeString('sv-SE')}`}
    >
      {isStale ? (
        <AlertTriangle className="h-3 w-3 shrink-0" />
      ) : (
        <MapPin className="h-3 w-3 shrink-0" />
      )}
      <span className="truncate">
        Senast pingad: <span className="font-medium">{label}</span>
        {' · '}
        {relative}
      </span>
    </div>
  );
};