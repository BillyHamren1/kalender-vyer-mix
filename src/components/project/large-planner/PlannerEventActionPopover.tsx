/**
 * PlannerEventActionPopover
 * --------------------------------------------------------------------------
 * Popover för PLANNER-events (large_project_booking_plan_items) i
 * projektkalendern. Speglar EventActionPopover visuellt men:
 *  - Ändra tid       → updateItem(plannerItemId, { start_time, end_time })
 *  - Flytta till team→ updateItem(plannerItemId, { assigned_team_id, ... })
 *  - Ta bort         → deleteItem(plannerItemId)
 *  - Lägg till fas-dag → PlannerAddPhaseDayDialog (skapar nya planner-items)
 *
 * Skriver ALDRIG till calendar_events / bookings / staff_assignments.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import {
  Plus, Trash2, Loader2, Clock, Users, Calendar as CalIcon,
  ExternalLink, ChevronLeft, ChevronRight, Lock, Unlock,
} from 'lucide-react';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek, endOfWeek, isSameDay, isSameMonth, addMonths, subMonths,
  parseISO,
} from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import type { CalendarEvent } from '../../Calendar/ResourceData';
import { useLargeProjectPlannerItems } from './useLargeProjectPlannerItems';
import { FIXED_TEAM_IDS } from './LargeProjectPlannerCalendarAdapter';
import PlannerAddPhaseDayDialog, { type PlannerPhase } from './PlannerAddPhaseDayDialog';

interface Props {
  event: CalendarEvent;
  onOpenDetails?: () => void;
  children: React.ReactNode;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];

const PHASE_LABEL: Record<string, string> = {
  rig: 'Rig',
  event: 'Event',
  rigDown: 'Rivning',
};
const PHASE_DOT_CLASS: Record<string, string> = {
  rig: 'bg-blue-500',
  event: 'bg-purple-500',
  rigDown: 'bg-orange-500',
};

const isValidPhase = (p: string | null | undefined): p is PlannerPhase =>
  p === 'rig' || p === 'event' || p === 'rigDown';

function extractTime(iso: string): { h: string; m: string } {
  const t = iso.split('T')[1] || '00:00';
  return { h: t.slice(0, 2), m: t.slice(3, 5) };
}

const TimeSelect: React.FC<{
  h: string; m: string;
  onH: (v: string) => void; onM: (v: string) => void;
}> = ({ h, m, onH, onM }) => (
  <div className="inline-flex items-center gap-1">
    <select
      value={h}
      onChange={(e) => onH(e.target.value)}
      className="h-7 rounded border border-border bg-background px-1 text-xs"
    >
      {HOURS.map((v) => <option key={v} value={v}>{v}</option>)}
    </select>
    <span className="text-muted-foreground">:</span>
    <select
      value={m}
      onChange={(e) => onM(e.target.value)}
      className="h-7 rounded border border-border bg-background px-1 text-xs"
    >
      {MINUTES.map((v) => <option key={v} value={v}>{v}</option>)}
    </select>
  </div>
);

const PlannerEventActionPopover: React.FC<Props> = ({ event, onOpenDetails, children }) => {
  const ext = event.extendedProps as any;
  const plannerItemId: string | undefined = ext?.plannerItemId;
  const largeProjectId: string | undefined = ext?.plannerLargeProjectId ?? ext?.largeProjectId;
  const bookingId: string | null = ext?.plannerBookingId ?? null;
  const phaseRaw: string | null = ext?.plannerPhase ?? null;
  const currentTeamId: string | null = ext?.assignedTeamId ?? null;
  const isCurrentLocked: boolean = ext?.plannerTimesLocked === true;

  const ctx = useLargeProjectPlannerItems(largeProjectId ?? null);

  const [open, setOpen] = useState(false);
  const [showAddDay, setShowAddDay] = useState(false);
  const [savingTime, setSavingTime] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [movingTeam, setMovingTeam] = useState(false);
  const [applyToAll, setApplyToAll] = useState(false);
  const [togglingLock, setTogglingLock] = useState(false);

  const startISO = typeof event.start === 'string'
    ? event.start
    : new Date(event.start).toISOString();
  const endISO = typeof event.end === 'string'
    ? event.end
    : new Date(event.end).toISOString();
  const initStart = extractTime(startISO);
  const initEnd = extractTime(endISO);
  const eventDate = startISO.split('T')[0];

  const [sH, setSH] = useState(initStart.h);
  const [sM, setSM] = useState(initStart.m);
  const [eH, setEH] = useState(initEnd.h);
  const [eM, setEM] = useState(initEnd.m);
  const [viewMonth, setViewMonth] = useState<Date>(parseISO(eventDate));

  useEffect(() => {
    if (open) {
      const s = extractTime(startISO);
      const e = extractTime(endISO);
      setSH(s.h); setSM(s.m); setEH(e.h); setEM(e.m);
      setViewMonth(parseISO(eventDate));
    }
  }, [open, startISO, endISO, eventDate]);

  const phaseLabel = phaseRaw ? PHASE_LABEL[phaseRaw] ?? '' : '';
  const timeChanged = sH !== initStart.h || sM !== initStart.m
    || eH !== initEnd.h || eM !== initEnd.m;

  // Befintliga planner-dagar för samma bokning + fas → datumceller i kalendern.
  const phaseDays = useMemo(() => {
    if (!bookingId || !phaseRaw) return [];
    return ctx.items.filter(
      (it) => it.booking_id === bookingId && it.source_booking_phase === phaseRaw,
    );
  }, [ctx.items, bookingId, phaseRaw]);

  const daysByDate = useMemo(() => {
    const m = new Map<string, typeof phaseDays>();
    for (const d of phaseDays) {
      const arr = m.get(d.plan_date) ?? [];
      arr.push(d);
      m.set(d.plan_date, arr);
    }
    return m;
  }, [phaseDays]);

  const monthCells = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [viewMonth]);

  const handleSaveTime = async () => {
    if (!plannerItemId) return;
    if (isCurrentLocked && !applyToAll) {
      toast.error('Tiden är låst för denna dag');
      return;
    }
    const newStart = `${sH}:${sM}:00`;
    const newEnd = `${eH}:${eM}:00`;
    if (newEnd <= newStart) {
      toast.error('Sluttid måste vara efter starttid');
      return;
    }
    // Bulk: alla planner-dagar för samma bokning + fas, hoppa låsta.
    const targets = applyToAll
      ? phaseDays.filter((d) => d.times_locked !== true)
      : phaseDays.filter((d) => d.id === plannerItemId);
    const skipped = applyToAll
      ? phaseDays.filter((d) => d.times_locked === true).length
      : 0;
    if (targets.length === 0) {
      toast.error('Inget att uppdatera (alla låsta?)');
      return;
    }
    setSavingTime(true);
    try {
      for (const t of targets) {
        await ctx.updateItem(t.id, { start_time: newStart, end_time: newEnd });
      }
      toast.success(
        applyToAll
          ? `Tid uppdaterad för ${targets.length} dag(ar)${skipped ? ` (${skipped} låsta hoppades över)` : ''}`
          : 'Tid uppdaterad',
      );
    } catch (e: any) {
      toast.error(e?.message || 'Kunde inte uppdatera tid');
    } finally {
      setSavingTime(false);
    }
  };

  const handleMoveToTeam = async (teamId: string) => {
    if (!plannerItemId || teamId === currentTeamId) return;
    const targets = applyToAll
      ? phaseDays.filter((d) => d.times_locked !== true)
      : phaseDays.filter((d) => d.id === plannerItemId);
    const skipped = applyToAll
      ? phaseDays.filter((d) => d.times_locked === true).length
      : 0;
    if (targets.length === 0) {
      toast.error('Inget att flytta (alla låsta?)');
      return;
    }
    setMovingTeam(true);
    try {
      for (const t of targets) {
        await ctx.updateItem(t.id, {
          assigned_team_id: teamId,
          assigned_staff_id: null,
        });
      }
      const label = teamId.replace('team-', 'Team ');
      toast.success(
        applyToAll
          ? `${targets.length} dag(ar) flyttade till ${label}${skipped ? ` (${skipped} låsta hoppades över)` : ''}`
          : `Flyttad till ${label}`,
      );
    } catch (e: any) {
      toast.error(e?.message || 'Kunde inte flytta');
    } finally {
      setMovingTeam(false);
    }
  };

  const handleToggleLock = async () => {
    if (!plannerItemId) return;
    setTogglingLock(true);
    try {
      await ctx.updateItem(plannerItemId, { times_locked: !isCurrentLocked } as never);
      toast.success(!isCurrentLocked ? 'Tid låst för denna dag' : 'Tid upplåst');
    } catch (e: any) {
      toast.error(e?.message || 'Kunde inte ändra lås');
    } finally {
      setTogglingLock(false);
    }
  };

  const handleDeleteDay = async (id: string) => {
    const target = phaseDays.find((d) => d.id === id);
    if (target?.times_locked) {
      toast.error('Dagen är låst – lås upp först');
      return;
    }
    setDeletingId(id);
    try {
      await ctx.deleteItem(id);
      toast.success('Dag borttagen');
    } catch (e: any) {
      toast.error(e?.message || 'Kunde inte ta bort');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteCurrent = async () => {
    if (!plannerItemId) return;
    if (isCurrentLocked) {
      toast.error('Dagen är låst – lås upp först');
      return;
    }
    await handleDeleteDay(plannerItemId);
    setOpen(false);
  };

  const defaultPhase: PlannerPhase = isValidPhase(phaseRaw) ? phaseRaw : 'rig';

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div style={{ width: '100%', height: '100%' }}>{children}</div>
        </PopoverTrigger>
        <PopoverContent
          className="w-[440px] p-3 z-[9999]"
          align="center"
          side="right"
          sideOffset={8}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-muted-foreground truncate">
                {event.title}
              </div>
              <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-violet-100 text-violet-700">
                Projektplan
              </span>
            </div>

            {/* TEAM ROW */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3" /> Team
              </div>
              <div className="flex flex-wrap gap-1">
                {FIXED_TEAM_IDS.map((t) => {
                  const num = t.replace('team-', '');
                  const isActive = t === currentTeamId;
                  return (
                    <Button
                      key={t}
                      size="sm"
                      variant={isActive ? 'default' : 'outline'}
                      className="h-7 px-2 text-xs"
                      disabled={movingTeam || isActive}
                      onClick={() => handleMoveToTeam(t)}
                    >
                      T{num}
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* MONTH CALENDAR */}
            {bookingId && phaseRaw && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <CalIcon className="h-3 w-3" /> Dagar ({phaseLabel})
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setViewMonth((m) => subMonths(m, 1))}
                      className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted"
                      aria-label="Föregående månad"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-xs font-medium min-w-[80px] text-center capitalize">
                      {format(viewMonth, 'MMMM yyyy', { locale: sv })}
                    </span>
                    <button
                      type="button"
                      onClick={() => setViewMonth((m) => addMonths(m, 1))}
                      className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted"
                      aria-label="Nästa månad"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-0.5 text-[10px] text-muted-foreground text-center">
                  {['M', 'T', 'O', 'T', 'F', 'L', 'S'].map((d, i) => (
                    <div key={i}>{d}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-0.5">
                  {monthCells.map((d) => {
                    const k = format(d, 'yyyy-MM-dd');
                    const inMonth = isSameMonth(d, viewMonth);
                    const rows = daysByDate.get(k) ?? [];
                    const hasRows = rows.length > 0;
                    const anyLocked = rows.some((r) => r.times_locked === true);
                    const onlyLocked = hasRows && rows.every((r) => r.times_locked === true);
                    const isCurrent = isSameDay(d, parseISO(eventDate));
                    const ringCls = isCurrent
                      ? 'ring-2 ring-primary'
                      : anyLocked
                        ? 'ring-2 ring-destructive'
                        : '';
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          if (hasRows) {
                            const target = rows.find((r) => r.times_locked !== true) ?? rows[0];
                            handleDeleteDay(target.id);
                          } else {
                            setShowAddDay(true);
                          }
                        }}
                        title={hasRows
                          ? `${rows.length} dag(ar)${onlyLocked ? ' (låst)' : ' — klicka för att ta bort'}`
                          : 'Klicka för att lägga till dag'}
                        disabled={deletingId !== null && rows.some((r) => r.id === deletingId)}
                        className={`relative h-11 rounded border text-[11px] flex flex-col items-center justify-start pt-1 transition-colors ${
                          inMonth ? 'bg-background' : 'bg-muted/30 text-muted-foreground'
                        } ${ringCls} ${
                          hasRows
                            ? 'border-border hover:bg-destructive/10 hover:border-destructive/40'
                            : 'border-dashed border-border hover:bg-planner/5 hover:border-planner/40'
                        } disabled:opacity-50`}
                      >
                        <span className={`leading-none ${isCurrent ? 'font-semibold' : ''}`}>
                          {format(d, 'd')}
                        </span>
                        {anyLocked && (
                          <Lock className="absolute top-0.5 right-0.5 h-2.5 w-2.5 text-destructive" />
                        )}
                        {hasRows && (
                          <div className="absolute bottom-1 left-1 right-1 flex flex-wrap justify-center gap-0.5">
                            {rows.map((r) => (
                              <span
                                key={r.id}
                                className={`h-1.5 w-1.5 rounded-full ${
                                  PHASE_DOT_CLASS[r.source_booking_phase ?? ''] ?? 'bg-foreground/40'
                                }`}
                              />
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-end text-[10px] text-muted-foreground">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => setShowAddDay(true)}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Lägg till
                  </Button>
                </div>
              </div>
            )}

            {/* TIME ROW */}
            <div className={`space-y-1.5 rounded p-2 -mx-1 ${isCurrentLocked ? 'bg-destructive/5 ring-1 ring-destructive/40' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" /> Tid
                  {phaseLabel && (
                    <span>· {phaseLabel} {format(parseISO(eventDate), 'd MMM', { locale: sv })}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleToggleLock}
                  disabled={togglingLock || !plannerItemId}
                  className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border transition-colors ${
                    isCurrentLocked
                      ? 'border-destructive text-destructive bg-destructive/10'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  } disabled:opacity-50`}
                  title={isCurrentLocked ? 'Klicka för att låsa upp' : 'Lås tid mot redigering'}
                >
                  {togglingLock
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : isCurrentLocked
                      ? <><Lock className="h-3 w-3" />Låst</>
                      : <><Unlock className="h-3 w-3" />Lås tider</>}
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <TimeSelect h={sH} m={sM} onH={setSH} onM={setSM} />
                <span className="text-muted-foreground">–</span>
                <TimeSelect h={eH} m={eM} onH={setEH} onM={setEM} />
                <Button
                  size="sm"
                  className="h-7 ml-auto"
                  disabled={!timeChanged || savingTime || (isCurrentLocked && !applyToAll)}
                  onClick={handleSaveTime}
                >
                  {savingTime ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Spara'}
                </Button>
              </div>
              {phaseDays.length > 1 && (
                <label className="flex items-center gap-2 text-xs cursor-pointer select-none text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={applyToAll}
                    onChange={(e) => setApplyToAll(e.target.checked)}
                    className="h-3.5 w-3.5 accent-primary"
                  />
                  Ändra tid/team för alla {phaseLabel || 'fas'}-dagar ({phaseDays.length}) — låsta hoppas över
                </label>
              )}
              {isCurrentLocked && !applyToAll && (
                <div className="text-[11px] text-destructive">
                  Tiden är låst — lås upp eller bocka i "Ändra för alla …-dagar" för att spara.
                </div>
              )}
            </div>

            {/* FOOTER */}
            <div className="flex gap-2 pt-1 border-t">
              {onOpenDetails && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs flex-1"
                  onClick={() => { setOpen(false); onOpenDetails(); }}
                >
                  <ExternalLink className="h-3 w-3 mr-1" /> Öppna
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-destructive hover:bg-destructive/10"
                disabled={deletingId === plannerItemId || isCurrentLocked}
                onClick={handleDeleteCurrent}
              >
                <Trash2 className="h-3 w-3 mr-1" /> Ta bort
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {largeProjectId && (
        <PlannerAddPhaseDayDialog
          open={showAddDay}
          onOpenChange={setShowAddDay}
          largeProjectId={largeProjectId}
          bookingId={bookingId}
          defaultPhase={defaultPhase}
          defaultStartTime={`${initStart.h}:${initStart.m}`}
          defaultEndTime={`${initEnd.h}:${initEnd.m}`}
          defaultTeamId={currentTeamId}
          defaultMonth={parseISO(eventDate)}
          titleFallback={event.title}
        />
      )}
    </>
  );
};

export default PlannerEventActionPopover;
