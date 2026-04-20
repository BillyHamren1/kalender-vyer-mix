import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Clock, Square, Play, Check, Building2, Loader2, Users, MapPin, Navigation } from 'lucide-react';
import { mobileApi } from '@/services/mobileApiService';
import { useMobileBookings } from '@/hooks/useMobileData';
import { useWorkSession, WorkTarget } from '@/hooks/useWorkSession';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useLanguage } from '@/i18n/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { MobileBackHeader } from '@/components/mobile-app/MobileHeader';
import LagerTeamSection from '@/components/mobile-app/lager/LagerTeamSection';
import LagerExpensesSection from '@/components/mobile-app/lager/LagerExpensesSection';
import LagerPhotosSection from '@/components/mobile-app/lager/LagerPhotosSection';
import { evaluateStartConflict, type StartEvaluation } from '@/lib/timerConcurrency';
import { TimerConflictDialog } from '@/components/mobile-app/TimerConflictDialog';
import DistanceWarningDialog from '@/components/mobile-app/DistanceWarningDialog';

interface LagerTask {
  id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  assigned_to_ids: string[] | null;
  completed: boolean;
}

const tabs = ['Info', 'Team', 'Photos', 'Costs'] as const;
type TabKey = typeof tabs[number];

const MobileLocationDetail = () => {
  const { id: locationId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { staff } = useMobileAuth();
  const { t } = useLanguage();
  const { data: bookings = [] } = useMobileBookings();
  const { activeTimers, geo, startSession, startSessionWithDistanceCheck, stopSession, dialogs } = useWorkSession(bookings, staff?.id);
  const { orgLocations } = geo;

  const [activeTab, setActiveTab] = useState<TabKey>('Info');
  const [loading, setLoading] = useState(true);
  const [myTasks, setMyTasks] = useState<LagerTask[]>([]);
  const [openTasks, setOpenTasks] = useState<LagerTask[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [assignToMe, setAssignToMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [, setTick] = useState(0);
  // Rule-based concurrency replaces the legacy "max one timer total" hard
  // block. Two timers may coexist (e.g. Lager presence + active booking) —
  // only incompatible kinds open the switch dialog.
  const [pendingStart, setPendingStart] = useState<{ label: string; doStart: () => void } | null>(null);
  const [conflictEval, setConflictEval] = useState<
    Extract<StartEvaluation, { status: 'switch' }> | null
  >(null);
  // Distance-warning dialog state — populated by startSessionWithDistanceCheck
  // when the user is outside the location's geofence radius.
  const [distanceWarning, setDistanceWarning] = useState<{ placeName: string; distance: number; onConfirm: () => void } | null>(null);

  const location = orgLocations.find((l) => l.id === locationId) || null;
  const locKey = `location-${locationId}`;
  const hasLocationTimer = activeTimers.has(locKey);
  const currentTimer = activeTimers.get(locKey);

  // tick for elapsed display
  useEffect(() => {
    if (activeTimers.size === 0) return;
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [activeTimers.size]);

  const loadTasks = async () => {
    try {
      const tasksRes = await mobileApi.getLagerTasks();
      setMyTasks(tasksRes.my_tasks || []);
      setOpenTasks(tasksRes.open_tasks || []);
    } catch (e) {
      console.error(e);
      toast.error('Kunde inte ladda uppgifter');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  const formatElapsed = (startIso: string) => {
    const secs = Math.floor((Date.now() - new Date(startIso).getTime()) / 1000);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Pure fixed-location presence target (no time_report on stop).
  const locationTarget: WorkTarget | null = location
    ? { kind: 'location', locationId: location.id, name: location.name, createsTimeReport: false }
    : null;

  /**
   * Check rule-based concurrency, then either start, ignore, or open the
   * switch dialog. Used by both the header play button and per-task starts.
   */
  const requestStart = (label: string, doStart: () => void) => {
    if (!locationTarget) return;
    const evalResult = evaluateStartConflict(locationTarget, activeTimers);
    if (evalResult.status === 'duplicate') return;
    if (evalResult.status === 'allow') {
      doStart();
      return;
    }
    setPendingStart({ label, doStart });
    setConflictEval(evalResult);
  };

  const cancelConflict = () => {
    setPendingStart(null);
    setConflictEval(null);
  };

  const confirmSwitch = async () => {
    if (!pendingStart || !conflictEval) return;
    const { conflict } = conflictEval;
    const { doStart } = pendingStart;
    cancelConflict();
    const existing = activeTimers.get(conflict.key);
    if (!existing) {
      doStart();
      return;
    }
    const stopTarget: WorkTarget = existing.locationId
      ? {
          kind: 'location',
          locationId: existing.locationId,
          name: existing.locationName || existing.client,
          createsTimeReport: false,
        }
      : existing.largeProjectId
        ? { kind: 'project', largeProjectId: existing.largeProjectId, name: existing.client }
        : { kind: 'booking', bookingId: conflict.key, client: existing.client };
    try {
      const res = await stopSession(stopTarget);
      if (res.cancelled) return;
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte stoppa pågående timer');
      return;
    }
    doStart();
  };

  const handleStartTaskTimer = (task: LagerTask) => {
    if (!locationTarget) return;
    requestStart(task.title, () => {
      const opts = { taskId: task.id, taskTitle: task.title };
      const successToast = () => toast.success(`${t('timer.started')}: ${task.title}`);
      const started = startSessionWithDistanceCheck(locationTarget, opts, ({ placeName, distance, confirm }) => {
        setDistanceWarning({
          placeName,
          distance,
          onConfirm: () => { confirm(); successToast(); },
        });
      });
      if (started) successToast();
    });
  };

  const handleStartGeneralTimer = () => {
    if (!locationTarget) return;
    requestStart(locationTarget.name, () => {
      const successToast = () => toast.success(`${t('timer.started')}: ${locationTarget.name}`);
      const started = startSessionWithDistanceCheck(locationTarget, {}, ({ placeName, distance, confirm }) => {
        setDistanceWarning({
          placeName,
          distance,
          onConfirm: () => { confirm(); successToast(); },
        });
      });
      if (started) successToast();
    });
  };

  const handleStopTimer = async () => {
    if (!locationTarget) return;
    // Unified engine — pure presence: no time_report, only server-stop.
    try {
      const res = await stopSession(locationTarget);
      if (res.cancelled) return;
      if (res.saved) {
        toast.success(t('timer.stoppedCreateReport'));
        navigate('/m/report');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte stoppa timer');
    }
  };

  const handleToggleComplete = async (task: LagerTask) => {
    try {
      await mobileApi.completeLagerTask({ task_id: task.id, completed: !task.completed });
      await loadTasks();
    } catch (e) {
      toast.error('Kunde inte uppdatera');
    }
  };

  const handleClaim = async (task: LagerTask) => {
    try {
      await mobileApi.claimLagerTask({ task_id: task.id });
      toast.success('Uppgift tagen');
      await loadTasks();
    } catch (e) {
      toast.error('Kunde inte ta uppgift');
    }
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setSubmitting(true);
    try {
      await mobileApi.createLagerTask({
        title: newTitle.trim(),
        description: newDesc.trim() || undefined,
        assign_to_me: assignToMe,
      });
      setNewTitle('');
      setNewDesc('');
      setAssignToMe(true);
      setCreateOpen(false);
      toast.success('Uppgift skapad');
      await loadTasks();
    } catch (e) {
      toast.error('Kunde inte skapa uppgift');
    } finally {
      setSubmitting(false);
    }
  };

  const openNavigation = () => {
    if (!location?.address) return;
    window.open(`https://maps.google.com/maps?daddr=${encodeURIComponent(location.address)}`, '_blank');
  };

  const renderTaskCard = (task: LagerTask, isMine: boolean) => {
    const activeTimer = activeTimers.get(locKey);
    const isActiveTask = hasLocationTimer && !!activeTimer && (activeTimer as any).establishmentTaskId === task.id;

    return (
      <div
        key={task.id}
        className={cn(
          'rounded-2xl border bg-card p-3.5 transition-all',
          isActiveTask ? 'border-primary/40 ring-1 ring-primary/20 shadow-md' : 'border-border'
        )}
      >
        <div className="flex items-start gap-3">
          <button
            onClick={() => handleToggleComplete(task)}
            className="mt-0.5 shrink-0 w-5 h-5 rounded border-2 border-muted-foreground/30 flex items-center justify-center active:scale-90"
            aria-label="Markera klar"
          >
            {task.completed && <Check className="w-3.5 h-3.5 text-primary" />}
          </button>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground text-[15px] leading-snug">
              {task.title}
            </h3>
            {task.description && (
              <p className="text-xs text-muted-foreground mt-1 leading-snug">{task.description}</p>
            )}
            {task.deadline && (
              <p className="text-[11px] text-muted-foreground mt-1">📅 {task.deadline}</p>
            )}
            {isActiveTask && activeTimer && (
              <p className="text-xs font-mono text-primary font-bold mt-1">
                ⏱ {formatElapsed(activeTimer.startTime)}
              </p>
            )}
          </div>
          {isMine ? (
            isActiveTask ? (
              <button
                onClick={handleStopTimer}
                className="shrink-0 w-10 h-10 rounded-xl bg-destructive text-destructive-foreground flex items-center justify-center shadow-md active:scale-90"
                aria-label="Stoppa timer"
              >
                <Square className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => handleStartTaskTimer(task)}
                className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center active:scale-90"
                aria-label="Starta timer"
              >
                <Clock className="w-4 h-4" />
              </button>
            )
          ) : (
            <Button size="sm" variant="outline" onClick={() => handleClaim(task)} className="shrink-0">
              Ta
            </Button>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!location) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
        <p className="text-muted-foreground">Plats hittades inte</p>
        <Button variant="ghost" onClick={() => navigate('/m')} className="mt-4">
          Tillbaka
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-card pb-24">
      {/* Header — identical pattern to MobileJobDetail */}
      <MobileBackHeader
        title={location.name}
        backTo="/m"
        rightAction={
          <button
            onClick={hasLocationTimer ? handleStopTimer : handleStartGeneralTimer}
            className={cn(
              "w-11 h-11 rounded-full flex items-center justify-center active:scale-95 transition-all shadow-md relative",
              hasLocationTimer
                ? "bg-destructive text-destructive-foreground animate-pulse"
                : "bg-primary-foreground text-primary",
            )}
            aria-label={hasLocationTimer ? "Stoppa timer" : "Starta timer"}
          >
            {hasLocationTimer ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>
        }
      />

      {/* Timer info bar */}
      {currentTimer && (
        <div className="text-center py-1.5 bg-primary/5">
          <span className="text-xs font-mono text-primary bg-primary/10 px-3 py-1 rounded-full">
            <Clock className="w-3 h-3 inline mr-1" />{formatElapsed(currentTimer.startTime)}
          </span>
          {(currentTimer as any).establishmentTaskTitle && (
            <p className="text-[10px] text-muted-foreground mt-0.5">{(currentTimer as any).establishmentTaskTitle}</p>
          )}
        </div>
      )}

      {/* Address card — same style as MobileJobDetail */}
      {location.address && (
        <button
          onClick={openNavigation}
          className="mx-4 mt-3 p-3.5 rounded-2xl bg-card border border-primary flex items-center gap-2.5 w-[calc(100%-2rem)] text-left active:scale-[0.98] transition-all"
        >
          <MapPin className="w-4 h-4 text-primary shrink-0" />
          <span className="text-foreground font-medium text-sm flex-1">{location.address}</span>
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shrink-0">
            <Navigation className="w-4 h-4 text-primary-foreground" />
          </div>
        </button>
      )}

      {/* Tab navigation — identical to MobileJobDetail */}
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
      <div className="flex-1 px-4 py-3 space-y-5">
        {activeTab === 'Info' && (
          <>
            {/* My tasks */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Mina uppgifter
                </h2>
                <button
                  onClick={() => setCreateOpen(true)}
                  className="flex items-center gap-1 text-xs font-semibold text-primary active:opacity-70"
                >
                  <Plus className="w-3.5 h-3.5" /> Ny
                </button>
              </div>
              {myTasks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-5 text-center">
                  <p className="text-sm text-muted-foreground">
                    Du har inga tilldelade uppgifter just nu.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">{myTasks.map((tk) => renderTaskCard(tk, true))}</div>
              )}
            </div>

            {/* Open tasks */}
            {openTasks.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                  <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    Öppna uppgifter
                  </h2>
                </div>
                <div className="space-y-2">{openTasks.map((tk) => renderTaskCard(tk, false))}</div>
              </div>
            )}
          </>
        )}

        {activeTab === 'Team' && <LagerTeamSection />}
        {activeTab === 'Photos' && <LagerPhotosSection />}
        {activeTab === 'Costs' && <LagerExpensesSection />}
      </div>

      {/* Create task dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ny lageruppgift</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Titel</Label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="t.ex. Städa lagerhall"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Beskrivning (valfritt)</Label>
              <Textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Detaljer..."
                rows={3}
              />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={assignToMe} onCheckedChange={(v) => setAssignToMe(!!v)} />
              <span>Tilldela mig direkt</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={submitting}>
              Avbryt
            </Button>
            <Button onClick={handleCreate} disabled={submitting || !newTitle.trim()}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Skapa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <TimerConflictDialog
        open={!!conflictEval}
        evaluation={conflictEval}
        newTargetLabel={pendingStart?.label ?? ''}
        onCancel={cancelConflict}
        onSwitch={confirmSwitch}
      />
      <DistanceWarningDialog
        open={!!distanceWarning}
        onOpenChange={(open) => { if (!open) setDistanceWarning(null); }}
        placeName={distanceWarning?.placeName || ''}
        distanceMeters={distanceWarning?.distance || 0}
        onConfirm={() => {
          distanceWarning?.onConfirm();
          setDistanceWarning(null);
        }}
      />
      {dialogs}
    </div>
  );
};

export default MobileLocationDetail;
