import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Check, Loader2, Users, MapPin, Navigation } from 'lucide-react';
import { mobileApi } from '@/services/mobileApiService';
import { useGeofencingContext } from '@/contexts/GeofencingContext';
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
import LagerMyAssignmentsSection from '@/components/mobile-app/lager/LagerMyAssignmentsSection';

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

/**
 * MobileLocationDetail
 * --------------------
 * Single-timer policy: platsdetalj startar/stoppar INTE timer. All
 * arbetsdagsstart/-stopp sker i WorkDayPanel. Här visas platsinfo,
 * lageruppgifter och kontaktdata.
 */
const MobileLocationDetail = () => {
  const { id: locationId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { orgLocations } = useGeofencingContext();

  const [activeTab, setActiveTab] = useState<TabKey>('Info');
  const [loading, setLoading] = useState(true);
  const [myTasks, setMyTasks] = useState<LagerTask[]>([]);
  const [openTasks, setOpenTasks] = useState<LagerTask[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [assignToMe, setAssignToMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const location = orgLocations.find((l) => l.id === locationId) || null;

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
    return (
      <div
        key={task.id}
        className="rounded-2xl border border-border bg-card p-3.5 transition-all"
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
          </div>
          {!isMine && (
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
      <MobileBackHeader title={location.name} backTo="/m" />

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

      <div className="flex-1 px-4 py-3 space-y-5">
        {activeTab === 'Info' && (
          <>
            {location && /lager/i.test(location.name) && (
              <LagerMyAssignmentsSection />
            )}
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
