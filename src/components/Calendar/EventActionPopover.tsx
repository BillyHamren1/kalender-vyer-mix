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
} from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import { updateCalendarEvent, setCalendarEventTimesLocked } from '@/services/eventService';
import { setCustomerPickupForBooking } from '@/services/customerPickupService';
import { moveLargeProjectDay, type LargeProjectPhase } from '@/services/largeProjectPlannerService';
import { deleteCalendarEvent } from '@/services/eventService';
import { useMoveEventToTeam } from '@/hooks/useMoveEventToTeam';
import { useEventBookingDays, type BookingDayRow } from '@/hooks/useEventBookingDays';
import AddRiggDayDialog from './AddRiggDayDialog';
import type { CalendarEvent } from './ResourceData';

interface Props {
  event: CalendarEvent;
  setEvents?: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
  onUpdate?: () => Promise<void>;
  onOpenDetails?: () => void;
  onMoveDate?: () => void;
  children: React.ReactNode;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];

const PHASE_LABEL: Record<string, string> = {
  rig: 'Rig',
  event: 'Event',
  rigDown: 'Rivning',
  packing: 'Packning',
  return: 'Retur',
  delivery: 'Leverans',
  unpacking: 'Återlev',
};

// Tailwind classes for phase pills inside calendar cell
const PHASE_DOT_CLASS: Record<string, string> = {
  rig:     'bg-blue-500',
  event:   'bg-purple-500',
  rigDown: 'bg-orange-500',
  packing: 'bg-emerald-500',
  return:  'bg-emerald-500',
  delivery:'bg-emerald-500',
  unpacking:'bg-emerald-500',
};

function extractTime(iso: string): { h: string; m: string } {
  const t = iso.split('T')[1] || '00:00';
  return { h: t.slice(0, 2), m: t.slice(3, 5) };
}

function dayKey(d: BookingDayRow): string {
  return d.source_date || (d.start_time?.split('T')[0] ?? '');
}

