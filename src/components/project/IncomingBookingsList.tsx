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
import ProjectUpdateDialog from './ProjectUpdateDialog';
import { useUnplannedProjects } from '@/hooks/useUnplannedProjects';
import { useUnseenBookingUpdates, useMarkBookingChangesSeen, useMarkAllBookingChangesSeen } from '@/hooks/useUnseenBookingUpdates';
import { useCancellationCandidates, useScanCancellationCandidates, useApplyCancellation } from '@/hooks/useCancellationCandidates';
import { useBookingStatusChanges, useRefreshSingleBooking, bookingStatusLabel } from '@/hooks/useBookingStatusChanges';
import { CheckCheck } from 'lucide-react';




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
  const [updateDialog, setUpdateDialog] = useState<{ name: string; bookingIds: string[]; navigateTo: string } | null>(null);
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


  // Avbokade i bokningssystemet men fortfarande aktiva lokalt.
  // Scan = ren läsning mot Booking; ingen automatisk destruktiv sync.
  const cancellationCandidatesQuery = useCancellationCandidates();
  const { data: cancellationCandidates = [] } = cancellationCandidatesQuery;
  const applyCancellation = useApplyCancellation();
  const scanIds = React.useMemo(() => {
    const ids = new Set<string>();
    bookings.forEach((b) => ids.add(b.id));
    unplannedProjects.forEach((p) => { if (p.bookingId) ids.add(p.bookingId); });
    return Array.from(ids);
  }, [bookings, unplannedProjects]);
  const cancellationScan = useScanCancellationCandidates(scanIds);
  const cancelledIds = React.useMemo(
    () => new Set(cancellationCandidates.map((c) => c.booking_id)),
    [cancellationCandidates],
  );






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

  // Avbokade bokningar får ALDRIG ligga kvar bland "Nya · ska placeras".
  const newBookings = bookings.filter((b) => !cancelledIds.has(b.id));
  const newUnplanned = unplannedProjects.filter((p) => !p.bookingId || !cancelledIds.has(p.bookingId));

  const totalNew = newBookings.length + newUnplanned.length;
  const totalCancelled = cancellationCandidates.length;
  const cancellationCheckPending = scanIds.length > 0 && (
    cancellationScan.isPending || cancellationScan.isFetching || cancellationCandidatesQuery.isFetching
  );
  const cancellationCheckFailed = cancellationScan.isError;
  const hasIncomingItems = totalNew + totalCancelled > 0;


  if ((isLoading && isLoadingUnplannedProjects) || !hasIncomingItems) {
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

  const headerLabel = totalNew > 0 ? 'Nya bokningar' : 'Avbokade bokningar';
  const showSectionHeaders = totalCancelled > 0 && totalNew > 0;



  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
      {/* Panel-header */}
      <div className="flex items-center justify-between px-4 h-10 border-b border-border/60">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-medium text-sm text-foreground">{headerLabel}</h3>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {totalCancelled > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
              <span className="tabular-nums font-medium text-foreground">{totalCancelled}</span>
              <span>ska bort</span>
            </span>
          )}
          {showSectionHeaders && <span className="h-3 w-px bg-border" />}

          {totalNew > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span className="tabular-nums font-medium text-foreground">{totalNew}</span>
              <span>nya</span>
            </span>
          )}
        </div>

      </div>

      {/* === SEKTION 0: AVBOKADE I BOKNINGSSYSTEMET === */}
      {(cancellationCheckPending || cancellationCheckFailed) && totalNew > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 border-y border-border bg-muted text-xs text-muted-foreground">
          <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${cancellationCheckPending ? 'animate-spin' : ''}`} />
          {cancellationCheckPending
            ? 'Kontrollerar bokningsstatus innan placering…'
            : 'Bokningsstatus kunde inte verifieras. Placering är spärrad tills kontrollen lyckas.'}
        </div>
      )}
      {totalCancelled > 0 && (
        <section>
          <div className="flex items-center gap-2 px-4 h-8 border-y border-border/60 bg-destructive/[0.06]">
            <span className="h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
            <span className="text-xs font-medium text-destructive truncate">
              Avbokade i bokningssystemet · kräver bekräftelse
            </span>
          </div>
          <div className="divide-y divide-border/40">
            {cancellationCandidates.map((c) => (
              <div
                key={`cancel-${c.booking_id}`}
                className="group relative flex items-center gap-3 pl-5 pr-3 py-2 hover:bg-destructive/[0.03] transition-colors"
              >
                <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-destructive" aria-hidden />
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => navigate(`/booking/${c.booking_id}`)}
                >
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium truncate text-destructive/90 line-through">
                      {c.client || 'Bokning'}
                    </h4>
                    <span className="inline-flex items-center gap-1 h-4 px-1.5 rounded-md bg-destructive/10 text-destructive text-[10px] font-medium shrink-0">
                      <XCircle className="w-2.5 h-2.5" />
                      Avbokad i booking
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    Bokningen är avbokad i bokningssystemet. Bekräfta för att avboka den här också.
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 shrink-0 pl-3 border-l border-destructive/10">
                  {c.booking_number && (
                    <span className="text-xs font-mono text-muted-foreground/60 order-2 sm:order-1">
                      #{c.booking_number}
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={applyCancellation.isPending}
                    onClick={() =>
                      applyCancellation.mutate(c.booking_id, {
                        onSuccess: () => toast.success('Bokningen är avbokad i planeringen'),
                        onError: (e: any) => toast.error(e?.message || 'Kunde inte avboka bokningen'),
                      })
                    }
                    className="h-7 px-2.5 text-xs gap-1.5 rounded-md border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive order-1 sm:order-2"
                    title="Bekräfta avbokningen och städa upp lokalt"
                  >
                    <XCircle className="w-3 h-3" />
                    Bekräfta avbokning
                  </Button>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 order-3" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* SEKTION 1 (granskning av uppdateringar) borttagen medvetet:
          endast nya bokningar och bokningar som ska bort visas. */}


      {/* === SEKTION 2: NYA === */}
      {totalNew > 0 && !cancellationCheckPending && !cancellationCheckFailed && (
        <section>
          {showSectionHeaders && (
            <div className="flex items-center gap-2 px-4 h-8 border-y border-border/60 bg-emerald-500/[0.06]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-xs font-medium text-emerald-700">
                Nya bokningar · ska placeras
              </span>
            </div>
          )}
          <div className="divide-y divide-border/40">
            {newUnplanned.map((project) => (
              <div
                key={`${project.kind}-${project.id}`}
                className="group relative flex items-center gap-3 pl-5 pr-3 py-2 hover:bg-emerald-500/[0.03] transition-colors"
              >
                <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-emerald-500" aria-hidden />

                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => project.bookingId && setPlacementBookingId(project.bookingId)}
                >
                  <h4 className="text-sm font-medium truncate text-foreground group-hover:text-primary transition-colors">
                    {project.client || project.name}
                  </h4>
                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(project.eventdate || '')}
                    </span>
                    {project.deliveryaddress && (
                      <span className="flex items-center gap-1 truncate max-w-[200px]">
                        <MapPin className="w-3 h-3 shrink-0" />
                        {project.deliveryaddress}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 shrink-0 pl-3 border-l border-border/40">
                  {project.booking_number && (
                    <span className="text-xs font-mono text-muted-foreground/60 order-2 sm:order-1">
                      #{project.booking_number}
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => project.bookingId && setPlacementBookingId(project.bookingId)}
                    className="h-7 px-2.5 text-xs gap-1 rounded-md border-emerald-400/70 text-emerald-800 bg-emerald-500/[0.04] hover:bg-emerald-500/10 hover:text-emerald-900 whitespace-nowrap transition-colors order-1 sm:order-2"
                    title="Placera bokningen"
                    disabled={!project.bookingId}
                  >
                    <CalendarPlus className="w-3 h-3" />
                    <span>Placera</span>
                  </Button>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 order-3" />
                </div>
              </div>
            ))}


            {newBookings.map(booking => {
              const isCancelled = booking.status === 'CANCELLED';
              return (
                <div
                  key={booking.id}
                  className={`group relative flex items-center gap-3 pl-5 pr-3 py-2 transition-colors ${isCancelled ? 'hover:bg-muted/30' : 'hover:bg-emerald-500/[0.03]'}`}
                >
                  <span
                    className={`absolute left-0 top-0 bottom-0 w-0.5 ${isCancelled ? 'bg-destructive' : 'bg-emerald-500'}`}
                    aria-hidden
                  />
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => navigate(`/booking/${booking.id}`)}
                  >
                    <div className="flex items-center gap-2">
                      <h4 className={`text-sm font-medium truncate group-hover:text-primary transition-colors ${isCancelled ? 'text-destructive/90 line-through' : 'text-foreground'}`}>
                        {booking.client}
                      </h4>
                      {isCancelled && (
                        <span className="inline-flex items-center gap-1 h-4 px-1.5 rounded-md bg-destructive/10 text-destructive text-[10px] font-medium shrink-0">
                          <XCircle className="w-2.5 h-2.5" />
                          Avbokad
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(booking.eventdate || '')}
                      </span>
                      {booking.deliveryaddress && (
                        <span className="flex items-center gap-1 truncate max-w-[200px]">
                          <MapPin className="w-3 h-3 shrink-0" />
                          {booking.deliveryaddress}
                        </span>
                      )}
                    </div>
                  </div>


                  <div className={`flex flex-wrap items-center justify-end gap-x-3 gap-y-1 shrink-0 pl-3 border-l ${isCancelled ? 'border-destructive/10' : 'border-border/40'}`}>
                    {booking.booking_number && (
                      <span className="text-xs font-mono text-muted-foreground/60 order-2 sm:order-1">
                        #{booking.booking_number}
                      </span>
                    )}
                    {isCancelled ? (
                      <div className="flex items-center gap-2 order-1 sm:order-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteMutation.mutate(booking.id)}
                          disabled={deleteMutation.isPending}
                          className="h-6 px-2 text-[11px] gap-1 rounded-md text-destructive hover:bg-destructive/10 hover:text-destructive"
                          title="Ta bort från planning"
                        >
                          <Trash2 className="w-3 h-3" />
                          Ta bort
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => restoreMutation.mutate(booking.id)}
                          disabled={restoreMutation.isPending}
                          className="h-6 px-2 text-[11px] gap-1 rounded-md"
                          title="Återställ till bekräftad"
                        >
                          <Undo2 className="w-3 h-3" />
                          Ångra
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPlacementBookingId(booking.id)}
                        className="h-7 px-2.5 text-xs gap-1 rounded-md border-emerald-400/70 text-emerald-800 bg-emerald-500/[0.04] hover:bg-emerald-500/10 hover:text-emerald-900 whitespace-nowrap transition-colors order-1 sm:order-2"
                        title="Placera bokningen i kalendern"
                      >
                        <CalendarPlus className="w-3 h-3" />
                        Placera
                      </Button>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 order-3" />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}



      <BookingPlacementDialog
        open={!!placementBookingId}
        onOpenChange={(o) => { if (!o) setPlacementBookingId(null); }}
        bookingId={placementBookingId}
      />



    </div>
  );
};
