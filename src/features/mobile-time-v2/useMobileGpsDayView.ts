/**
 * useMobileGpsDayView — fetches the prebuilt GPS Day View for the
 * effective mobile staff. No GPS interpretation, no ping reads, no time
 * math. Backend owns everything; this hook just shuttles the result.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { getMobileGpsDayView } from './mobileTimeV2Api';
import type { MobileGpsDayView } from './types';

export interface UseMobileGpsDayViewResult {
  data: MobileGpsDayView | null;
  staffId: string | null;
  date: string;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useMobileGpsDayView(date?: string): UseMobileGpsDayViewResult {
  const { effectiveStaffId } = useMobileAuth();
  const staffId = effectiveStaffId ?? null;
  const targetDate = date ?? format(new Date(), 'yyyy-MM-dd');

  const [data, setData] = useState<MobileGpsDayView | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!staffId) {
      setData(null);
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    setIsLoading(true);
    try {
      const view = await getMobileGpsDayView({ staffId, date: targetDate });
      setData(view);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Kunde inte ladda dagsvyn');
    } finally {
      setIsLoading(false);
      inFlight.current = false;
    }
  }, [staffId, targetDate]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, staffId, date: targetDate, isLoading, error, refresh };
}