const EventActionPopover: React.FC<Props> = ({
  event,
  setEvents,
  onUpdate,
  onOpenDetails,
  onMoveDate,
  children,
}) => {
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showAddDay, setShowAddDay] = useState(false);
  const [savingTime, setSavingTime] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [applyToAll, setApplyToAll] = useState(false);
  const [togglingLock, setTogglingLock] = useState(false);

  const { teams, busy: teamBusy, moveOneDay, currentTeamId } =
    useMoveEventToTeam(event, setEvents, async () => {
      if (onUpdate) await onUpdate();
      setRefreshKey(k => k + 1);
    });
  const { days } = useEventBookingDays(event, refreshKey);

  const startISO = typeof event.start === 'string' ? event.start : new Date(event.start).toISOString();
  const endISO   = typeof event.end   === 'string' ? event.end   : new Date(event.end).toISOString();
  const initStart = extractTime(startISO);
  const initEnd   = extractTime(endISO);
  const eventDate = startISO.split('T')[0];

  const [sH, setSH] = useState(initStart.h);
  const [sM, setSM] = useState(initStart.m);
  const [eH, setEH] = useState(initEnd.h);
  const [eM, setEM] = useState(initEnd.m);
  const [viewMonth, setViewMonth] = useState<Date>(new Date(eventDate));

  useEffect(() => {
    if (open) {
      const s = extractTime(startISO);
      const e = extractTime(endISO);
      setSH(s.h); setSM(s.m); setEH(e.h); setEM(e.m);
      setViewMonth(new Date(eventDate));
    }
  }, [open, startISO, endISO, eventDate]);

  // Group days by date (yyyy-MM-dd) → list of phase rows
  const daysByDate = useMemo(() => {
    const map = new Map<string, BookingDayRow[]>();
    for (const d of days) {
      const k = dayKey(d);
      if (!k) continue;
      const arr = map.get(k) ?? [];
      arr.push(d);
      map.set(k, arr);
    }
    return map;
  }, [days]);

  const currentDayRow = days.find(d => d.id === event.id);
  const isCurrentLocked = currentDayRow?.times_locked === true;

  const timeChanged = sH !== initStart.h || sM !== initStart.m || eH !== initEnd.h || eM !== initEnd.m;

  const phaseRaw = ((event.extendedProps as any)?.eventType || event.eventType) as string | undefined;
  const phaseLabel = (phaseRaw && PHASE_LABEL[phaseRaw]) || '';

  const handleSaveTime = async () => {
    if (isCurrentLocked) {
      toast.error('Tiden är låst för denna dag');
      return;
    }
    setSavingTime(true);
    try {
      const newStartISO = `${eventDate}T${sH}:${sM}:00Z`;
      const newEndISO   = `${eventDate}T${eH}:${eM}:00Z`;
      if (new Date(newEndISO) <= new Date(newStartISO)) {
        toast.error('Sluttid måste vara efter starttid');
        return;
      }

      const ext: any = event.extendedProps || {};

      // Bulk: skip locked days
      const targets = applyToAll
        ? days.filter(d => d.event_type === phaseRaw && d.times_locked !== true)
        : [{ id: event.id, source_date: eventDate, event_type: phaseRaw } as any];
      const skipped = applyToAll
        ? days.filter(d => d.event_type === phaseRaw && d.times_locked === true).length
        : 0;

      if (ext.largeProjectId && (phaseRaw === 'rig' || phaseRaw === 'rigDown')) {
        for (const t of targets) {
          const sd = t.source_date || (t.start_time?.split('T')[0]) || eventDate;
          await moveLargeProjectDay({
            largeProjectId: ext.largeProjectId,
            phase: phaseRaw as LargeProjectPhase,
            fromDate: sd,
            toDate: sd,
            newStartISO: `${sd}T${sH}:${sM}:00Z`,
            newEndISO:   `${sd}T${eH}:${eM}:00Z`,
          });
        }
      } else {
        for (const t of targets) {
          const sd = t.source_date || (t.start_time?.split('T')[0]) || eventDate;
          await updateCalendarEvent(t.id, {
            start: `${sd}T${sH}:${sM}:00Z`,
            end:   `${sd}T${eH}:${eM}:00Z`,
          });
        }
      }
      toast.success(
        applyToAll
          ? `Tid uppdaterad för ${targets.length} dagar${skipped ? ` (${skipped} låsta hoppades över)` : ''}`
          : 'Tid uppdaterad',
      );
      if (onUpdate) await onUpdate();
      setRefreshKey(k => k + 1);
    } catch (e: any) {
      toast.error(e?.message || 'Kunde inte uppdatera tid');
    } finally {
      setSavingTime(false);
    }
  };

  const handleToggleLock = async () => {
    if (!currentDayRow) return;
    setTogglingLock(true);
    try {
      await setCalendarEventTimesLocked(event.id, !isCurrentLocked);
      toast.success(!isCurrentLocked ? 'Tid låst för denna dag' : 'Tid upplåst');
      if (onUpdate) await onUpdate();
      setRefreshKey(k => k + 1);
    } catch (e: any) {
      toast.error(e?.message || 'Kunde inte ändra lås');
    } finally {
      setTogglingLock(false);
    }
  };

  const handleDeleteDay = async (dayId: string, locked: boolean) => {
    if (locked) {
      toast.error('Dagen är låst – lås upp först');
      return;
    }
    setDeletingId(dayId);
    try {
      await deleteCalendarEvent(dayId);
      toast.success('Dag borttagen');
      if (onUpdate) await onUpdate();
      setRefreshKey(k => k + 1);
    } catch (e: any) {
      toast.error(e?.message || 'Kunde inte ta bort');
    } finally {
      setDeletingId(null);
    }
  };

  const handleTeamClick = (teamId: string) => {
    if (teamId === currentTeamId) return;
    void moveOneDay(teamId);
  };

  // Build month grid (Mon–Sun rows)
  const monthCells = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
    const end   = endOfWeek(endOfMonth(viewMonth),   { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [viewMonth]);

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
            <div className="text-xs font-semibold text-muted-foreground truncate">
              {event.title}
            </div>

            {/* TEAM ROW */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3" /> Team
              </div>
              <div className="flex flex-wrap gap-1">
                {teams.map((t: any) => {
                  const num = (t.id.match(/team-(\d+)/) || [, ''])[1];
                  const isActive = t.id === currentTeamId;
                  return (
                    <Button
                      key={t.id}
                      size="sm"
                      variant={isActive ? 'default' : 'outline'}
                      className="h-7 px-2 text-xs"
                      disabled={teamBusy || isActive}
                      onClick={() => handleTeamClick(t.id)}
                    >
                      T{num || t.title}
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* MONTH CALENDAR */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CalIcon className="h-3 w-3" /> Dagar
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setViewMonth(m => subMonths(m, 1))}
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
                    onClick={() => setViewMonth(m => addMonths(m, 1))}
                    className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted"
                    aria-label="Nästa månad"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* weekday header */}
              <div className="grid grid-cols-7 gap-0.5 text-[10px] text-muted-foreground text-center">
                {['M','T','O','T','F','L','S'].map((d, i) => (
                  <div key={i}>{d}</div>
                ))}
              </div>

              {/* day cells */}
              <div className="grid grid-cols-7 gap-0.5">
                {monthCells.map((d) => {
                  const k = format(d, 'yyyy-MM-dd');
                  const inMonth = isSameMonth(d, viewMonth);
                  const rows = daysByDate.get(k) ?? [];
                  const hasRows = rows.length > 0;
                  const isCurrent = isSameDay(d, new Date(eventDate));
                  const anyLocked = rows.some(r => r.times_locked);
                  const onlyLockedInRows = hasRows && rows.every(r => r.times_locked);

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
                          // Delete the first non-locked phase row on this day
                          const target = rows.find(r => !r.times_locked) ?? rows[0];
                          handleDeleteDay(target.id, target.times_locked);
                        } else {
                          setShowAddDay(true);
                        }
                      }}
                      title={hasRows
                        ? `${rows.map(r => PHASE_LABEL[r.event_type] || r.event_type).join(' / ')}${onlyLockedInRows ? ' (låst)' : ' — klicka för att ta bort'}`
                        : 'Klicka för att lägga till dag'}
                      disabled={deletingId !== null && rows.some(r => r.id === deletingId)}
                      className={`relative h-11 rounded border text-[11px] flex flex-col items-center justify-start pt-1 transition-colors ${
                        inMonth ? 'bg-background' : 'bg-muted/30 text-muted-foreground'
                      } ${ringCls} ${
                        hasRows ? 'border-border hover:bg-destructive/10 hover:border-destructive/40'
                                : 'border-dashed border-border hover:bg-primary/5 hover:border-primary/40'
                      } disabled:opacity-50`}
                    >
                      <span className={`leading-none ${isCurrent ? 'font-semibold' : ''}`}>
                        {format(d, 'd')}
                      </span>
                      {hasRows && (
                        <div className="absolute bottom-1 left-1 right-1 flex flex-wrap justify-center gap-0.5">
                          {rows.map(r => (
                            <span
                              key={r.id}
                              className={`h-1.5 w-1.5 rounded-full ${PHASE_DOT_CLASS[r.event_type] || 'bg-foreground/40'}`}
                            />
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* legend + add */}
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-blue-500" />Rig</span>
                  <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-purple-500" />Event</span>
                  <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-orange-500" />Rivning</span>
                </div>
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

            {/* TIME ROW */}
            <div className={`space-y-1.5 rounded p-2 -mx-1 ${isCurrentLocked ? 'bg-destructive/5 ring-1 ring-destructive/40' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" /> Tid {phaseLabel && <span>· {phaseLabel} {format(new Date(eventDate), 'd MMM', { locale: sv })}</span>}
                </div>
                <button
                  type="button"
                  onClick={handleToggleLock}
                  disabled={togglingLock || !currentDayRow}
                  className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border transition-colors ${
                    isCurrentLocked
                      ? 'border-destructive text-destructive bg-destructive/10'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  } disabled:opacity-50`}
                  title={isCurrentLocked ? 'Klicka för att låsa upp' : 'Lås tid mot drag/redigering'}
                >
                  {togglingLock
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : isCurrentLocked
                      ? <><Lock className="h-3 w-3" />Låst</>
                      : <><Unlock className="h-3 w-3" />Lås tider</>}
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <TimeSelect h={sH} m={sM} onH={setSH} onM={setSM} disabled={isCurrentLocked} />
                <span className="text-muted-foreground">–</span>
                <TimeSelect h={eH} m={eM} onH={setEH} onM={setEM} disabled={isCurrentLocked} />
                <Button
                  size="sm"
                  className="h-7 ml-auto"
                  disabled={!timeChanged || savingTime || isCurrentLocked}
                  onClick={handleSaveTime}
                >
                  {savingTime ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Spara'}
                </Button>
              </div>

              <label className={`flex items-center gap-2 text-xs cursor-pointer select-none ${isCurrentLocked ? 'text-muted-foreground/60' : 'text-muted-foreground'}`}>
                <input
                  type="checkbox"
                  checked={applyToAll}
                  onChange={(e) => setApplyToAll(e.target.checked)}
                  disabled={isCurrentLocked}
                  className="h-3.5 w-3.5 accent-primary"
                />
                Ändra för alla {phaseLabel}-dagar (låsta hoppas över)
              </label>

              {isCurrentLocked && (
                <div className="text-[11px] text-destructive">
                  Tiden är låst — drag, resize och bulkändringar är blockerade för denna dag.
                </div>
              )}
            </div>

            {/* FOOTER */}
            <div className="flex gap-2 pt-1 border-t">
              {onOpenDetails && (
                <Button size="sm" variant="ghost" className="h-7 text-xs flex-1" onClick={() => { setOpen(false); onOpenDetails(); }}>
                  <ExternalLink className="h-3 w-3 mr-1" /> Öppna
                </Button>
              )}
              {onMoveDate && (
                <Button size="sm" variant="ghost" className="h-7 text-xs flex-1" onClick={() => { setOpen(false); onMoveDate(); }}>
                  Flytta datum…
                </Button>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <AddRiggDayDialog
        open={showAddDay}
        onOpenChange={setShowAddDay}
        event={{
          id: event.id,
          title: event.title,
          start: event.start,
          end: event.end,
          bookingId: event.bookingId,
          resourceId: event.resourceId,
          eventType: event.eventType,
        }}
        defaultStartTime={`${initStart.h}:${initStart.m}`}
        defaultEndTime={`${initEnd.h}:${initEnd.m}`}
        onUpdate={() => {
          if (onUpdate) void onUpdate();
          setRefreshKey(k => k + 1);
        }}
      />
    </>
  );
};

const TimeSelect: React.FC<{
  h: string; m: string;
  onH: (v: string) => void; onM: (v: string) => void;
  disabled?: boolean;
}> = ({ h, m, onH, onM, disabled }) => (
  <div className={`inline-flex items-center gap-0.5 border rounded px-1 py-0.5 bg-background ${disabled ? 'opacity-50' : ''}`}>
    <select disabled={disabled} value={h} onChange={(e) => onH(e.target.value)} className="bg-transparent text-xs outline-none">
      {HOURS.map(x => <option key={x} value={x}>{x}</option>)}
    </select>
    <span>:</span>
    <select disabled={disabled} value={m} onChange={(e) => onM(e.target.value)} className="bg-transparent text-xs outline-none">
      {MINUTES.map(x => <option key={x} value={x}>{x}</option>)}
    </select>
  </div>
);

export default EventActionPopover;
