import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Inbox, Calendar, MapPin, ChevronRight, XCircle, Trash2, Undo2, CalendarPlus, RefreshCw, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import { BookingPlacementDialog } from './BookingPlacementDialog';
import { useUnplannedProjects } from '@/hooks/useUnplannedProjects';
import { useUnseenBookingUpdates, useMarkBookingChangesSeen } from '@/hooks/useUnseenBookingUpdates';


interface IncomingBooking {
  id: string;
  client: string;
  status: string;
  booking_number: string | null;
  eventdate: string | null;
  deliveryaddress: string | null;
  large_project_id: string | null;
}

interface IncomingBookingsListProps {
  onCreateProject: (bookingId: string) => void;
  onCreateLargeProject?: (bookingId: string) => void;
}

export const IncomingBookingsList: React.FC<IncomingBookingsListProps> = ({
  // onCreateProject / onCreateLargeProject behålls i interfacet för bakåtkompat
  // men används inte längre — Placera-knappen öppnar BookingPlacementDialog direkt.
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [placementBookingId, setPlacementBookingId] = useState<string | null>(null);
  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['bookings-without-project'],
    queryFn: async () => {
      // Query only unassigned bookings directly from Supabase
      const { data: candidates, error } = await supabase
        .from('bookings')
        .select('id, client, status, booking_number, eventdate, deliveryaddress, large_project_id')
        .eq('status', 'CONFIRMED')
        .or('assigned_to_project.is.null,assigned_to_project.eq.false')
        .is('large_project_id', null)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching incoming bookings:', error);
        return [];
      }
      if (!candidates || candidates.length === 0) return [];

      const candidateIds = candidates.map(b => b.id);
      
      const [{ data: activeJobs }, { data: activeProjects }, { data: largeLinks }] = await Promise.all([
        supabase.from('jobs').select('booking_id').in('booking_id', candidateIds).is('deleted_at', null).not('status', 'in', '("completed","cancelled")'),
        supabase.from('projects').select('booking_id').in('booking_id', candidateIds).not('status', 'in', '("completed","cancelled")'),
        supabase.from('large_project_bookings').select('booking_id').in('booking_id', candidateIds),
      ]);

      const assignedIds = new Set([
        ...(activeJobs || []).map(j => j.booking_id),
        ...(activeProjects || []).map(p => p.booking_id),
        ...(largeLinks || []).map(l => l.booking_id),
      ]);

      return candidates.filter(b => !assignedIds.has(b.id)) as IncomingBooking[];
    },
    placeholderData: [],
  });
  const { data: unplannedProjects = [], isLoading: isLoadingUnplannedProjects } = useUnplannedProjects();
  const { data: unseenUpdates = [], isLoading: isLoadingUpdates } = useUnseenBookingUpdates();
  const markSeen = useMarkBookingChangesSeen();

  // Hämta bokningsmeta (klient, nummer, datum) för uppdaterade bokningar
  const updateBookingIds = unseenUpdates.map((u) => u.booking_id);
  const { data: updatedBookingsMeta = [] } = useQuery({
    queryKey: ['updated-bookings-meta', updateBookingIds.sort().join(',')],
    queryFn: async () => {
      if (updateBookingIds.length === 0) return [];
      const { data, error } = await supabase
        .from('bookings')
        .select('id, client, booking_number, eventdate, deliveryaddress, assigned_project_id, large_project_id')
        .in('id', updateBookingIds);
      if (error) {
        console.error('[updated-bookings-meta]', error);
        return [];
      }
      return data || [];
    },
    enabled: updateBookingIds.length > 0,
    staleTime: 30_000,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['bookings-without-project'] });
    queryClient.invalidateQueries({ queryKey: ['bookings'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
  };


  // (createJobMutation borttagen — Placera-flödet skapar projekt via BookingPlacementDialog)


  const deleteMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase
        .from('bookings')
        .update({ assigned_to_project: true })
        .eq('id', bookingId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('Bokning borttagen från planning');
    },
    onError: (error) => {
      toast.error('Kunde inte ta bort bokningen');
      console.error('Error deleting booking:', error);
    }
  });

  const restoreMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const [{ count: jobCount }, { count: projectCount }, { data: booking }] = await Promise.all([
        supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('booking_id', bookingId),
        supabase.from('projects').select('*', { count: 'exact', head: true }).eq('booking_id', bookingId),
        supabase.from('bookings').select('large_project_id, assigned_project_id').eq('id', bookingId).single(),
      ]);
      const hasProject = (jobCount ?? 0) > 0 || (projectCount ?? 0) > 0 || !!booking?.large_project_id || !!booking?.assigned_project_id;
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'CONFIRMED', assigned_to_project: hasProject })
        .eq('id', bookingId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('Bokning återställd till bekräftad');
    },
    onError: (error) => {
      toast.error('Kunde inte återställa bokningen');
      console.error('Error restoring booking:', error);
    }
  });

  const totalNew = bookings.length + unplannedProjects.length;
  const totalUpdates = unseenUpdates.length;
  const hasIncomingItems = totalNew + totalUpdates > 0;

  if ((isLoading && isLoadingUnplannedProjects && isLoadingUpdates) || !hasIncomingItems) {
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

  const handleReviewUpdate = (booking: typeof updatedBookingsMeta[number]) => {
    const projectId = booking.large_project_id || booking.assigned_project_id;
    if (projectId) {
      navigate(`/projects/${booking.large_project_id ? 'large/' : ''}${projectId}`);
    } else {
      navigate(`/booking/${booking.id}`);
    }
    markSeen.mutate(booking.id);
  };

  // Visuell prioritet: uppdaterade > nya (uppdateringar är ofta tidskritiska)
  const headerLabel = totalUpdates > 0 ? 'Uppdaterade bokningar' : 'Nya bokningar';
  const badgeLabel =
    totalUpdates > 0 && totalNew > 0
      ? `${totalUpdates} uppdaterade · ${totalNew} nya`
      : totalUpdates > 0
        ? `${totalUpdates} uppdaterade`
        : `${totalNew} nya`;

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 border-b border-border/40 bg-amber-50/30 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-amber-500/10">
            {totalUpdates > 0 ? (
              <RefreshCw className="h-4 w-4 text-amber-600" />
            ) : (
              <Inbox className="h-4 w-4 text-amber-600" />
            )}
          </div>
          <h3 className="font-semibold text-sm text-foreground">{headerLabel}</h3>
        </div>
        <Badge className="h-5 px-2 text-xs font-medium bg-amber-100 text-amber-800 border-0">
          {badgeLabel}
        </Badge>
      </div>


      <div className="divide-y divide-border/30">
        {unplannedProjects.map((project) => (
          <div
            key={`${project.kind}-${project.id}`}
            className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors"
          >
            <div
              className="flex-1 min-w-0 cursor-pointer"
              onClick={() => project.bookingId && setPlacementBookingId(project.bookingId)}
            >
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium truncate text-foreground group-hover:text-primary transition-colors">
                  {project.client || project.name}
                </h4>
                {project.booking_number && (
                  <span className="text-[10px] text-muted-foreground/60 font-mono shrink-0">
                    #{project.booking_number}
                  </span>
                )}
                <Badge variant="outline" className="h-4 px-1.5 text-[10px] shrink-0">
                  Medel
                </Badge>
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatDate(project.eventdate || '')}
                </span>
                {project.deliveryaddress && (
                  <span className="flex items-center gap-1 truncate max-w-[180px]">
                    <MapPin className="w-3 h-3 shrink-0" />
                    {project.deliveryaddress}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="default"
                size="sm"
                onClick={() => project.bookingId && setPlacementBookingId(project.bookingId)}
                className="h-7 px-3 text-xs gap-1"
                title="Placera bokningen"
                disabled={!project.bookingId}
              >
                <CalendarPlus className="w-3.5 h-3.5" />
                <span>Placera</span>
              </Button>
              <ChevronRight className="h-4 w-4 text-muted-foreground/20 ml-1" />
            </div>
          </div>
        ))}

        {bookings.map(booking => {
          const isCancelled = booking.status === 'CANCELLED';
          return (
            <div 
              key={booking.id}
              className={`group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors ${isCancelled ? 'bg-destructive/5' : ''}`}
            >
              <div 
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => navigate(`/booking/${booking.id}`)}
              >
                <div className="flex items-center gap-2">
                  <h4 className={`text-sm font-medium truncate group-hover:text-primary transition-colors ${isCancelled ? 'text-destructive line-through' : 'text-foreground'}`}>
                    {booking.client}
                  </h4>
                  {isCancelled && (
                    <Badge variant="destructive" className="h-4 px-1.5 text-[10px] font-medium shrink-0">
                      <XCircle className="w-2.5 h-2.5 mr-0.5" />
                      Avbokad
                    </Badge>
                  )}
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
                {isCancelled ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(booking.id)}
                      disabled={deleteMutation.isPending}
                      className="h-7 px-2 text-xs gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      title="Ta bort från planning"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Ta bort</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => restoreMutation.mutate(booking.id)}
                      disabled={restoreMutation.isPending}
                      className="h-7 px-2 text-xs gap-1 hover:bg-primary/10 hover:text-primary"
                      title="Återställ till bekräftad"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>Ångra</span>
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => setPlacementBookingId(booking.id)}
                    className="h-7 px-3 text-xs gap-1"
                    title="Placera bokningen i kalendern"
                  >
                    <CalendarPlus className="w-3.5 h-3.5" />
                    <span>Placera</span>
                  </Button>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground/20 ml-1" />
              </div>
            </div>
          );
        })}
      </div>

      <BookingPlacementDialog
        open={!!placementBookingId}
        onOpenChange={(o) => { if (!o) setPlacementBookingId(null); }}
        bookingId={placementBookingId}
      />
    </div>
  );
};