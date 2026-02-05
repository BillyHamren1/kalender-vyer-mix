import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Inbox, Calendar, MapPin, FolderKanban, Briefcase, Building2, ArrowUpRight, Sparkles } from 'lucide-react';
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
      <div 
        className="relative rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--card) / 0.95) 100%)',
          boxShadow: '0 4px 24px -4px rgba(0, 0, 0, 0.08), 0 0 0 1px hsl(var(--border) / 0.5)',
        }}
      >
        <div className="h-1 bg-gradient-to-r from-amber-400/60 via-amber-500 to-amber-400/60" />
        <div className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/15 to-amber-500/5 ring-1 ring-amber-500/20">
              <Inbox className="h-5 w-5 text-amber-600" />
            </div>
            <h3 className="font-semibold text-lg">Nya bokningar</h3>
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-muted/50 animate-pulse rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div 
        className="relative rounded-2xl overflow-hidden border-2 border-dashed border-border/60"
        style={{
          background: 'linear-gradient(135deg, hsl(var(--muted) / 0.3) 0%, hsl(var(--muted) / 0.1) 100%)',
        }}
      >
        <div className="py-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted/50 flex items-center justify-center">
            <Inbox className="w-8 h-8 text-muted-foreground/40" />
          </div>
          <p className="text-muted-foreground font-medium">Inga nya bokningar att hantera</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Bokningar visas här när de bekräftas</p>
        </div>
      </div>
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
    <div 
      className="relative rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--card) / 0.95) 100%)',
        boxShadow: '0 4px 24px -4px rgba(0, 0, 0, 0.08), 0 0 0 1px hsl(var(--border) / 0.5)',
      }}
    >
      {/* Amber accent bar for incoming items */}
      <div className="h-1.5 bg-gradient-to-r from-amber-400/60 via-amber-500 to-amber-400/60" />
      
      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="relative p-2.5 rounded-xl bg-gradient-to-br from-amber-500/15 to-amber-500/5 ring-1 ring-amber-500/20">
              <Inbox className="h-5 w-5 text-amber-600" />
              <Sparkles className="absolute -top-1 -right-1 h-3.5 w-3.5 text-amber-500" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-foreground">Nya bokningar</h3>
              <p className="text-xs text-muted-foreground">Väntar på projekthantering</p>
            </div>
          </div>
          <Badge 
            variant="secondary" 
            className="h-7 px-3 text-sm font-medium bg-amber-100 text-amber-800 hover:bg-amber-100"
          >
            {bookings.length} nya
          </Badge>
        </div>

        {/* Bookings List */}
        <div className="space-y-3">
          {bookings.map(booking => (
            <div 
              key={booking.id}
              className="group relative p-4 rounded-xl border border-border/50 bg-gradient-to-br from-background to-muted/20 hover:border-primary/30 hover:shadow-md transition-all duration-200"
            >
              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                {/* Left: Client info - clickable */}
                <div 
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => navigate(`/booking/${booking.id}`)}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
                      {booking.client}
                    </h4>
                    {booking.bookingNumber && (
                      <Badge variant="outline" className="text-xs shrink-0 font-mono">
                        #{booking.bookingNumber}
                      </Badge>
                    )}
                    <Badge className="text-xs shrink-0 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                      Bekräftad
                    </Badge>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity ml-auto lg:hidden" />
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-muted-foreground/60" />
                      {formatDate(booking.eventDate)}
                    </span>
                    {booking.deliveryAddress && (
                      <span className="flex items-center gap-1.5 truncate">
                        <MapPin className="w-4 h-4 text-muted-foreground/60 shrink-0" />
                        <span className="truncate">{booking.deliveryAddress}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: Action buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => createJobMutation.mutate(booking.id)}
                    disabled={createJobMutation.isPending}
                    className="gap-2 rounded-lg h-9 px-3 border-border/60 hover:border-primary/40 hover:bg-primary/5 transition-all"
                    title="Skapa ett litet projekt (enkel struktur)"
                  >
                    <Briefcase className="w-4 h-4" />
                    <span className="hidden sm:inline">Litet</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onCreateProject(booking.id)}
                    className="gap-2 rounded-lg h-9 px-3 border-border/60 hover:border-primary/40 hover:bg-primary/5 transition-all"
                    title="Skapa ett medelstort projekt (full projekthantering)"
                  >
                    <FolderKanban className="w-4 h-4" />
                    <span className="hidden sm:inline">Medel</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onCreateLargeProject?.(booking.id)}
                    className="gap-2 rounded-lg h-9 px-3 border-border/60 hover:border-primary/40 hover:bg-primary/5 transition-all"
                    title="Lägg till i ett stort projekt (flera bokningar)"
                  >
                    <Building2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Stort</span>
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
