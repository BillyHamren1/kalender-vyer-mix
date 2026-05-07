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

export interface CurrentTimeRegistration {
  timerActive: boolean;
  timerStartedAt: string | null;
  timerId: string | null;
  label: string;
  kind: RegistrationKind;
  confidence: number;
  needsUserChoice: boolean;
}

const INITIAL: CurrentTimeRegistration = {
  timerActive: false,
  timerStartedAt: null,
  timerId: null,
  label: 'Tid registreras inte',
  kind: 'none',
  confidence: 0,
  needsUserChoice: false,
};

/**
 * useCurrentTimeRegistration — backend-driven snapshot of "what is my time
 * being registered on right now?". Polls every 30s + on `timer-state-changed`.
 *
 * Source of truth: edge function `get-current-time-registration`.
 * NEVER reads from useWorkSession / location_time_entries / time_reports
 * locally — label and kind come from GPS engine on the server.
 */
export function useCurrentTimeRegistration(enabled: boolean) {
  const [data, setData] = useState<CurrentTimeRegistration>(INITIAL);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const res = await callStaffSnapshotFunction<any>(
        'get-current-time-registration',
        {},
      );
      if (res && typeof res === 'object') {
        setData({
          timerActive: !!res.timerActive,
          timerStartedAt: res.timerStartedAt ?? null,
          timerId: res.timerId ?? null,
          label: res.label ?? 'Tid registreras inte',
          kind: (res.kind ?? 'none') as RegistrationKind,
          confidence: typeof res.confidence === 'number' ? res.confidence : 0,
          needsUserChoice: !!res.needsUserChoice,
        });
      }
    } catch {
      // Silent — keep last known state
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    const id = window.setInterval(refresh, 30_000);
    const onChange = () => refresh();
    window.addEventListener('timer-state-changed', onChange);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('timer-state-changed', onChange);
    };
  }, [enabled, refresh]);

  return { data, loading, refresh };
}
