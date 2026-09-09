import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { CalendarDays, ExternalLink, MapPin, Package, Phone, Mail, UserRound, Clock3 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import QuickAssignStaffPopover from '@/components/warehouse-ops/QuickAssignStaffPopover';
import type { OpsJob } from '@/hooks/useWarehouseOpsRange';

const STATUS_LABELS: Record<string, string> = {
  planning: 'Ej påbörjad',
  in_progress: 'Packas',
  packed: 'Packad',
  delivered: 'Ute hos kund',
  back: 'Retur väntar',
  returning: 'Retur pågår',
  started_back: 'Retur pågår',
  in_production: 'Pågår',
  completed_out: 'Utlevererad',
  completed_in: 'Retur klar',
  completed: 'Klar',
  done: 'Klar',
};

const fmtDate = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, 'EEE d MMM yyyy', { locale: sv });
};
const fmtTime = (value?: string | null) => (value ? String(value).slice(0, 5) : null);

interface Props {
  job: OpsJob | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Öppnar hela bokningsunderlaget direkt när ett kalenderkort klickas —
 * ren läsvy + befintliga snabbåtgärder. Inga bokningsfält muteras här.
 */
const OpsJobBookingSheet: React.FC<Props> = ({ job, open, onOpenChange }) => {
  const navigate = useNavigate();
  const bookingId = job?.bookingId || null;

  const { data: booking, isLoading } = useQuery({
    queryKey: ['ops-job-booking', bookingId],
    enabled: open && !!bookingId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('id, booking_number, client, title, status, contact_name, contact_phone, contact_email, deliveryaddress, delivery_city, delivery_postal_code, rigdaydate, rig_start_time, rig_end_time, eventdate, event_start_time, event_end_time, rigdowndate, rigdown_start_time, rigdown_end_time, internalnotes, exact_time_info, customer_pickup, carry_more_than_10m')
        .eq('id', bookingId as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: productCount } = useQuery({
    queryKey: ['ops-job-booking-products', bookingId],
    enabled: open && !!bookingId,
    staleTime: 30_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('booking_products')
        .select('id', { count: 'exact', head: true })
        .eq('booking_id', bookingId as string);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const phases = [
    { label: 'Rigg', date: booking?.rigdaydate, start: booking?.rig_start_time, end: booking?.rig_end_time },
    { label: 'Event', date: booking?.eventdate, start: booking?.event_start_time, end: booking?.event_end_time },
    { label: 'Rivning', date: booking?.rigdowndate, start: booking?.rigdown_start_time, end: booking?.rigdown_end_time },
  ].filter((phase) => !!phase.date);

  const address = [booking?.deliveryaddress, booking?.delivery_postal_code, booking?.delivery_city].filter(Boolean).join(', ');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="text-left">
          <SheetTitle className="flex flex-wrap items-center gap-2">
            <span>{job?.bookingNumber || job?.name || 'Jobb'}</span>
            <Badge variant="outline" className="text-[10px]">{STATUS_LABELS[job?.status || ''] || job?.status}</Badge>
            <Badge variant="outline" className="text-[10px]">
              {job?.direction === 'in' ? 'Retur' : job?.direction === 'internal' ? 'Lager' : 'Packning'}
            </Badge>
          </SheetTitle>
          <SheetDescription>{booking?.client || job?.client || job?.name || 'Bokningsunderlag'}</SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex flex-wrap gap-2">
          {job?.packingId && (
            <Button size="sm" onClick={() => navigate(`/warehouse/packing/${job.packingId}`)}>
              <Package className="mr-1.5 h-4 w-4" /> Öppna packning
            </Button>
          )}
          {bookingId && (
            <Button size="sm" variant="outline" onClick={() => navigate(`/warehouse/bookings/${bookingId}`)}>
              <ExternalLink className="mr-1.5 h-4 w-4" /> Öppna bokning
            </Button>
          )}
          {job?.packingId && (
            <QuickAssignStaffPopover
              packingId={job.packingId}
              packingName={job.bookingNumber || job.name}
              assignedNames={(job.assignedStaff || []).map((a) => a.name).filter(Boolean)}
              label={(job.assignedStaff?.length || 0) > 0 ? 'Ändra bemanning' : 'Bemanna'}
              muted={(job.assignedStaff?.length || 0) === 0}
            />
          )}
        </div>

        {isLoading ? (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="mt-4 space-y-3 text-sm">
            <section className="rounded-xl border border-border bg-muted/25 p-4 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dagar och tider</div>
              {phases.length === 0 && <div className="text-muted-foreground">Inga datum satta i bokningen.</div>}
              {phases.map((phase) => (
                <div key={phase.label} className="flex items-start gap-2">
                  <CalendarDays className="mt-0.5 h-4 w-4 text-warehouse" />
                  <div>
                    <div className="font-medium">{phase.label} · {fmtDate(phase.date)}</div>
                    <div className="text-xs text-muted-foreground">
                      {fmtTime(phase.start) ? `${fmtTime(phase.start)}${fmtTime(phase.end) ? `–${fmtTime(phase.end)}` : ''}` : 'Tid saknas'}
                    </div>
                  </div>
                </div>
              ))}
              {job?.anchorTime && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock3 className="h-3.5 w-3.5" /> Lagerdeadline {fmtTime(job.anchorTime)}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-border p-4 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plats och kontakt</div>
              {address ? (
                <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 text-warehouse" /><span>{address}</span></div>
              ) : (
                <div className="text-muted-foreground">Ingen leveransadress angiven.</div>
              )}
              {booking?.contact_name && <div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-warehouse" />{booking.contact_name}</div>}
              {booking?.contact_phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-warehouse" /><a className="underline" href={`tel:${booking.contact_phone}`}>{booking.contact_phone}</a></div>}
              {booking?.contact_email && <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-warehouse" /><a className="underline" href={`mailto:${booking.contact_email}`}>{booking.contact_email}</a></div>}
              {booking?.customer_pickup && <div className="text-xs text-muted-foreground">Kunden hämtar själv.</div>}
              {booking?.carry_more_than_10m && <div className="text-xs text-muted-foreground">Bärsträcka över 10 m.</div>}
            </section>

            <section className="rounded-xl border border-border p-4 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Packning</div>
              <div className="flex items-center justify-between">
                <span>Kontrollerat</span>
                <span className="font-bold tabular-nums">{job?.verifiedItems ?? 0}/{job?.totalItems ?? 0} · {job?.percent ?? 0}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-warehouse" style={{ width: `${Math.min(100, job?.percent ?? 0)}%` }} />
              </div>
              <div className="text-xs text-muted-foreground">{productCount ?? 0} orderrader i bokningen.</div>
              <div className="text-xs text-muted-foreground">
                Bemanning: {(job?.assignedStaff?.length || 0) > 0
                  ? job!.assignedStaff.map((a) => `${a.name}${a.startTime ? ` ${a.startTime.slice(0, 5)}` : ''}`).join(' · ')
                  : 'Ingen planerad'}
              </div>
            </section>

            {(booking?.internalnotes || booking?.exact_time_info) && (
              <section className="rounded-xl border border-border p-4 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Intern information</div>
                {booking?.exact_time_info && <p className="whitespace-pre-wrap text-sm">{booking.exact_time_info}</p>}
                {booking?.internalnotes && <p className="whitespace-pre-wrap text-sm">{booking.internalnotes}</p>}
              </section>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default OpsJobBookingSheet;
