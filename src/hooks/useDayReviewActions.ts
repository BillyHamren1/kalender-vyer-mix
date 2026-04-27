/**
 * useDayReviewActions — orchestrerar de 7 åtgärderna i review-flödet.
 *
 * OFFICIELL TIDMODELL (Tidappen):
 *   • Dagtimer = hela arbetsdagen.
 *   • Aktivitet = projekt/plats/bokning inuti dagen.
 *   • Restid = GAPET mellan två aktiviteter när gapet är rimligt.
 *     Live GPS-travel är legacy/assist (se useTravelDetection) — denna
 *     hook är PRIMÄR källa för restidsjustering: `adjustTravel` skapar
 *     eller uppdaterar `travel_time_logs` baserat på det användaren
 *     bekräftar i day-review (typiskt: gapet mellan stopp och nästa start).
 *
 * Använder ENBART centrala flöden:
 *   • useTimerStartFlow.requestStart     — säker start (workday-first + conflict)
 *   • useWorkSession.stopSession         — säker stopp (break-prompt + time_report)
 *   • useWorkDay.ensureActive / end      — workday-livscykel
 *   • syncWorkDayEnd                     — server-anchored EOD
 *   • mobileApi.assistantEvents.resolve  — markera event löst / irrelevant
 *   • mobileApi.createTravelLog / stopTravelLog / setTravelTimes — travel
 *     (auktoritativ när användaren justerar i review; ej GPS-driven)
 *
 * INGEN egen direktskrivning mot time_reports/workdays/travel_time_logs.
 * Sidan (MobileDayReview) konsumerar denna hook och visar feedback via toast.
 */
import { useCallback } from 'react';
import { toast } from 'sonner';
import { useMobileBookings } from '@/hooks/useMobileData';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useTimerStartFlow } from '@/hooks/useTimerStartFlow';
import { useWorkSession, type WorkTarget } from '@/hooks/useWorkSession';
import { useWorkDay } from '@/hooks/useWorkDay';
import { endWorkdayFlow } from '@/services/workdayServerSync';
import { mobileApi } from '@/services/mobileApiService';

export type ReviewEventLite = {
  id: string;
  happened_at: string;
  event_type: string;
  target_label: string | null;
  target_type?: string | null;
  target_id?: string | null;
  suggested_action: string;
};

/**
 * Map ett review-event → WorkTarget.
 *
 * Läser PRIMÄRT från top-level kolumnerna `target_type` + `target_id`
 * (alltid satta av dual-write i mobile-app-api). Faller tillbaka till
 * `metadata.target_kind` / `metadata.target_id` för bakåtkompatibilitet
 * med tidigare events där metadata-spegling saknades.
 */
export function eventToTarget(
  ev: {
    event_type: string;
    target_label: string | null;
    target_type?: string | null;
    target_id?: string | null;
    metadata?: any;
  },
): WorkTarget | null {
  const meta = (ev as any)?.metadata || {};
  const kind = (ev.target_type ?? meta.target_kind) as string | undefined;
  const id = (ev.target_id ?? meta.target_id) as string | undefined;
  if (!kind || !id) return null;

  if (kind === 'project') {
    return { kind: 'project', largeProjectId: id, name: ev.target_label || 'Projekt' };
  }
  if (kind === 'location') {
    return {
      kind: 'location',
      locationId: id,
      name: ev.target_label || 'Plats',
      createsTimeReport: true,
    };
  }
  if (kind === 'booking') {
    return { kind: 'booking', bookingId: id, client: ev.target_label || 'Bokning' };
  }
  return null;
}

