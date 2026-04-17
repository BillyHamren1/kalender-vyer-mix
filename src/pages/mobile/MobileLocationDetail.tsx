import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Clock, Square, Check, Building2, Loader2, Users } from 'lucide-react';
import { mobileApi } from '@/services/mobileApiService';
import { useGeofencing } from '@/hooks/useGeofencing';
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

interface LagerTask {
  id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  assigned_to_ids: string[] | null;
  completed: boolean;
}

const MobileLocationDetail = () => {
  const { id: locationId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { staff } = useMobileAuth();
  const { activeTimers, startTimer, stopTimer, hasAnyTimer } = useTimerStore();

  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState<{ id: string; name: string; address: string | null; latitude: number; longitude: number } | null>(null);
  const [myTasks, setMyTasks] = useState<LagerTask[]>([]);
  const [openTasks, setOpenTasks] = useState<LagerTask[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [assignToMe, setAssignToMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [, setTick] = useState(0);

  const locKey = `location-${locationId}`;
  const hasLocationTimer = activeTimers.has(locKey);

  // tick for elapsed display
  useEffect(() => {
    if (activeTimers.size === 0) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [activeTimers.size]);

  const loadAll = async () => {
    if (!locationId) return;
    try {
      const [locsRes, tasksRes] = await Promise.all([
        mobileApi.getOrganizationLocations(),
        mobileApi.getLagerTasks(),
      ]);
      const loc = locsRes.locations.find((l) => l.id === locationId);
      if (loc) setLocation(loc);
      setMyTasks(tasksRes.my_tasks || []);
      setOpenTasks(tasksRes.open_tasks || []);
    } catch (e) {
      console.error(e);
      toast.error(t('locationDetail.loadFailed') ?? 'Kunde inte ladda data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  const formatElapsed = (startIso: string) => {
    const secs = Math.floor((Date.now() - new Date(startIso).getTime()) / 1000);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleStartTaskTimer = async (task: LagerTask) => {
    if (!location) return;
    if (hasAnyTimer) {
      toast.error(t('timer.alreadyActive') ?? 'En timer är redan aktiv');
      return;
    }
    try {
      await mobileApi.startLocationTimer(location.id, task.id);
      const label = `${location.name} · ${task.title}`;
      startTimer(`location-${location.id}`, label, false, undefined, undefined, location.id, location.name);
      toast.success(`${t('timer.started') ?? 'Timer startad'}: ${task.title}`);
    } catch (e) {
      console.error(e);
      toast.error('Kunde inte starta timer');
    }
  };

  const handleStartGeneralTimer = async () => {
    if (!location) return;
    if (hasAnyTimer) {
      toast.error(t('timer.alreadyActive') ?? 'En timer är redan aktiv');
      return;
    }
    try {
      await mobileApi.startLocationTimer(location.id);
      startTimer(`location-${location.id}`, location.name, false, undefined, undefined, location.id, location.name);
      toast.success(`${t('timer.started') ?? 'Timer startad'}: ${location.name}`);
    } catch (e) {
      console.error(e);
      toast.error('Kunde inte starta timer');
    }
  };

  const handleStopTimer = () => {
    const stopped = stopTimer(`location-${location!.id}`);
    if (stopped) {
      toast.success(t('timer.stoppedCreateReport') ?? 'Timer stoppad');
      navigate('/m/report');
    }
  };

  const handleToggleComplete = async (task: LagerTask) => {
    try {
      await mobileApi.completeLagerTask({ task_id: task.id, completed: !task.completed });
      await loadAll();
    } catch (e) {
      toast.error('Kunde inte uppdatera');
    }
  };

  const handleClaim = async (task: LagerTask) => {
    try {
      await mobileApi.claimLagerTask({ task_id: task.id });
      toast.success('Uppgift tagen');
      await loadAll();
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
      await loadAll();
    } catch (e) {
      toast.error('Kunde inte skapa uppgift');
    } finally {
      setSubmitting(false);
    }
  };

  const renderTaskCard = (task: LagerTask, isMine: boolean) => {
    const taskTimerLabel = activeTimers.get(locKey)?.activityLabel || '';
    const isActiveTask = hasLocationTimer && taskTimerLabel.includes(task.title);

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
            {isActiveTask && activeTimers.get(locKey) && (
              <p className="text-xs font-mono text-primary font-bold mt-1">
                ⏱ {formatElapsed(activeTimers.get(locKey)!.startTime)}
              </p>
            )}
          </div>
          {isMine ? (
            isActiveTask ? (
              <button
                onClick={handleStopTimer}
                className="shrink-0 w-10 h-10 rounded-xl bg-destructive text-destructive-foreground flex items-center justify-center shadow-md active:scale-90"
              >
                <Square className="w-4 h-4" />
              </button>
            ) : (
              !hasAnyTimer && (
                <button
                  onClick={() => handleStartTaskTimer(task)}
                  className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center active:scale-90"
                >
                  <Clock className="w-4 h-4" />
                </button>
              )
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
      {/* Header */}
      <div className="bg-primary text-primary-foreground px-5 pt-12 pb-6">
        <button
          onClick={() => navigate('/m')}
          className="mb-3 -ml-2 p-2 rounded-lg active:bg-primary-foreground/10"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="w-4 h-4 opacity-70" />
          <span className="text-[11px] font-bold uppercase tracking-widest opacity-80">
            Lager
          </span>
        </div>
        <h1 className="text-2xl font-bold">{location.name}</h1>
        {location.address && (
          <p className="text-sm opacity-80 mt-1">{location.address}</p>
        )}
      </div>

      {/* General timer button */}
      <div className="px-4 -mt-4 mb-4">
        {hasLocationTimer ? (
          <button
            onClick={handleStopTimer}
            className="w-full rounded-2xl bg-destructive text-destructive-foreground p-4 shadow-lg flex items-center justify-center gap-2 font-semibold active:scale-[0.98]"
          >
            <Square className="w-5 h-5" />
            Stoppa timer · {formatElapsed(activeTimers.get(locKey)!.startTime)}
          </button>
        ) : !hasAnyTimer ? (
          <button
            onClick={handleStartGeneralTimer}
            className="w-full rounded-2xl bg-card border border-primary/30 text-primary p-4 shadow-md flex items-center justify-center gap-2 font-semibold active:scale-[0.98]"
          >
            <Clock className="w-5 h-5" />
            Starta tid på Lager
          </button>
        ) : null}
      </div>

      {/* Content */}
      <div className="flex-1 px-4 space-y-5">
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
            <div className="space-y-2">{myTasks.map((t) => renderTaskCard(t, true))}</div>
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
            <div className="space-y-2">{openTasks.map((t) => renderTaskCard(t, false))}</div>
          </div>
        )}
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
    </div>
  );
};

export default MobileLocationDetail;
