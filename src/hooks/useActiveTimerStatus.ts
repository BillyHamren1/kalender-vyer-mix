import { useEffect, useState, useCallback } from 'react';
import { callStaffSnapshotFunction } from '@/services/staffSnapshotApi';

export type RegistrationKind =
  | 'none'
  | 'known_site'
  | 'project'
  | 'booking'
  | 'warehouse'
  | 'transport'
  | 'unknown_place'
  | 'gps_uncertain';

export type RegistrationSource = 'user_started' | 'gps_classifier' | 'none';

export interface ActiveTimerStatus {
  timerActive: boolean;
  timerId: string | null;
  startedAt: string | null;
  elapsedSeconds: number;
  registrationKind: RegistrationKind;
  registrationLabel: string;
  registrationSource: RegistrationSource;
  confidence: number;
  needsUserChoice: boolean;
  canGpsStartTimer: false;
}

const INITIAL: ActiveTimerStatus = {
  timerActive: false,
  timerId: null,
  startedAt: null,
  elapsedSeconds: 0,
  registrationKind: 'none',
  registrationLabel: 'Tid registreras inte',
  registrationSource: 'none',
  confidence: 0,
  needsUserChoice: false,
  canGpsStartTimer: false,
};

/**
 * useActiveTimerStatus — single source of truth for the mobile app's timer.
 * Polls `get-active-timer-status` every 15s + on `timer-state-changed`.
 *
 * The app MUST NOT derive timer state from useWorkSession,
 * location_time_entries, time_reports, workday or legacy activeTimers.
 */
export function useActiveTimerStatus(enabled: boolean) {
  const [data, setData] = useState<ActiveTimerStatus>(INITIAL);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const res = await callStaffSnapshotFunction<any>(
        'get-active-timer-status',
        {},
      );
      if (res && typeof res === 'object') {
        setData({
          timerActive: !!res.timerActive,
          timerId: res.timerId ?? null,
          startedAt: res.startedAt ?? null,
          elapsedSeconds: typeof res.elapsedSeconds === 'number' ? res.elapsedSeconds : 0,
          registrationKind: (res.registrationKind ?? 'none') as RegistrationKind,
          registrationLabel: res.registrationLabel ?? 'Tid registreras inte',
          registrationSource: (res.registrationSource ?? 'none') as RegistrationSource,
          confidence: typeof res.confidence === 'number' ? res.confidence : 0,
          needsUserChoice: !!res.needsUserChoice,
          canGpsStartTimer: false,
        });
      }
    } catch {
      // silent — keep last known state
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    const id = window.setInterval(refresh, 15_000);
    const onChange = () => refresh();
    window.addEventListener('timer-state-changed', onChange);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('timer-state-changed', onChange);
    };
  }, [enabled, refresh]);

  // Local 1s tick so UI shows live elapsed without re-fetching.
  useEffect(() => {
    if (!enabled || !data.timerActive || !data.startedAt) return;
    const id = window.setInterval(() => {
      setData((prev) => {
        if (!prev.timerActive || !prev.startedAt) return prev;
        const elapsed = Math.max(
          0,
          Math.floor((Date.now() - new Date(prev.startedAt).getTime()) / 1000),
        );
        return { ...prev, elapsedSeconds: elapsed };
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [enabled, data.timerActive, data.startedAt]);

  return { data, loading, refresh };
}