export interface DayReviewActions {
  /** 1. Starta arbete från eventets arrival-tid. */
  startWorkFromArrival: (ev: ReviewEventLite & { metadata?: any }) => Promise<void>;
  /** 2. Starta arbete nu (utan backdate). */
  startWorkNow: (ev: ReviewEventLite & { metadata?: any }) => Promise<void>;
  /** 3. Avsluta aktivitet vid eventets departure-tid. */
  endActivityAtDeparture: (ev: ReviewEventLite & { metadata?: any }) => Promise<void>;
  /** 4. Avsluta hela arbetsdagen vid hemkomst-tid. */
  endWorkDayAtHomeArrival: (ev: ReviewEventLite & { metadata?: any }) => Promise<void>;
  /** 5. Justera/registrera restid (start/slut). */
  adjustTravel: (input: {
    travel_log_id?: string;
    start_time: string;
    end_time?: string;
  }) => Promise<void>;
  /** 6. Markera ett event som irrelevant ("ignored_stale"). */
  dismissEvent: (eventId: string, note?: string) => Promise<void>;
  /** 7. Godkänn dagen. */
  approveWorkday: (workdayId: string) => Promise<void>;
}

export function useDayReviewActions(): DayReviewActions {
  const { staff } = useMobileAuth();
  const { data: bookings = [] } = useMobileBookings();
  const startFlow = useTimerStartFlow(bookings, staff?.id);
  const { stopSession } = useWorkSession(bookings, staff?.id);
  const { ensureActive: ensureWorkDay, current: currentWorkday } = useWorkDay();

  const resolveEvent = useCallback(
    async (
      event_id: string,
      resolution_status:
        | 'applied_from_event_time'
        | 'applied_from_now'
        | 'applied_from_custom_time'
        | 'dismissed'
        | 'ignored_stale',
      extra?: { note?: string; linked_workday_id?: string; linked_time_report_id?: string; linked_travel_log_id?: string },
    ) => {
      try {
        await mobileApi.assistantEvents.resolve({
          event_id,
          resolution_status,
          resolution_notes: extra?.note,
          linked_workday_id: extra?.linked_workday_id,
          linked_time_report_id: extra?.linked_time_report_id,
          linked_travel_log_id: extra?.linked_travel_log_id,
        });
      } catch (err) {
        console.warn('[DayReviewActions] resolve failed (non-fatal):', err);
      }
    },
    [],
  );

  const startWorkFromArrival = useCallback<DayReviewActions['startWorkFromArrival']>(
    async (ev) => {
      const target = eventToTarget(ev);
      if (!target) {
        toast.error('Saknar mål för detta event — händelsen kvarstår');
        return;
      }
      // Awaitbar väg via tryStartFromArrival: vi resolvar EVENTET endast
      // efter att hela start-kedjan (workday-first + activity start) lyckats.
      try {
        const result = await startFlow.tryStartFromArrival(target, {
          startedAtIso: ev.happened_at,
        });
        if (result === 'started') {
          toast.success('Arbete startat från ankomsttid');
          await resolveEvent(ev.id, 'applied_from_event_time');
        } else if (result === 'duplicate') {
          toast.info('Aktivitet redan igång — markerar händelsen som hanterad');
          await resolveEvent(ev.id, 'auto_closed_by_later_action' as any);
        } else if (result === 'conflict') {
          // Konfliktdialogen tar över — eventet förblir öppet tills användaren
          // bekräftar bytet och en ny start sker. Ingen resolve här.
          toast.message('Lös pågående timer-konflikt först — händelsen kvarstår');
        } else if (result === 'workday-failed') {
          // performStart har redan visat ett tydligt felmeddelande.
          toast.error('Arbetsdagen kunde inte säkerställas — händelsen kvarstår');
        }
      } catch (err: any) {
        console.error('[DayReviewActions] startWorkFromArrival failed:', err);
        toast.error(err?.message || 'Kunde inte starta arbetet — händelsen kvarstår');
      }
    },
    [startFlow, resolveEvent],
  );

  const startWorkNow = useCallback<DayReviewActions['startWorkNow']>(
    async (ev) => {
      const target = eventToTarget(ev);
      if (!target) {
        toast.error('Saknar mål för detta event — händelsen kvarstår');
        return;
      }
      try {
        // Använd tryStartFromArrival utan startedAtIso → "nu". Awaitbar och
        // ger samma garantier (workday-first + verifierad start) som arrival.
        const result = await startFlow.tryStartFromArrival(target);
        if (result === 'started') {
          toast.success('Arbete startat nu');
          await resolveEvent(ev.id, 'applied_from_now');
        } else if (result === 'duplicate') {
          toast.info('Redan igång — markerar händelsen som hanterad');
          await resolveEvent(ev.id, 'auto_closed_by_later_action' as any);
        } else if (result === 'conflict') {
          toast.message('Lös pågående timer-konflikt först — händelsen kvarstår');
        } else if (result === 'workday-failed') {
          toast.error('Arbetsdagen kunde inte säkerställas — händelsen kvarstår');
        }
      } catch (err: any) {
        console.error('[DayReviewActions] startWorkNow failed:', err);
        toast.error(err?.message || 'Kunde inte starta arbetet — händelsen kvarstår');
      }
    },
    [startFlow, resolveEvent],
  );

  const endActivityAtDeparture = useCallback<DayReviewActions['endActivityAtDeparture']>(
    async (ev) => {
      const target = eventToTarget(ev);
      if (!target) {
        toast.error('Saknar mål för detta event');
        return;
      }
      try {
        const res = await stopSession(target, { stopAtIso: ev.happened_at });
        if (res.saved) {
          toast.success('Aktivitet avslutad vid avgångstid');
          await resolveEvent(ev.id, 'applied_from_event_time');
        } else if (res.cancelled) {
          toast.info('Avbruten');
        } else {
          toast.warning('Ingen aktiv timer att stoppa — markerar händelsen ändå');
          await resolveEvent(ev.id, 'auto_closed_by_later_action' as any);
        }
      } catch (err: any) {
        toast.error(err?.message || 'Kunde inte avsluta aktivitet');
      }
    },
    [stopSession, resolveEvent],
  );

  const endWorkDayAtHomeArrival = useCallback<DayReviewActions['endWorkDayAtHomeArrival']>(
    async (ev) => {
      try {
        const result = await endWorkdayFlow({ endedAtIso: ev.happened_at });
        if (!result.ok) {
          toast.error(`Kunde inte avsluta arbetsdag: ${result.error || 'okänt fel'}`);
          return;
        }
        toast.success('Arbetsdag avslutad vid hemkomst');
        await resolveEvent(ev.id, 'applied_from_event_time', {
          linked_workday_id: currentWorkday?.id,
        });
      } catch (err: any) {
        toast.error(err?.message || 'Kunde inte avsluta arbetsdag');
      }
    },
    [currentWorkday, resolveEvent],
  );

  const adjustTravel = useCallback<DayReviewActions['adjustTravel']>(
    async ({ travel_log_id, start_time, end_time }) => {
      try {
        if (travel_log_id) {
          await mobileApi.setTravelTimes({ travel_log_id, start_time, end_time });
          toast.success('Restid uppdaterad');
        } else {
          const created = await mobileApi.createTravelLog({});
          const newId = created?.travel_log?.id;
          if (newId) {
            await mobileApi.setTravelTimes({ travel_log_id: newId, start_time, end_time });
            toast.success('Restid registrerad');
          } else {
            toast.error('Kunde inte skapa restid');
          }
        }
      } catch (err: any) {
        toast.error(err?.message || 'Kunde inte spara restid');
      }
    },
    [],
  );

  const dismissEvent = useCallback<DayReviewActions['dismissEvent']>(
    async (eventId, note) => {
      await resolveEvent(eventId, 'ignored_stale', { note: note || 'Markerad som irrelevant av användaren' });
      toast.success('Händelse markerad som irrelevant');
    },
    [resolveEvent],
  );

  const approveWorkday = useCallback<DayReviewActions['approveWorkday']>(
    async (workdayId) => {
      try {
        await mobileApi.approveWorkday(workdayId);
        toast.success('Dagen godkänd');
      } catch (err: any) {
        toast.error(err?.message || 'Kunde inte godkänna dagen');
      }
    },
    [],
  );

  return {
    startWorkFromArrival,
    startWorkNow,
    endActivityAtDeparture,
    endWorkDayAtHomeArrival,
    adjustTravel,
    dismissEvent,
    approveWorkday,
  };
}
