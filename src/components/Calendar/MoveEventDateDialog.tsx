import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { updateCalendarEvent } from '@/services/calendarService';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { CalendarIcon, Users, Copy, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { extractUTCTime, buildUTCDateTime } from '@/utils/dateUtils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Lock } from 'lucide-react';
import CopyEventDialog from './CopyEventDialog';
import AddRiggDayDialog from './AddRiggDayDialog';
// handleBookingMove deprecated — BSA derives from staff_assignments × calendar_events via recompute_booking_staff_for_day RPC
import { moveLargeProjectDay, setLargeProjectDayTeam, type LargeProjectPhase } from '@/services/largeProjectPlannerService';
import { resolveCalendarEventId } from '@/services/calendarEventResolver';

interface MoveEventDateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: {
    id: string;
    title: string;
    start: string | Date;
    end: string | Date;
    resourceId?: string;
    bookingId?: string;
    bookingNumber?: string;
    eventType?: string;
    deliveryAddress?: string;
    extendedProps?: Record<string, any>;
  };
  resources?: Array<{ id: string; title: string }>;
  onUpdate?: () => void;
  exactTimeNeeded?: boolean;
  setEvents?: React.Dispatch<React.SetStateAction<any[]>>;
}

const MoveEventDateDialog: React.FC<MoveEventDateDialogProps> = ({
  open,
  onOpenChange,
  event,
  resources = [],
  onUpdate,
  exactTimeNeeded = false,
  setEvents
}) => {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedResourceId, setSelectedResourceId] = useState<string | undefined>(undefined);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [lockedTimes, setLockedTimes] = useState(false);

  // Initialize when dialog opens
  useEffect(() => {
    if (open && event) {
      const eventStart = typeof event.start === 'string' ? new Date(event.start) : event.start;
      setSelectedDate(eventStart);
      setSelectedResourceId(event.resourceId || undefined);
      setStartTime(extractUTCTime(event.start));
      setEndTime(extractUTCTime(event.end));
    }
  }, [open, event]);

  const handleMove = async () => {
    if (!selectedDate) {
      toast.error('Välj ett datum');
      return;
    }

    setIsSubmitting(true);

    // Set up a structured trace for this move attempt
    const traceId = Math.random().toString(36).slice(2, 8);
    const trace = (label: string, payload?: any) => {
      // eslint-disable-next-line no-console
      console.log(`🚚 [MoveEvent/${traceId}] ${label}`, payload ?? '');
    };
    const traceError = (label: string, payload?: any) => {
      // eslint-disable-next-line no-console
      console.error(`❌ [MoveEvent/${traceId}] ${label}`, payload ?? '');
    };

    try {
      const newDateStr = format(selectedDate, 'yyyy-MM-dd');
      const newStartISO = buildUTCDateTime(newDateStr, startTime);
      const newEndISO = buildUTCDateTime(newDateStr, endTime);

      const currentDateStr = (typeof event.start === 'string' ? event.start : event.start.toISOString()).split('T')[0];
      const teamChanged = !!selectedResourceId && selectedResourceId !== event.resourceId;

      trace('START', {
        eventId: event.id,
        bookingId: event.bookingId,
        bookingNumber: event.bookingNumber,
        eventType: event.eventType,
        title: event.title,
        oldDate: currentDateStr,
        newDate: newDateStr,
        oldTeam: event.resourceId,
        newTeam: selectedResourceId,
        teamChanged,
        newStartISO,
        newEndISO,
        largeProjectId: event.extendedProps?.largeProjectId,
      });

      // Optimistic UI update — move the event instantly before DB write
      if (setEvents) {
        setEvents(prev => prev.map(ev =>
          ev.id === event.id
            ? {
                ...ev,
                start: newStartISO,
                end: newEndISO,
                resourceId: (selectedResourceId && selectedResourceId !== event.resourceId)
                  ? selectedResourceId
                  : ev.resourceId
              }
            : ev
        ));
      }

      // ── LARGE PROJECT: move whole project day + save team override
      const largeProjectId: string | undefined = event.extendedProps?.largeProjectId;
      const phase = event.eventType as LargeProjectPhase | undefined;

      if (largeProjectId && phase) {
        trace('LARGE_PROJECT branch', { largeProjectId, phase });
        try {
          await moveLargeProjectDay({
            largeProjectId,
            phase,
            fromDate: currentDateStr,
            toDate: newDateStr,
            newStartISO,
            newEndISO,
          });
          trace('moveLargeProjectDay OK');
        } catch (err) {
          traceError('moveLargeProjectDay FAILED', err);
          throw new Error(`Steg "Flytta projektdag" misslyckades: ${err instanceof Error ? err.message : String(err)}`);
        }

        if (teamChanged && selectedResourceId) {
          try {
            await setLargeProjectDayTeam(largeProjectId, phase, newDateStr, selectedResourceId);
            trace('setLargeProjectDayTeam OK', { team: selectedResourceId });
          } catch (err) {
            traceError('setLargeProjectDayTeam FAILED', err);
            throw new Error(`Steg "Spara team för projektdag" misslyckades: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        const teamName = resources.find(r => r.id === selectedResourceId)?.title;
        toast.success('Projektdag uppdaterad', {
          description: `${event.title} → ${format(selectedDate, 'd MMM yyyy')}${teamChanged && teamName ? ` → ${teamName}` : ''}`,
        });

        if (onUpdate) await onUpdate();
        onOpenChange(false);
        return;
      }

      // Warehouse event types live in `warehouse_calendar_events`, not `calendar_events`.
      const WAREHOUSE_TYPES = ['packing', 'return', 'delivery', 'inventory', 'unpacking'];
      const isWarehouseEvent = !!event.eventType && WAREHOUSE_TYPES.includes(event.eventType);

      let syncedSiblings = 0;

      if (isWarehouseEvent) {
        trace('WAREHOUSE branch');
        const whPayload: any = {
          start_time: newStartISO,
          end_time: newEndISO,
          manually_adjusted: true,
          has_source_changes: false,
        };
        if (selectedResourceId && selectedResourceId !== event.resourceId) {
          whPayload.resource_id = selectedResourceId;
        }
        const { error: whErr } = await supabase
          .from('warehouse_calendar_events')
          .update(whPayload)
          .eq('id', event.id);
        if (whErr) {
          traceError('warehouse_calendar_events update FAILED', whErr);
          throw new Error(`Steg "Uppdatera lagerhändelse" misslyckades: ${whErr.message}`);
        }
        trace('warehouse_calendar_events OK');
      } else {
        trace('NORMAL branch');

        // Resolve a real calendar_events.id. Staff-calendar derived rows have
        // synthetic ids (`staff-…-{phase}-{date}`) and many have NO underlying
        // calendar_events row at all — we must NOT blindly call
        // updateCalendarEvent(syntheticId) because it returns 0 rows and the
        // user gets an opaque "Kunde inte flytta händelsen" toast.
        const realEventId = await resolveCalendarEventId({
          rawId: event.id,
          bookingId: event.bookingId,
          eventType: event.eventType,
          sourceDate: currentDateStr,
        });

        if (realEventId) {
          const updatePayload: any = {
            start: newStartISO,
            end: newEndISO,
          };
          if (teamChanged) {
            updatePayload.resourceId = selectedResourceId;
          }
          try {
            const result = await updateCalendarEvent(realEventId, updatePayload);
            syncedSiblings = (result as any)?.syncedSiblings ?? 0;
            trace('updateCalendarEvent OK', { realEventId, updatePayload });
          } catch (err) {
            traceError('updateCalendarEvent FAILED', err);
            throw new Error(`Steg "Uppdatera kalenderhändelse" misslyckades: ${err instanceof Error ? err.message : String(err)}`);
          }
        } else {
          // Post-backfill: every visible row has a real calendar_events row.
          // Missing row = real bug worth surfacing instead of silently hiding.
          throw new Error(`Hittade ingen kalenderhändelse för bokning ${event.bookingId} (${event.eventType} ${currentDateStr}). Kör backfill.`);
        }

        // Mirror date/time onto the booking row — but ONLY if the day we
        // moved IS the booking's primary date for this phase. Multi-day
        // rig/rigDown has secondary calendar_events rows that must NOT
        // overwrite bookings.<phase>date when moved.
        if (event.bookingId && event.eventType) {
          const bookingFields = {
            'rig': { date: 'rigdaydate', start: 'rig_start_time', end: 'rig_end_time' },
            'event': { date: 'eventdate', start: 'event_start_time', end: 'event_end_time' },
            'rigDown': { date: 'rigdowndate', start: 'rigdown_start_time', end: 'rigdown_end_time' }
          }[event.eventType as 'rig' | 'event' | 'rigDown'];

          if (bookingFields) {
            const { data: bkRow } = await supabase
              .from('bookings')
              .select(bookingFields.date)
              .eq('id', event.bookingId)
              .maybeSingle();
            const primaryDate = (bkRow as any)?.[bookingFields.date];
            const isPrimaryDay = primaryDate && primaryDate === currentDateStr;

            if (isPrimaryDay) {
              const bkUpdate = {
                [bookingFields.date]: newDateStr,
                [bookingFields.start]: newStartISO,
                [bookingFields.end]: newEndISO,
              };
              const { error: bkErr } = await supabase
                .from('bookings')
                .update(bkUpdate)
                .eq('id', event.bookingId);
              if (bkErr) {
                traceError('bookings update FAILED', { bkErr, bkUpdate });
                throw new Error(`Steg "Uppdatera bokning" misslyckades: ${bkErr.message}`);
              }
              trace('bookings update OK (primary day)', bkUpdate);
            } else {
              trace('bookings update SKIPPED (secondary day)', {
                phase: event.eventType, primaryDate, movedFrom: currentDateStr,
              });
            }
          }
        }

        // Räkna om BSA för båda dagarna. Personalen tillhör teamet — bokningen
        // flyttas. recompute_booking_staff_for_day säkerställer att BSA speglar
        // staff_assignments × calendar_events.resource_id.
        if (event.bookingId) {
          try {
            const dates = Array.from(new Set([currentDateStr, newDateStr]));
            await Promise.all(dates.map(d =>
              supabase.rpc('recompute_booking_staff_for_day' as any, {
                p_booking_id: event.bookingId,
                p_date: d,
              })
            ));
            trace('BSA recompute OK', { dates });
          } catch (rpcErr) {
            traceError('BSA recompute FAILED (non-fatal)', rpcErr);
          }
        }
      }

      const teamName = resources.find(r => r.id === selectedResourceId)?.title;
      const movedToTeam = selectedResourceId !== event.resourceId && teamName
        ? ` → ${teamName}`
        : '';

      trace('SUCCESS');
      const siblingsNote = syncedSiblings > 0
        ? ` · synkad till ${syncedSiblings} bokning${syncedSiblings === 1 ? '' : 'ar'} i projektet`
        : '';
      toast.success('Händelse flyttad', {
        description: `${event.title} → ${format(selectedDate, 'd MMM yyyy')}${movedToTeam}${siblingsNote}`
      });

      if (onUpdate) await onUpdate();
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      traceError('CAUGHT — move aborted', { message, error });
      toast.error('Kunde inte flytta händelsen', {
        description: message,
        duration: 8000,
      });
      // Revert optimistic update on error
      if (onUpdate) await onUpdate();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenCopyDialog = () => {
    setShowCopyDialog(true);
  };

  const handleCopied = () => {
    setShowCopyDialog(false);
    onOpenChange(false);
    if (onUpdate) onUpdate();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              Flytta eller kopiera händelse
            </DialogTitle>
            <DialogDescription>
              Välj ny dag, tid och/eller team. Flytta eller kopiera.
            </DialogDescription>
          </DialogHeader>

          {exactTimeNeeded && (
            <Alert className="border-amber-300 bg-amber-50 text-amber-900">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                Denna bokning har bestämda tider. Är du säker att du vill ändra?
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <div className="text-sm font-medium">{event.title}</div>
              <div className="text-xs text-muted-foreground">
                Nuvarande: {format(typeof event.start === 'string' ? new Date(event.start) : event.start, 'd MMM yyyy')} · {extractUTCTime(event.start)}–{extractUTCTime(event.end)}
            </div>

            {/* Time inputs */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tid</label>
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-[120px]"
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-[120px]"
                />
              </div>
            </div>
            </div>

            {/* Team selector */}
            {resources.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Users className="h-4 w-4" />
                  Team
                </label>
                <Select value={selectedResourceId} onValueChange={setSelectedResourceId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Välj team" />
                  </SelectTrigger>
                  <SelectContent>
                    {resources.map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                initialFocus
                className={cn("p-3 pointer-events-auto rounded-md border")}
              />
            </div>
          </div>

          <DialogFooter className="flex-row gap-1.5 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Avbryt
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                setShowAddDialog(true);
              }}
              disabled={isSubmitting}
              className="gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              Lägg till
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleOpenCopyDialog}
              disabled={isSubmitting}
              className="gap-1"
            >
              <Copy className="h-3.5 w-3.5" />
              Kopiera
            </Button>
            <Button
              size="sm"
              onClick={handleMove}
              disabled={isSubmitting || !selectedDate}
            >
              {isSubmitting ? 'Flyttar...' : 'Flytta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showCopyDialog && (
        <CopyEventDialog
          open={showCopyDialog}
          onOpenChange={setShowCopyDialog}
          event={event}
          resources={resources}
          onCopied={handleCopied}
        />
      )}

      {showAddDialog && (
        <AddRiggDayDialog
          open={showAddDialog}
          onOpenChange={setShowAddDialog}
          event={event}
          defaultStartTime={startTime}
          defaultEndTime={endTime}
          onUpdate={() => {
            setShowAddDialog(false);
            if (onUpdate) onUpdate();
          }}
        />
      )}
    </>
  );
};

export default MoveEventDateDialog;
