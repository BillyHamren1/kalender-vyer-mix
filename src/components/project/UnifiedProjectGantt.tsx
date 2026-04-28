/**
 * UnifiedProjectGantt
 * --------------------------------------------------------------------------
 * One Gantt for ALL projects (medium + large). Reads `calendar_events` —
 * the same source as the staff calendar — and writes back through
 * `eventService.updateCalendarEvent` (which mirrors via timeSync to all
 * sibling bookings in a large project).
 *
 * Rules locked in mem://features/projects/unified-gantt-calendar-sync-v1
 *   - Lanes: Riggning, Event, Demontering (Event-day shown as marker).
 *   - One bar per (phase, source_date). Multi-day phases label as "Rigg dag N".
 *   - Realtime sync: changes from the staff calendar appear without reload.
 *   - Time edits in the time popover write through updateCalendarEvent.
 */
import { useMemo, useState } from 'react';
import { addDays, differenceInCalendarDays, format, parseISO, startOfDay } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Calendar as CalIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useProjectGanttEvents, type GanttPhase } from '@/hooks/useProjectGanttEvents';
import { updateCalendarEvent } from '@/services/eventService';
import { buildGanttLanes, getOverallRange, type GanttCell } from './gantt/buildGanttLanes';

interface Props {
  projectId: string | null | undefined;
  bookingId?: string | null;
  isLargeProject?: boolean;
}

const PHASE_BG: Record<GanttPhase, string> = {
  rig: 'bg-primary/85 hover:bg-primary text-primary-foreground',
  event: 'bg-amber-400/80 hover:bg-amber-500 text-amber-950',
  rigDown: 'bg-rose-500/85 hover:bg-rose-600 text-rose-50',
};

const DAY_WIDTH = 56;

