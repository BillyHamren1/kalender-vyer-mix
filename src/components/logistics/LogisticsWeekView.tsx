import React, { useState, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Truck, MapPin, Clock, ArrowRight, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, addDays, isSameDay, startOfWeek, endOfWeek } from 'date-fns';
import { sv } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { TransportAssignment } from '@/hooks/useTransportAssignments';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const TransportEventCard = ({ assignment, onSelect }: { assignment: TransportAssignment; onSelect: (a: TransportAssignment) => void }) => {
  const statusLabel = assignment.status === 'delivered' ? 'Levererad' :
    assignment.status === 'in_transit' ? 'På väg' :
    assignment.status === 'skipped' ? 'Hoppad' :
    assignment.partner_response === 'accepted' ? 'Accepterad' :
    assignment.partner_response === 'declined' ? 'Nekad' : 'Väntar';

  const statusDot = assignment.status === 'delivered' ? 'bg-primary' :
    assignment.status === 'in_transit' ? 'bg-secondary animate-pulse' :
    assignment.partner_response === 'accepted' ? 'bg-primary' :
    assignment.partner_response === 'declined' ? 'bg-destructive' :
    'bg-muted-foreground';

  return (
    <div
      onClick={() => onSelect(assignment)}
      className={cn(
        "group relative rounded-lg border transition-all duration-200 overflow-hidden cursor-pointer",
        "bg-secondary/10 border-secondary/30",
        "hover:shadow-sm hover:scale-[1.01]"
      )}
    >
      <div className="p-2.5">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="px-2 py-0.5 rounded text-[10px] tracking-wide font-bold border bg-secondary/20 text-secondary border-secondary/40">
            TRANSPORT
          </span>
          <Truck className="w-3 h-3 ml-auto text-secondary" />
        </div>
        
        <h4 className="font-semibold text-sm text-foreground line-clamp-2 mb-1">
          {assignment.booking?.client || 'Okänd kund'}
        </h4>

        {assignment.booking?.deliveryaddress && (
          <div className="flex items-start gap-1.5 mb-1">
            <MapPin className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
            <span className="text-xs text-muted-foreground line-clamp-1">
              {assignment.booking.deliveryaddress}
            </span>
          </div>
        )}

        <div className="flex items-center gap-1.5 mt-1">
          <div className={cn("w-2 h-2 rounded-full", statusDot)} />
          <span className="text-xs text-muted-foreground">{statusLabel}</span>
        </div>
      </div>
    </div>
  );
};

