import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { format, parse } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import {
  findExistingDayRow,
  getStickyTeamForBooking,
} from '@/lib/calendar/projectTeamStickiness';

// Generate time options in 30-minute intervals
const generateTimeOptions = (): string[] => {
  const options: string[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const hourStr = hour.toString().padStart(2, '0');
      const minuteStr = minute.toString().padStart(2, '0');
      options.push(`${hourStr}:${minuteStr}`);
    }
  }
  return options;
};

const timeOptions = generateTimeOptions();

interface AddRiggDayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: {
    id: string;
    title: string;
    start: string | Date;
    end: string | Date;
    bookingId?: string;
    resourceId?: string;
    eventType?: string;
  };
  defaultStartTime: string;
  defaultEndTime: string;
  onUpdate?: () => void;
}

const WAREHOUSE_TYPES = ['packing', 'return', 'delivery', 'inventory', 'unpacking'] as const;
type WarehouseType = typeof WAREHOUSE_TYPES[number];

const AddRiggDayDialog: React.FC<AddRiggDayDialogProps> = ({
  open,
  onOpenChange,
  event,
  defaultStartTime,
  defaultEndTime,
  onUpdate
}) => {
  const isWarehouseSource = !!event.eventType && (WAREHOUSE_TYPES as readonly string[]).includes(event.eventType);

  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [eventType, setEventType] = useState<'rig' | 'event' | 'rigDown' | WarehouseType>(
    isWarehouseSource ? (event.eventType as WarehouseType) : 'rig'
  );
  const [isCreating, setIsCreating] = useState(false);
  const [rigDates, setRigDates] = useState<Date[]>([]);
  const [eventDates, setEventDates] = useState<Date[]>([]);
  const [rigDownDates, setRigDownDates] = useState<Date[]>([]);
  const [defaultMonth, setDefaultMonth] = useState<Date | undefined>();
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [endTime, setEndTime] = useState(defaultEndTime);

  // Update times when props change
  useEffect(() => {
    setStartTime(defaultStartTime);
    setEndTime(defaultEndTime);
  }, [defaultStartTime, defaultEndTime]);

  // Fetch all dates for this booking when dialog opens
  useEffect(() => {
    if (open && event.bookingId) {
      const fetchBookingDates = async () => {
        const { data, error } = await supabase
          .from('calendar_events')
          .select('start_time, event_type')
          .eq('booking_id', event.bookingId);

        if (!error && data) {
          const rigs: Date[] = [];
          const events: Date[] = [];
          const rigDowns: Date[] = [];

          data.forEach(e => {
            const date = new Date(e.start_time);
            if (e.event_type === 'rig') {
              rigs.push(date);
            } else if (e.event_type === 'event') {
              events.push(date);
            } else if (e.event_type === 'rigDown') {
              rigDowns.push(date);
            }
          });

          setRigDates(rigs);
          setEventDates(events);
          setRigDownDates(rigDowns);
        }
      };

      fetchBookingDates();

      // Set default month to the clicked event's date
      const eventDate = typeof event.start === 'string' ? new Date(event.start) : event.start;
      setDefaultMonth(eventDate);
    }
  }, [open, event.bookingId, event.start]);

  const handleCreate = async () => {
    if (!selectedDates || selectedDates.length === 0) {
      toast.error('Välj minst ett datum');
      return;
    }

    if (!event.bookingId) {
      toast.error('Bokning saknas');
      return;
    }

    setIsCreating(true);

    try {
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .select('organization_id, booking_number, deliveryaddress, delivery_city, client')
        .eq('id', event.bookingId)
        .single();

      if (bookingError || !booking) {
        throw new Error('Kunde inte hämta bokningsdata');
      }

      const isWarehouseTarget = (WAREHOUSE_TYPES as readonly string[]).includes(eventType);

      // Sortera datum kronologiskt så bokningens primära fält
      // (rigdaydate / eventdate / rigdowndate) hamnar på första dagen.
      const sorted = [...selectedDates].sort((a, b) => a.getTime() - b.getTime());
      const failures: string[] = [];
      let successCount = 0;

      for (const date of sorted) {
        const dateStr = format(date, 'yyyy-MM-dd');
        const startDateTime = `${dateStr}T${startTime}:00Z`;
        const endDateTime = `${dateStr}T${endTime}:00Z`;

        try {
          if (isWarehouseTarget) {
            const { error: whErr } = await supabase
              .from('warehouse_calendar_events')
              .insert({
                title: booking.client || event.title,
                start_time: startDateTime,
                end_time: endDateTime,
                resource_id: 'warehouse',
                booking_id: event.bookingId,
                booking_number: booking.booking_number,
                event_type: eventType,
                organization_id: booking.organization_id,
                delivery_address:
                  [booking.deliveryaddress, booking.delivery_city].filter(Boolean).join(', ') || null,
                manually_adjusted: true,
              });
            if (whErr) throw whErr;
          } else {
            const sourceDate = startDateTime.split('T')[0];

            // PROJECT TEAM STICKINESS:
            // 1) Om en aktiv rad redan finns för (booking, event_type, date)
            //    → uppdatera bara metadata/tider, ALDRIG resource_id. Befintlig
            //    teamplacering är inviolat.
            // 2) Annars → använd bokningens etablerade team (sticky); fall
            //    tillbaka på event.resourceId bara om bokningen är ny.
            const existingRow = await findExistingDayRow(
              event.bookingId,
              booking.organization_id,
              eventType,
              sourceDate,
            );

            if (existingRow) {
              const { error: updateErr } = await supabase
                .from('calendar_events')
                .update({
                  title: event.title,
                  start_time: startDateTime,
                  end_time: endDateTime,
                  booking_number: booking.booking_number,
                  delivery_address:
                    [booking.deliveryaddress, booking.delivery_city].filter(Boolean).join(', ') || null,
                })
                .eq('id', existingRow.id);
              if (updateErr) throw updateErr;
              console.log(
                `[AddRiggDayDialog] Day exists on ${existingRow.resource_id} — updated metadata only, resource_id preserved`,
              );
            } else {
              const stickyTeam = await getStickyTeamForBooking(
                event.bookingId,
                booking.organization_id,
              );
              const targetResourceId = stickyTeam ?? event.resourceId;

              if (targetResourceId) {
                const { error: insertError } = await supabase
                  .from('calendar_events')
                  .insert({
                    title: event.title,
                    start_time: startDateTime,
                    end_time: endDateTime,
                    resource_id: targetResourceId,
                    booking_id: event.bookingId,
                    event_type: eventType,
                    organization_id: booking.organization_id,
                    booking_number: booking.booking_number,
                    delivery_address:
                      [booking.deliveryaddress, booking.delivery_city].filter(Boolean).join(', ') || null,
                    source_date: sourceDate,
                  });
                if (insertError) throw insertError;
                if (stickyTeam && stickyTeam !== event.resourceId) {
                  console.log(
                    `[AddRiggDayDialog] New day inserted on sticky team ${stickyTeam} (dialog opened from ${event.resourceId})`,
                  );
                }
              } else {
                console.log('[AddRiggDayDialog] no resourceId — skipping calendar_events insert, booking update will trigger reconciler');
              }
            }

            // Spegla endast FÖRSTA datumet på bokningens primära fält
            // (annars skriver dag 2-N över dag 1).
            const isFirst = date.getTime() === sorted[0].getTime();
            if (isFirst) {
              const bookingFieldMap = {
                rig: { date: 'rigdaydate', start: 'rig_start_time', end: 'rig_end_time' },
                event: { date: 'eventdate', start: 'event_start_time', end: 'event_end_time' },
                rigDown: { date: 'rigdowndate', start: 'rigdown_start_time', end: 'rigdown_end_time' },
              } as const;

              const fields = bookingFieldMap[eventType as 'rig' | 'event' | 'rigDown'];
              if (fields) {
                const { error: bkErr } = await supabase
                  .from('bookings')
                  .update({
                    [fields.date]: dateStr,
                    [fields.start]: startDateTime,
                    [fields.end]: endDateTime,
                  })
                  .eq('id', event.bookingId);
                if (bkErr) throw bkErr;
              }
            }

            // Recompute BSA för den nya dagen så personalen från det valda
            // teamet speglas in (per calendar-team-model-v1).
            try {
              await supabase.rpc('recompute_booking_staff_for_day' as any, {
                p_booking_id: event.bookingId,
                p_date: dateStr,
              });
            } catch (rpcErr) {
              console.warn('[AddRiggDayDialog] BSA recompute failed (non-fatal)', rpcErr);
            }
          }
          successCount++;
        } catch (perDayErr: any) {
          const msg = perDayErr?.message || perDayErr?.hint || String(perDayErr);
          failures.push(`${dateStr}: ${msg}`);
        }
      }

      const labels: Record<string, string> = {
        packing: 'Packning',
        return: 'Retur',
        delivery: 'Leverans',
        inventory: 'Inventering',
        unpacking: 'Uppackning',
        rig: 'Riggdag',
        event: 'Eventdag',
        rigDown: 'Rivdag',
      };
      const typeLabel = labels[eventType] || 'Dag';

      if (successCount > 0 && failures.length === 0) {
        toast.success(
          successCount === 1
            ? `${typeLabel} tillagd`
            : `${successCount} ${typeLabel.toLowerCase()}ar tillagda`,
        );
      } else if (successCount > 0 && failures.length > 0) {
        toast.warning(`${successCount} av ${sorted.length} dagar tillagda`, {
          description: failures.join('\n'),
          duration: 8000,
        });
      } else {
        throw new Error(failures.join('\n') || 'Inga dagar kunde läggas till');
      }

      onOpenChange(false);
      if (onUpdate) onUpdate();
    } catch (error: any) {
      console.error('Error creating event day(s):', error);
      const detail = error?.message || error?.hint || (typeof error === 'string' ? error : '');
      toast.error('Kunde inte lägga till dagen/dagarna', {
        description: detail || undefined,
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Lägg till händelse</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Booking</Label>
            <div className="text-sm text-muted-foreground">{event.title}</div>
          </div>

          <div className="space-y-2">
            <Label>Event Type</Label>
            <Select value={eventType} onValueChange={(value: any) => setEventType(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {isWarehouseSource ? (
                  <>
                    <SelectItem value="packing">Packning</SelectItem>
                    <SelectItem value="return">Retur</SelectItem>
                    <SelectItem value="delivery">Leverans</SelectItem>
                    <SelectItem value="inventory">Inventering</SelectItem>
                    <SelectItem value="unpacking">Uppackning</SelectItem>
                  </>
                ) : (
                  <>
                    <SelectItem value="rig">Riggdag</SelectItem>
                    <SelectItem value="event">Eventdag</SelectItem>
                    <SelectItem value="rigDown">Rivdag</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Datum (välj en eller flera)</Label>
              {selectedDates.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {selectedDates.length} dag{selectedDates.length === 1 ? '' : 'ar'} valda
                </span>
              )}
            </div>
            <Calendar
              mode="multiple"
              selected={selectedDates}
              onSelect={(dates) => setSelectedDates(dates ?? [])}
              month={defaultMonth}
              onMonthChange={setDefaultMonth}
              className={cn("rounded-md border pointer-events-auto")}
              modifiers={{
                rigDay: rigDates,
                eventDay: eventDates,
                rigDownDay: rigDownDates,
              }}
              modifiersStyles={{
                rigDay: {
                  backgroundColor: '#F2FCE2',
                  fontWeight: 'bold',
                  border: '2px solid #86C232',
                },
                eventDay: {
                  backgroundColor: '#FEF7CD',
                  fontWeight: 'bold',
                  border: '2px solid #F4C430',
                },
                rigDownDay: {
                  backgroundColor: '#FEE2E2',
                  fontWeight: 'bold',
                  border: '2px solid #F87171',
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Tips: klicka för att välja, klicka igen för att avmarkera. Alla valda dagar får samma tid och team.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Time</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="start-time" className="text-xs text-muted-foreground">Start</Label>
                <Select value={startTime} onValueChange={setStartTime}>
                  <SelectTrigger id="start-time">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timeOptions.map(time => (
                      <SelectItem key={`start-${time}`} value={time}>{time}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="end-time" className="text-xs text-muted-foreground">End</Label>
                <Select value={endTime} onValueChange={setEndTime}>
                  <SelectTrigger id="end-time">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timeOptions.map(time => (
                      <SelectItem key={`end-${time}`} value={time}>{time}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={handleCreate} disabled={isCreating || selectedDates.length === 0}>
            {isCreating
              ? 'Lägger till...'
              : selectedDates.length > 1
                ? `Lägg till ${selectedDates.length} dagar`
                : 'Lägg till'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddRiggDayDialog;
