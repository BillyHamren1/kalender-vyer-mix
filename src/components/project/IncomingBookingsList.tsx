import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Inbox, Calendar, MapPin, FolderKanban, Briefcase, Building2 } from 'lucide-react';
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
      
      // Filter: only CONFIRMED, not assigned to project (small/medium or large), and upcoming (event date >= today)
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Inbox className="w-5 h-5 text-primary" />
            Nya bokningar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (bookings.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center">
          <Inbox className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Inga nya bokningar att hantera</p>
        </CardContent>
      </Card>
    );
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
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Inbox className="w-5 h-5 text-primary" />
          Nya bokningar ({bookings.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {bookings.map(booking => (
            <div 
              key={booking.id}
              className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
            >
              {/* Left column: Client info - clickable to view booking */}
              <div 
                className="min-w-0 cursor-pointer"
                onClick={() => navigate(`/booking/${booking.id}`)}
              >
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium text-foreground truncate hover:text-primary transition-colors">
                    {booking.client}
                  </h4>
                  {booking.bookingNumber && (
                    <Badge variant="outline" className="text-xs shrink-0">
                      #{booking.bookingNumber}
                    </Badge>
                  )}
                  <Badge 
                    variant="secondary" 
                    className="text-xs shrink-0 bg-green-100 text-green-800"
                  >
                    Bekräftad
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1 w-28 shrink-0">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDate(booking.eventDate)}
                  </span>
                  {booking.deliveryAddress && (
                    <span className="flex items-center gap-1 truncate">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{booking.deliveryAddress}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Actions: Three buttons for different project types */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => createJobMutation.mutate(booking.id)}
                disabled={createJobMutation.isPending}
                className="gap-1.5"
                title="Skapa ett litet projekt (enkel struktur)"
              >
                <Briefcase className="w-4 h-4" />
                Litet
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onCreateProject(booking.id)}
                className="gap-1.5"
                title="Skapa ett medelstort projekt (full projekthantering)"
              >
                <FolderKanban className="w-4 h-4" />
                Medel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onCreateLargeProject?.(booking.id)}
                className="gap-1.5"
                title="Lägg till i ett stort projekt (flera bokningar)"
              >
                <Building2 className="w-4 h-4" />
                Stort
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