const TransportDetailDialog = ({ assignment, open, onClose }: { assignment: TransportAssignment | null; open: boolean; onClose: () => void }) => {
  const navigate = useNavigate();
  if (!assignment) return null;

  const statusLabel = assignment.status === 'delivered' ? 'Levererad' :
    assignment.status === 'in_transit' ? 'På väg' :
    assignment.status === 'skipped' ? 'Hoppad' :
    assignment.partner_response === 'accepted' ? 'Accepterad' :
    assignment.partner_response === 'declined' ? 'Nekad' : 'Väntar';

  const statusColor = assignment.status === 'delivered' ? 'bg-primary/10 text-primary border-primary/30' :
    assignment.status === 'in_transit' ? 'bg-accent text-accent-foreground border-accent' :
    assignment.partner_response === 'accepted' ? 'bg-primary/10 text-primary border-primary/30' :
    assignment.partner_response === 'declined' ? 'bg-destructive/10 text-destructive border-destructive/30' :
    'bg-muted text-muted-foreground border-border';

  const durationHours = assignment.estimated_duration ? (assignment.estimated_duration / 60).toFixed(1) : null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-secondary" />
            Transportdetaljer
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className={cn("text-xs", statusColor)}>
              {statusLabel}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {format(new Date(assignment.transport_date + 'T00:00:00'), 'd MMMM yyyy', { locale: sv })}
            </span>
          </div>

          <div className="bg-muted/50 rounded-lg p-3 space-y-1">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Kund</div>
            <div className="font-semibold text-foreground">{assignment.booking?.client || 'Okänd'}</div>
            {assignment.booking?.booking_number && (
              <div className="text-xs text-muted-foreground">Bokningsnr: {assignment.booking.booking_number}</div>
            )}
          </div>

          <div className="bg-muted/50 rounded-lg p-3 space-y-1">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Fordon / Partner</div>
            <div className="font-semibold text-foreground">{assignment.vehicle?.name || 'Ej tilldelat'}</div>
            {assignment.vehicle?.is_external && (
              <Badge variant="outline" className="text-[10px] mt-1">Extern partner</Badge>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {assignment.transport_time && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Avgång</div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-secondary" />
                  <span className="font-semibold">{assignment.transport_time}</span>
                </div>
              </div>
            )}
            {durationHours && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Uppskattad tid</div>
                <div className="font-semibold">{durationHours} h</div>
              </div>
            )}
          </div>

          <div className="bg-muted/50 rounded-lg p-3 space-y-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Rutt</div>
            {assignment.pickup_address && (
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 rounded-full bg-accent mt-1.5 shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground">Upphämtning</div>
                  <div className="text-sm font-medium">{assignment.pickup_address}</div>
                </div>
              </div>
            )}
            {(assignment.pickup_address && assignment.booking?.deliveryaddress) && (
              <div className="flex items-center pl-0.5">
                <ArrowRight className="w-3 h-3 text-muted-foreground" />
              </div>
            )}
            {assignment.booking?.deliveryaddress && (
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground">Leverans</div>
                  <div className="text-sm font-medium">
                    {assignment.booking.deliveryaddress}
                    {assignment.booking.delivery_city && `, ${assignment.booking.delivery_city}`}
                  </div>
                </div>
              </div>
            )}
          </div>

          {assignment.driver_notes && (
            <div className="bg-muted/50 rounded-lg p-3 space-y-1">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Anteckningar</div>
              <div className="text-sm text-foreground">{assignment.driver_notes}</div>
            </div>
          )}

          {assignment.partner_responded_at && (
            <div className="text-xs text-muted-foreground">
              Partner svarade: {format(new Date(assignment.partner_responded_at), 'd MMM yyyy HH:mm', { locale: sv })}
            </div>
          )}

          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              onClose();
              navigate(`/booking/${assignment.booking_id}`);
            }}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Visa bokning
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const DayColumn = ({
  date,
  assignments,
  onSelectAssignment,
}: {
  date: Date;
  assignments: TransportAssignment[];
  onSelectAssignment: (a: TransportAssignment) => void;
}) => {
  const isToday = isSameDay(date, new Date());
  const isPast = date < new Date() && !isToday;
  const dayStr = format(date, 'yyyy-MM-dd');
  const dayEvents = assignments.filter(a => a.transport_date === dayStr);
  const dayName = format(date, 'EEEE', { locale: sv });
  const dayNumber = format(date, 'd');
  const monthName = format(date, 'MMM', { locale: sv });

  return (
    <div className={cn(
      "flex flex-col flex-1 min-w-[160px]",
      isPast && "opacity-50"
    )}>
      <div className={cn(
        "relative rounded-t-xl px-3 py-2.5 text-center border-x border-t transition-all",
        isToday ? "bg-primary/15 border-primary/30" : "bg-muted border-border"
      )}>
        {isToday && (
          <div className="pointer-events-none absolute left-1/2 top-2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-primary" />
        )}
        <div className={cn(
          "text-[10px] font-bold uppercase tracking-widest",
          isToday ? "text-primary" : "text-muted-foreground"
        )}>
          {dayName}
        </div>
        <div className="flex items-baseline justify-center gap-0.5 mt-0.5">
          <span className={cn(
            "text-2xl font-bold tabular-nums",
            isToday ? "text-primary" : "text-foreground"
          )}>{dayNumber}</span>
          <span className="text-xs text-muted-foreground">{monthName}.</span>
        </div>
      </div>

      <div className={cn("h-px", isToday ? "bg-primary/40" : "bg-border")} />
      
      <div className={cn(
        "flex-1 p-2 space-y-2 min-h-[280px] border-x border-b rounded-b-xl",
        isToday ? "bg-primary/5 border-primary/30" : "bg-card border-border"
      )}>
        {dayEvents.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center py-8">
              <Calendar className="w-10 h-10 mx-auto text-muted-foreground/20 mb-2" />
              <span className="text-sm text-muted-foreground/40">Inga händelser</span>
            </div>
          </div>
        ) : (
          dayEvents.map(assignment => (
            <TransportEventCard key={assignment.id} assignment={assignment} onSelect={onSelectAssignment} />
          ))
        )}
      </div>
    </div>
  );
};

interface LogisticsWeekViewProps {
  assignments: TransportAssignment[];
  isLoading: boolean;
  currentDate: Date;
  onDateChange: (date: Date) => void;
}

const LogisticsWeekView: React.FC<LogisticsWeekViewProps> = ({ assignments, isLoading, currentDate, onDateChange }) => {
  const [selectedAssignment, setSelectedAssignment] = useState<TransportAssignment | null>(null);
  
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekNumber = format(weekStart, 'w');

  const navigateWeek = (direction: 'prev' | 'next') => {
    onDateChange(addDays(currentDate, direction === 'prev' ? -7 : 7));
  };

  return (
    <div className="bg-card rounded-2xl shadow-xl border overflow-hidden">
      <div className="bg-gradient-to-r from-primary to-primary/80 px-6 py-4">
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigateWeek('prev')}
              className="text-primary-foreground hover:bg-primary-foreground/10 border border-primary-foreground/30 rounded-lg"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <span className="text-primary-foreground font-medium min-w-[80px] text-center">
              Vecka {weekNumber}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigateWeek('next')}
              className="text-primary-foreground hover:bg-primary-foreground/10 border border-primary-foreground/30 rounded-lg"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
      
      <div className="p-3 overflow-x-auto">
        {isLoading ? (
          <div className="flex gap-2 min-w-[1120px]">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex-1 min-w-[160px] space-y-2">
                <Skeleton className="h-16 rounded-t-xl" />
                <Skeleton className="h-[280px] rounded-b-xl" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex gap-2 min-w-[1120px] items-stretch">
            {days.map(day => (
              <DayColumn 
                key={day.toISOString()}
                date={day}
                assignments={assignments}
                onSelectAssignment={setSelectedAssignment}
              />
            ))}
          </div>
        )}
      </div>

      <TransportDetailDialog
        assignment={selectedAssignment}
        open={!!selectedAssignment}
        onClose={() => setSelectedAssignment(null)}
      />
    </div>
  );
};

export default LogisticsWeekView;