const UnifiedProjectGantt = ({ projectId, bookingId, isLargeProject }: Props) => {
  const queryClient = useQueryClient();
  const { events, isLoading, refetch } = useProjectGanttEvents({
    projectId, bookingId, isLargeProject,
  });

  const [editingCell, setEditingCell] = useState<GanttCell | null>(null);
  const [savingCellKey, setSavingCellKey] = useState<string | null>(null);

  const lanes = useMemo(() => buildGanttLanes(events), [events]);
  const range = useMemo(() => getOverallRange(lanes), [lanes]);

  const days = useMemo(() => {
    if (!range) return [] as Date[];
    const start = parseISO(range.minDate);
    const end = parseISO(range.maxDate);
    const total = differenceInCalendarDays(end, start) + 1;
    return Array.from({ length: Math.max(total, 1) }, (_, i) => addDays(start, i));
  }, [range]);

  const colIndex = (date: string) => {
    if (!range) return 0;
    return differenceInCalendarDays(parseISO(date), parseISO(range.minDate));
  };

  async function persistCellTime(cell: GanttCell, startTime: string, endTime: string) {
    setSavingCellKey(`${cell.phase}|${cell.date}`);
    try {
      // Compose ISO timestamps anchored on the cell's date (keeps source_date stable).
      const newStart = `${cell.date}T${startTime}:00`;
      const newEnd = `${cell.date}T${endTime}:00`;

      // Update each underlying calendar_events row. updateCalendarEvent() then
      // calls timeSync.syncFromCalendarEvent() per row, which propagates the
      // time to every sibling booking sharing this phase+date in a large project.
      for (const ev of cell.events) {
        await updateCalendarEvent(ev.id, { start: newStart, end: newEnd });
      }

      toast.success(`${cell.label} uppdaterad`, {
        description: `${format(parseISO(cell.date), 'd MMM', { locale: sv })} · ${startTime}–${endTime}`,
      });

      // Invalidate planner caches so the staff calendar reflects the change too.
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      queryClient.invalidateQueries({ queryKey: ['project-gantt-events'] });
      await refetch();
      setEditingCell(null);
    } catch (err: any) {
      console.error('[UnifiedProjectGantt] persist failed', err);
      toast.error('Kunde inte uppdatera tid', { description: err?.message ?? 'Okänt fel' });
    } finally {
      setSavingCellKey(null);
    }
  }

  if (!projectId) return null;

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <CalIcon className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Tidsplan</CardTitle>
          <Badge variant="outline" className="text-[10px]">
            Synk med personalkalender
          </Badge>
        </div>
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 text-muted-foreground text-sm flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Laddar tidsplan…
          </div>
        ) : !range || lanes.every((l) => l.cells.length === 0) ? (
          <div className="p-6 text-muted-foreground text-sm">
            Inga planerade tider ännu. Skapa dem i personalkalendern så dyker de upp här.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div style={{ minWidth: 200 + days.length * DAY_WIDTH }}>
              {/* Header — day strip */}
              <div className="flex border-b bg-muted/30 sticky top-0 z-10">
                <div className="flex-shrink-0 px-3 py-2 text-xs font-medium text-muted-foreground" style={{ width: 200 }}>
                  Fas
                </div>
                {days.map((d, i) => {
                  const isToday = differenceInCalendarDays(d, startOfDay(new Date())) === 0;
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <div
                      key={i}
                      className={cn(
                        'flex-shrink-0 flex flex-col items-center justify-center text-[11px] border-r py-1',
                        isWeekend && 'bg-muted/50',
                        isToday && 'bg-primary/10 text-primary font-semibold',
                      )}
                      style={{ width: DAY_WIDTH }}
                    >
                      <span className="font-medium">{format(d, 'd MMM', { locale: sv })}</span>
                      <span className="text-muted-foreground">{format(d, 'EEE', { locale: sv })}</span>
                    </div>
                  );
                })}
              </div>

              {/* Lanes */}
              {lanes.map((lane) => (
                <div key={lane.phase} className="flex border-b last:border-b-0 min-h-[64px]">
                  <div
                    className="flex-shrink-0 px-3 py-3 text-sm font-medium border-r bg-muted/10 flex items-center"
                    style={{ width: 200 }}
                  >
                    {lane.title}
                    {lane.cells.length > 1 && (
                      <Badge variant="secondary" className="ml-2 text-[10px] h-4 px-1.5">
                        {lane.cells.length} dagar
                      </Badge>
                    )}
                  </div>

                  <div className="relative flex-1" style={{ height: 64, width: days.length * DAY_WIDTH }}>
                    {/* Grid lines */}
                    <div className="absolute inset-0 flex">
                      {days.map((d, i) => {
                        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                        return (
                          <div
                            key={i}
                            className={cn('flex-shrink-0 border-r', isWeekend && 'bg-muted/30')}
                            style={{ width: DAY_WIDTH }}
                          />
                        );
                      })}
                    </div>

                    {/* Cells (bars) */}
                    {lane.cells.map((cell) => {
                      const left = colIndex(cell.date) * DAY_WIDTH + 4;
                      const width = DAY_WIDTH - 8;
                      const cellKey = `${cell.phase}|${cell.date}`;
                      const isSaving = savingCellKey === cellKey;
                      const startHHMM = cell.startISO.slice(11, 16);
                      const endHHMM = cell.endISO.slice(11, 16);

                      return (
                        <Popover
                          key={cellKey}
                          open={editingCell?.phase === cell.phase && editingCell?.date === cell.date}
                          onOpenChange={(open) => setEditingCell(open ? cell : null)}
                        >
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                'absolute top-2 bottom-2 rounded-md px-2 py-1 text-xs font-medium shadow-sm transition-all',
                                'flex flex-col items-start justify-center cursor-pointer',
                                PHASE_BG[cell.phase],
                                isSaving && 'opacity-70',
                              )}
                              style={{ left, width }}
                              title={`${cell.label}\n${startHHMM}–${endHHMM}`}
                            >
                              <span className="truncate w-full leading-tight">{cell.label}</span>
                              <span className="text-[10px] opacity-90 leading-tight">
                                {startHHMM}–{endHHMM}
                              </span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-72 p-3" align="center">
                            <CellEditor
                              cell={cell}
                              isSaving={isSaving}
                              onSave={(s, e) => persistCellTime(cell, s, e)}
                              onCancel={() => setEditingCell(null)}
                            />
                          </PopoverContent>
                        </Popover>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Legend */}
              <div className="flex items-center gap-4 px-3 py-2 border-t text-xs text-muted-foreground">
                <span>Klicka på en stapel för att ändra tider — sparas direkt i personalkalendern.</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

interface CellEditorProps {
  cell: GanttCell;
  isSaving: boolean;
  onSave: (start: string, end: string) => void;
  onCancel: () => void;
}

function CellEditor({ cell, isSaving, onSave, onCancel }: CellEditorProps) {
  const [start, setStart] = useState(cell.startISO.slice(11, 16));
  const [end, setEnd] = useState(cell.endISO.slice(11, 16));
  const dateLabel = format(parseISO(cell.date), 'EEEE d MMMM', { locale: sv });

  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-semibold">{cell.label}</div>
        <div className="text-xs text-muted-foreground capitalize">{dateLabel}</div>
        {cell.events.length > 1 && (
          <div className="text-[10px] text-muted-foreground mt-1">
            Påverkar {cell.events.length} bokningar i projektet
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Start</Label>
          <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Slut</Label>
          <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSaving}>
          Avbryt
        </Button>
        <Button size="sm" onClick={() => onSave(start, end)} disabled={isSaving}>
          {isSaving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
          Spara
        </Button>
      </div>
    </div>
  );
}

export default UnifiedProjectGantt;
