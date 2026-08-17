import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  MapPin,
  Pencil,
  Truck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { addDays, format, isSameDay, startOfWeek } from 'date-fns';
import { sv } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { TransportAssignment } from '@/hooks/useTransportAssignments';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const statusMeta = (assignment: TransportAssignment) => {
  if (assignment.status === 'delivered') return { label: 'Levererad', dot: 'bg-emerald-500', badge: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700' };
  if (assignment.status === 'in_transit') return { label: 'På väg', dot: 'bg-sky-500 animate-pulse', badge: 'border-sky-500/20 bg-sky-500/10 text-sky-700' };
  if (assignment.status === 'skipped') return { label: 'Hoppad', dot: 'bg-muted-foreground', badge: 'border-border bg-muted text-muted-foreground' };
  if (assignment.partner_response === 'accepted') return { label: 'Accepterad', dot: 'bg-emerald-500', badge: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700' };
  if (assignment.partner_response === 'declined') return { label: 'Nekad', dot: 'bg-destructive', badge: 'border-destructive/20 bg-destructive/10 text-destructive' };
  if (assignment.vehicle?.is_external) return { label: 'Väntar partnersvar', dot: 'bg-amber-500', badge: 'border-amber-500/20 bg-amber-500/10 text-amber-700' };
  return { label: 'Planerad', dot: 'bg-primary', badge: 'border-primary/20 bg-primary/10 text-primary' };
};

const TransportEventCard = ({ assignment, onSelect }: { assignment: TransportAssignment; onSelect: (a: TransportAssignment) => void }) => {
  const meta = statusMeta(assignment);
  const hasAddressIssue = !assignment.booking?.deliveryaddress || assignment.booking.delivery_latitude == null || assignment.booking.delivery_longitude == null;

  return (
    <button
      type="button"
      onClick={() => onSelect(assignment)}
      className="group w-full overflow-hidden rounded-xl border bg-background text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
    >
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {assignment.transport_time ? (
                <span className="text-sm font-bold tabular-nums text-foreground">{assignment.transport_time.slice(0, 5)}</span>
              ) : (
                <span className="flex items-center gap-1 text-xs font-semibold text-amber-600"><Clock3 className="h-3 w-3" /> Tid saknas</span>
              )}
              {assignment.booking?.booking_number && (
                <span className="truncate text-[10px] font-medium text-muted-foreground">#{assignment.booking.booking_number}</span>
              )}
            </div>
            <h4 className="mt-1 truncate text-sm font-semibold text-foreground">{assignment.booking?.client || 'Okänd kund'}</h4>
          </div>
          <Truck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
        </div>

        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Truck className="h-3 w-3 shrink-0" />
            <span className="truncate">{assignment.vehicle?.name || 'Fordon ej tilldelat'}</span>
            {assignment.vehicle?.is_external && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide">Extern</span>}
          </div>
          <div className={cn('flex items-center gap-1.5 text-xs', hasAddressIssue ? 'text-amber-600' : 'text-muted-foreground')}>
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{assignment.booking?.deliveryaddress || 'Leveransadress saknas'}</span>
          </div>
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-2 border-t pt-2">
          <span className="flex min-w-0 items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', meta.dot)} />
            <span className="truncate">{meta.label}</span>
          </span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </button>
  );
};

const TransportDetailDialog = ({ assignment, open, onClose, onEdit }: { assignment: TransportAssignment | null; open: boolean; onClose: () => void; onEdit?: (assignment: TransportAssignment) => void }) => {
  const navigate = useNavigate();
  if (!assignment) return null;

  const meta = statusMeta(assignment);
  const durationHours = assignment.estimated_duration ? (assignment.estimated_duration / 60).toFixed(1) : null;

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-xl overflow-hidden p-0">
        <DialogHeader className="border-b bg-muted/20 px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Transportdetaljer
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge variant="outline" className={cn('text-xs', meta.badge)}>{meta.label}</Badge>
            <span className="text-sm text-muted-foreground">
              {format(new Date(`${assignment.transport_date}T00:00:00`), 'd MMMM yyyy', { locale: sv })}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border bg-muted/20 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Kund</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{assignment.booking?.client || 'Okänd'}</p>
              {assignment.booking?.booking_number && <p className="mt-0.5 text-xs text-muted-foreground">#{assignment.booking.booking_number}</p>}
            </div>
            <div className="rounded-xl border bg-muted/20 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Fordon / Partner</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{assignment.vehicle?.name || 'Ej tilldelat'}</p>
              {assignment.vehicle?.is_external && <p className="mt-0.5 text-xs text-muted-foreground">Extern transportpartner</p>}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Avgång</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{assignment.transport_time?.slice(0, 5) || 'Saknas'}</p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Stop</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{assignment.stop_order || '—'}</p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Uppskattad tid</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{durationHours ? `${durationHours} h` : '—'}</p>
            </div>
          </div>

          <div className="rounded-xl border bg-muted/20 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Rutt</p>
            <div className="mt-3 space-y-3">
              <div className="flex items-start gap-2.5">
                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-muted-foreground" />
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Upphämtning</p>
                  <p className="text-sm font-medium text-foreground">{assignment.pickup_address || 'Upphämtningsadress saknas'}</p>
                </div>
              </div>
              <div className="ml-[3px] h-4 border-l border-dashed border-muted-foreground/40" />
              <div className="flex items-start gap-2.5">
                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Leverans</p>
                  <p className="text-sm font-medium text-foreground">
                    {assignment.booking?.deliveryaddress || 'Leveransadress saknas'}
                    {assignment.booking?.delivery_city ? `, ${assignment.booking.delivery_city}` : ''}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {assignment.driver_notes && (
            <div className="rounded-xl border bg-muted/20 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Anteckningar</p>
              <p className="mt-1 text-sm leading-relaxed text-foreground">{assignment.driver_notes}</p>
            </div>
          )}

          {onEdit && (
            <Button
              className="w-full"
              onClick={() => {
                onClose();
                onEdit(assignment);
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Redigera transport
            </Button>
          )}

          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              onClose();
              navigate(`/booking/${assignment.booking_id}`);
            }}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
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
  const dayStr = format(date, 'yyyy-MM-dd');
  const dayEvents = assignments
    .filter((a) => a.transport_date === dayStr)
    .sort((a, b) => (a.transport_time || '99:99').localeCompare(b.transport_time || '99:99'));

  return (
    <div className={cn('flex min-w-[185px] flex-1 flex-col rounded-xl border bg-card', isToday && 'border-primary/40 ring-1 ring-primary/10')}>
      <div className={cn('border-b px-3 py-3', isToday && 'bg-primary/[0.045]')}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className={cn('text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground', isToday && 'text-primary')}>
              {format(date, 'EEEE', { locale: sv })}
            </p>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span className="text-xl font-bold tabular-nums text-foreground">{format(date, 'd')}</span>
              <span className="text-xs text-muted-foreground">{format(date, 'MMM', { locale: sv })}</span>
            </div>
          </div>
          <Badge variant={dayEvents.length > 0 ? 'secondary' : 'outline'} className="rounded-full px-2 py-0.5 text-[10px]">
            {dayEvents.length}
          </Badge>
        </div>
      </div>

      <div className={cn('min-h-[310px] flex-1 space-y-2 p-2.5', isToday && 'bg-primary/[0.018]')}>
        {dayEvents.length === 0 ? (
          <div className="flex h-full min-h-[285px] flex-col items-center justify-center text-center">
            <Calendar className="mb-2 h-7 w-7 text-muted-foreground/20" />
            <span className="text-xs text-muted-foreground/60">Inga transporter</span>
          </div>
        ) : (
          dayEvents.map((assignment) => (
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
  onEditAssignment?: (assignment: TransportAssignment) => void;
}

const LogisticsWeekView: React.FC<LogisticsWeekViewProps> = ({ assignments, isLoading, currentDate, onDateChange, onEditAssignment }) => {
  const [selectedAssignment, setSelectedAssignment] = useState<TransportAssignment | null>(null);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekNumber = format(weekStart, 'w');
  const deliveredCount = useMemo(() => assignments.filter((a) => a.status === 'delivered').length, [assignments]);
  const pendingCount = assignments.length - deliveredCount;

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-col gap-4 border-b bg-muted/20 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-foreground" />
            <h2 className="text-sm font-bold text-foreground">Veckoplanering</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Transporter sorterade per dag och avgångstid.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden items-center gap-3 rounded-lg border bg-background px-3 py-1.5 text-xs text-muted-foreground md:flex">
            <span className="flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" />{assignments.length} transporter</span>
            <span className="h-3 w-px bg-border" />
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" />{deliveredCount} klara</span>
            <span className="h-3 w-px bg-border" />
            <span>{pendingCount} återstår</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => onDateChange(new Date())}>Idag</Button>
          <div className="flex items-center overflow-hidden rounded-lg border bg-background">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none" onClick={() => onDateChange(addDays(currentDate, -7))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[90px] border-x px-3 py-1.5 text-center text-xs font-semibold text-foreground">Vecka {weekNumber}</div>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none" onClick={() => onDateChange(addDays(currentDate, 7))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto p-3">
        {isLoading ? (
          <div className="flex min-w-[1295px] gap-2.5">
            {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-[390px] min-w-[185px] flex-1 rounded-xl" />)}
          </div>
        ) : (
          <div className="flex min-w-[1295px] items-stretch gap-2.5">
            {days.map((day) => (
              <DayColumn key={day.toISOString()} date={day} assignments={assignments} onSelectAssignment={setSelectedAssignment} />
            ))}
          </div>
        )}
      </div>

      <TransportDetailDialog assignment={selectedAssignment} open={!!selectedAssignment} onClose={() => setSelectedAssignment(null)} onEdit={onEditAssignment} />
    </section>
  );
};

export default LogisticsWeekView;
