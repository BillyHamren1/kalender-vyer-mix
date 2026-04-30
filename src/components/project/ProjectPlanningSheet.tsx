import React, { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, Calendar as CalIcon } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { addCalendarEvent } from '@/services/eventService';
import { useTeamResources } from '@/hooks/useTeamResources';

type Phase = 'rig' | 'rigDown';
type DayKind = Phase | 'event';

interface PlanningDay {
  date: string;
  kind: DayKind;
  startTime: string;   // 'HH:mm'
  endTime: string;     // 'HH:mm'
  teamId: string;      // 'team-1' .. 'team-5' | 'transport'
}

interface Props {
  projectId: string;
  projectKind: 'medium' | 'large';
  open: boolean;
  onClose: () => void;
}

const DEFAULT_RIG_START = '08:00';
const DEFAULT_RIG_END = '16:00';
const DEFAULT_DOWN_START = '08:00';
const DEFAULT_DOWN_END = '16:00';
const DEFAULT_EVENT_START = '17:00';
const DEFAULT_EVENT_END = '23:00';

/**
 * Planeringssheet: användaren sätter team + tider per dag innan
 * projektet materialiseras i kalendern. När hen sparar:
 *  1) calendar_events skapas (en per dag/fas/booking)
 *  2) bookings.rig_*_time / rigdown_*_time uppdateras
 *  3) planning_status flippas till 'planned'
 */
