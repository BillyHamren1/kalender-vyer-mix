// LEGACY_DO_NOT_IMPORT_TIME_ENGINE_V3
// Timer 1.8 — kvar i kodbasen för testkontrakt och historisk referens.
// FÅR INTE importeras från aktiv personalapp (mobile/scanner) eller från
// admin/Time Engine. Single source of truth = active_time_registrations +
// WorkDayPanel + staff_day_report_cache.
/**
 * useEndDayOnArrivalHome (Auto-first 2026-04)
 * ───────────────────────────────────────────
 * Lyssnar på travel-completed från useTravelDetection. När en resa slutar
 * inom användarens (tyst inferred) hem-radie OCH en activity-timer eller
 * öppen workplace-exit finns kvar idag → AUTO-AVSLUTA dagen:
 *   1. Stoppa öppen activity via stopSession (samma break-pipeline som vanligt).
 *   2. Avsluta workday på servern via syncWorkDayEnd.
 *   3. Skriv en workday_flag (severity=info) som audit-spår.
 *   4. Toast: "Arbetsdag avslutad — du kom hem kl HH:MM. Justera i Översikt
 *      om något ser fel ut."
 *
 * Hard rules:
 *   • Säger ALDRIG "hem"/"hemma" till användaren — hemma används bara som trigger.
 *   • Max ett auto-end per dag.
 *   • Suppressas om ingen inferred home finns (cold start).
 *   • Vid fel (server, missing exit, stop misslyckas): exponera `suggestion`
 *     så MobileGlobalOverlays kan rendera fallback-dialogen där användaren
 *     bekräftar manuellt. Det är då vi har äkta osäkerhet.
 *
 * Returnerar fortfarande `suggestion` / `dismissSuggestion` / `acceptSuggestion`
 * för att inte bryta MobileGlobalOverlays-kontraktet — men i happy path är
 * `suggestion` alltid null.
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
import { hasWorkdayEndedToday } from '@/services/workdayState';
import { endWorkdayFlow } from '@/services/workdayServerSync';

const SUPPRESS_KEY_PREFIX = 'eventflow-end-day-home-suppressed-';
const ASSISTANT_DAILY_KEY_PREFIX = 'eventflow-last-workplace-prompted-';
const AUTO_ENDED_KEY_PREFIX = 'eventflow-end-day-home-auto-ended-';

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
  /** Why the auto-flow couldn't complete (review/audit context). */
  reason?: 'stop_failed' | 'workday_end_failed' | 'no_open_signal';
}

