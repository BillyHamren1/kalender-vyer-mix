/**
 * useEndDayOnArrivalHome
 * ──────────────────────
 * Listens to travel-completed events from useTravelDetection. When a trip
 * ends inside the user's silently-inferred home location AND the user has
 * an open workplace timer or a recent un-closed location entry, opens a
 * gentle dialog suggesting they end the day at the time they actually
 * left the workplace.
 *
 * Hard rules (mirrors the approved plan):
 *   • Never says "hem"/"hemma" to the user — the home location is only
 *     used as a trigger.
 *   • At most one suggestion per day.
 *   • Suppressed if no inferred home exists yet (cold start).
 *   • Decisions:
 *      - Yes → endDay flow via useWorkSession.stopSession with
 *              endOfDayContext + stopAtIso = workplace exit time.
 *      - No  → silenced for the rest of the day.
 *      - Custom → time picker, then same endDay; if > 30 min from
 *              workplace exit, also writes a workday_flags entry.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { mobileApi } from '@/services/mobileApiService';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useMobileBookings } from '@/hooks/useMobileData';
import { useWorkSession, timerToTarget } from '@/hooks/useWorkSession';
import type { TravelCompletedInfo } from '@/hooks/useTravelDetection';
import type { ActiveTimer } from '@/hooks/useGeofencing';
import { toast } from 'sonner';
import { hasWorkdayEndedToday, markWorkdayEnded } from '@/services/workdayState';
import { syncWorkDayEnd } from '@/services/workdayServerSync';

const SUPPRESS_KEY_PREFIX = 'eventflow-end-day-home-suppressed-';
const ASSISTANT_DAILY_KEY_PREFIX = 'eventflow-last-workplace-prompted-';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface InferredHome {
  lat: number;
  lng: number;
  radius_m: number;
  kind: 'primary' | 'temporary';
}

export interface EndDayOnHomeSuggestion {
  workplaceName: string;
  exitedAtIso: string;
  /** ActiveTimer key, if the open signal is a timer (used for stop). */
  timerKey?: string;
  timer?: ActiveTimer;
}

async function fetchActiveHome(): Promise<InferredHome | null> {
  const nowIso = new Date().toISOString();
  // Temporary takes precedence over primary when valid.
  const { data, error } = await supabase
    .from('staff_inferred_home_locations')
    .select('lat, lng, radius_m, kind, valid_until')
    .or(`valid_until.is.null,valid_until.gt.${nowIso}`)
    .order('kind', { ascending: false }) // 'temporary' < 'primary' alphabetically? Actually 'p' > 't'; force ordering below
    .limit(5);
  if (error || !data || data.length === 0) return null;

  // Pick temporary first if any is valid, else primary.
  const temp = data.find((r) => r.kind === 'temporary');
  const prim = data.find((r) => r.kind === 'primary');
  const chosen = temp ?? prim;
  if (!chosen) return null;
  return {
    lat: chosen.lat as number,
    lng: chosen.lng as number,
    radius_m: (chosen.radius_m as number) ?? 150,
    kind: chosen.kind as 'primary' | 'temporary',
  };
}

