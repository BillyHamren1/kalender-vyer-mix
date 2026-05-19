import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2,
  Save,
  Building2,
  Calendar as CalIcon,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useTeamResources } from '@/hooks/useTeamResources';
import {
  syncLargeProjectPlanningAssignments,
} from '@/services/largeProjectPlannerService';
import {
  fetchLargeProjects,
  createLargeProject,
  addBookingToLargeProject,
} from '@/services/largeProjectService';
import { writeProjectDates } from '@/services/projectDateAuthority';
import {
  PlanningDay,
  isPhaseLocked,
  seedDaysFromBooking,
} from './bookingPlacementSeed';
import { BookingInfoHeader } from './BookingInfoHeader';
import { PhaseDatesEditor } from './PhaseDatesEditor';
import { translateSupabaseError } from '@/lib/supabase/translateError';


interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bookingId: string | null;
}

const BOOKING_FIELDS = `
  id, client, booking_number, deliveryaddress, organization_id,
  contact_name, contact_phone, contact_email, internalnotes,
  eventdate, rigdaydate, rigdowndate,
  rig_start_time, rig_end_time, event_start_time, event_end_time,
  rigdown_start_time, rigdown_end_time,
  rig_time_locked, event_time_locked, rigdown_time_locked
`;

export const BookingPlacementDialog: React.FC<Props> = ({ open, onOpenChange, bookingId }) => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { teamResources } = useTeamResources();

  const [days, setDays] = useState<PlanningDay[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [isLarge, setIsLarge] = useState(false);
  const [largeMode, setLargeMode] = useState<'new' | 'existing'>('new');
  const [largeNewName, setLargeNewName] = useState('');
  const [largeExistingId, setLargeExistingId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const { data: booking, isLoading } = useQuery({
    queryKey: ['placement-booking', bookingId],
    enabled: !!bookingId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select(BOOKING_FIELDS)
        .eq('id', bookingId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Bokningen kunde inte hittas.');
      return data;
    },
  });

  const { data: largeProjects = [] } = useQuery({
    queryKey: ['large-projects'],
    queryFn: fetchLargeProjects,
    enabled: open && isLarge && largeMode === 'existing',
  });

  // Reset on open
  useEffect(() => {
    if (open) {
      setStepIndex(0);
      setIsLarge(false);
      setLargeMode('new');
      setLargeNewName('');
      setLargeExistingId('');
    }
  }, [open]);

  // Seed days när bokning hämtats
  useEffect(() => {
    if (!booking) return;
    setDays(seedDaysFromBooking(booking));
    setLargeNewName(
      booking.client && booking.eventdate
        ? `${booking.client} – ${format(parseISO(booking.eventdate), 'd MMM yyyy', { locale: sv })}`
        : booking.client || '',
    );
  }, [booking]);

  // När bokningen länkas till ett BEFINTLIGT stort projekt ärvs riggdagar
  // och tider från det stora projektet — användaren ska då inte planera dagar.
  const linkingToExistingLarge = isLarge && largeMode === 'existing' && !!largeExistingId;

  // Endast rig + rigDown planeras (eventdagen hoppas över i wizarden)
  const planSteps = useMemo(
    () => (linkingToExistingLarge ? [] : days.filter((d) => d.kind !== 'event')),
    [days, linkingToExistingLarge],
  );

  // När vi länkar till befintligt stort projekt: wizarden blir 1 steg (bekräftelse).
  const totalSteps = linkingToExistingLarge ? 1 : planSteps.length;
  const currentDay: PlanningDay | undefined = planSteps[stepIndex];
  const isLastStep = linkingToExistingLarge ? true : stepIndex >= totalSteps - 1;
  const isFirstStep = stepIndex === 0;

  const teamOptions = useMemo(
    () =>
      (teamResources || [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((r: any) => r.id !== 'team-11' && r.id !== 'transport')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => ({ id: r.id, title: r.title })),
    [teamResources],
  );

  const updateCurrent = (patch: Partial<PlanningDay>) => {
    if (!currentDay) return;
    const idxInDays = days.indexOf(currentDay);
    setDays((prev) => {
      const next = [...prev];
      next[idxInDays] = { ...next[idxInDays], ...patch };
      return next;
    });
  };

  const inheritedTeamId = useMemo(
    () => currentDay?.teamId || days[0]?.teamId || teamOptions[0]?.id || 'team-1',
    [currentDay, days, teamOptions],
  );

  const handleAddDay = (kind: 'rig' | 'rigDown') => {
    const samePhase = days.filter((d) => d.kind === kind);
    let baseDate: string;
    if (kind === 'rig') {
      baseDate = samePhase[0]?.date || booking?.rigdaydate || booking?.eventdate || new Date().toISOString().slice(0, 10);
    } else {
      baseDate = samePhase[samePhase.length - 1]?.date || booking?.rigdowndate || booking?.eventdate || new Date().toISOString().slice(0, 10);
    }
    const newDay = makeExtraDay(kind, baseDate, inheritedTeamId);
    setDays((prev) => {
      const next = insertDaySorted(prev, newDay);
      const planOnly = next.filter((d) => d.kind !== 'event');
      const newIdx = planOnly.findIndex(
        (d) => d.date === newDay.date && d.kind === newDay.kind,
      );
      if (newIdx >= 0) setStepIndex(newIdx);
      return next;
    });
    toast.success(`La till ${kind === 'rig' ? 'riggdag' : 'demonteringsdag'}`);
  };

  const handleRemoveCurrent = () => {
    if (!currentDay) return;
    if (phaseLockedForCurrent) {
      toast.error('Denna dag har fast tid från bokningen och kan inte tas bort här');
      return;
    }
    if (planSteps.length <= 1) {
      toast.error('Minst en dag måste vara kvar att planera');
      return;
    }
    const idxInDays = days.indexOf(currentDay);
    setDays((prev) => removeDayAt(prev, idxInDays));
    setStepIndex((i) => Math.max(0, i - 1));
    toast.success('Dag borttagen');
  };

  const goNext = () => {
    if (!isLastStep) setStepIndex((i) => i + 1);
  };
  const goBack = () => {
    if (!isFirstStep) setStepIndex((i) => i - 1);
  };

  const phaseLockedForCurrent =
    !!currentDay && !!booking && isPhaseLocked(booking, currentDay.kind);

  const handleFinish = async () => {
    if (!booking) return;
    // Tom planSteps är OK när vi länkar till befintligt LP (dagar ärvs).
    if (isLarge && largeMode === 'new' && !largeNewName.trim()) {
      toast.error('Ange ett namn för det stora projektet');
      return;
    }
    if (isLarge && largeMode === 'existing' && !largeExistingId) {
      toast.error('Välj ett befintligt stort projekt');
      return;
    }
    if (!linkingToExistingLarge && planSteps.length === 0) {
      toast.error('Inga rig- eller demonteringsdagar att planera');
      return;
    }

    setSaving(true);
    try {
      let largeProjectId: string | null = null;
      let mediumProjectId: string | null = null;

      if (isLarge) {
        if (largeMode === 'new') {
          const created = await createLargeProject({ name: largeNewName.trim() });
          largeProjectId = created.id;
        } else {
          largeProjectId = largeExistingId;
        }
        await addBookingToLargeProject(largeProjectId!, booking.id);
      } else {
        // Skapa medel-projekt på samma sätt som CreateProjectWizard
        const dateStr = booking.eventdate
          ? format(parseISO(booking.eventdate), 'd MMMM yyyy', { locale: sv })
          : '';
        const projectName = `${booking.client || 'Projekt'}${dateStr ? ` - ${dateStr}` : ''}`;

        // Duplicate guard
        const { data: existing } = await supabase
          .from('projects')
          .select('id')
          .eq('booking_id', booking.id)
          .not('status', 'in', '("completed","cancelled")')
          .is('deleted_at', null);
        if (existing && existing.length > 0) {
          throw new Error('Bokningen har redan ett aktivt projekt.');
        }

        const { data: project, error: projErr } = await supabase
          .from('projects')
          .insert({
            name: projectName,
            booking_id: booking.id,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any)
          .select()
          .single();
        if (projErr) throw projErr;
        mediumProjectId = project.id;

        await supabase
          .from('bookings')
          .update({
            assigned_to_project: true,
            assigned_project_id: project.id,
            assigned_project_name: projectName,
          })
          .eq('id', booking.id);
      }

      if (linkingToExistingLarge && largeProjectId) {
        // Bokningen ärver datum/tider från det stora projektet.
        // Hämta LP:s nuvarande datum-arrayer och propagera (apply-project-dates
        // bygger calendar_events för alla sub-bookings inkl. den nya).
        const { data: lp } = await supabase
          .from('large_projects')
          .select('start_date, event_date, end_date')
          .eq('id', largeProjectId)
          .maybeSingle();
        const phaseDates: Partial<Record<'rig' | 'event' | 'rigDown', string[]>> = {};
        if (Array.isArray(lp?.start_date) && lp.start_date.length) phaseDates.rig = lp.start_date;
        if (Array.isArray(lp?.event_date) && lp.event_date.length) phaseDates.event = lp.event_date;
        if (Array.isArray(lp?.end_date) && lp.end_date.length) phaseDates.rigDown = lp.end_date;
        if (Object.keys(phaseDates).length > 0) {
          await writeProjectDates({
            projectId: largeProjectId,
            projectType: 'large',
            dates: phaseDates,
          });
        }
        await supabase
          .from('large_projects')
          .update({ planning_status: 'planned' })
          .eq('id', largeProjectId);
      } else {
        // Skriv calendar_events för rig + rigDown enligt planerade dagar
        for (const day of planSteps) {
          const { data: existing } = await supabase
            .from('calendar_events')
            .select('id')
            .eq('booking_id', booking.id)
            .eq('event_type', day.kind)
            .eq('source_date', day.date)
            .maybeSingle();

          const payload = {
            title: booking.client || 'Projekt',
            start_time: `${day.date}T${day.startTime}:00+00:00`,
            end_time: `${day.date}T${day.endTime}:00+00:00`,
            resource_id: day.teamId,
            booking_id: booking.id,
            event_type: day.kind,
            delivery_address: booking.deliveryaddress || null,
            booking_number: booking.booking_number || null,
            source_date: day.date,
          };

          if (existing?.id) {
            const { error } = await supabase
              .from('calendar_events')
              .update(payload)
              .eq('id', existing.id);
            if (error) throw error;
          } else {
            const { error } = await supabase.from('calendar_events').insert(payload);
            if (error) throw error;
          }
        }

        // Uppdatera bokningens fasta tider till första-dag-tiden om inte låst
        const firstRig = planSteps.find((d) => d.kind === 'rig');
        const firstDown = planSteps.find((d) => d.kind === 'rigDown');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updates: any = {};
        if (firstRig && !isPhaseLocked(booking, 'rig')) {
          updates.rig_start_time = `${firstRig.startTime}:00`;
          updates.rig_end_time = `${firstRig.endTime}:00`;
        }
        if (firstDown && !isPhaseLocked(booking, 'rigDown')) {
          updates.rigdown_start_time = `${firstDown.startTime}:00`;
          updates.rigdown_end_time = `${firstDown.endTime}:00`;
        }
        if (Object.keys(updates).length > 0) {
          await supabase.from('bookings').update(updates).eq('id', booking.id);
        }

        if (isLarge && largeProjectId) {
          await syncLargeProjectPlanningAssignments(largeProjectId, planSteps);
          await supabase
            .from('large_projects')
            .update({ planning_status: 'planned' })
            .eq('id', largeProjectId);
        } else if (mediumProjectId) {
          await supabase
            .from('projects')
            .update({ planning_status: 'planned' })
            .eq('id', mediumProjectId);
        }
      }

      toast.success('Bokningen är placerad och dagarna är inlagda i kalendern');
      qc.invalidateQueries({ queryKey: ['bookings-without-project'] });
      qc.invalidateQueries({ queryKey: ['calendar-events'] });
      qc.invalidateQueries({ queryKey: ['planner-calendar'] });
      qc.invalidateQueries({ queryKey: ['large-project-team-assignments'] });
      qc.invalidateQueries({ queryKey: ['large-projects'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['unplanned-projects'] });
      try {
        window.dispatchEvent(
          new CustomEvent('planner-calendar-refresh', {
            detail: { source: 'BookingPlacementDialog', bookingId: booking.id },
          }),
        );
      } catch {
        /* ignore */
      }

      onOpenChange(false);
      if (largeProjectId) navigate(`/large-project/${largeProjectId}`);
      else if (mediumProjectId) navigate(`/project/${mediumProjectId}`);
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = err as any;
      console.error('[BookingPlacementDialog] save error', {
        code: e?.code,
        message: e?.message,
        details: e?.details,
        hint: e?.hint,
        err,
      });
      toast.error(translateSupabaseError(err, 'Kunde inte placera bokningen'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-screen h-screen sm:rounded-none p-6 overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalIcon className="h-5 w-5 text-primary" />
            Placera bokning
          </DialogTitle>
        </DialogHeader>


        <div className="flex-1 overflow-y-auto pr-1">
          {isLoading || !booking ? (
            <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Laddar bokning…
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
              {/* Vänster: planering via kalender */}
              <div className="space-y-3 min-w-0">
                {linkingToExistingLarge ? (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-6 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <Building2 className="h-4 w-4" />
                      Ärvs från det stora projektet
                    </div>
                    <p className="text-sm text-foreground/80">
                      Den här bokningen läggs in i{' '}
                      <strong>
                        {largeProjects.find((p) => p.id === largeExistingId)?.name ?? 'valt stort projekt'}
                      </strong>
                      . Riggdagar, demonteringsdagar, tider och team ärvs automatiskt
                      från projektet — du behöver inte välja dem här.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Tryck <strong>Slutför planering</strong> för att lägga till bokningen.
                    </p>
                  </div>
                ) : (
                  <PhaseDatesEditor
                    booking={booking}
                    days={days}
                    onChange={setDays}
                    inheritedTeamId={inheritedTeamId}
                    teamOptions={teamOptions}
                  />
                )}
              </div>

              {/* Höger: bokningsinfo + projekttyp */}
              <div className="space-y-3 min-w-0">
                <BookingInfoHeader booking={booking} hideTimes />

                <div className="rounded-lg border border-border/60 bg-card p-3 space-y-3">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <Checkbox
                      checked={isLarge}
                      onCheckedChange={(v) => setIsLarge(v === true)}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5" />
                        Detta är ett stort projekt
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Bokningen läggs in som del av ett stort projekt istället för ett medelprojekt.
                      </div>
                    </div>
                  </label>

                  {isLarge && (
                    <div className="space-y-2 pl-6">
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant={largeMode === 'new' ? 'default' : 'outline'}
                          onClick={() => setLargeMode('new')}
                          className="flex-1 h-7 text-xs"
                        >
                          Skapa nytt
                        </Button>
                        <Button
                          size="sm"
                          variant={largeMode === 'existing' ? 'default' : 'outline'}
                          onClick={() => setLargeMode('existing')}
                          className="flex-1 h-7 text-xs"
                        >
                          Lägg till i befintligt
                        </Button>
                      </div>
                      {largeMode === 'new' ? (
                        <Input
                          placeholder="Projektnamn"
                          value={largeNewName}
                          onChange={(e) => setLargeNewName(e.target.value)}
                          className="h-8 text-sm"
                        />
                      ) : (
                        <Select value={largeExistingId} onValueChange={setLargeExistingId}>
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Välj projekt…" />
                          </SelectTrigger>
                          <SelectContent>
                            {largeProjects.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>


        <DialogFooter className="flex !justify-between gap-2 pt-2 border-t border-border/40">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Avbryt
          </Button>
          <Button onClick={handleFinish} disabled={saving || (!linkingToExistingLarge && planSteps.length === 0)}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Slutför planering
          </Button>

        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
