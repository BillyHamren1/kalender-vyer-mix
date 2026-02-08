import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Inbox, Calendar, MapPin, FolderKanban, Briefcase, Building2, ChevronRight } from 'lucide-react';
import { fetchBookings } from '@/services/bookingService';
import { createJobFromBooking } from '@/services/jobService';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';

interface IncomingBookingsListProps {
  onCreateProject: (bookingId: string) => void;
  onCreateLargeProject?: (bookingId: string) => void;
}

export const IncomingBookingsList: React.FC<IncomingBookingsListProps> = ({
  onCreateProject,
  onCreateLargeProject
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['bookings-without-project'],
    queryFn: async () => {
      const allBookings = await fetchBookings();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      return allBookings.filter(b => {
        const eventDate = b.eventDate ? new Date(b.eventDate) : null;
        const isUpcoming = eventDate ? eventDate >= today : false;
        
        return (
          b.status === 'CONFIRMED' &&
          !b.assignedToProject &&
          !b.largeProjectId &&
          isUpcoming
        );
      });
    }
  });

  const createJobMutation = useMutation({
    mutationFn: createJobFromBooking,
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: ['bookings-without-project'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.success('Projekt litet skapat');
      navigate(`/jobs/${job.id}`);
    },
    onError: (error) => {
      toast.error('Kunde inte skapa litet projekt');
      console.error('Error creating small project:', error);
    }
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-border/40 bg-amber-50/30">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/10">
              <Inbox className="h-4 w-4 text-amber-600" />
            </div>
            <h3 className="font-semibold text-sm">Nya bokningar</h3>
          </div>
        </div>
        <div className="p-3 space-y-2">
          {[1, 2].map(i => (
            <div key={i} className="h-10 bg-muted/40 animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (bookings.length === 0) {
    return null;
  }

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
      {/* Compact header */}
      <div className="px-4 py-2.5 border-b border-border/40 bg-amber-50/30 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-amber-500/10">
            <Inbox className="h-4 w-4 text-amber-600" />
          </div>
          <h3 className="font-semibold text-sm text-foreground">Nya bokningar</h3>
        </div>
        <Badge className="h-5 px-2 text-xs font-medium bg-amber-100 text-amber-800 border-0">
          {bookings.length} nya
        </Badge>
      </div>

      {/* Compact bookings list */}
      <div className="divide-y divide-border/30">
        {bookings.map(booking => (
          <div 
            key={booking.id}
            className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors"
          >
            {/* Left: Client info - clickable */}
            <div 
              className="flex-1 min-w-0 cursor-pointer"
              onClick={() => navigate(`/booking/${booking.id}`)}
            >
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                  {booking.client}
                </h4>
                {booking.bookingNumber && (
                  <span className="text-[10px] text-muted-foreground/60 font-mono shrink-0">
                    #{booking.bookingNumber}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatDate(booking.eventDate)}
                </span>
                {booking.deliveryAddress && (
                  <span className="flex items-center gap-1 truncate max-w-[180px]">
                    <MapPin className="w-3 h-3 shrink-0" />
                    {booking.deliveryAddress}
                  </span>
                )}
              </div>
            </div>

            {/* Right: Compact action buttons */}
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => createJobMutation.mutate(booking.id)}
                disabled={createJobMutation.isPending}
                className="h-7 px-2 text-xs gap-1 hover:bg-primary/10 hover:text-primary"
                title="Litet projekt"
              >
                <Briefcase className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Litet</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onCreateProject(booking.id)}
                className="h-7 px-2 text-xs gap-1 hover:bg-primary/10 hover:text-primary"
                title="Medelstort projekt"
              >
                <FolderKanban className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Medel</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onCreateLargeProject?.(booking.id)}
                className="h-7 px-2 text-xs gap-1 hover:bg-primary/10 hover:text-primary"
                title="Stort projekt"
              >
                <Building2 className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Stort</span>
              </Button>
              <ChevronRight className="h-4 w-4 text-muted-foreground/20 ml-1" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