export const ProjectPlanningSheet: React.FC<Props> = ({ projectId, projectKind, open, onClose }) => {
  const qc = useQueryClient();
  const { teamResources } = useTeamResources();
  const [saving, setSaving] = useState(false);
  const [useSameTeamForAll, setUseSameTeamForAll] = useState(true);
  const [days, setDays] = useState<PlanningDay[]>([]);

  // Hämta projektets bokning(ar) och datum
  const { data: ctx, isLoading } = useQuery({
    enabled: open,
    queryKey: ['project-planning-ctx', projectKind, projectId],
    queryFn: async () => {
      let bookings: any[] = [];
      let projectName = '';
      if (projectKind === 'medium') {
        const { data: project } = await supabase
          .from('projects')
          .select('id, name, booking_id')
          .eq('id', projectId)
          .single();
        projectName = project?.name ?? '';
        if (project?.booking_id) {
          const { data: b } = await supabase
            .from('bookings')
            .select('id, client, booking_number, deliveryaddress, organization_id, eventdate, rigdaydate, rigdowndate')
            .eq('id', project.booking_id)
            .single();
          if (b) bookings = [b];
        }
      } else {
        const { data: lp } = await supabase
          .from('large_projects')
          .select('id, name')
          .eq('id', projectId)
          .single();
        projectName = lp?.name ?? '';
        const { data: bs } = await supabase
          .from('bookings')
          .select('id, client, booking_number, deliveryaddress, organization_id, eventdate, rigdaydate, rigdowndate')
          .eq('large_project_id', projectId);
        bookings = bs || [];
      }
      return { bookings, projectName };
    },
  });

  // Härled dagar från första bokningens datum
  useEffect(() => {
    if (!ctx || ctx.bookings.length === 0) return;
    const b = ctx.bookings[0];
    const list: PlanningDay[] = [];
    if (b.rigdaydate) {
      list.push({ date: b.rigdaydate, kind: 'rig', startTime: DEFAULT_RIG_START, endTime: DEFAULT_RIG_END, teamId: 'team-1' });
    }
    if (b.eventdate) {
      list.push({ date: b.eventdate, kind: 'event', startTime: DEFAULT_EVENT_START, endTime: DEFAULT_EVENT_END, teamId: 'team-1' });
    }
    if (b.rigdowndate) {
      list.push({ date: b.rigdowndate, kind: 'rigDown', startTime: DEFAULT_DOWN_START, endTime: DEFAULT_DOWN_END, teamId: 'team-1' });
    }
    list.sort((a, z) => a.date.localeCompare(z.date));
    setDays(list);
  }, [ctx]);

  // När toggle är på — synka alla dagar till första riggdagens team
  const masterTeam = days[0]?.teamId ?? 'team-1';
  useEffect(() => {
    if (!useSameTeamForAll) return;
    setDays(prev => prev.map(d => ({ ...d, teamId: masterTeam })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useSameTeamForAll, masterTeam]);

  const updateDay = (idx: number, patch: Partial<PlanningDay>) => {
    setDays(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      // Om "samma team för alla" är på och man ändrar team — uppdatera alla
      if (useSameTeamForAll && patch.teamId) {
        return next.map(d => ({ ...d, teamId: patch.teamId! }));
      }
      return next;
    });
  };

  const teamOptions = useMemo(() => {
    return teamResources
      .filter((r: any) => r.id !== 'team-11' && r.id !== 'transport')
      .map((r: any) => ({ id: r.id, title: r.title }));
  }, [teamResources]);

  const handleSave = async () => {
    if (!ctx || ctx.bookings.length === 0) {
      toast.error('Ingen bokning kopplad');
      return;
    }
    setSaving(true);
    try {
      // För stort projekt: skapa events per fas+datum för VARJE underliggande bokning
      // (samma princip som reconcilern). För medel: bara en bokning.
      for (const day of days) {
        if (day.kind === 'event') continue; // event-dagar skrivs ej längre till calendar_events
        for (const b of ctx.bookings) {
          await addCalendarEvent({
            title: b.client || ctx.projectName || 'Projekt',
            start: `${day.date}T${day.startTime}:00+00:00`,
            end: `${day.date}T${day.endTime}:00+00:00`,
            resourceId: day.teamId,
            bookingId: b.id,
            eventType: day.kind as any,
            delivery_address: b.deliveryaddress || null,
            booking_number: b.booking_number || null,
          } as any);
        }
      }

      // Uppdatera bookings tider (så reconcilern har korrekta tider om den körs igen)
      const rigDay = days.find(d => d.kind === 'rig');
      const downDay = days.find(d => d.kind === 'rigDown');
      const eventDay = days.find(d => d.kind === 'event');
      const updates: any = {};
      if (rigDay) {
        updates.rig_start_time = `${rigDay.startTime}:00`;
        updates.rig_end_time = `${rigDay.endTime}:00`;
      }
      if (downDay) {
        updates.rigdown_start_time = `${downDay.startTime}:00`;
        updates.rigdown_end_time = `${downDay.endTime}:00`;
      }
      if (eventDay) {
        updates.event_start_time = `${eventDay.startTime}:00`;
        updates.event_end_time = `${eventDay.endTime}:00`;
      }
      if (Object.keys(updates).length > 0) {
        await supabase.from('bookings').update(updates).in('id', ctx.bookings.map(b => b.id));
      }

      // Flippa planning_status → 'planned'
      const table = projectKind === 'medium' ? 'projects' : 'large_projects';
      const { error: flipErr } = await supabase
        .from(table)
        .update({ planning_status: 'planned' })
        .eq('id', projectId);
      if (flipErr) throw flipErr;

      toast.success('Projektet är planerat och ligger nu i kalendern');
      qc.invalidateQueries({ queryKey: ['unplanned-projects'] });
      qc.invalidateQueries({ queryKey: ['calendar-events'] });
      onClose();
    } catch (err: any) {
      console.error('[ProjectPlanningSheet] save error:', err);
      toast.error(err?.message || 'Kunde inte spara planeringen');
    } finally {
      setSaving(false);
    }
  };

  const phaseLabel = (k: DayKind) => k === 'rig' ? 'Riggning' : k === 'rigDown' ? 'Demontering' : 'Event';

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <CalIcon className="h-5 w-5 text-primary" />
            Planera projekt
          </SheetTitle>
          <SheetDescription>
            Sätt tider och team per dag. Eventen skapas i kalendern när du sparar.
          </SheetDescription>
        </SheetHeader>

        {isLoading || !ctx ? (
          <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Laddar projekt…
          </div>
        ) : ctx.bookings.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            Projektet saknar kopplad bokning — ingen planering möjlig.
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm">
              <div className="font-medium text-foreground">{ctx.projectName}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {ctx.bookings.length === 1
                  ? `1 bokning · ${ctx.bookings[0].client}`
                  : `${ctx.bookings.length} bokningar`}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
              <Label htmlFor="same-team" className="cursor-pointer text-sm">
                Använd samma team för alla dagar
              </Label>
              <Switch id="same-team" checked={useSameTeamForAll} onCheckedChange={setUseSameTeamForAll} />
            </div>

            <div className="space-y-3">
              {days.map((day, idx) => (
                <div key={`${day.date}-${day.kind}`} className="rounded-lg border border-border/60 p-3 space-y-2 bg-card">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {phaseLabel(day.kind)}
                      </Badge>
                      <span className="text-sm font-medium">
                        {format(parseISO(day.date), 'EEE d MMM', { locale: sv })}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 items-end">
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Start</Label>
                      <Input
                        type="time"
                        value={day.startTime}
                        onChange={(e) => updateDay(idx, { startTime: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Slut</Label>
                      <Input
                        type="time"
                        value={day.endTime}
                        onChange={(e) => updateDay(idx, { endTime: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground">
                        {day.kind === 'event' ? 'Team (visas ej i kalender)' : 'Team'}
                      </Label>
                      <Select
                        value={day.teamId}
                        onValueChange={(v) => updateDay(idx, { teamId: v })}
                        disabled={day.kind === 'event'}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {teamOptions.map(t => (
                            <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-border/40">
              <Button variant="outline" onClick={onClose} disabled={saving}>
                Avbryt
              </Button>
              <Button onClick={handleSave} disabled={saving || days.length === 0}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Spara & lägg i kalendern
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
