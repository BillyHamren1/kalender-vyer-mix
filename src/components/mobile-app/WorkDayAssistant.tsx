// LEGACY_DO_NOT_IMPORT_TIME_ENGINE_V3
// Timer 1.8 — kvar i kodbasen för testkontrakt och historisk referens.
// FÅR INTE importeras från aktiv personalapp (mobile/scanner) eller från
// admin/Time Engine. Single source of truth = active_time_registrations +
// WorkDayPanel + staff_day_report_cache.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sun, Coffee, MoonStar } from 'lucide-react';
import type {
  AssistantDecision,
  DaystartDecision,
  LongPassNoBreakDecision,
  LastWorkplaceForDayDecision,
  ActivityLeaveDecision,
  LateAfterPlannedStartDecision,
} from '@/hooks/useWorkDayAssistant';
import { mobileApi } from '@/services/mobileApiService';
import { useWorkSession, type WorkTarget } from '@/hooks/useWorkSession';
import { useMobileBookings } from '@/hooks/useMobileData';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { ActivityLeaveDialog } from './ActivityLeaveDialog';
import { LateAfterPlannedStartDialog } from './LateAfterPlannedStartDialog';
import { useLanguage } from '@/i18n/LanguageContext';
import { workdayApi } from '@/services/workdayApi';

interface Props {
  decision: AssistantDecision | null;
  onAcknowledge: () => void;
}

