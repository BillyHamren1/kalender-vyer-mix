import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, Calendar as CalIcon, X, Plus, Trash2 } from 'lucide-react';
import { format, parseISO, addDays } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { addCalendarEvent } from '@/services/eventService';
import { syncLargeProjectPlanningAssignments } from '@/services/largeProjectPlannerService';
import { useTeamResources } from '@/hooks/useTeamResources';

type Phase = 'rig' | 'rigDown';
type DayKind = Phase | 'event';

interface PlanningDay {
  date: string;
  kind: DayKind;
  startTime: string;
  endTime: string;
  teamId: string;
}

interface Props {
  projectId: string;
  projectKind: 'medium' | 'large';
  open: boolean;
  onClose: () => void;
}

const DEFAULTS: Record<DayKind, { start: string; end: string }> = {
  rig: { start: '08:00', end: '16:00' },
  event: { start: '17:00', end: '23:00' },
  rigDown: { start: '08:00', end: '16:00' },
};

const PHASE_ORDER: DayKind[] = ['rig', 'event', 'rigDown'];
const phaseLabel = (k: DayKind) => k === 'rig' ? 'Riggning' : k === 'rigDown' ? 'Demontering' : 'Event';

const trimSec = (t: string | null | undefined): string | null => {
  if (!t || typeof t !== 'string') return null;
  const m = t.match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : null;
};

const FIELD_MAP: Record<DayKind, { start: string; end: string }> = {
  rig: { start: 'rig_start_time', end: 'rig_end_time' },
  event: { start: 'event_start_time', end: 'event_end_time' },
  rigDown: { start: 'rigdown_start_time', end: 'rigdown_end_time' },
};

