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
import CopyEventDialog from './CopyEventDialog';
import AddRiggDayDialog from './AddRiggDayDialog';
import { handleBookingMove } from '@/services/staffCalendarService';
import { moveLargeProjectDay, setLargeProjectDayTeam, type LargeProjectPhase } from '@/services/largeProjectPlannerService';

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

    try {
      const newDateStr = format(selectedDate, 'yyyy-MM-dd');
      const newStartISO = buildUTCDateTime(newDateStr, startTime);
      const newEndISO = buildUTCDateTime(newDateStr, endTime);

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
      const currentDateStr = (typeof event.start === 'string' ? event.start : event.start.toISOString()).split('T')[0];
      const teamChanged = !!selectedResourceId && selectedResourceId !== event.resourceId;

      if (largeProjectId && phase) {
        // Always run — handles date change, time change, or both.
        await moveLargeProjectDay({
          largeProjectId,
          phase,
          fromDate: currentDateStr,
          toDate: newDateStr,
          newStartISO,
          newEndISO,
        });
        if (teamChanged && selectedResourceId) {
          await setLargeProjectDayTeam(largeProjectId, phase, newDateStr, selectedResourceId);
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

      if (isWarehouseEvent) {
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
        if (whErr) throw whErr;
      } else {
        const teamChanged = !!selectedResourceId && selectedResourceId !== event.resourceId;

        const updatePayload: any = {
          start: newStartISO,
          end: newEndISO,
        };
        if (teamChanged) {
          updatePayload.resourceId = selectedResourceId;
        }
        await updateCalendarEvent(event.id, updatePayload);

        // Mirror date/time onto the booking row for staff event types only.
        if (event.bookingId && event.eventType) {
          const bookingFields = {
            'rig': { date: 'rigdaydate', start: 'rig_start_time', end: 'rig_end_time' },
            'event': { date: 'eventdate', start: 'event_start_time', end: 'event_end_time' },
            'rigDown': { date: 'rigdowndate', start: 'rigdown_start_time', end: 'rigdown_end_time' }
          }[event.eventType as 'rig' | 'event' | 'rigDown'];

          if (bookingFields) {
            await supabase
              .from('bookings')
              .update({
                [bookingFields.date]: newDateStr,
                [bookingFields.start]: newStartISO,
                [bookingFields.end]: newEndISO
              })
              .eq('id', event.bookingId);
          }
        }

        // IMPORTANT: for normal planner bookings, the authoritative team on refresh
        // is derived from booking_staff_assignments (and sometimes re-imported real rows),
        // not only calendar_events.resource_id. So persist a real booking move when the
        // team changed for the same booking/day.
        if (event.bookingId && event.eventType && event.resourceId && selectedResourceId && teamChanged) {
          const moveResult = await handleBookingMove(
            event.bookingId,
            event.resourceId,
            selectedResourceId,
            currentDateStr,
            newDateStr
          );

          if (!moveResult.success) {
            const conflictCount = moveResult.conflicts?.length || 0;
            throw new Error(
              moveResult.error ||
              (conflictCount > 0
                ? `Kunde inte flytta bemanningen till valt team (${conflictCount} konflikter).`
                : 'Kunde inte flytta bokningen till valt team.')
            );
          }
        }
      }

      const teamName = resources.find(r => r.id === selectedResourceId)?.title;
      const movedToTeam = selectedResourceId !== event.resourceId && teamName
        ? ` → ${teamName}`
        : '';

      toast.success('Händelse flyttad', {
        description: `${event.title} → ${format(selectedDate, 'd MMM yyyy')}${movedToTeam}`
      });

      if (onUpdate) await onUpdate();
      onOpenChange(false);
    } catch (error) {
      console.error('Error moving event:', error);
      toast.error('Kunde inte flytta händelsen');
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
