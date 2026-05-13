// LEGACY_DO_NOT_IMPORT_TIME_ENGINE_V3
// Timer 1.8 — kvar i kodbasen för testkontrakt och historisk referens.
// FÅR INTE importeras från aktiv personalapp (mobile/scanner) eller från
// admin/Time Engine. Single source of truth = active_time_registrations +
// WorkDayPanel + staff_day_report_cache.
/**
 * useTimerStartFlow — UNIFIED START FLOW
 * ======================================
 *
 * THE ONLY sanctioned path to start an ACTIVITY timer in the mobile app.
 *
 * UNIFIED MODEL (Tidappen):
 *   1. Dagtimer (workday) = HUVUDSPÅR. Säkerställs här via ensureWorkDayActive
 *      vid första aktivitetsstart. Får också startas explicit av användaren
 *      via "Starta dagen". App-open startar ALDRIG dagen implicit.
 *   2. Aktivitetstid (projekt/plats/bokning) = INUTI dagen. Den här hooken
 *      ansvarar för aktivitetsstart — inte för att äga workday-livscykeln.
 *   3. "Avsluta dagen" = SEPARAT handling — sker via useWorkDay.end, inte här.
 *      Att stoppa en aktivitet avslutar ALDRIG dagen.
 *   4. Geofence = SIGNAL. Den här hooken är ACTION/DECISION-lagret som tar
 *      emot signaler (manuell knapp, ankomst-popup, geo arrival via
 *      tryStartFromArrival) och kör dem genom samma startkedja.
 *
 * All start sources (manual button, arrival popup, geofence arrival)
 * MUST go through `requestStart()` here. The flow is:
 *
 *   requestStart(target, label, opts?)
 *      │
 *      ├─ evaluateStartConflict(target, activeTimers)
 *      │     ├─ duplicate → no-op (silent)
 *      │     ├─ allow     → distance check (if GPS) → startSession(target)
 *      │     └─ switch    → expose conflict → caller renders TimerConflictDialog
 *      │                    → on confirm: stopSession(old) → startSession(new)
 *
 * Direct calls to `startTimer(...)` or `startSession(...)` from feature
 * code are forbidden — enforced by `timerStartUnification.contract.test.ts`.
 */
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { evaluateStartConflict, type StartEvaluation } from '@/lib/timerConcurrency';
import {
  useWorkSession,
  resolveTargetKey,
  timerToTarget,
  type WorkTarget,
} from '@/hooks/useWorkSession';
import {
  // useGeofencing is mounted ONCE by GeofencingProvider — see GeofencingContext.tsx.
  // We only consume the shared instance via useGeofencingContext().
  haversineDistance,
} from '@/hooks/useGeofencing';

import { useGeofencingContext } from '@/contexts/GeofencingContext';
import { STOP_TRAVEL_EVENT, type StopTravelEventDetail } from '@/hooks/useTravelDetection';
import { useWorkDay } from '@/hooks/useWorkDay';
import type { MobileBooking } from '@/services/mobileApiService';
import { mobileApi } from '@/services/mobileApiService';
import {
  evaluateGap,
  readLastWorkSegment,
  clearLastWorkSegment,
} from '@/lib/lastWorkSegment';

/**
 * Distans-tröskel för "off-site"-varningen vid manuell timer-start.
 * Avsiktligt större än geofencens ENTER_RADIUS (150 m) — GPS i städer/inomhus
 * kan lätt vara 100–200 m off, och vi vill inte tvinga fram en kommentar
 * när användaren faktiskt står på platsen. Geofence-auto-start är oförändrad.
 */
const OFF_SITE_PROMPT_RADIUS = 300; // meters

/**
 * Gap-baserad restidshärledning.
 *
 * När en aktivitet startas tittar vi på det senaste stoppade
 * arbetssegmentet (lagrat av useWorkSession.stopSession). Är gapet
 * rimligt (10–180 min) anropar vi den centrala server-funktionen
 * `create_travel_from_gap`, som är idempotent och tillämpar reglerna:
 *   • <10 min   → skip (klienten filtrerar)
 *   • 10–180 min → 'work', skapas direkt
 *   • >180 min  → needs_review=true, skapas men kräver attest
 *
 * Servern dedupliceras på (staff, start, end, source='gap_derived'),
 * så även parallella anropare hamnar aldrig i dubbletter.
 *
 * Best-effort: fel loggas men blockerar aldrig start-flödet.
 */