export const WorkDayAssistant: React.FC<Props> = ({ decision, onAcknowledge }) => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { staff } = useMobileAuth();
  const { data: bookings = [] } = useMobileBookings();
  const { stopSession, dialogs: workSessionDialogs } = useWorkSession(
    bookings,
    staff?.id,
  );
  const [submitting, setSubmitting] = useState(false);

  if (!decision) {
    return <>{workSessionDialogs}</>;
  }

  const targetFromTimer = (
    timerKey: string,
    timer: ActivityLeaveDecision['timer'] | LongPassNoBreakDecision['timer'],
  ): WorkTarget => {
    if (timer.locationId) {
      return {
        kind: 'location',
        locationId: timer.locationId,
        name: timer.locationName || timer.client,
      };
    }
    if (timer.largeProjectId) {
      return {
        kind: 'project',
        largeProjectId: timer.largeProjectId,
        name: timer.client,
      };
    }
    return { kind: 'booking', bookingId: timerKey, client: timer.client };
  };

  if (decision.kind === 'daystart') {
    const d = decision as DaystartDecision;
    return (
      <>
        <Dialog open onOpenChange={(o) => !o && onAcknowledge()}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sun className="h-5 w-5 text-primary" />
                {t('assistant.morningTitle')}
              </DialogTitle>
              <DialogDescription>
                {d.arrivedAtWorkplace
                  ? t('assistant.morningAtWorkplace')
                  : t('assistant.morningGeneric')}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={onAcknowledge} className="w-full sm:w-auto">
                {t('assistant.notNow')}
              </Button>
              <Button
                onClick={() => {
                  navigate('/m/jobs');
                  onAcknowledge();
                }}
                className="w-full sm:w-auto"
              >
                {t('assistant.showJobs')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {workSessionDialogs}
      </>
    );
  }

  if (decision.kind === 'activity_leave') {
    const d = decision as ActivityLeaveDecision;
    const handleStopActivity = async () => {
      setSubmitting(true);
      try {
        const target = targetFromTimer(d.timerKey, d.timer);
        const res = await stopSession(target);
        if (res.cancelled) {
          onAcknowledge();
          return;
        }
        if (res.saved) {
          toast.success(
            target.kind === 'location'
              ? t('assistant.activityEnded')
              : t('assistant.reportSaved', { hours: res.hoursWorked ?? '' }),
          );
        }
        onAcknowledge();
      } catch (err: any) {
        toast.error(err?.message || t('assistant.couldNotEnd'));
      } finally {
        setSubmitting(false);
      }
    };

    const handleKeepRunning = () => {
      onAcknowledge();
    };

    const handleCreateAnomaly = async () => {
      setSubmitting(true);
      try {
        await mobileApi.createEndOfDayAnomaly({
          started_at: d.outsideSinceIso,
          ended_at: new Date().toISOString(),
          work_description: `Användaren markerade glapp vid ${
            d.timer.locationName || d.timer.client
          } — assistant-detected leave (${d.distanceMeters} m / ${d.outsideMinutes} min utanför)`,
          location_id: d.timer.locationId || undefined,
          booking_id: d.timer.locationId || d.timer.largeProjectId ? undefined : d.timerKey,
          large_project_id: d.timer.largeProjectId || undefined,
        });
        toast.success(t('assistant.gapMarked'));
      } catch (err: any) {
        toast.error(err?.message || t('assistant.couldNotMark'));
      } finally {
        setSubmitting(false);
        onAcknowledge();
      }
    };

    return (
      <>
        <ActivityLeaveDialog
          open
          onOpenChange={(o) => !o && onAcknowledge()}
          decision={d}
          submitting={submitting}
          onStopActivity={handleStopActivity}
          onKeepRunning={handleKeepRunning}
          onCreateAnomaly={handleCreateAnomaly}
        />
        {workSessionDialogs}
      </>
    );
  }

  if (decision.kind === 'long_pass_no_break') {
    const d = decision as LongPassNoBreakDecision;
    return (
      <>
        <Dialog open onOpenChange={(o) => !o && onAcknowledge()}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Coffee className="h-5 w-5 text-primary" />
                {t('assistant.longShiftTitle')}
              </DialogTitle>
              <DialogDescription>
                {t('assistant.longShiftBody', {
                  place: d.timer.locationName || d.timer.client,
                  hours: d.passHours.toFixed(1),
                })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={onAcknowledge} className="w-full sm:w-auto">
                {t('assistant.remindLater')}
              </Button>
              <Button
                onClick={async () => {
                  setSubmitting(true);
                  try {
                    const target = targetFromTimer(d.timerKey, d.timer);
                    const res = await stopSession(target);
                    if (res.saved) {
                      toast.success(t('assistant.reportSaved', { hours: res.hoursWorked ?? '' }));
                    }
                  } catch (err: any) {
                    toast.error(err?.message || t('assistant.couldNotStop'));
                  } finally {
                    setSubmitting(false);
                    onAcknowledge();
                  }
                }}
                disabled={submitting}
                className="w-full sm:w-auto"
              >
                {t('assistant.endNowAskBreak')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {workSessionDialogs}
      </>
    );
  }

  if (decision.kind === 'last_workplace_for_day') {
    const d = decision as LastWorkplaceForDayDecision;
    return (
      <>
        <Dialog open onOpenChange={(o) => !o && onAcknowledge()}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MoonStar className="h-5 w-5 text-primary" />
                {t('assistant.endDayQ')}
              </DialogTitle>
              <DialogDescription>
                {t('assistant.endDayBody', {
                  place: d.locationName || t('assistant.workplaceFallback'),
                })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={onAcknowledge} className="w-full sm:w-auto">
                {t('assistant.notYet')}
              </Button>
              <Button
                onClick={() => {
                  navigate('/m');
                  window.dispatchEvent(new CustomEvent('request-end-day', {
                    detail: { source: 'assistant_last_workplace_for_day' },
                  }));
                  onAcknowledge();
                }}
                className="w-full sm:w-auto"
              >
                {t('assistant.endDay')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {workSessionDialogs}
      </>
    );
  }

  if (decision.kind === 'late_after_planned_start') {
    const d = decision as LateAfterPlannedStartDecision;
    const handleChoose = async (
      choice: 'planned' | 'first_signal' | 'custom' | 'did_not_work',
      customIso?: string,
    ) => {
      if (choice === 'did_not_work') {
        try {
          await mobileApi.createWorkdayFlag({
            flag_type: 'planned_time_without_signal',
            flag_date: d.plannedStartIso.slice(0, 10),
            title: 'Markerad: jobbade inte planerad tid',
            description: `Planerad start ${d.plannedStartIso}, första signal ${d.firstSignalIso}. Användaren angav att hen inte jobbade.`,
            severity: 'info',
            needs_user_input: false,
            context: {
              source: 'assistant_late_after_planned_start',
              user_choice: 'did_not_work',
              planned_start_iso: d.plannedStartIso,
              first_gps_at: d.firstSignalIso,
            },
          });
          toast.success(t('assistant.lateMarkedAbsent'));
        } catch (err: any) {
          toast.error(err?.message || t('assistant.couldNotSave'));
        } finally {
          onAcknowledge();
        }
        return;
      }

      const startedAtIso =
        choice === 'planned' ? d.plannedStartIso
        : choice === 'first_signal' ? d.firstSignalIso
        : customIso || d.firstSignalIso;

      const sourceTag =
        choice === 'planned' ? 'user_confirmed_assignment_start'
        : choice === 'first_signal' ? 'user_confirmed_first_gps'
        : 'user_confirmed_custom_start';

      const notes = JSON.stringify({
        source: sourceTag,
        no_signal_until: d.firstSignalIso,
        first_gps_at: d.firstSignalIso,
        planned_start_iso: d.plannedStartIso,
        late_minutes: d.lateMinutes,
        assistant_origin: 'late_after_planned_start',
      });

      setSubmitting(true);
      try {
        await workdayApi.start({ startedAtIso, notes });
        window.dispatchEvent(new CustomEvent('workday-started', {
          detail: { source: sourceTag, startedAtIso },
        }));
        toast.success(t('assistant.workdayStartedAt', {
          time: new Date(startedAtIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }));
      } catch (err: any) {
        toast.error(err?.message || t('assistant.couldNotStart'));
      } finally {
        setSubmitting(false);
        onAcknowledge();
      }
    };

    return (
      <>
        <LateAfterPlannedStartDialog
          open
          onOpenChange={(o) => !o && onAcknowledge()}
          decision={d}
          submitting={submitting}
          onChoose={handleChoose}
        />
        {workSessionDialogs}
      </>
    );
  }

  return <>{workSessionDialogs}</>;
};

export default WorkDayAssistant;
