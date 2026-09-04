import React from 'react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { CalendarDays, Clock3, Hash, MapPin, UsersRound } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { CalendarEvent, Resource } from './ResourceData';

interface PlanningEventDetailsSheetProps {
  event: CalendarEvent | null;
  resources: Resource[];
  onOpenChange: (open: boolean) => void;
}

const phaseLabel: Record<string, string> = {
  rig: 'Rig',
  event: 'Event',
  rigDown: 'Rivning',
};

const safeDate = (value: CalendarEvent['start'] | CalendarEvent['end']): Date | null => {
  if (!value) return null;
  const date = typeof value === 'string' ? new Date(value) : (value as Date);
  return Number.isNaN(date.getTime()) ? null : date;
};

const PlanningEventDetailsSheet: React.FC<PlanningEventDetailsSheetProps> = ({ event, resources, onOpenChange }) => {
  const start = event ? safeDate(event.start) : null;
  const end = event ? safeDate(event.end) : null;
  const type = String(event?.eventType || event?.extendedProps?.eventType || '');
  const team = event ? resources.find(resource => resource.id === event.resourceId)?.title : undefined;
  const address = event?.deliveryAddress || event?.extendedProps?.deliveryAddress;
  const bookingNumber = event?.bookingNumber || event?.booking_number || event?.extendedProps?.bookingNumber;

  return (
    <Sheet open={!!event} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="text-left">
          <SheetTitle>{event?.title || 'Planeringsdetaljer'}</SheetTitle>
          <SheetDescription>Detaljer från bemanningskalendern.</SheetDescription>
        </SheetHeader>
        {event && (
          <div className="mt-6 space-y-3">
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {phaseLabel[type] || type || 'Planerat arbete'}
              </div>
              <div className="space-y-3 text-sm">
                {start && (
                  <div className="flex gap-3"><CalendarDays className="mt-0.5 h-4 w-4 text-primary" /><span>{format(start, 'EEEE d MMMM yyyy', { locale: sv })}</span></div>
                )}
                {start && end && (
                  <div className="flex gap-3"><Clock3 className="mt-0.5 h-4 w-4 text-primary" /><span>{format(start, 'HH:mm')}–{format(end, 'HH:mm')}</span></div>
                )}
                {team && (
                  <div className="flex gap-3"><UsersRound className="mt-0.5 h-4 w-4 text-primary" /><span>{team}</span></div>
                )}
                {address && (
                  <div className="flex gap-3"><MapPin className="mt-0.5 h-4 w-4 text-primary" /><span>{address}</span></div>
                )}
                {bookingNumber && (
                  <div className="flex gap-3"><Hash className="mt-0.5 h-4 w-4 text-primary" /><span>{bookingNumber}</span></div>
                )}
              </div>
            </div>
            {event.extendedProps?.internalNotes && (
              <div className="rounded-xl border border-border p-4">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Intern information</div>
                <p className="whitespace-pre-wrap text-sm text-foreground">{event.extendedProps.internalNotes}</p>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default PlanningEventDetailsSheet;