export function useEndDayOnArrivalHome(
  completedTravel: TravelCompletedInfo | null,
  activeTimers: Map<string, ActiveTimer>,
) {
  const { staff } = useMobileAuth();
  const { data: bookings = [] } = useMobileBookings();
  const { stopSession } = useWorkSession(bookings, staff?.id);
  const [suggestion, setSuggestion] = useState<EndDayOnHomeSuggestion | null>(null);
  const handledTravelIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!staff || !completedTravel) return;
    if (handledTravelIdRef.current === completedTravel.travelLogId) return;
    handledTravelIdRef.current = completedTravel.travelLogId;

    const today = todayKey();
    const suppressed = localStorage.getItem(SUPPRESS_KEY_PREFIX + today);
    if (suppressed) return;
    if (hasWorkdayEndedToday()) return;

    // Suppress if last_workplace_for_day assistant has already prompted today.
    const assistantPromptedToday = localStorage.getItem(ASSISTANT_DAILY_KEY_PREFIX + today);
    if (assistantPromptedToday) return;

    (async () => {
      try {
        const home = await fetchActiveHome();
        if (!home) return; // cold start

        const dist = haversine(
          completedTravel.toLat,
          completedTravel.toLng,
          home.lat,
          home.lng,
        );
        if (dist > home.radius_m) return;

        // Find an open workplace signal earlier today.
        // Priority 1: an active timer (booking/project/location).
        let timerKey: string | undefined;
        let timer: ActiveTimer | undefined;
        let workplaceName: string | undefined;
        let exitedAtIso: string | undefined;

        for (const [key, t] of activeTimers.entries()) {
          if (!timer || new Date(t.startTime) < new Date(timer.startTime)) {
            timer = t;
            timerKey = key;
          }
        }
        if (timer && timerKey) {
          workplaceName = timer.locationName || timer.client;
          // Best-effort: use travel start time as the workplace exit time.
          // The user left the workplace ⇒ travel began.
          exitedAtIso = new Date(Date.now() - 60_000).toISOString();
          // Try to pull a more precise exit time:
          try {
            const res = await mobileApi.getLastWorkplaceExit?.();
            if (res?.last_exit?.exited_at) {
              exitedAtIso = res.last_exit.exited_at;
              if (res.last_exit.location_name) workplaceName = res.last_exit.location_name;
            }
          } catch { /* non-fatal */ }
        } else {
          // Priority 2: most recent location_time_entries row that exited within the last 12h.
          try {
            const res = await mobileApi.getLastWorkplaceExit?.();
            if (res?.last_exit?.exited_at) {
              exitedAtIso = res.last_exit.exited_at;
              workplaceName = res.last_exit.location_name || 'arbetsplatsen';
            }
          } catch { /* non-fatal */ }
        }

        if (!exitedAtIso || !workplaceName) return;

        // Sanity: exit time must be earlier today
        const exitDate = new Date(exitedAtIso);
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        if (exitDate < todayStart) return;

        setSuggestion({ workplaceName, exitedAtIso, timerKey, timer });
      } catch (err) {
        console.warn('[useEndDayOnArrivalHome] check failed:', err);
      }
    })();
  }, [completedTravel, staff, activeTimers]);

  const dismissSuggestion = useCallback((silenceForToday: boolean) => {
    if (silenceForToday) {
      localStorage.setItem(SUPPRESS_KEY_PREFIX + todayKey(), '1');
    }
    setSuggestion(null);
  }, []);

  const acceptSuggestion = useCallback(
    async (chosenEndIso: string) => {
      if (!suggestion) return;
      const exitIso = suggestion.exitedAtIso;
      const driftMin = Math.abs(
        (new Date(chosenEndIso).getTime() - new Date(exitIso).getTime()) / 60000,
      );

      try {
        if (suggestion.timer && suggestion.timerKey) {
          const target = timerToTarget(suggestion.timerKey, suggestion.timer);
          await stopSession(target, {
            stopAtIso: chosenEndIso,
            // No break dialog — caller assumes user already accounted for it
            breakChoice: { kind: 'no_break' },
            endOfDayContext:
              driftMin > 1
                ? {
                    lastExitIso: exitIso,
                    endedAtIso: chosenEndIso,
                    workDescription:
                      'Sluttid satt manuellt efter att ha lämnat ' + suggestion.workplaceName,
                  }
                : undefined,
          });
        }

        // Workday flag if user adjusted by > 30 min
        if (driftMin > 30 && staff?.id) {
          try {
            await mobileApi.createWorkdayFlag?.({
              flag_type: 'home_arrival_end_day_adjusted',
              flag_date: chosenEndIso.slice(0, 10),
              title: 'Sluttid justerad efter ankomst',
              description: `Föreslagen sluttid (${exitIso}) justerades med ${Math.round(driftMin)} min till ${chosenEndIso}.`,
              severity: 'info',
              context: {
                workplace: suggestion.workplaceName,
                suggested_end: exitIso,
                chosen_end: chosenEndIso,
                drift_minutes: Math.round(driftMin),
              },
            });
          } catch { /* non-fatal */ }
        }

        markWorkdayEnded(chosenEndIso);
        toast.success('Arbetsdag avslutad');
        setSuggestion(null);
      } catch (err: any) {
        console.error('[useEndDayOnArrivalHome] endDay failed:', err);
        toast.error(err?.message || 'Kunde inte avsluta dagen');
      }
    },
    [suggestion, stopSession, staff?.id],
  );

  return { suggestion, dismissSuggestion, acceptSuggestion };
}
