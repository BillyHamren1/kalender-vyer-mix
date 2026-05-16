/**
 * App health reporter — diagnostics only.
 *
 * Emits low-frequency health events to the backend so admins can later
 * correlate GPS gaps with app lifecycle / battery state. Never affects work
 * time, time reports, or the Time Engine.
 *
 * Events emitted:
 *   - app_start                  — once when this hook first mounts per session
 *   - app_foreground/background  — Capacitor App appStateChange (native only)
 *   - workday_timer_started      — window 'workday-started'
 *   - workday_timer_stopped      — window 'workday-ended'
 */
import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentStaffId } from '@/hooks/useCurrentStaffId';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { recordAppHealthEvent } from '@/lib/mobile/recordAppHealthEvent';

export function useAppHealthReporter() {
  const { user } = useAuth();
  const { staffId } = useCurrentStaffId();
  const { organizationId } = useCurrentOrg();
  const startedRef = useRef(false);
  const ctxRef = useRef<{ staffId: string | null; organizationId: string | null }>({
    staffId: null,
    organizationId: null,
  });

  useEffect(() => {
    ctxRef.current = { staffId: staffId ?? null, organizationId: organizationId ?? null };
  }, [staffId, organizationId]);

  // Fire app_start once we have ctx.
  useEffect(() => {
    if (!user || !staffId || !organizationId || startedRef.current) return;
    startedRef.current = true;
    void recordAppHealthEvent({
      organizationId,
      staffId,
      eventType: 'app_start',
      appState: 'active',
    });
  }, [user, staffId, organizationId]);

  // Capacitor App lifecycle (native only).
  useEffect(() => {
    if (!user) return;
    let removeListener: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        if (!Capacitor.isNativePlatform()) return;
        const { App } = await import('@capacitor/app');
        const handle = await App.addListener('appStateChange', ({ isActive }) => {
          const { staffId: sid, organizationId: oid } = ctxRef.current;
          if (!sid || !oid) return;
          void recordAppHealthEvent({
            organizationId: oid,
            staffId: sid,
            eventType: isActive ? 'app_foreground' : 'app_background',
            appState: isActive ? 'active' : 'background',
            skipBattery: !isActive, // background snapshot can be unreliable on iOS
          });
        });
        if (cancelled) {
          try { await handle.remove(); } catch { /* ignore */ }
        } else {
          removeListener = () => { void handle.remove(); };
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[app-health] appStateChange listener failed', err);
      }
    })();

    return () => {
      cancelled = true;
      if (removeListener) removeListener();
    };
  }, [user]);

  // Workday timer start/stop window events.
  useEffect(() => {
    if (!user) return;
    const onStarted = () => {
      const { staffId: sid, organizationId: oid } = ctxRef.current;
      if (!sid || !oid) return;
      void recordAppHealthEvent({
        organizationId: oid,
        staffId: sid,
        eventType: 'workday_timer_started',
      });
    };
    const onEnded = () => {
      const { staffId: sid, organizationId: oid } = ctxRef.current;
      if (!sid || !oid) return;
      void recordAppHealthEvent({
        organizationId: oid,
        staffId: sid,
        eventType: 'workday_timer_stopped',
      });
    };
    window.addEventListener('workday-started', onStarted as EventListener);
    window.addEventListener('workday-ended', onEnded as EventListener);

    const onPermDenied = () => {
      const { staffId: sid, organizationId: oid } = ctxRef.current;
      if (!sid || !oid) return;
      void recordAppHealthEvent({
        organizationId: oid,
        staffId: sid,
        eventType: 'location_permission_denied',
      });
    };
    const onPermRestored = () => {
      const { staffId: sid, organizationId: oid } = ctxRef.current;
      if (!sid || !oid) return;
      void recordAppHealthEvent({
        organizationId: oid,
        staffId: sid,
        eventType: 'location_permission_restored',
      });
    };
    window.addEventListener('location-permission-denied', onPermDenied as EventListener);
    window.addEventListener('location-permission-restored', onPermRestored as EventListener);

    return () => {
      window.removeEventListener('workday-started', onStarted as EventListener);
      window.removeEventListener('workday-ended', onEnded as EventListener);
      window.removeEventListener('location-permission-denied', onPermDenied as EventListener);
      window.removeEventListener('location-permission-restored', onPermRestored as EventListener);
    };
  }, [user]);
}
