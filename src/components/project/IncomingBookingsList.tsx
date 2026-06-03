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
import { getBookingUpdatesBaseline } from '@/lib/bookingUpdatesBaseline';



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

  // Per-användare baseline: vi börjar räkna från och med första gången koden
  // körs i denna browser. Allt som ändrades innan dess är osynligt för all
  // framtid — ingen UI-knapp, ingen "markera alla", bara en ren cutoff.
  // Klick på "Granska" hanteras separat (last_seen_at per booking).
  const baselineMs = getBookingUpdatesBaseline();
  const visibleUpdates = unseenUpdates.filter((u) => {
    if (!u.last_change_at) return false;
    const t = new Date(u.last_change_at).getTime();
    if (isNaN(t)) return false;
    return t > baselineMs;
  });


  const totalNew = bookings.length + unplannedProjects.length;
  const totalUpdates = visibleUpdates.length;
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

  // Visuell prioritet: uppdaterade vs nya MÅSTE särskiljas tydligt — annars
  // riskerar man att klicka "Placera" på en uppdatering eller "Granska" på en
  // helt ny bokning. Vi separerar i två sektioner med olika färg + kant + CTA.
  const hasBoth = totalUpdates > 0 && totalNew > 0;
  const headerLabel = hasBoth
    ? 'Inkommande bokningar'
    : totalUpdates > 0
      ? 'Uppdaterade bokningar'
      : 'Nya bokningar';
  const showSectionHeaders = hasBoth;

  // Konsekvent design: alla rad-CTA är `size="sm"` (h-8 px-3) outline/default.
  // Färg används sparsamt — endast som 2px vänsteraccent + dot-badge.
  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
      {/* Panel-header */}
      <div className="flex items-center justify-between px-4 h-11 border-b border-border/60">
        <div className="flex items-center gap-2.5">
          <Inbox className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm text-foreground tracking-tight">{headerLabel}</h3>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {totalUpdates > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-foreground/60" />
              <span className="tabular-nums font-medium text-foreground">{totalUpdates}</span>
              <span>uppdaterade</span>
            </span>
          )}
          {hasBoth && <span className="h-3 w-px bg-border" />}
          {totalNew > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span className="tabular-nums font-medium text-foreground">{totalNew}</span>
              <span>nya</span>
            </span>
          )}
        </div>

      </div>

      {/* === SEKTION 1: UPPDATERADE === */}
      {totalUpdates > 0 && (
        <section>
          {showSectionHeaders && (
            <div className="flex items-center gap-2.5 px-4 h-10 bg-yellow-100 border-y border-yellow-300">
              <span className="h-2 w-2 rounded-full bg-yellow-500" />
              <span className="text-xs font-bold uppercase tracking-[0.1em] text-yellow-900">
                Uppdaterade · kräver granskning
              </span>
            </div>
          )}
          <div className="divide-y divide-border/40">
            {visibleUpdates.map((update) => {
              const meta = updatedBookingsMeta.find((b) => b.id === update.booking_id);
              if (!meta) return null;
              return (
                <div
                  key={`update-${update.booking_id}`}
                  className="group relative flex items-center gap-3 pl-6 pr-3 py-3 bg-yellow-50 hover:bg-yellow-100/70 transition-colors"
                >
                  <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-amber-500" aria-hidden />

                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => handleReviewUpdate(meta)}
                  >
                    <h4 className="text-sm font-semibold truncate text-foreground group-hover:text-primary transition-colors">
                      {meta.client}
                    </h4>
                    <div className="flex items-center gap-3 mt-1 text-[11.5px] text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3 h-3" />
                        {formatDate(meta.eventdate || '')}
                      </span>
                      {meta.deliveryaddress && (
                        <span className="flex items-center gap-1.5 truncate max-w-[220px]">
                          <MapPin className="w-3 h-3 shrink-0" />
                          {meta.deliveryaddress}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 shrink-0 pl-4 border-l border-amber-200/70">
                    {meta.booking_number && (
                      <span className="text-sm font-mono text-slate-400 order-2 sm:order-1">
                        #{meta.booking_number}
                      </span>
                    )}
                    <div className="flex flex-col items-end gap-0.5 order-1 sm:order-2">
                      <Button
                        size="sm"
                        onClick={() => handleReviewUpdate(meta)}
                        className="h-10 px-5 text-sm gap-2 font-semibold rounded-xl shadow-sm bg-amber-500 hover:bg-amber-600 text-white whitespace-nowrap transition-colors"
                        title="Granska ändringar och bekräfta mottagen"
                        disabled={markSeen.isPending}
                      >
                        <Eye className="w-4 h-4" />
                        <span>Granska</span>
                      </Button>
                      {update.change_count > 0 && (
                        <span className="text-xs text-amber-700/80 font-medium">
                          {update.change_count} {update.change_count === 1 ? 'ändring väntar' : 'ändringar väntar'}
                        </span>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 order-3" />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* === SEKTION 2: NYA === */}
      {totalNew > 0 && (
        <section>
          {showSectionHeaders && (
            <div className="flex items-center gap-2.5 px-4 h-10 bg-green-100 border-y border-green-300">
              <span className="h-2 w-2 rounded-full bg-green-600" />
              <span className="text-xs font-bold uppercase tracking-[0.1em] text-green-900">
                Nya bokningar · ska placeras
              </span>
            </div>
          )}
          <div className="divide-y divide-border/40">
            {unplannedProjects.map((project) => (
              <div
                key={`${project.kind}-${project.id}`}
                className="group relative flex items-center gap-3 pl-4 pr-3 py-3 bg-green-50 hover:bg-green-100/70 transition-colors"
              >
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => project.bookingId && setPlacementBookingId(project.bookingId)}
                >
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    <h4 className="text-sm font-medium truncate text-foreground group-hover:text-primary transition-colors">
                      {project.client || project.name}
                    </h4>
                    {project.booking_number && (
                      <span className="ml-auto text-[10.5px] text-muted-foreground/60 font-mono shrink-0">
                        #{project.booking_number}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 pl-3.5 text-[11.5px] text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" />
                      {formatDate(project.eventdate || '')}
                    </span>
                    {project.deliveryaddress && (
                      <span className="flex items-center gap-1.5 truncate max-w-[220px]">
                        <MapPin className="w-3 h-3 shrink-0" />
                        {project.deliveryaddress}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    onClick={() => project.bookingId && setPlacementBookingId(project.bookingId)}
                    className="h-8 px-3 text-xs gap-1.5 font-medium text-neutral-800 border border-emerald-300 hover:brightness-95" style={{ backgroundColor: '#E2FBE9' }}
                    title="Placera bokningen"
                    disabled={!project.bookingId}
                  >
                    <CalendarPlus className="w-3.5 h-3.5" />
                    <span>Placera</span>
                  </Button>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                </div>
              </div>
            ))}


            {bookings.map(booking => {
              const isCancelled = booking.status === 'CANCELLED';
              return (
                <div
                  key={booking.id}
                  className={`group relative flex items-center gap-3 pl-4 pr-3 py-3 transition-colors ${isCancelled ? 'hover:bg-muted/30' : 'bg-green-50 hover:bg-green-100/70'}`}
                >
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => navigate(`/booking/${booking.id}`)}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${isCancelled ? 'bg-destructive' : 'bg-primary'}`} />
                      <h4 className={`text-sm font-medium truncate group-hover:text-primary transition-colors ${isCancelled ? 'text-destructive line-through' : 'text-foreground'}`}>
                        {booking.client}
                      </h4>
                      {isCancelled && (
                        <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-md bg-destructive/10 text-destructive text-[10.5px] font-medium shrink-0">
                          <XCircle className="w-2.5 h-2.5" />
                          Avbokad
                        </span>
                      )}
                      {booking.booking_number && (
                        <span className="ml-auto text-[10.5px] text-muted-foreground/60 font-mono shrink-0">
                          #{booking.booking_number}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 pl-3.5 text-[11.5px] text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3 h-3" />
                        {formatDate(booking.eventdate || '')}
                      </span>
                      {booking.deliveryaddress && (
                        <span className="flex items-center gap-1.5 truncate max-w-[220px]">
                          <MapPin className="w-3 h-3 shrink-0" />
                          {booking.deliveryaddress}
                        </span>
                      )}
                    </div>
                  </div>


                  <div className="flex items-center gap-2 shrink-0">
                    {isCancelled ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteMutation.mutate(booking.id)}
                          disabled={deleteMutation.isPending}
                          className="h-8 px-3 text-xs gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          title="Ta bort från planning"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Ta bort
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => restoreMutation.mutate(booking.id)}
                          disabled={restoreMutation.isPending}
                          className="h-8 px-3 text-xs gap-1.5"
                          title="Återställ till bekräftad"
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                          Ångra
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => setPlacementBookingId(booking.id)}
                        className="h-8 px-3 text-xs gap-1.5 font-medium text-neutral-800 border border-emerald-300 hover:brightness-95" style={{ backgroundColor: '#E2FBE9' }}
                        title="Placera bokningen i kalendern"
                      >
                        <CalendarPlus className="w-3.5 h-3.5" />
                        Placera
                      </Button>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
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