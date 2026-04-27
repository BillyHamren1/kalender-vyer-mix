/**
 * useWorkdayBootstrap — guarantees that a server-anchored workday exists
 * as soon as a logged-in mobile staff opens the app.
 *
 * Why: previously `ensureActive()` only ran inside `useTimerStartFlow.performStart`,
 * which means a user who opens the app and never starts a specific activity
 * had NO open workday — the header sun never appears, the day-clock never
 * starts, and downstream EOD reconciliation has nothing to close.
 *
 * Idempotent on the server (`workday.start` returns the existing open row
 * if any) and de-duped client-side via `useWorkDay.ensureActive`.
 *
 * Skips when:
 *   - no staff is logged in
 *   - the user has already explicitly ended the day (per `workdayState`)
 *
 * Mounted once globally by `MobileGlobalOverlays`.
 */
import { useEffect, useRef } from 'react';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useWorkDay } from '@/hooks/useWorkDay';
import { hasWorkdayEndedToday, WORKDAY_ENDED_STATE_CHANGED_EVENT } from '@/services/workdayState';

export function useWorkdayBootstrap(): void {
  const { staff } = useMobileAuth();
  const { ensureActive, current } = useWorkDay();
  const ranForStaffRef = useRef<string | null>(null);

  useEffect(() => {
    if (!staff?.id) return;
    // Already an open workday → nothing to do.
    if (current && !current.ended_at) return;
    // User explicitly ended the day → respect that.
    if (hasWorkdayEndedToday()) return;
    // Don't repeat for the same staff session.
    if (ranForStaffRef.current === staff.id) return;
    ranForStaffRef.current = staff.id;
    void ensureActive();
  }, [staff?.id, current, ensureActive]);

  // If the user manually ends + then later re-opens the app on the same
  // day (and clears the ended-flag, e.g. via Day Review), reset the latch
  // so a fresh ensureActive can fire.
  useEffect(() => {
    const reset = () => {
      ranForStaffRef.current = null;
    };
    window.addEventListener(WORKDAY_ENDED_STATE_CHANGED_EVENT, reset);
    return () => window.removeEventListener(WORKDAY_ENDED_STATE_CHANGED_EVENT, reset);
  }, []);
}

export default useWorkdayBootstrap;
