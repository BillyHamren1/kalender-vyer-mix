import React, { useEffect, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Loader2, Clock, Users, Calendar as CalIcon, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { updateCalendarEvent } from '@/services/calendarService';
import { moveLargeProjectDay, type LargeProjectPhase } from '@/services/largeProjectPlannerService';
import { deleteCalendarEvent } from '@/services/eventService';
import { useMoveEventToTeam } from '@/hooks/useMoveEventToTeam';
import { useEventBookingDays } from '@/hooks/useEventBookingDays';
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

function extractTime(iso: string): { h: string; m: string } {
  const t = iso.split('T')[1] || '00:00';
  return { h: t.slice(0, 2), m: t.slice(3, 5) };
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

  const { teams, busy: teamBusy, moveOneDay, currentTeamId } = useMoveEventToTeam(event, setEvents, async () => {
    if (onUpdate) await onUpdate();
    setRefreshKey(k => k + 1);
  });
  const { days } = useEventBookingDays(event, refreshKey);

  const startISO = typeof event.start === 'string' ? event.start : new Date(event.start).toISOString();
  const endISO = typeof event.end === 'string' ? event.end : new Date(event.end).toISOString();
  const initStart = extractTime(startISO);
  const initEnd = extractTime(endISO);
  const [sH, setSH] = useState(initStart.h);
  const [sM, setSM] = useState(initStart.m);
  const [eH, setEH] = useState(initEnd.h);
  const [eM, setEM] = useState(initEnd.m);

  useEffect(() => {
    if (open) {
      const s = extractTime(startISO);
      const e = extractTime(endISO);
      setSH(s.h); setSM(s.m); setEH(e.h); setEM(e.m);
    }
  }, [open, startISO, endISO]);

  const timeChanged = sH !== initStart.h || sM !== initStart.m || eH !== initEnd.h || eM !== initEnd.m;

  const handleSaveTime = async () => {
    setSavingTime(true);
    try {
      const eventDate = startISO.split('T')[0];
      const newStartISO = `${eventDate}T${sH}:${sM}:00Z`;
      const newEndISO = `${eventDate}T${eH}:${eM}:00Z`;
      if (new Date(newEndISO) <= new Date(newStartISO)) {
        toast.error('Sluttid måste vara efter starttid');
        return;
      }

      const ext: any = event.extendedProps || {};
      const phaseRaw = (ext.eventType || event.eventType) as string | undefined;
      if (ext.largeProjectId && (phaseRaw === 'rig' || phaseRaw === 'rigDown')) {
        const sourceDate = ext.sourceDate || eventDate;
        await moveLargeProjectDay({
          largeProjectId: ext.largeProjectId,
          phase: phaseRaw as LargeProjectPhase,
          fromDate: sourceDate,
          toDate: sourceDate,
          newStartISO: `${sourceDate}T${sH}:${sM}:00Z`,
          newEndISO: `${sourceDate}T${eH}:${eM}:00Z`,
        });
      } else {
        await updateCalendarEvent(event.id, { start: newStartISO, end: newEndISO });
      }
      toast.success('Tid uppdaterad');
      if (onUpdate) await onUpdate();
      setRefreshKey(k => k + 1);
    } catch (e: any) {
      toast.error(e?.message || 'Kunde inte uppdatera tid');
    } finally {
      setSavingTime(false);
    }
  };

  const handleDeleteDay = async (dayId: string) => {
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

  const sortedDays = [...days].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div style={{ width: '100%', height: '100%' }}>
            {children}
          </div>
        </PopoverTrigger>
        <PopoverContent
          className="w-80 p-3 z-[9999]"
          align="center"
          side="right"
          sideOffset={8}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="space-y-3">
            <div className="text-xs font-semibold text-muted-foreground truncate">{event.title}</div>

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

            {/* DAYS ROW */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <CalIcon className="h-3 w-3" /> Dagar
              </div>
              <div className="flex flex-wrap gap-1">
                {sortedDays.map((d) => {
                  const date = d.source_date || d.start_time?.split('T')[0];
                  const dateLabel = date ? format(new Date(date), 'd MMM', { locale: sv }) : '?';
                  const phaseLabel = PHASE_LABEL[d.event_type] || d.event_type;
                  const isCurrent = d.id === event.id;
                  const isBusy = deletingId === d.id;
                  return (
                    <button
                      key={d.id}
                      onClick={() => !isBusy && handleDeleteDay(d.id)}
                      disabled={isBusy}
                      title={isCurrent ? 'Denna dag (klicka för att ta bort)' : 'Klicka för att ta bort'}
                      className={`group inline-flex items-center gap-1 h-7 px-2 text-[11px] rounded border transition-colors ${
                        isCurrent
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background hover:bg-destructive/10 hover:border-destructive/40'
                      } disabled:opacity-50`}
                    >
                      <span className="font-medium">{phaseLabel}</span>
                      <span className="opacity-70">{dateLabel}</span>
                      {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3 opacity-40 group-hover:opacity-100 group-hover:text-destructive" />}
                    </button>
                  );
                })}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => setShowAddDay(true)}
                >
                  <Plus className="h-3 w-3 mr-1" /> Lägg till
                </Button>
              </div>
            </div>

            {/* TIME ROW */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" /> Tid
              </div>
              <div className="flex items-center gap-2 text-xs">
                <TimeSelect h={sH} m={sM} onH={setSH} onM={setSM} />
                <span className="text-muted-foreground">–</span>
                <TimeSelect h={eH} m={eM} onH={setEH} onM={setEM} />
                <Button
                  size="sm"
                  className="h-7 ml-auto"
                  disabled={!timeChanged || savingTime}
                  onClick={handleSaveTime}
                >
                  {savingTime ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Spara'}
                </Button>
              </div>
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

const TimeSelect: React.FC<{ h: string; m: string; onH: (v: string) => void; onM: (v: string) => void }> = ({ h, m, onH, onM }) => (
  <div className="inline-flex items-center gap-0.5 border rounded px-1 py-0.5 bg-background">
    <select value={h} onChange={(e) => onH(e.target.value)} className="bg-transparent text-xs outline-none">
      {HOURS.map(x => <option key={x} value={x}>{x}</option>)}
    </select>
    <span>:</span>
    <select value={m} onChange={(e) => onM(e.target.value)} className="bg-transparent text-xs outline-none">
      {MINUTES.map(x => <option key={x} value={x}>{x}</option>)}
    </select>
  </div>
);

export default EventActionPopover;
