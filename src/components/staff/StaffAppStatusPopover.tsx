/**
 * StaffAppStatusPopover — visar app-status (version, build, OS, device) för
 * en personal i adminens tidrapportvy. Triggas av en telefonikon per
 * personalrad i StaffGanttView.
 *
 * Färgkoden på telefonikonen beräknas via `classifyAppBuild` från
 * `expectedAppBuild.ts`:
 *   - 'ok'       → grön (telefonen kör förväntad eller nyare build)
 *   - 'outdated' → orange (telefonen kör en äldre build)
 *   - 'missing'  → grå (ingen build alls rapporterad)
 *
 * Datakällan är samma `appHealth`-summary som RawPingsDebugPanel använder
 * (från `useRawStaffPingsDebug`). När appHealth saknas visas en tydlig
 * varning om att personen inte rapporterat någon app-health.
 */
import React from 'react';
import { Smartphone } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  classifyAppBuild,
  CURRENT_EXPECTED_APP_BUILD,
  CURRENT_EXPECTED_APP_VERSION,
} from '@/lib/mobile/expectedAppBuild';

export interface StaffAppHealthSummary {
  lastAppVersion: string | null;
  lastAppBuild: string | null;
  lastOsVersion: string | null;
  lastDeviceModel: string | null;
  lastAppId: string | null;
  lastAppHealthAt: string | null;
  lastGpsAt: string | null;
  lastPlatform?: string | null;
  lastAppSeenAt?: string | null;
  lastEventType?: string | null;
  heartbeatMissing?: boolean;
}

interface Props {
  staffName: string;
  appHealth: StaffAppHealthSummary | null | undefined;
  /** Storlek på iconknappen i px. */
  size?: number;
}

function fmtTs(ts: string | null | undefined): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('sv-SE', {
      timeZone: 'Europe/Stockholm',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

function statusBadge(status: 'ok' | 'outdated' | 'missing') {
  if (status === 'ok') return { label: 'OK', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40' };
  if (status === 'outdated') return { label: 'Gammal build', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40' };
  return { label: 'Version saknas', cls: 'bg-muted text-muted-foreground border-border' };
}

function iconColor(status: 'ok' | 'outdated' | 'missing'): string {
  if (status === 'ok') return 'text-emerald-600 dark:text-emerald-400';
  if (status === 'outdated') return 'text-amber-600 dark:text-amber-400';
  return 'text-muted-foreground';
}

export function StaffAppStatusPopover({ staffName, appHealth, size = 14 }: Props) {
  const status = classifyAppBuild(appHealth?.lastAppBuild ?? null);
  const badge = statusBadge(status);
  const color = iconColor(status);
  const title =
    status === 'ok'
      ? `App-version OK (build ${appHealth?.lastAppBuild ?? '?'})`
      : status === 'outdated'
        ? `Gammal app-version (build ${appHealth?.lastAppBuild ?? '?'}, förväntat ${CURRENT_EXPECTED_APP_BUILD})`
        : 'Ingen app-health mottagen';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/80 transition-colors hover:bg-muted',
            color,
          )}
          aria-label="Visa appstatus"
          title={title}
        >
          <Smartphone style={{ width: size, height: size }} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        className="w-80 p-3 text-[12.5px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="truncate font-semibold text-foreground">{staffName}</div>
          <span className={cn('shrink-0 rounded border px-1.5 py-0.5 text-[10.5px] font-medium', badge.cls)}>
            {badge.label}
          </span>
        </div>

        {!appHealth ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11.5px] text-amber-800 dark:text-amber-200">
            Ingen app-health mottagen. Personen kan ha gammal app, vara
            utloggad eller inte öppnat appen efter uppdatering.
          </div>
        ) : (
          <dl className="grid grid-cols-[110px_1fr] gap-x-2 gap-y-1.5">
            <dt className="text-muted-foreground">App-version</dt>
            <dd className="font-medium text-foreground">{appHealth.lastAppVersion ?? '—'}</dd>

            <dt className="text-muted-foreground">Build</dt>
            <dd className="font-mono text-foreground">{appHealth.lastAppBuild ?? '—'}</dd>

            <dt className="text-muted-foreground">Förväntad build</dt>
            <dd className="font-mono text-foreground">
              {CURRENT_EXPECTED_APP_BUILD}{' '}
              <span className="text-muted-foreground">({CURRENT_EXPECTED_APP_VERSION})</span>
            </dd>

            <dt className="text-muted-foreground">OS</dt>
            <dd className="text-foreground">
              {appHealth.lastPlatform ? `${appHealth.lastPlatform} ` : ''}
              {appHealth.lastOsVersion ?? '—'}
            </dd>

            <dt className="text-muted-foreground">Enhet</dt>
            <dd className="text-foreground">{appHealth.lastDeviceModel ?? '—'}</dd>

            <dt className="text-muted-foreground">App-ID</dt>
            <dd className="truncate font-mono text-[11px] text-foreground" title={appHealth.lastAppId ?? ''}>
              {appHealth.lastAppId ?? '—'}
            </dd>

            <dt className="text-muted-foreground">Senaste app-health</dt>
            <dd className="text-foreground">{fmtTs(appHealth.lastAppHealthAt ?? appHealth.lastAppSeenAt ?? null)}</dd>

            <dt className="text-muted-foreground">Senaste GPS</dt>
            <dd className="text-foreground">{fmtTs(appHealth.lastGpsAt ?? null)}</dd>

            {appHealth.heartbeatMissing ? (
              <>
                <dt className="text-muted-foreground">Heartbeat</dt>
                <dd className="text-amber-700 dark:text-amber-300">
                  Saknas (pings finns men inga health-events på 30+ min)
                </dd>
              </>
            ) : null}
          </dl>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default StaffAppStatusPopover;
