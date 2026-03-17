import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Inbox, Calendar, Briefcase, FolderKanban, Building2, ArrowUpRight, Sparkles, XCircle } from 'lucide-react';
import { fetchBookings } from '@/services/bookingService';
import { supabase } from '@/integrations/supabase/client';
import { createJobFromBooking } from '@/services/jobService';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';

interface DashboardNewBookingsProps {
  onCreateProject: (bookingId: string) => void;
  onCreateLargeProject: (bookingId: string) => void;
}

const DashboardNewBookings: React.FC<DashboardNewBookingsProps> = ({
  onCreateProject,
  onCreateLargeProject,
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['bookings-without-project'],
    queryFn: async () => {
      const allBookings = await fetchBookings();

      // Filter by flags first
      const candidates = allBookings.filter((b) => {
        return b.status === 'CONFIRMED' && !b.assignedToProject && !b.largeProjectId;
      });

      if (candidates.length === 0) return [];

      // Cross-check against actual relations to prevent ghost entries
      const candidateIds = candidates.map(b => b.id);
      
      const [{ data: activeJobs }, { data: activeProjects }, { data: largeLinks }] = await Promise.all([
        supabase.from('jobs').select('booking_id').in('booking_id', candidateIds).neq('status', 'completed'),
        supabase.from('projects').select('booking_id').in('booking_id', candidateIds).not('status', 'in', '("completed","cancelled")'),
        supabase.from('large_project_bookings').select('booking_id').in('booking_id', candidateIds),
      ]);

      const assignedIds = new Set([
        ...(activeJobs || []).map(j => j.booking_id),
        ...(activeProjects || []).map(p => p.booking_id),
        ...(largeLinks || []).map(l => l.booking_id),
      ]);

      return candidates.filter(b => !assignedIds.has(b.id));
    },
  });

  const createJobMutation = useMutation({
    mutationFn: createJobFromBooking,
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: ['bookings-without-project'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success('Projekt litet skapat');
      navigate(`/jobs/${job.id}`);
    },
    onError: (error) => {
      toast.error('Kunde inte skapa litet projekt');
      console.error('Error creating small project:', error);
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
    return null;
  }

  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--card) / 0.95) 100%)',
        boxShadow: '0 4px 24px -4px rgba(0, 0, 0, 0.08), 0 0 0 1px hsl(var(--border) / 0.5)',
      }}
    >
      <div className="h-1.5 bg-gradient-to-r from-amber-400/60 via-amber-500 to-amber-400/60" />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="relative p-2.5 rounded-xl bg-gradient-to-br from-amber-500/15 to-amber-500/5 ring-1 ring-amber-500/20">
              <Inbox className="h-5 w-5 text-amber-600" />
              <Sparkles className="absolute -top-1 -right-1 h-3.5 w-3.5 text-amber-500" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-foreground">Nya bokningar</h3>
              <p className="text-xs text-muted-foreground">Tilldela projekt direkt från dashboarden</p>
            </div>
          </div>
          <Badge
            variant="secondary"
            className="h-7 px-3 text-sm font-medium bg-amber-100 text-amber-800 hover:bg-amber-100"
          >
            {bookings.length} nya
          </Badge>
        </div>

        {/* Scrollable list */}
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
          {bookings.map(booking => {
            const isCancelled = booking.status === 'CANCELLED';
            return (
              <div
                key={booking.id}
                className={`group relative rounded-xl border bg-gradient-to-br from-background to-muted/20 hover:shadow-sm transition-all duration-200 ${isCancelled ? 'border-red-200/60 hover:border-red-300/50' : 'border-border/50 hover:border-primary/30'}`}
              >
                <div className="flex items-center gap-3 px-3 py-2.5">
                  {/* Left: booking info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className={`font-semibold text-sm leading-tight truncate group-hover:text-primary transition-colors ${isCancelled ? 'text-red-700 line-through' : 'text-foreground'}`}>
                        {booking.client}
                      </h4>
                      {isCancelled && (
                        <Badge className="h-4 px-1.5 text-[10px] font-medium bg-red-100 text-red-700 border-0 shrink-0">
                          <XCircle className="w-2.5 h-2.5 mr-0.5" />
                          Avbokad
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      {booking.bookingNumber && (
                        <Badge variant="outline" className="text-xs shrink-0 font-mono h-5 px-1.5">
                          #{booking.bookingNumber}
                        </Badge>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-muted-foreground/60" />
                        {formatDate(booking.eventDate)}
                      </span>
                    </div>
                  </div>

                  {/* Right: project type buttons (hidden for cancelled) */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isCancelled && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => createJobMutation.mutate(booking.id)}
                          disabled={createJobMutation.isPending}
                          className="gap-1 h-7 px-2 text-xs rounded-lg border-border/60 hover:border-primary/40 hover:bg-primary/5"
                          title="Litet projekt"
                        >
                          <Briefcase className="w-3 h-3" />
                          Litet
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onCreateProject(booking.id)}
                          className="gap-1 h-7 px-2 text-xs rounded-lg border-border/60 hover:border-primary/40 hover:bg-primary/5"
                          title="Medel projekt"
                        >
                          <FolderKanban className="w-3 h-3" />
                          Medel
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onCreateLargeProject(booking.id)}
                          className="gap-1 h-7 px-2 text-xs rounded-lg border-border/60 hover:border-primary/40 hover:bg-primary/5"
                          title="Stort projekt"
                        >
                          <Building2 className="w-3 h-3" />
                          Stort
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/booking/${booking.id}`)}
                      className="h-7 w-7 p-0 rounded-lg text-muted-foreground/40 hover:text-muted-foreground"
                      title="Öppna bokning"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DashboardNewBookings;