async function maybeCreateGapTravel(
  nextStartIso: string,
  next: { targetType: 'project' | 'booking' | 'location'; targetId: string; label: string },
): Promise<void> {
  const prev = readLastWorkSegment();
  const decision = evaluateGap(nextStartIso, prev);

  if (decision.kind === 'no_previous' || decision.kind === 'cross_day') {
    return;
  }
  if (decision.kind === 'too_short') {
    console.log(`[GapTravel] gap ${decision.gapMin} min → too_short, skipping`);
    clearLastWorkSegment();
    return;
  }

  // candidate (10–180 min) ELLER needs_review (>180 min) — båda fallen
  // går till servern; servern avgör needs_review-flaggan.
  try {
    const res = await mobileApi.createTravelFromGap({
      previous_target_type: prev!.targetType,
      previous_target_id: prev!.targetId,
      previous_target_label: prev!.targetLabel,
      next_target_type: next.targetType,
      next_target_id: next.targetId,
      next_target_label: next.label,
      start_time: prev!.stoppedAtIso,
      end_time: nextStartIso,
    });
    if (res?.deduplicated) {
      console.log(`[GapTravel] gap already recorded (${decision.gapMin} min) — dedup hit`);
    } else if (res?.success) {
      console.log(
        `[GapTravel] created (${res.gap_minutes ?? decision.gapMin} min, needs_review=${res.needs_review ?? false})`,
      );
    } else if (res?.skipped) {
      console.log(`[GapTravel] server skipped: ${res.reason}`);
    }
  } catch (err: any) {
    console.warn('[GapTravel] createTravelFromGap failed (non-fatal):', err);
  } finally {
    // Rensa alltid efter ett beslut — varje gap utvärderas en gång.
    clearLastWorkSegment();
  }
}

export interface RequestStartOptions {
  /** Backdated start (e.g. arrival timestamp from popup). */
  startedAtIso?: string;
  /** Optional label for toasts / conflict dialog (defaults to target's own label). */
  label?: string;
  /** Optional task metadata persisted on the resulting time_report. */
  taskId?: string;
  taskTitle?: string;
  /**
   * Suppress the default "Timer startad: …" / "Timer redan aktiv …" toasts.
   * Used by callers (e.g. arrival prompt) som vill visa egen, mer detaljerad
   * feedback ("Arbetsdag startad från 09:44" + "Projekt X är aktivt").
   */
  suppressToast?: boolean;
}

interface PendingStart {
  target: WorkTarget;
  label: string;
  startedAtIso?: string;
  taskId?: string;
  taskTitle?: string;
  suppressToast?: boolean;
}

/**
 * Resultat-statusar som kan rapporteras tillbaka från ett distance-confirm.
 * Distance-dialogen visar UI-fel och håller sig öppen om status inte är
 * 'started' eller 'already_running'.
 */
export type DistanceConfirmStatus =
  | 'started'
  | 'already_running'
  | 'workday_failed'
  | 'start_failed';

interface DistanceWarning {
  placeName: string;
  distance: number;
  /**
   * Awaitable confirm. Anropas med användarens (obligatoriska) anledning
   * och kör performStart till klart. Returnerar riktig status så att
   * dialog-wrappern kan visa fel och hålla sig öppen vid misslyckande.
   */
  onConfirm: (reason: string) => Promise<DistanceConfirmStatus>;
}