async function fetchActiveHome(): Promise<InferredHome | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('staff_inferred_home_locations')
    .select('lat, lng, radius_m, kind, valid_until')
    .or(`valid_until.is.null,valid_until.gt.${nowIso}`)
    .order('kind', { ascending: false })
    .limit(5);
  if (error || !data || data.length === 0) return null;

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
    if (localStorage.getItem(SUPPRESS_KEY_PREFIX + today)) return;
    if (localStorage.getItem(AUTO_ENDED_KEY_PREFIX + today)) return;
    if (hasWorkdayEndedToday()) return;
    if (localStorage.getItem(ASSISTANT_DAILY_KEY_PREFIX + today)) return;

    (async () => {
      try {
        const home = await fetchActiveHome();
        if (!home) return; // cold start — never speak about "hem"

        const dist = haversine(
          completedTravel.toLat,
          completedTravel.toLng,
          home.lat,
          home.lng,
        );
        if (dist > home.radius_m) return;

        // ── Hitta öppen activity / sista workplace-exit ──────────────────
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
          exitedAtIso = new Date(Date.now() - 60_000).toISOString();
          try {
            const res = await mobileApi.getLastWorkplaceExit?.();
            if (res?.last_exit?.exited_at) {
              exitedAtIso = res.last_exit.exited_at;
              if (res.last_exit.location_name) workplaceName = res.last_exit.location_name;
            }
          } catch { /* non-fatal */ }
        } else {
          try {
            const res = await mobileApi.getLastWorkplaceExit?.();
            if (res?.last_exit?.exited_at) {
              exitedAtIso = res.last_exit.exited_at;
              workplaceName = res.last_exit.location_name || 'arbetsplatsen';
            }
          } catch { /* non-fatal */ }
        }

        if (!exitedAtIso || !workplaceName) {
          // Vi har varken öppen timer eller sista exit på servern → osäkert.
          // Fallback-dialogen tar över; markera som review.
          setSuggestion({
            workplaceName: workplaceName || 'arbetsplatsen',
            exitedAtIso: exitedAtIso || new Date().toISOString(),
            timerKey, timer,
            reason: 'no_open_signal',
          });
          return;
        }

        const exitDate = new Date(exitedAtIso);
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        if (exitDate < todayStart) return; // gammal exit, hör inte hit

        // ── AUTO-FIRST: kör hela end-of-day-flödet utan dialog ───────────
        const chosenEndIso = exitedAtIso;

        try {
          if (timer && timerKey) {
            const target = timerToTarget(timerKey, timer);
            const stopRes = await stopSession(target, {
              stopAtIso: chosenEndIso,
              breakChoice: { kind: 'no_break' },
              endOfDayContext: {
                lastExitIso: exitedAtIso,
                endedAtIso: chosenEndIso,
                workDescription:
                  'Arbetsdagen avslutades automatiskt efter ankomst (sluttid = workplace exit)',
              },
            });
            if (stopRes.cancelled) {
              // Användaren stängde break-dialogen → vi har bekräftad osäkerhet.
              setSuggestion({ workplaceName, exitedAtIso, timerKey, timer, reason: 'stop_failed' });
              return;
            }
          }

          const result = await endWorkdayFlow({ endedAtIso: chosenEndIso });
          if (!result.ok) {
            console.warn('[useEndDayOnArrivalHome] endWorkdayFlow failed:', result.error);
            // needsReview → fallback-dialog tar över via suggestion.
            setSuggestion({ workplaceName, exitedAtIso, timerKey, timer, reason: 'workday_end_failed' });
            return;
          }

          // Audit: skriv alltid en flag som spår, även när allt funkat.
          if (staff?.id) {
            try {
              await mobileApi.createWorkdayFlag?.({
                flag_type: 'home_arrival_auto_ended',
                flag_date: chosenEndIso.slice(0, 10),
                title: 'Arbetsdag auto-avslutad',
                description:
                  `Dagen avslutades automatiskt efter ankomst. Sluttid sattes till workplace exit (${chosenEndIso}).`,
                severity: 'info',
                context: {
                  workplace: workplaceName,
                  ended_at: chosenEndIso,
                  source: 'home_arrival_auto',
                },
              });
            } catch { /* non-fatal */ }
          }

          localStorage.setItem(AUTO_ENDED_KEY_PREFIX + today, '1');

          const hhmm = new Date(chosenEndIso).toLocaleTimeString('sv-SE', {
            hour: '2-digit', minute: '2-digit',
          });
          toast.success(
            `Arbetsdag avslutad kl ${hhmm}. Justera i Översikt om något ser fel ut.`,
          );
        } catch (err: any) {
          console.error('[useEndDayOnArrivalHome] auto-end failed:', err);
          setSuggestion({ workplaceName, exitedAtIso, timerKey, timer, reason: 'stop_failed' });
        }
      } catch (err) {
        console.warn('[useEndDayOnArrivalHome] check failed:', err);
      }
    })();
  }, [completedTravel, staff, activeTimers, stopSession]);

  // ── Kvar för fallback-dialogen (när auto-end inte kan slutföras) ──────
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

        const result = await endWorkdayFlow({ endedAtIso: chosenEndIso });
        if (!result.ok) {
          toast.error(result.error || 'Kunde inte avsluta arbetspasset på servern');
          return;
        }

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

        localStorage.setItem(AUTO_ENDED_KEY_PREFIX + todayKey(), '1');
        toast.success('Arbetsdag avslutad');
        setSuggestion(null);
      } catch (err: any) {
        console.error('[useEndDayOnArrivalHome] manual end failed:', err);
        toast.error(err?.message || 'Kunde inte avsluta dagen');
      }
    },
    [suggestion, stopSession, staff?.id],
  );

  return { suggestion, dismissSuggestion, acceptSuggestion };
}
