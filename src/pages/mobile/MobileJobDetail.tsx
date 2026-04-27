import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MobileBooking } from '@/services/mobileApiService';
import { useWorkSession } from '@/hooks/useWorkSession';
import { useTimerStartFlow } from '@/hooks/useTimerStartFlow';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useMobileBookingDetails, useInvalidateMobileData } from '@/hooks/useMobileData';
import { parseISO, differenceInSeconds } from 'date-fns';
import { sv } from 'date-fns/locale';
import { ArrowLeft, Play, Square, MapPin, Navigation, Phone, Mail, User, Clock, Loader2, ChevronDown, FolderOpen } from 'lucide-react';
import { MobileBackHeader } from '@/components/mobile-app/MobileHeader';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import JobInfoTab from '@/components/mobile-app/job-tabs/JobInfoTab';
import JobTeamTab from '@/components/mobile-app/job-tabs/JobTeamTab';
import JobPhotosTab from '@/components/mobile-app/job-tabs/JobPhotosTab';
import JobCostsTab from '@/components/mobile-app/job-tabs/JobCostsTab';
import JobTimeTab from '@/components/mobile-app/job-tabs/JobTimeTab';
import { CheckCircle2 } from 'lucide-react';
import DistanceWarningDialog from '@/components/mobile-app/DistanceWarningDialog';
import { TimerConflictDialog } from '@/components/mobile-app/TimerConflictDialog';
import { useLanguage } from '@/i18n/LanguageContext';

const tabs = ['Info', 'Team', 'Photos', 'Costs', 'Time'] as const;
type TabKey = typeof tabs[number];

interface TaskOption {
  id: string;
  title: string;
}

const MobileJobDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { staff } = useMobileAuth();
  const { data: bookingData, isLoading } = useMobileBookingDetails(id);
  const { t } = useLanguage();
  const { invalidateTimeReports, invalidateBookingDetails } = useInvalidateMobileData();
  const booking = bookingData?.booking ?? null;
  const [activeTab, setActiveTab] = useState<TabKey>('Info');
  const [timerElapsed, setTimerElapsed] = useState(0);
  const [showTaskPicker, setShowTaskPicker] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const bookingsArr = useMemo(() => booking ? [booking as MobileBooking] : [], [booking]);
  // STOP via useWorkSession (unified engine).
  // START via useTimerStartFlow (workday-first guarantee + conflict + distance).
  const { activeTimers, stopSession, dialogs } = useWorkSession(bookingsArr, staff?.id);
  const {
    requestStart,
    cancelConflict,
    confirmSwitch,
    conflictEval,
    pendingLabel,
    distanceWarning,
    dismissDistanceWarning,
  } = useTimerStartFlow(bookingsArr, staff?.id);

  // If this booking belongs to a large project, all time is reported on the
  // project total (not per sub-booking). Hide the standalone timer here and
  // direct the user back to the project card to start/stop.
  const largeProjectId = (booking as any)?.large_project_id ?? null;
  const isProjectBooking = Boolean(largeProjectId);

  const currentTimer = id ? activeTimers.get(id) : undefined;

  // Get user's assigned pending tasks for the task picker
  const myPendingTasks: TaskOption[] = useMemo(() => {
    const tasks = bookingData?.establishment_tasks;
    if (!tasks || !staff?.id) return [];
    return tasks
      .filter((t: any) => {
        if (t.completed) return false;
        const assignedIds = t.assigned_to_ids || [];
        const legacyAssigned = t.assigned_to;
        return assignedIds.includes(staff.id) || legacyAssigned === staff.id;
      })
      .map((t: any) => ({ id: t.id, title: t.title }));
  }, [bookingData?.establishment_tasks, staff?.id]);

  // Auto-select if only one task
  useEffect(() => {
    if (myPendingTasks.length === 1 && !selectedTaskId) {
      setSelectedTaskId(myPendingTasks[0].id);
    }
  }, [myPendingTasks, selectedTaskId]);

  useEffect(() => {
    if (!currentTimer) { setTimerElapsed(0); return; }
    const interval = setInterval(() => {
      setTimerElapsed(differenceInSeconds(new Date(), parseISO(currentTimer.startTime)));
    }, 1000);
    return () => clearInterval(interval);
  }, [currentTimer]);

  const formatTimer = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const selectedTaskTitle = myPendingTasks.find(t => t.id === selectedTaskId)?.title;

  const handleTimerToggle = async () => {
    if (!id || !booking) return;
    if (currentTimer) {
      // STOP — unified engine handles break decision + save-then-stop.
      try {
        const res = await stopSession({ kind: 'booking', bookingId: id, client: booking.client });
        if (res.cancelled) return;
        if (res.saved) {
          invalidateTimeReports();
          toast.success(t('time.savedHours' as any, { h: res.hoursWorked }) || `Time report saved: ${res.hoursWorked}h`);
        }
      } catch (err: any) {
        toast.error(err.message || t('time.couldNotSave' as any));
      }
    } else {
      // START — UNIFIED START FLOW. requestStart guarantees a workday is
      // active before any activity starts (workday-first), and routes
      // through the same conflict + distance machinery as every other
      // surface in the mobile app. Direct startSession is forbidden.
      const target = { kind: 'booking' as const, bookingId: id, client: booking.client };
      requestStart(target, {
        taskId: selectedTaskId || undefined,
        taskTitle: selectedTaskTitle || undefined,
      });
    }
  };

  const openNavigation = () => {
    if (!booking) return;
    const { delivery_latitude, delivery_longitude, deliveryaddress } = booking;
    if (delivery_latitude && delivery_longitude) {
      window.open(`https://maps.google.com/maps?daddr=${delivery_latitude},${delivery_longitude}`, '_blank');
    } else if (deliveryaddress) {
      window.open(`https://maps.google.com/maps?daddr=${encodeURIComponent(deliveryaddress)}`, '_blank');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-card">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-card">
        <p className="text-muted-foreground">Job not found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-card pb-24">
      {/* Header */}
      <MobileBackHeader
        title={booking.client}
        subtitle={booking.booking_number ? `#${booking.booking_number}` : undefined}
        backTo="/m"
        rightAction={
          isProjectBooking ? (
            <button
              onClick={() => navigate(`/m/project/${largeProjectId}`)}
              className="h-9 px-3 rounded-full flex items-center justify-center gap-1.5 bg-primary-foreground text-primary text-xs font-semibold active:scale-95 transition-all shadow-md"
              title="Tidrapportering sker på projektnivå"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              Projekt
            </button>
          ) : (
            <button
              onClick={handleTimerToggle}
              className={cn(
                "w-11 h-11 rounded-full flex items-center justify-center active:scale-95 transition-all shadow-md relative",
                currentTimer
                  ? "bg-destructive text-destructive-foreground animate-pulse"
                  : "bg-primary-foreground text-primary"
              )}
            >
              {currentTimer ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>
          )
        }
      />

      {/* Project info banner — clarifies that time is reported on the project, not the booking */}
      {isProjectBooking && (
        <div className="mx-4 mt-3 p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-start gap-2.5">
          <FolderOpen className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-foreground">Del av stort projekt</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              Tidrapportering sker på projektkortet. Den här vyn visar adress, kontakt och leveransinfo.
            </p>
          </div>
        </div>
      )}

      {/* Timer info bar */}
      {!isProjectBooking && currentTimer && (
        <div className="text-center py-1.5 bg-primary/5">
          <span className="text-xs font-mono text-primary bg-primary/10 px-3 py-1 rounded-full">
            <Clock className="w-3 h-3 inline mr-1" />{formatTimer(timerElapsed)}
          </span>
          {currentTimer.establishmentTaskTitle && (
            <p className="text-[10px] text-muted-foreground mt-0.5">{currentTimer.establishmentTaskTitle}</p>
          )}
        </div>
      )}

      {/* Task picker — only shown when timer is NOT running, there are tasks, and this isn't a project sub-booking */}
      {!isProjectBooking && !currentTimer && myPendingTasks.length > 0 && (
        <div className="mx-4 mt-2">
          <button
            onClick={() => setShowTaskPicker(!showTaskPicker)}
            className="w-full flex items-center justify-between p-2.5 rounded-xl border border-border bg-muted/30 text-left"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Activity for timer</p>
              <p className="text-sm font-medium text-foreground truncate">
                {selectedTaskId ? selectedTaskTitle : 'None selected (optional)'}
              </p>
            </div>
            <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", showTaskPicker && "rotate-180")} />
          </button>
          {showTaskPicker && (
            <div className="mt-1 rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <button
                onClick={() => { setSelectedTaskId(null); setShowTaskPicker(false); }}
                className={cn(
                  "w-full text-left px-3 py-2.5 text-sm border-b border-border/50",
                  !selectedTaskId ? "bg-primary/5 text-primary font-semibold" : "text-muted-foreground"
                )}
              >
                No specific activity
              </button>
              {myPendingTasks.map(task => (
                <button
                  key={task.id}
                  onClick={() => { setSelectedTaskId(task.id); setShowTaskPicker(false); }}
                  className={cn(
                    "w-full text-left px-3 py-2.5 text-sm border-b border-border/50 last:border-b-0",
                    selectedTaskId === task.id ? "bg-primary/5 text-primary font-semibold" : "text-foreground"
                  )}
                >
                  {task.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {booking.deliveryaddress && (
        <button
          onClick={openNavigation}
          className="mx-4 mt-3 p-3.5 rounded-2xl bg-card border border-primary flex items-center gap-2.5 w-[calc(100%-2rem)] text-left active:scale-[0.98] transition-all"
        >
          <MapPin className="w-4 h-4 text-primary shrink-0" />
          <span className="text-foreground font-medium text-sm flex-1">{booking.deliveryaddress}</span>
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shrink-0">
            <Navigation className="w-4 h-4 text-primary-foreground" />
          </div>
        </button>
      )}

      {(booking.contact_name || booking.contact_phone || booking.contact_email) && (
        <div className="mx-4 mt-2 p-3 rounded-2xl bg-card border border-border space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <User className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {t('contact.label' as any) || 'Kontaktperson'}
            </span>
          </div>
          {booking.contact_name && (
            <p className="text-sm font-semibold text-foreground">{booking.contact_name}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {booking.contact_phone && (
              <a
                href={`tel:${booking.contact_phone.replace(/\s+/g, '')}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium active:scale-95 transition-all"
              >
                <Phone className="w-3.5 h-3.5" />
                {booking.contact_phone}
              </a>
            )}
            {booking.contact_email && (
              <a
                href={`mailto:${booking.contact_email}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-foreground text-xs font-medium active:scale-95 transition-all"
              >
                <Mail className="w-3.5 h-3.5" />
                <span className="truncate max-w-[180px]">{booking.contact_email}</span>
              </a>
            )}
          </div>
        </div>
      )}

      {/* Tab navigation */}
      <div className="px-4 pt-2.5">
        <div className="flex gap-0.5 bg-muted/50 rounded-xl p-0.5">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-1 py-2 text-[11px] font-semibold rounded-lg transition-all duration-200",
                activeTab === tab
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground"
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 px-4 py-3">
        {activeTab === 'Info' && <JobInfoTab booking={booking} bookingId={booking.id} establishmentTasks={bookingData?.establishment_tasks} onCommentsUpdated={() => invalidateBookingDetails(booking.id)} onTaskToggled={() => invalidateBookingDetails(booking.id)} />}
        {activeTab === 'Team' && <JobTeamTab bookingId={booking.id} />}
        {activeTab === 'Photos' && <JobPhotosTab bookingId={booking.id} />}
        {activeTab === 'Costs' && <JobCostsTab bookingId={booking.id} />}
        {activeTab === 'Time' && <JobTimeTab bookingId={booking.id} timeReports={bookingData?.my_time_reports} />}
      </div>

      {/* Avsluta jobb button */}
      <div className="px-4 pb-4">
        <Button
          onClick={() => navigate(`/m/job/${id}/complete`)}
          variant="outline"
          className="w-full h-12 rounded-xl border-primary text-primary font-semibold text-base"
        >
          <CheckCircle2 className="w-5 h-5 mr-2" />
          Complete job
        </Button>
      </div>

      <DistanceWarningDialog
        open={!!distanceWarning}
        onOpenChange={(open) => { if (!open) dismissDistanceWarning(); }}
        placeName={distanceWarning?.placeName || ''}
        distanceMeters={distanceWarning?.distance || 0}
        onConfirm={() => {
          distanceWarning?.onConfirm();
          dismissDistanceWarning();
        }}
      />
      <TimerConflictDialog
        open={!!conflictEval}
        evaluation={conflictEval}
        newTargetLabel={pendingLabel}
        onCancel={cancelConflict}
        onSwitch={confirmSwitch}
      />
      {dialogs}
    </div>
  );
};

export default MobileJobDetail;