export function useTimerStartFlow(
  bookings: MobileBooking[],
  staffId?: string,
) {
  const { activeTimers, userPosition } = useGeofencingContext();
  const { startSession, stopSession, resolveTargetCoords } = useWorkSession(
    bookings,
    staffId,
  );
  const { ensureActive: ensureWorkDayActive } = useWorkDay();

  const [pendingStart, setPendingStart] = useState<PendingStart | null>(null);
  const [conflictEval, setConflictEval] = useState<
    Extract<StartEvaluation, { status: 'switch' }> | null
  >(null);
  const [distanceWarning, setDistanceWarning] =
    useState<DistanceWarning | null>(null);

  const labelFor = useCallback((target: WorkTarget): string => {
    if (target.kind === 'booking') return target.client;
    return target.name;
  }, []);

  /**
   * Unified outcome for ALL start entry-points (`requestStart`,
   * `tryStartFromArrival`). Callers must await and only show success UI
   * when the status is `started` or `already_running`.
   *
   *   started                         — workday active + activity timer created
   *   already_running                 — same target was already active (no-op)
   *   conflict                        — TimerConflictDialog opened; async resolution
   *   awaiting_distance_confirmation  — DistanceWarningDialog opened; user must
   *                                     confirm/cancel. NOT a failure — caller MUST
   *                                     NOT show success toast or generic error.
   *                                     Real outcome flows via dialog onConfirm.
   *   workday_failed                  — workday could not be ensured; activity NOT started
   *   start_failed                    — startSession returned false (race / engine refused)
   */
  type StartStatus =
    | 'started'
    | 'already_running'
    | 'conflict'
    | 'awaiting_distance_confirmation'
    | 'workday_failed'
    | 'start_failed';

  /**
   * Actually create the timer through the unified engine.
   *
   * WORKDAY-FIRST (HARD REQUIREMENT):
   *   We ALWAYS await `ensureWorkDayActive()` before starting an activity.
   *   If the workday cannot be ensured the activity MUST NOT start.
   */
  const performStart = useCallback(
    async (
      target: WorkTarget,
      opts: { startedAtIso?: string; label: string; taskId?: string; taskTitle?: string; offSiteReason?: string; offSiteDistance?: number; suppressToast?: boolean },
    ): Promise<Extract<StartStatus, 'started' | 'already_running' | 'workday_failed' | 'start_failed'>> => {
      // End any open GPS-travel row when starting a new activity.
      if (userPosition) {
        const detail: StopTravelEventDetail = {
          lat: userPosition.lat,
          lng: userPosition.lng,
          auto: true,
        };
        window.dispatchEvent(new CustomEvent(STOP_TRAVEL_EVENT, { detail }));
      }

      // WORKDAY-FIRST hard gate.
      let workday: Awaited<ReturnType<typeof ensureWorkDayActive>> = null;
      try {
        workday = await ensureWorkDayActive(opts.startedAtIso);
      } catch (err) {
        console.error('[StartFlow] ensureWorkDayActive threw:', err);
        workday = null;
      }
      if (!workday) {
        toast.error(
          'Kunde inte starta arbetspasset. Försök igen.',
        );
        return 'workday_failed';
      }

      // SINGLE-TIMER POLICY (single-timer-policy-v1):
      // Mobilappen har bara EN timer — workday. Aktivitets-/projekt-/plats-
      // /bokningstimers får inte längre startas från klienten. GPS/geofence
      // matar admin via pings/place_visits/assistant_events; admin fördelar
      // tid till projekt från tidslinjen i webben.
      //
      // Vi behåller ensureWorkDayActive ovan (workday är den enda timern),
      // men hoppar startSession helt. Audit: skicka assistant-event så admin
      // ser att en arbetsplats-arrival skedde.
      void mobileApi.assistantEvents
        .create({
          event_type: 'arrival',
          target_type: target.kind,
          target_id:
            target.kind === 'booking'
              ? target.bookingId
              : target.kind === 'project'
                ? target.largeProjectId
                : target.locationId,
          target_label: opts.label,
          happened_at: opts.startedAtIso ?? new Date().toISOString(),
          source: 'single_timer_policy',
          suggested_action: 'admin_allocate_from_timeline',
          metadata: {
            policy: 'single-timer-policy-v1',
            note: 'Activity-timer start suppressed; workday ensured.',
          },
        })
        .catch(() => {});
      const ok = true;
      if (!ok) {
        // startSession returns false on duplicate (already in activeTimers).
        if (!opts.suppressToast) {
          toast.message('Timer redan aktiv för platsen');
        }
        return 'already_running';
      }

      if (!opts.suppressToast) {
        toast.success(`Timer startad: ${opts.label}`);
      }

      // Off-site flag (best-effort, non-blocking)
      if (opts.offSiteReason) {
        const targetId =
          target.kind === 'booking'
            ? target.bookingId
            : target.kind === 'project'
              ? target.largeProjectId
              : target.locationId;
        void mobileApi.createWorkdayFlag({
          flag_type: 'geofence_presence_mismatch',
          flag_date: new Date().toISOString().slice(0, 10),
          title: `Startade off-site: ${opts.label}`,
          description: opts.offSiteReason,
          severity: 'warning',
          needs_user_input: false,
          related_booking_id: target.kind === 'booking' ? target.bookingId : undefined,
          related_large_project_id: target.kind === 'project' ? target.largeProjectId : undefined,
          related_location_id: target.kind === 'location' ? target.locationId : undefined,
          context: {
            source: 'distance_warning_override',
            distance_meters: opts.offSiteDistance ?? null,
            target_kind: target.kind,
            target_id: targetId,
            user_position: userPosition ?? null,
            reason: opts.offSiteReason,
          },
        }).catch((err) => {
          console.warn('[StartFlow] createWorkdayFlag (off-site) failed (non-fatal):', err);
        });
      }

      // Gap-derived travel (best-effort, fire-and-forget)
      const startIso = opts.startedAtIso ?? new Date().toISOString();
      const nextTargetId =
        target.kind === 'booking'
          ? target.bookingId
          : target.kind === 'project'
            ? target.largeProjectId
            : target.locationId;
      void maybeCreateGapTravel(startIso, {
        targetType: target.kind,
        targetId: nextTargetId,
        label: opts.label,
      });
      return 'started';
    },
    [startSession, userPosition, ensureWorkDayActive],
  );

  /**
   * Distance-aware wrapper around performStart.
   *
   * If we have GPS + target coords AND the user is far away, we open the
   * DistanceWarningDialog and resolve with `'awaiting_distance_confirmation'`.
   * The dialog's confirm
   * handler triggers a fresh performStart that runs to completion later.
   *
   * Returns the actual outcome from performStart in the no-warning path so
   * the caller knows whether to show success UI.
   */
  const checkDistanceAndStart = useCallback(
    async (
      target: WorkTarget,
      opts: { startedAtIso?: string; label: string; taskId?: string; taskTitle?: string },
    ): Promise<Extract<StartStatus, 'started' | 'already_running' | 'workday_failed' | 'start_failed' | 'awaiting_distance_confirmation'>> => {
      const coords = resolveTargetCoords(target);
      if (!userPosition || !coords) {
        return performStart(target, opts);
      }
      const dist = haversineDistance(
        userPosition.lat,
        userPosition.lng,
        coords.lat,
        coords.lng,
      );
      if (dist > OFF_SITE_PROMPT_RADIUS) {
        setDistanceWarning({
          placeName: coords.label || opts.label,
          distance: dist,
          // Awaitable confirm — kör hela performStart-kedjan klart och
          // returnerar riktig status. Wrappern (DistanceWarningDialog-konsumenten
          // i MobileGlobalOverlays) håller dialogen öppen vid fel.
          onConfirm: async (reason: string): Promise<DistanceConfirmStatus> => {
            try {
              return await performStart(target, {
                ...opts,
                offSiteReason: reason,
                offSiteDistance: dist,
              });
            } catch (err: any) {
              console.error('[StartFlow] distance-confirm performStart threw:', err);
              toast.error(err?.message || 'Kunde inte starta aktiviteten');
              return 'start_failed';
            }
          },
        });
        return 'awaiting_distance_confirmation';
      }
      return performStart(target, opts);
    },
    [resolveTargetCoords, userPosition, performStart],
  );

  /**
   * Public entry-point — fully async.
   *
   * Resolves only after the entire start chain has settled (workday ensure
   * + startSession + provider activeTimers updated) OR a UI dialog has
   * taken over (conflict / distance). Callers MUST await and gate any
   * success UI on `started` / `already_running`.
   */
  const requestStart = useCallback(
    async (
      target: WorkTarget,
      opts: RequestStartOptions = {},
    ): Promise<StartStatus> => {
      const label = opts.label ?? labelFor(target);
      const evalResult = evaluateStartConflict(target, activeTimers);

      if (evalResult.status === 'duplicate') return 'already_running';

      if (evalResult.status === 'allow') {
        return checkDistanceAndStart(target, {
          startedAtIso: opts.startedAtIso,
          label,
          taskId: opts.taskId,
          taskTitle: opts.taskTitle,
        });
      }

      // switch — defer until user confirms in TimerConflictDialog
      setPendingStart({
        target,
        label,
        startedAtIso: opts.startedAtIso,
        taskId: opts.taskId,
        taskTitle: opts.taskTitle,
      });
      setConflictEval(evalResult);
      return 'conflict';
    },
    [activeTimers, labelFor, checkDistanceAndStart],
  );

  const cancelConflict = useCallback(() => {
    setPendingStart(null);
    setConflictEval(null);
  }, []);

  /**
   * User picked "Stoppa & byt". Stop the conflicting timer through the
   * unified engine (same break-prompt + save-then-stop rules), then start
   * the new one.
   */
  const confirmSwitch = useCallback(async () => {
    if (!pendingStart || !conflictEval) return;
    const { target, label, startedAtIso, taskId, taskTitle } = pendingStart;
    const { conflict } = conflictEval;
    setPendingStart(null);
    setConflictEval(null);

    const existing = activeTimers.get(conflict.key);
    if (!existing) {
      checkDistanceAndStart(target, { startedAtIso, label, taskId, taskTitle });
      return;
    }

    const stopTarget: WorkTarget = existing.locationId
      ? {
          kind: 'location',
          locationId: existing.locationId,
          name: existing.locationName || existing.client,
        }
      : existing.largeProjectId
        ? {
            kind: 'project',
            largeProjectId: existing.largeProjectId,
            name: existing.client,
          }
        : { kind: 'booking', bookingId: conflict.key, client: existing.client };

    try {
      const res = await stopSession(stopTarget);
      if (res.cancelled) return;
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte stoppa pågående timer');
      return;
    }
    checkDistanceAndStart(target, { startedAtIso, label, taskId, taskTitle });
  }, [
    pendingStart,
    conflictEval,
    activeTimers,
    stopSession,
    checkDistanceAndStart,
  ]);

  /** True if this exact target already has a running timer. */
  const isActive = useCallback(
    (target: WorkTarget) => activeTimers.has(resolveTargetKey(target)),
    [activeTimers],
  );

  /**
   * Awaitable start used by the arrival-prompt confirm flow.
   *
   * Same StartStatus contract as `requestStart`. Skips the distance dialog
   * (user has just confirmed they arrived). The arrival prompt must only
   * mark itself resolved on `started` / `already_running`.
   */
  const tryStartFromArrival = useCallback(
    async (
      target: WorkTarget,
      opts: RequestStartOptions = {},
    ): Promise<StartStatus> => {
      const label = opts.label ?? labelFor(target);
      const evalResult = evaluateStartConflict(target, activeTimers);

      if (evalResult.status === 'duplicate') return 'already_running';

      if (evalResult.status === 'switch') {
        // Defer to TimerConflictDialog; arrival caller must NOT mark resolved.
        setPendingStart({
          target,
          label,
          startedAtIso: opts.startedAtIso,
          taskId: opts.taskId,
          taskTitle: opts.taskTitle,
          suppressToast: opts.suppressToast,
        });
        setConflictEval(evalResult);
        return 'conflict';
      }

      // allow → run the real start chain (no distance dialog) and return
      // the actual outcome.
      return performStart(target, {
        startedAtIso: opts.startedAtIso,
        label,
        taskId: opts.taskId,
        taskTitle: opts.taskTitle,
        suppressToast: opts.suppressToast,
      });
    },
    [activeTimers, labelFor, performStart],
  );

  /**
   * Auto-switch from geofence arrival on workplace B while a timer for
   * workplace A is still running.
   *
   * Flow (no user prompt):
   *   1. evaluate concurrency. If `duplicate` → already_running. If `allow`
   *      → behaves identically to tryStartFromArrival.
   *   2. If `switch` → stop the conflicting timer at `departureAtIso`
   *      (defaults to arrival time of B), then start B at `arrivedAtIso`.
   *   3. Emit a `geofence_auto_switch` assistant_event with metadata
   *      (previous_target / next_target / departure_at / arrival_at /
   *      confidence) so admin can audit the transition.
   *
   * Caller (geofence ENTER) is responsible for ensuring B is a known and
   * stable arrival before invoking this. Workday is preserved (stopSession
   * never ends the day; performStart re-uses the open workday).
   */
  const tryAutoSwitchFromArrival = useCallback(
    async (
      target: WorkTarget,
      opts: RequestStartOptions & {
        departureAtIso?: string;
        confidence?: 'high' | 'medium' | 'low';
        switchMetadata?: Record<string, unknown>;
      } = {},
    ): Promise<StartStatus> => {
      const label = opts.label ?? labelFor(target);
      const evalResult = evaluateStartConflict(target, activeTimers);

      if (evalResult.status === 'duplicate') return 'already_running';

      if (evalResult.status === 'allow') {
        return performStart(target, {
          startedAtIso: opts.startedAtIso,
          label,
          taskId: opts.taskId,
          taskTitle: opts.taskTitle,
          suppressToast: opts.suppressToast,
        });
      }

      // status === 'switch' → auto-switch silently.
      const arrivedAtIso = opts.startedAtIso ?? new Date().toISOString();
      const departureAtIso = opts.departureAtIso ?? arrivedAtIso;
      const conflict = evalResult.conflict;
      const existing = activeTimers.get(conflict.key);

      let prevTargetType: 'booking' | 'project' | 'location' | null = null;
      let prevTargetId: string | null = null;
      let prevLabel: string | null = conflict.label;

      if (existing) {
        const stopTarget = timerToTarget(conflict.key, existing);
        prevTargetType = stopTarget.kind;
        prevTargetId =
          stopTarget.kind === 'booking'
            ? stopTarget.bookingId
            : stopTarget.kind === 'project'
              ? stopTarget.largeProjectId
              : stopTarget.locationId;
        prevLabel =
          stopTarget.kind === 'booking'
            ? stopTarget.client
            : stopTarget.name;

        try {
          const res = await stopSession(stopTarget, {
            stopAtIso: departureAtIso,
          });
          if (res?.cancelled) {
            // User-cancellable break-prompt etc. should not happen on the
            // auto-switch path (geofence is silent), but bail safely.
            return 'start_failed';
          }
        } catch (err: any) {
          console.warn('[AutoSwitch] stopSession threw:', err);
          return 'start_failed';
        }
      }

      const startStatus = await performStart(target, {
        startedAtIso: arrivedAtIso,
        label,
        taskId: opts.taskId,
        taskTitle: opts.taskTitle,
        suppressToast: true,
      });

      if (startStatus === 'started' || startStatus === 'already_running') {
        const nextTargetId =
          target.kind === 'booking'
            ? target.bookingId
            : target.kind === 'project'
              ? target.largeProjectId
              : target.locationId;

        // Audit event so admin can see exactly why a switch occurred.
        void mobileApi.assistantEvents
          .create({
            event_type: 'arrival',
            target_type: target.kind,
            target_id: nextTargetId,
            target_label: label,
            happened_at: arrivedAtIso,
            source: 'geofence',
            suggested_action: 'auto_switched_activity',
            metadata: {
              source: 'geofence_auto_switch',
              previous_target: prevTargetId
                ? {
                    kind: prevTargetType,
                    id: prevTargetId,
                    label: prevLabel,
                  }
                : null,
              next_target: {
                kind: target.kind,
                id: nextTargetId,
                label,
              },
              departure_at: departureAtIso,
              arrival_at: arrivedAtIso,
              confidence: opts.confidence ?? 'high',
              ...(opts.switchMetadata ?? {}),
            },
          })
          .catch(() => {});

        // Soft toast so the user sees what happened.
        if (!opts.suppressToast) {
          toast.message(`Bytte aktivitet → ${label}`);
        }
      }

      return startStatus;
    },
    [activeTimers, labelFor, performStart, stopSession],
  );

  return {
    requestStart,
    tryStartFromArrival,
    tryAutoSwitchFromArrival,
    cancelConflict,
    confirmSwitch,
    conflictEval,
    pendingLabel: pendingStart?.label ?? '',
    distanceWarning,
    dismissDistanceWarning: () => setDistanceWarning(null),
    isActive,
    activeTimers,
  };
}
