/**
 * GpsHealthDebugPanel
 * ────────────────────────────────────────────────────────────────────────────
 * Minimal on-device debug overlay för GPS-pipeline. Aktiveras med:
 *
 *   localStorage.setItem('time:gps-debug', '1');
 *
 * Visar exakt VAR pipelinen står still — permission, native callback,
 * backend-policy, queue, upload — så vi inte behöver gissa när en
 * telefon "slutar pinga".
 *
 * Diagnostik. INGEN tidsdata. INGEN write-path.
 */
import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import {
  getLocationSyncStatus,
  getPendingLocationPoints,
  subscribeLocationQueue,
  subscribeLocationSyncStatus,
  type LocationSyncStatus,
} from '@/services/locationSyncQueue';
import type { BackgroundLocationDebugInfo } from '@/hooks/useBackgroundLocationReporter';
import { getAppBuildInfo, type AppBuildInfo } from '@/lib/mobile/getAppBuildInfo';
import { classifyAppBuild, CURRENT_EXPECTED_APP_BUILD } from '@/lib/mobile/expectedAppBuild';

interface Props {
  debug: BackgroundLocationDebugInfo;
}

function fmtAgo(ts: number | null): string {
  if (!ts) return '—';
  const sec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (sec < 60) return `${sec}s sedan`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m sedan`;
  const h = Math.round(min / 60);
  return `${h}h sedan`;
}

function isEnabled(): boolean {
  try {
    return localStorage.getItem('time:gps-debug') === '1';
  } catch {
    return false;
  }
}

export const GpsHealthDebugPanel: React.FC<Props> = ({ debug }) => {
  const { staff } = useMobileAuth();
  const [enabled, setEnabled] = useState<boolean>(isEnabled());
  const [collapsed, setCollapsed] = useState<boolean>(true);
  const [permission, setPermission] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<LocationSyncStatus>(getLocationSyncStatus());
  const [pendingCount, setPendingCount] = useState<number>(getPendingLocationPoints().length);

  // Tick var 2s så "ago"-fält uppdateras
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 2000);
    return () => clearInterval(t);
  }, []);

  // Lyssna på localStorage-flaggan så panelen kan slås på/av live
  useEffect(() => {
    const i = setInterval(() => setEnabled(isEnabled()), 1000);
    return () => clearInterval(i);
  }, []);

  // Permission status
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const anyNav = navigator as unknown as { permissions?: { query: (q: { name: string }) => Promise<{ state: string }> } };
        if (anyNav.permissions?.query) {
          const res = await anyNav.permissions.query({ name: 'geolocation' });
          if (!cancelled) setPermission(res.state);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [enabled]);

  // Subscribe to sync status + queue
  useEffect(() => {
    if (!enabled) return;
    const u1 = subscribeLocationSyncStatus((s) => setSyncStatus(s));
    const u2 = subscribeLocationQueue((q) => setPendingCount(q.filter((p) => p.status !== 'uploaded').length));
    return () => { u1(); u2(); };
  }, [enabled]);

  if (!enabled) return null;

  const rows: Array<[string, string]> = [
    ['staffId', staff?.id ?? '—'],
    ['orgId', (() => { try { const r = localStorage.getItem('eventflow-mobile-staff'); return r ? (JSON.parse(r)?.organization_id ?? '—') : '—'; } catch { return '—'; } })()],
    ['permission', permission ?? 'okänd'],
    ['isNativePlatform', String(debug.isNativePlatform)],
    ['appVisibilityState', debug.appVisibilityState],
    ['currentDistanceFilter', `${debug.currentDistanceFilter}m`],
    ['currentHeartbeatMs', `${Math.round(debug.currentHeartbeatMs / 1000)}s`],
    ['backendPolicyMode', debug.backendPolicyMode ?? '—'],
    ['lastNativeLocationEventAt', fmtAgo(debug.lastNativeLocationEventAt)],
    ['lastJsHeartbeatAt', fmtAgo(debug.lastJsHeartbeatAt)],
    ['lastFreshResumePingAt', fmtAgo(debug.lastFreshResumePingAt)],
    ['lastEnqueuedAt', fmtAgo(debug.lastEnqueuedAt)],
    ['queue pending', String(pendingCount)],
    ['lastAcceptedUploadAt', fmtAgo(syncStatus.lastUploadAt)],
    ['accepted (last batch)', String(syncStatus.lastUploadAccepted)],
    ['rejected (last batch)', String(syncStatus.lastUploadRejected)],
    ['last upload error', syncStatus.lastErrorMessage ?? '—'],
    ['last geo error', debug.lastGeolocationError ?? '—'],
    ['gpsSilentState', debug.gpsSilentState],
  ];

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 80,
        right: 8,
        zIndex: 9999,
        maxWidth: 320,
        fontSize: 10,
        background: 'rgba(0,0,0,0.85)',
        color: '#fff',
        padding: 8,
        borderRadius: 8,
        fontFamily: 'monospace',
        lineHeight: 1.3,
      }}
    >
      <div
        style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer', marginBottom: 4 }}
        onClick={() => setCollapsed((c) => !c)}
      >
        <strong>GPS health {Capacitor.getPlatform()}</strong>
        <span>{collapsed ? '▸' : '▾'}</span>
      </div>
      {!collapsed && (
        <table style={{ borderSpacing: 0, width: '100%' }}>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td style={{ opacity: 0.7, paddingRight: 6, verticalAlign: 'top', whiteSpace: 'nowrap' }}>{k}</td>
                <td style={{ wordBreak: 'break-all' }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default GpsHealthDebugPanel;
