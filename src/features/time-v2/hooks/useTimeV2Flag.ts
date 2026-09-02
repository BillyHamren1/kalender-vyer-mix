import { useCallback, useEffect, useState } from 'react';
import { useOrganizationId } from '@/hooks/useOrganizationId';
import {
  parseTenantAllowlist,
  readLocalOverrides,
  resolveTimeV2Flag,
  writeLocalOverride,
  type TimeV2FlagState,
} from '@/features/time-v2/lib/moduleFlag';

const FLAG_EVENT = 'eventflow:time-v2-flag-changed';

export interface UseTimeV2FlagResult extends TimeV2FlagState {
  isLoading: boolean;
  setLocalOverride: (enabled: boolean | null) => void;
}

export function useTimeV2Flag(): UseTimeV2FlagResult {
  const { organizationId, isLoading } = useOrganizationId();
  const [overrides, setOverrides] = useState<Record<string, boolean>>(() => readLocalOverrides());

  useEffect(() => {
    const sync = () => setOverrides(readLocalOverrides());
    window.addEventListener(FLAG_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(FLAG_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const allowlist = parseTenantAllowlist(
    (import.meta.env as unknown as Record<string, string | undefined>).VITE_TIME_V2_TENANTS,
  );

  const state = resolveTimeV2Flag({ organizationId, allowlist, overrides });

  const setLocalOverride = useCallback(
    (enabled: boolean | null) => {
      if (!organizationId) return;
      writeLocalOverride(organizationId, enabled);
      setOverrides(readLocalOverrides());
    },
    [organizationId],
  );

  return { ...state, isLoading, setLocalOverride };
}
