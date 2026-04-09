import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Calendar, MapPin, ChevronRight, ChevronDown, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import BookingChangesDetail from '@/components/booking/BookingChangesDetail';

interface UpdatedBooking {
  id: string;
  client: string;
  booking_number: string | null;
  eventdate: string | null;
  deliveryaddress: string | null;
  needs_review_reason: string | null;
}

export const UpdatedBookingsList: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['bookings-needs-review'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('id, client, booking_number, eventdate, deliveryaddress, needs_review_reason')
        .eq('needs_review', true)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error fetching updated bookings:', error);
        return [];
      }
      return (data || []) as UpdatedBooking[];
    },
    placeholderData: [],
  });

  const approveMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase
        .from('bookings')
        .update({ needs_review: false, needs_review_reason: null })
        .eq('id', bookingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings-needs-review'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success('Ändring godkänd');
    },
    onError: () => {
      toast.error('Kunde inte godkänna ändringen');
    },
  });

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr), 'd MMM yyyy', { locale: sv });
    } catch {
      return dateStr;
    }
  };

  if (isLoading || bookings.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 border-b border-border/40 bg-blue-50/30 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-blue-500/10">
            <RefreshCw className="h-4 w-4 text-blue-600" />
          </div>
          <h3 className="font-semibold text-sm text-foreground">Uppdaterade bokningar</h3>
        </div>
        <Badge className="h-5 px-2 text-xs font-medium bg-blue-100 text-blue-800 border-0">
          {bookings.length} uppdaterade
        </Badge>
      </div>

      <div className="divide-y divide-border/30">
        {bookings.map(booking => {
          const isExpanded = expandedId === booking.id;
          return (
            <div key={booking.id}>
              <div className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors">
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : booking.id)}
                >
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium truncate group-hover:text-primary transition-colors text-foreground">
                      {booking.client}
                    </h4>
                    <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-medium shrink-0 border-blue-300 text-blue-700 bg-blue-50">
                      Ändrad
                    </Badge>
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
                    onClick={() => setExpandedId(isExpanded ? null : booking.id)}
                    className="h-7 px-2 text-xs gap-1 hover:bg-blue-50 hover:text-blue-700"
                  >
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    <span>Visa</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => approveMutation.mutate(booking.id)}
                    disabled={approveMutation.isPending}
                    className="h-7 px-2 text-xs gap-1 hover:bg-green-50 hover:text-green-700"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Godkänn</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`/booking/${booking.id}`)}
                    className="h-7 w-7 p-0"
                  >
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                  </Button>
                </div>
              </div>

              {isExpanded && (
                <div className="px-4 pb-3 bg-blue-50/20 border-t border-border/20">
                  <BookingChangesDetail bookingId={booking.id} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
