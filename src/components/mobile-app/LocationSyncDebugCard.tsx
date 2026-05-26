/**
 * LocationSyncDebugCard
 * ---------------------
 * Internal debug + manual flush UI for the GPS offline sync queue.
 * Mounted on the mobile profile screen so testers can:
 *   - See how many GPS points are pending upload
 *   - Inspect the latest enqueued and uploaded points
 *   - Trigger a manual flush via mobileApi.uploadLocationBatch
 *   - See the most recent error if a flush failed
 *
 * Reads live state from the real queue + status store — no mocks.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { MapPin, RefreshCw, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  flushLocationQueue,
  getPendingLocationPoints,
  subscribeLocationQueue,
  subscribeLocationSyncStatus,
  getLocationSyncStatus,
  type PendingLocationPoint,
  type LocationSyncStatus,
} from '@/services/locationSyncQueue';

function formatRelative(ts: number | null): string {
  if (!ts) return '–';
  const diff = Date.now() - ts;
  if (diff < 0) return 'nu';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s sedan`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m sedan`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h sedan`;
  return `${Math.floor(diff / 86_400_000)}d sedan`;
}

function formatPoint(p: PendingLocationPoint | null): string {
  if (!p) return '–';
  return `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)} (${p.source})`;
}

const LocationSyncDebugCard = () => {
  const [pending, setPending] = useState<PendingLocationPoint[]>([]);
  const [status, setStatus] = useState<LocationSyncStatus>(getLocationSyncStatus());
  const [, forceTick] = useState(0);

  useEffect(() => {
    const unsubQueue = subscribeLocationQueue(() => {
      setPending(getPendingLocationPoints());
    });
    const unsubStatus = subscribeLocationSyncStatus(setStatus);
    // Re-render every 5s so "x sec ago" stays fresh
    const id = window.setInterval(() => forceTick(t => t + 1), 5_000);
    return () => {
      unsubQueue();
      unsubStatus();
      window.clearInterval(id);
    };
  }, []);

  const handleManualSync = async () => {
    await flushLocationQueue();
  };

  const newestPending = pending.length > 0
    ? [...pending].sort((a, b) => b.createdAt - a.createdAt)[0]
    : null;

  const lastUploadOk =
    status.lastUploadAt !== null &&
    (status.lastErrorAt === null || status.lastUploadAt > status.lastErrorAt);

  return (
    <div className="rounded-2xl border border-primary/20 bg-card px-4 py-3 shadow-md space-y-3">
      <div className="flex items-center gap-3">
        <div className="p-1.5 rounded-lg bg-primary/8">
          <MapPin className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">GPS-synk (debug)</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {pending.length} {pending.length === 1 ? 'punkt' : 'punkter'} väntar på uppladdning
          </p>
        </div>
        {status.isFlushing && (
          <Loader2 className="w-4 h-4 text-primary animate-spin" />
        )}
      </div>

      <Button
        onClick={handleManualSync}
        disabled={status.isFlushing}
        className="w-full h-10 rounded-xl text-sm gap-2 font-semibold"
        variant="outline"
      >
        {status.isFlushing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Skickar…
          </>
        ) : (
          <>
            <RefreshCw className="w-4 h-4" />
            Skicka platsdata nu
          </>
        )}
      </Button>

      <div className="border-t border-border/50 pt-2 space-y-1.5 text-[11px]">
        <DebugRow
          label="Väntar i kö"
          value={String(pending.length)}
          accent={pending.length > 0 ? 'warn' : 'ok'}
        />
        <DebugRow
          label="Senast sparad"
          value={
            status.lastEnqueuedAt
              ? `${formatRelative(status.lastEnqueuedAt)} (${status.lastEnqueuedSource ?? '–'})`
              : '–'
          }
        />
        <DebugRow
          label="Nyaste i kö"
          value={formatPoint(newestPending)}
        />
        <DebugRow
          label="Senast skickad"
          value={
            status.lastUploadAt
              ? `${formatRelative(status.lastUploadAt)} · ✓${status.lastUploadAccepted} ✗${status.lastUploadRejected}`
              : '–'
          }
          accent={status.lastUploadAt ? (lastUploadOk ? 'ok' : 'warn') : undefined}
        />
        <DebugRow
          label="Senaste fel"
          value={
            status.lastErrorAt
              ? `${formatRelative(status.lastErrorAt)} – ${status.lastErrorMessage ?? '–'}`
              : '–'
          }
          accent={status.lastErrorAt && !lastUploadOk ? 'err' : undefined}
        />
        <DebugRow
          label="Flush pågår"
          value={status.isFlushing ? 'JA' : 'nej'}
          accent={status.isFlushing ? 'warn' : undefined}
        />
      </div>
    </div>
  );
};

interface DebugRowProps {
  label: string;
  value: string;
  accent?: 'ok' | 'warn' | 'err';
}

const DebugRow = ({ label, value, accent }: DebugRowProps) => {
  const Icon =
    accent === 'ok' ? CheckCircle2 :
    accent === 'err' ? AlertCircle :
    accent === 'warn' ? AlertCircle :
    null;

  const color =
    accent === 'ok' ? 'text-primary' :
    accent === 'err' ? 'text-destructive' :
    accent === 'warn' ? 'text-amber-600 dark:text-amber-400' :
    'text-foreground';

  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`font-mono text-right break-all ${color} flex items-center gap-1`}>
        {Icon && <Icon className="w-3 h-3 shrink-0" />}
        {value}
      </span>
    </div>
  );
};

export default LocationSyncDebugCard;