export const pickBookingTime = (
  booking: any,
  kind: DayKind,
  edge: 'start' | 'end',
): string => {
  const field = FIELD_MAP[kind][edge];
  return trimSec(booking?.[field]) ?? DEFAULTS[kind][edge];
};

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const nextDayIso = (iso: string): string => {
  try {
    const d = addDays(parseISO(iso), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return todayIso();
  }
};

/**
 * Flytande, icke-modal planeringspanel — kalendern bakom syns hela tiden.
 * Stöder flera dagar per fas (Riggning/Event/Demontering).
 */
export const ProjectPlanningSheet: React.FC<Props> = ({ projectId, projectKind, open, onClose }) => {
  const qc = useQueryClient();
  const { teamResources } = useTeamResources();
  const [saving, setSaving] = useState(false);
  const [useSameTeamForAll, setUseSameTeamForAll] = useState(true);
  const [days, setDays] = useState<PlanningDay[]>([]);

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

  useEffect(() => {
    if (!ctx || ctx.bookings.length === 0) return;
    const b = ctx.bookings[0];
    const list: PlanningDay[] = [];
    if (b.rigdaydate) list.push({ date: b.rigdaydate, kind: 'rig', ...DEFAULTS.rig, teamId: 'team-1', startTime: DEFAULTS.rig.start, endTime: DEFAULTS.rig.end });
    if (b.eventdate) list.push({ date: b.eventdate, kind: 'event', startTime: DEFAULTS.event.start, endTime: DEFAULTS.event.end, teamId: 'team-1' });
    if (b.rigdowndate) list.push({ date: b.rigdowndate, kind: 'rigDown', startTime: DEFAULTS.rigDown.start, endTime: DEFAULTS.rigDown.end, teamId: 'team-1' });
    list.sort((a, z) => a.date.localeCompare(z.date));
    setDays(list);
  }, [ctx]);

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
      if (useSameTeamForAll && patch.teamId) {
        return next.map(d => ({ ...d, teamId: patch.teamId! }));
      }
      return next;
    });
  };

  const removeDay = (idx: number) => {
    setDays(prev => prev.filter((_, i) => i !== idx));
  };

  const addDayForPhase = (kind: DayKind) => {
    setDays(prev => {
      const inPhase = prev.filter(d => d.kind === kind).sort((a, z) => a.date.localeCompare(z.date));
      const lastDate = inPhase.length > 0 ? inPhase[inPhase.length - 1].date : (ctx?.bookings?.[0]?.[kind === 'rig' ? 'rigdaydate' : kind === 'event' ? 'eventdate' : 'rigdowndate'] ?? todayIso());
      const newDate = inPhase.length > 0 ? nextDayIso(lastDate) : lastDate;
      const team = useSameTeamForAll ? masterTeam : 'team-1';
      const next: PlanningDay = {
        date: newDate,
        kind,
        startTime: DEFAULTS[kind].start,
        endTime: DEFAULTS[kind].end,
        teamId: team,
      };
      return [...prev, next];
    });
  };

  const teamOptions = useMemo(() => {
    return teamResources
      .filter((r: any) => r.id !== 'team-11' && r.id !== 'transport')
      .map((r: any) => ({ id: r.id, title: r.title }));
  }, [teamResources]);

  const groupedByPhase = useMemo(() => {
    const map: Record<DayKind, { day: PlanningDay; idx: number }[]> = { rig: [], event: [], rigDown: [] };
    days.forEach((d, idx) => map[d.kind].push({ day: d, idx }));
    PHASE_ORDER.forEach(p => map[p].sort((a, z) => a.day.date.localeCompare(z.day.date)));
    return map;
  }, [days]);

  const handleSave = async () => {
    if (!ctx || ctx.bookings.length === 0) {
      toast.error('Ingen bokning kopplad');
      return;
    }
    setSaving(true);
    try {
      for (const day of days) {
        if (day.kind === 'event') continue;
        for (const b of ctx.bookings) {
          // Identitet = (booking_id, event_type, source_date, organization_id).
          // Om en rad redan finns för denna fas+datum (t.ex. från bookings-import
          // eller en tidigare planering) ska vi uppdatera den, inte krascha på
          // uq_calendar_event_identity. Vi gör därför update→insert per dag.
          const { data: existing, error: existingErr } = await supabase
            .from('calendar_events')
            .select('id')
            .eq('booking_id', b.id)
            .eq('event_type', day.kind)
            .eq('source_date', day.date)
            .maybeSingle();
          if (existingErr) throw existingErr;

          const payload = {
            title: b.client || ctx.projectName || 'Projekt',
            start_time: `${day.date}T${day.startTime}:00+00:00`,
            end_time: `${day.date}T${day.endTime}:00+00:00`,
            resource_id: day.teamId,
            booking_id: b.id,
            event_type: day.kind,
            delivery_address: b.deliveryaddress || null,
            booking_number: b.booking_number || null,
            source_date: day.date,
          };

          if (existing?.id) {
            const { error: updErr } = await supabase
              .from('calendar_events')
              .update(payload)
              .eq('id', existing.id);
            if (updErr) throw updErr;
          } else {
            // Vi har redan select:at ovan — kör ren insert istället för upsert
            // för att undvika ON CONFLICT-inferens mot partiellt unikt index
            // (uq_calendar_event_identity inkluderar organization_id som vi
            // inte sätter här, vilket fick PostgREST att fela med
            // "no unique or exclusion constraint matching the ON CONFLICT specification").
            const { error: insErr } = await supabase
              .from('calendar_events')
              .insert(payload);
            if (insErr) throw insErr;
          }
        }
      }

      if (projectKind === 'large') {
        await syncLargeProjectPlanningAssignments(projectId, days);
      }

      const sortedRig = days.filter(d => d.kind === 'rig').sort((a, z) => a.date.localeCompare(z.date));
      const sortedDown = days.filter(d => d.kind === 'rigDown').sort((a, z) => a.date.localeCompare(z.date));
      const sortedEvent = days.filter(d => d.kind === 'event').sort((a, z) => a.date.localeCompare(z.date));
      const updates: any = {};
      if (sortedRig[0]) {
        updates.rig_start_time = `${sortedRig[0].startTime}:00`;
        updates.rig_end_time = `${sortedRig[0].endTime}:00`;
      }
      if (sortedDown[0]) {
        updates.rigdown_start_time = `${sortedDown[0].startTime}:00`;
        updates.rigdown_end_time = `${sortedDown[0].endTime}:00`;
      }
      if (sortedEvent[0]) {
        updates.event_start_time = `${sortedEvent[0].startTime}:00`;
        updates.event_end_time = `${sortedEvent[0].endTime}:00`;
      }
      if (Object.keys(updates).length > 0) {
        await supabase.from('bookings').update(updates).in('id', ctx.bookings.map(b => b.id));
      }

      const table = projectKind === 'medium' ? 'projects' : 'large_projects';
      const { error: flipErr } = await supabase
        .from(table)
        .update({ planning_status: 'planned' })
        .eq('id', projectId);
      if (flipErr) throw flipErr;

      toast.success('Projektet är planerat och ligger nu i kalendern');
      qc.invalidateQueries({ queryKey: ['unplanned-projects'] });
      qc.invalidateQueries({ queryKey: ['calendar-events'] });
      qc.invalidateQueries({ queryKey: ['planner-calendar'] });
      qc.invalidateQueries({ queryKey: ['large-project-team-assignments'] });
      qc.invalidateQueries({ queryKey: ['large-project', projectId] });
      qc.invalidateQueries({ queryKey: ['large-projects'] });
      // Push a synchronous signal to the (non-react-query) calendar hooks so
      // they refetch calendar_events + large_project_team_assignments and
      // re-derive the planner view without requiring a page refresh.
      try {
        window.dispatchEvent(new CustomEvent('planner-calendar-refresh', {
          detail: { source: 'ProjectPlanningSheet', projectId, projectKind },
        }));
      } catch {
        /* ignore (SSR/test envs) */
      }
      onClose();
    } catch (err: any) {
      console.error('[ProjectPlanningSheet] save error:', err);
      toast.error(err?.message || 'Kunde inte spara planeringen');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Planera projekt"
      className="fixed right-4 top-20 bottom-4 w-[440px] max-w-[92vw] z-40 bg-background border border-border rounded-lg shadow-xl flex flex-col"
    >
      <div className="flex items-start justify-between gap-2 p-4 border-b border-border/60">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            <CalIcon className="h-5 w-5 text-primary" />
            Planera projekt
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Sätt tider och team per dag. Eventen skapas i kalendern när du sparar.
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose} aria-label="Stäng">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading || !ctx ? (
          <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Laddar projekt…
          </div>
        ) : ctx.bookings.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            Projektet saknar kopplad bokning — ingen planering möjlig.
          </div>
        ) : (
          <div className="space-y-4">
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

            {PHASE_ORDER.map(phase => {
              const rows = groupedByPhase[phase];
              return (
                <div key={phase} className="rounded-lg border border-border/60 bg-card">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
                    <Badge variant="outline" className="text-[11px]">{phaseLabel(phase)}</Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => addDayForPhase(phase)}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Lägg till dag
                    </Button>
                  </div>
                  <div className="p-3 space-y-3">
                    {rows.length === 0 ? (
                      <div className="text-xs text-muted-foreground italic">Inga dagar — klicka "Lägg till dag"</div>
                    ) : rows.map(({ day, idx }) => (
                      <div key={`${day.kind}-${idx}`} className="space-y-2 rounded-md border border-border/40 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1">
                            <Label className="text-[11px] text-muted-foreground">Datum</Label>
                            <Input
                              type="date"
                              value={day.date}
                              onChange={(e) => updateDay(idx, { date: e.target.value })}
                              className="h-8 text-sm"
                            />
                            <div className="text-[11px] text-muted-foreground mt-1">
                              {(() => { try { return format(parseISO(day.date), 'EEE d MMM', { locale: sv }); } catch { return ''; } })()}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => removeDay(idx)}
                            aria-label="Ta bort dag"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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
                              {day.kind === 'event' ? 'Team (ej i kal.)' : 'Team'}
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
                </div>
              );
            })}
          </div>
        )}
      </div>

      {ctx && ctx.bookings.length > 0 && (
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border/60">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Avbryt
          </Button>
          <Button onClick={handleSave} disabled={saving || days.length === 0}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Spara & lägg i kalendern
          </Button>
        </div>
      )}
    </div>
  );
};
