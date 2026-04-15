import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Calendar as CalendarIcon, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import ProjectScheduleEditable from '@/components/project/ProjectScheduleEditable';

interface MultiBookingScheduleCardProps {
  linkedBookingIds: string[];
  packingStartDate?: string | null;
  packingEndDate?: string | null;
  onPackingDateChange: (updates: { start_date?: string | null; end_date?: string | null }) => void;
  onBookingUpdated?: () => void;
}

interface LinkedBookingDetails {
  id: string;
  client: string;
  booking_number: string | null;
  rigdaydate: string | null;
  eventdate: string | null;
  rigdowndate: string | null;
  rig_start_time: string | null;
  rig_end_time: string | null;
  event_start_time: string | null;
  event_end_time: string | null;
  rigdown_start_time: string | null;
  rigdown_end_time: string | null;
}

const MultiBookingScheduleCard = ({
  linkedBookingIds,
  packingStartDate,
  packingEndDate,
  onPackingDateChange,
  onBookingUpdated,
}: MultiBookingScheduleCardProps) => {
  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['packing-linked-booking-details', linkedBookingIds],
    enabled: linkedBookingIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('id, client, booking_number, rigdaydate, eventdate, rigdowndate, rig_start_time, rig_end_time, event_start_time, event_end_time, rigdown_start_time, rigdown_end_time')
        .in('id', linkedBookingIds);

      if (error) throw error;

      const orderMap = new Map(linkedBookingIds.map((id, index) => [id, index]));
      return ((data || []) as LinkedBookingDetails[]).sort(
        (a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0)
      );
    },
  });

  const visibleBookings = useMemo(
    () => bookings.filter((booking) => booking.rigdaydate || booking.eventdate || booking.rigdowndate),
    [bookings]
  );

  return (
    <Card className="mb-4 border-border/40 shadow-2xl rounded-2xl">
      <div className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, hsl(38 92% 55%) 0%, hsl(32 95% 40%) 100%)' }}
          >
            <Package className="h-4 w-4 text-white" />
          </div>
          <span className="text-xs font-bold text-foreground uppercase tracking-wider">Packdatum</span>
        </div>

        <div className="flex items-center gap-3 w-full mb-4">
          <Popover>
            <PopoverTrigger asChild>
              <div className="flex-1 rounded-xl p-4 border border-border/40 bg-card cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-6 h-6 rounded-md flex items-center justify-center bg-muted">
                    <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">START</span>
                </div>
                {packingStartDate ? (
                  <p className="font-bold text-lg text-foreground tracking-tight">
                    {format(new Date(packingStartDate), 'd MMMM yyyy', { locale: sv })}
                  </p>
                ) : (
                  <p className="text-sm text-primary font-medium mt-1">Lägg till datum</p>
                )}
              </div>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={packingStartDate ? new Date(packingStartDate) : undefined}
                onSelect={(date) => onPackingDateChange({ start_date: date ? format(date, 'yyyy-MM-dd') : null })}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

          <div className="w-8 h-px bg-border/60 flex-shrink-0" />

          <Popover>
            <PopoverTrigger asChild>
              <div className="flex-1 rounded-xl p-4 border border-border/40 bg-card cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-6 h-6 rounded-md flex items-center justify-center bg-muted">
                    <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">SLUT</span>
                </div>
                {packingEndDate ? (
                  <p className="font-bold text-lg text-foreground tracking-tight">
                    {format(new Date(packingEndDate), 'd MMMM yyyy', { locale: sv })}
                  </p>
                ) : (
                  <p className="text-sm text-primary font-medium mt-1">Lägg till datum</p>
                )}
              </div>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={packingEndDate ? new Date(packingEndDate) : undefined}
                onSelect={(date) => onPackingDateChange({ end_date: date ? format(date, 'yyyy-MM-dd') : null })}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="border-t border-border/30 pt-4">
          <div className="flex items-center justify-between mb-3 gap-2">
            <span className="text-xs font-bold text-foreground uppercase tracking-wider">Alla bokningsevent</span>
            <span className="text-xs text-muted-foreground">{visibleBookings.length} av {linkedBookingIds.length} bokningar med datum</span>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Laddar bokningsevent...</p>
          ) : visibleBookings.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Inga bokningsevent hittades</p>
          ) : (
            <div className="space-y-3">
              {visibleBookings.map((booking) => (
                <div key={booking.id} className="rounded-xl border border-border/30 bg-background/40 p-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
                    <h3 className="text-base font-semibold text-foreground">{booking.client}</h3>
                    <span className="text-sm text-muted-foreground">
                      Bokning: {booking.booking_number || booking.id}
                    </span>
                  </div>

                  <ProjectScheduleEditable
                    bookingId={booking.id}
                    rigDate={booking.rigdaydate}
                    eventDate={booking.eventdate}
                    rigdownDate={booking.rigdowndate}
                    rigStartTime={booking.rig_start_time}
                    rigEndTime={booking.rig_end_time}
                    eventStartTime={booking.event_start_time}
                    eventEndTime={booking.event_end_time}
                    rigdownStartTime={booking.rigdown_start_time}
                    rigdownEndTime={booking.rigdown_end_time}
                    onUpdated={onBookingUpdated}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};

export default MultiBookingScheduleCard;
