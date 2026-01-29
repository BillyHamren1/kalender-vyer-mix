import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Inbox, Calendar, MapPin, FolderKanban, Briefcase } from 'lucide-react';
import { fetchBookings } from '@/services/bookingService';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface IncomingBookingsListProps {
  onCreateProject: (bookingId: string) => void;
  onCreateJob: (bookingId: string) => void;
}

export const IncomingBookingsList: React.FC<IncomingBookingsListProps> = ({
  onCreateProject,
  onCreateJob
}) => {
  const navigate = useNavigate();
  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['bookings-without-project'],
    queryFn: async () => {
      const allBookings = await fetchBookings();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Filter: only CONFIRMED, not assigned to project, and upcoming (event date >= today)
      return allBookings.filter(b => {
        const eventDate = b.eventDate ? new Date(b.eventDate) : null;
        const isUpcoming = eventDate ? eventDate >= today : false;
        
        return (
          b.status === 'CONFIRMED' &&
          !b.assignedToProject &&
          isUpcoming
        );
      });
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
              className="grid grid-cols-[1fr_auto_auto] items-center gap-4 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
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

              {/* Right column: Actions */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onCreateJob(booking.id)}
                className="gap-1.5 w-24"
              >
                <Briefcase className="w-4 h-4" />
                Jobb
              </Button>
              <Button
                size="sm"
                onClick={() => onCreateProject(booking.id)}
                className="gap-1.5 w-24"
              >
                <FolderKanban className="w-4 h-4" />
                Projekt
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
