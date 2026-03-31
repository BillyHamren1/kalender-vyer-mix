import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Inbox, Calendar, MapPin, Package, ChevronRight, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { syncBookingToPacking } from '@/services/booking/bookingPackingSyncService';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';

interface IncomingBooking {
  id: string;
  client: string;
  booking_number: string | null;
  eventdate: string | null;
  deliveryaddress: string | null;
  organization_id: string;
}

export const IncomingPackingList: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['bookings-without-packing'],
    queryFn: async () => {
      const [{ data: jobBookingIds }, { data: projectBookingIds }, { data: largeLinks }] = await Promise.all([
        supabase.from('jobs').select('booking_id').not('status', 'in', '("completed","cancelled")').not('booking_id', 'is', null),
        supabase.from('projects').select('booking_id').not('status', 'in', '("completed","cancelled")').not('booking_id', 'is', null),
        supabase.from('large_project_bookings').select('booking_id'),
      ]);

      const allProjectBookingIds = new Set([
        ...(jobBookingIds || []).map(j => j.booking_id).filter(Boolean),
        ...(projectBookingIds || []).map(p => p.booking_id).filter(Boolean),
        ...(largeLinks || []).map(l => l.booking_id).filter(Boolean),
      ]);

      if (allProjectBookingIds.size === 0) return [];

      const ids = Array.from(allProjectBookingIds);

      const { data: existingPackings } = await supabase
        .from('packing_projects')
        .select('booking_id')
        .in('booking_id', ids);

      const packedIds = new Set((existingPackings || []).map(p => p.booking_id).filter(Boolean));

      const missingIds = ids.filter(id => !packedIds.has(id));
      if (missingIds.length === 0) return [];

      const { data: bookings, error } = await supabase
        .from('bookings')
        .select('id, client, booking_number, eventdate, deliveryaddress, organization_id')
        .in('id', missingIds)
        .neq('status', 'CANCELLED')
        .order('eventdate', { ascending: true });

      if (error) {
        console.error('Error fetching bookings without packing:', error);
        return [];
      }

      return (bookings || []) as IncomingBooking[];
    },
    placeholderData: [],
  });

  const handleCreatePacking = async (booking: IncomingBooking) => {
    setCreatingId(booking.id);
    try {
      // Build packing name from booking
      const dateStr = booking.eventdate
        ? format(new Date(booking.eventdate), 'd MMMM yyyy', { locale: sv })
        : '';
      const packingName = `${booking.client}${dateStr ? ` - ${dateStr}` : ''}`;

      // Create packing project directly (edge function only creates for CONFIRMED bookings)
      const { data: newPacking, error: createError } = await supabase
        .from('packing_projects')
        .insert({
          name: packingName,
          booking_id: booking.id,
          client_name: booking.client,
          delivery_address: booking.deliveryaddress,
          status: 'planning',
          organization_id: booking.organization_id,
        })
        .select('id')
        .single();

      if (createError) throw createError;

      // Sync items + tasks via edge function (idempotent, will update existing packing)
      syncBookingToPacking(booking.id, booking.organization_id);

      await queryClient.invalidateQueries({ queryKey: ['bookings-without-packing'] });
      await queryClient.invalidateQueries({ queryKey: ['packings'] });

      toast.success(`Packning skapad för ${booking.client}`);

      if (newPacking) {
        navigate(`/warehouse/packing/${newPacking.id}`);
      }
    } catch (err) {
      console.error('Error creating packing:', err);
      toast.error('Kunde inte skapa packning');
    } finally {
      setCreatingId(null);
    }
  };

  if (isLoading || bookings.length === 0) return null;

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr), 'd MMM yyyy', { locale: sv });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 border-b border-border/40 bg-amber-50/30 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-amber-500/10">
            <Inbox className="h-4 w-4 text-amber-600" />
          </div>
          <h3 className="font-semibold text-sm text-foreground">Projekt utan packning</h3>
        </div>
        <Badge className="h-5 px-2 text-xs font-medium bg-amber-100 text-amber-800 border-0">
          {bookings.length} nya
        </Badge>
      </div>

      <div className="divide-y divide-border/30">
        {bookings.map(booking => (
          <div
            key={booking.id}
            className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors"
          >
            <div
              className="flex-1 min-w-0 cursor-pointer"
              onClick={() => navigate(`/booking/${booking.id}`)}
            >
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium truncate group-hover:text-primary transition-colors text-foreground">
                  {booking.client}
                </h4>
                {booking.booking_number && (
                  <span className="text-[10px] text-muted-foreground/60 font-mono shrink-0">
                    #{booking.booking_number}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatDate(booking.eventdate || '')}
                </span>
                {booking.deliveryaddress && (
                  <span className="flex items-center gap-1 truncate max-w-[180px]">
                    <MapPin className="w-3 h-3 shrink-0" />
                    {booking.deliveryaddress}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCreatePacking(booking)}
                disabled={creatingId === booking.id}
                className="h-7 px-2 text-xs gap-1 hover:bg-primary/10 hover:text-primary"
              >
                {creatingId === booking.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Package className="w-3.5 h-3.5" />
                )}
                <span>Skapa packning</span>
              </Button>
              <ChevronRight className="h-4 w-4 text-muted-foreground/20 ml-1" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
