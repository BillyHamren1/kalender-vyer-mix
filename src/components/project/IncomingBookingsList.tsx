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
  const { data: unseenUpdates = [], isLoading: isLoadingUpdates } = useUnseenBookingUpdates();
  const markSeen = useMarkBookingChangesSeen();
  const markAllSeen = useMarkAllBookingChangesSeen();

  // Avbokade i bokningssystemet men fortfarande aktiva lokalt.
  // Scan = ren läsning mot Booking; ingen automatisk destruktiv sync.
  const { data: cancellationCandidates = [] } = useCancellationCandidates();
  const applyCancellation = useApplyCancellation();
  const scanIds = React.useMemo(() => {
    const ids = new Set<string>();
    bookings.forEach((b) => ids.add(b.id));
    unplannedProjects.forEach((p) => { if (p.bookingId) ids.add(p.bookingId); });
    return Array.from(ids);
  }, [bookings, unplannedProjects]);
  useScanCancellationCandidates(scanIds);
  const cancelledIds = React.useMemo(
    () => new Set(cancellationCandidates.map((c) => c.booking_id)),
    [cancellationCandidates],
  );


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

  // Tidigare hade vi en lokal "first-visit baseline" här som dolde alla
  // ändringar äldre än första gången användaren öppnade sidan. Det gjorde
  // att stora projekt (med mest historik) tappade bort osedda uppdateringar
  // helt. Vi litar nu enbart på `booking_change_views.last_seen_at` som
  // `get_unseen_booking_updates()` redan filtrerar på server-side.
  const visibleUpdates = unseenUpdates;

  // Avbokade bokningar får ALDRIG ligga kvar bland "Nya · ska placeras".
  const newBookings = bookings.filter((b) => !cancelledIds.has(b.id));
  const newUnplanned = unplannedProjects.filter((p) => !p.bookingId || !cancelledIds.has(p.bookingId));

  const totalNew = newBookings.length + newUnplanned.length;
  const totalUpdates = visibleUpdates.length;
  const totalCancelled = cancellationCandidates.length;
  const hasIncomingItems = totalNew + totalUpdates + totalCancelled > 0;


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
    // Bygg navigateTo + samla alla syskon-bokningar med osedda ändringar
    // som tillhör samma target, så att dialogen visar ALLA diffar.
    const unseenIds = new Set(visibleUpdates.map((u) => u.booking_id));
    let navigateTo: string;
    let bookingIds: string[];
    let name: string;
    if (booking.large_project_id) {
      navigateTo = `/large-project/${booking.large_project_id}`;
      bookingIds = updatedBookingsMeta
        .filter((b) => b.large_project_id === booking.large_project_id && unseenIds.has(b.id))
        .map((b) => b.id);
      name = booking.client || 'Stort projekt';
    } else if (booking.assigned_project_id) {
      navigateTo = `/project/${booking.assigned_project_id}`;
      bookingIds = updatedBookingsMeta
        .filter((b) => b.assigned_project_id === booking.assigned_project_id && unseenIds.has(b.id))
        .map((b) => b.id);
      name = booking.client || 'Projekt';
    } else {
      navigateTo = `/booking/${booking.id}`;
      bookingIds = [booking.id];
      name = booking.client || 'Bokning';
    }
    if (bookingIds.length === 0) bookingIds = [booking.id];
    setUpdateDialog({ name, bookingIds, navigateTo });
  };

  // Visuell prioritet: uppdaterade vs nya MÅSTE särskiljas tydligt — annars
  // riskerar man att klicka "Placera" på en uppdatering eller "Granska" på en
  // helt ny bokning. Vi separerar i två sektioner med olika färg + kant + CTA.
  const hasBoth = totalUpdates > 0 && totalNew > 0;
  const headerLabel = hasBoth
    ? 'Inkommande bokningar'
    : totalUpdates > 0
      ? 'Uppdaterade bokningar'
      : totalNew > 0
        ? 'Nya bokningar'
        : 'Avbokade bokningar';
  const showSectionHeaders = hasBoth || totalCancelled > 0;


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

      {/* === SEKTION 0: AVBOKADE I BOKNINGSSYSTEMET === */}
      {totalCancelled > 0 && (
        <section>
          <div className="flex items-center gap-2.5 px-4 h-11 bg-red-100 border-y border-red-300">
            <span className="h-2 w-2 rounded-full bg-red-600 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-red-900 truncate">
              Avbokade i bokningssystemet · kräver bekräftelse
            </span>
          </div>
          <div className="divide-y divide-border/40">
            {cancellationCandidates.map((c) => (
              <div
                key={`cancel-${c.booking_id}`}
                className="group relative flex items-center gap-3 pl-6 pr-3 py-3 bg-red-50 hover:bg-red-100/70 transition-colors"
              >
                <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-destructive" aria-hidden />
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => navigate(`/booking/${c.booking_id}`)}
                >
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold truncate text-destructive line-through">
                      {c.client || 'Bokning'}
                    </h4>
                    <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-md bg-destructive/10 text-destructive text-[10.5px] font-medium shrink-0">
                      <XCircle className="w-2.5 h-2.5" />
                      Avbokad i booking
                    </span>
                  </div>
                  <div className="mt-1 text-[11.5px] text-muted-foreground">
                    Bokningen är avbokad i bokningssystemet. Bekräfta för att avboka den här också.
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 shrink-0 pl-4 border-l border-destructive/20">
                  {c.booking_number && (
                    <span className="text-sm font-mono text-slate-400 order-2 sm:order-1">
                      #{c.booking_number}
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={applyCancellation.isPending}
                    onClick={() =>
                      applyCancellation.mutate(c.booking_id, {
                        onSuccess: () => toast.success('Bokningen är avbokad i planeringen'),
                        onError: (e: any) => toast.error(e?.message || 'Kunde inte avboka bokningen'),
                      })
                    }
                    className="h-10 px-5 text-sm gap-2 font-semibold rounded-xl shadow-sm whitespace-nowrap order-1 sm:order-2"
                    title="Bekräfta avbokningen och städa upp lokalt"
                  >
                    <XCircle className="w-4 h-4" />
                    Bekräfta avbokning
                  </Button>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 order-3" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* === SEKTION 1: UPPDATERADE === */}
      {totalUpdates > 0 && (

        <section>
          <div className="flex items-center justify-between gap-2.5 px-4 h-11 bg-yellow-100 border-y border-yellow-300">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="h-2 w-2 rounded-full bg-yellow-500 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-[0.1em] text-yellow-900 truncate">
                {showSectionHeaders ? 'Uppdaterade · kräver granskning' : `${totalUpdates} kräver granskning`}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const ids = visibleUpdates.map((u) => u.booking_id);
                markAllSeen.mutate(ids, {
                  onSuccess: (n) => toast.success(`${n} bokningar markerade som granskade`),
                  onError: () => toast.error('Kunde inte markera alla som granskade'),
                });
              }}
              disabled={markAllSeen.isPending || visibleUpdates.length === 0}
              className="h-8 px-3 text-xs gap-1.5 border-amber-400 text-amber-900 hover:bg-amber-200/70 bg-white/60"
              title="Markera alla uppdaterade bokningar som granskade"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Markera alla som granskade</span>
            </Button>
          </div>

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
            {newUnplanned.map((project) => (
              <div
                key={`${project.kind}-${project.id}`}
                className="group relative flex items-center gap-3 pl-6 pr-3 py-3 bg-green-50 hover:bg-green-100/70 transition-colors"
              >
                <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-emerald-500" aria-hidden />

                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => project.bookingId && setPlacementBookingId(project.bookingId)}
                >
                  <h4 className="text-sm font-semibold truncate text-foreground group-hover:text-primary transition-colors">
                    {project.client || project.name}
                  </h4>
                  <div className="flex items-center gap-3 mt-1 text-[11.5px] text-muted-foreground">
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

                <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 shrink-0 pl-4 border-l border-emerald-200/70">
                  {project.booking_number && (
                    <span className="text-sm font-mono text-slate-400 order-2 sm:order-1">
                      #{project.booking_number}
                    </span>
                  )}
                  <Button
                    size="sm"
                    onClick={() => project.bookingId && setPlacementBookingId(project.bookingId)}
                    className="h-10 px-5 text-sm gap-2 font-semibold rounded-xl shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white whitespace-nowrap transition-colors order-1 sm:order-2"
                    title="Placera bokningen"
                    disabled={!project.bookingId}
                  >
                    <CalendarPlus className="w-4 h-4" />
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
                  className={`group relative flex items-center gap-3 pl-6 pr-3 py-3 transition-colors ${isCancelled ? 'hover:bg-muted/30' : 'bg-green-50 hover:bg-green-100/70'}`}
                >
                  <span
                    className={`absolute left-0 top-0 bottom-0 w-1.5 ${isCancelled ? 'bg-destructive' : 'bg-emerald-500'}`}
                    aria-hidden
                  />
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => navigate(`/booking/${booking.id}`)}
                  >
                    <div className="flex items-center gap-2">
                      <h4 className={`text-sm font-semibold truncate group-hover:text-primary transition-colors ${isCancelled ? 'text-destructive line-through' : 'text-foreground'}`}>
                        {booking.client}
                      </h4>
                      {isCancelled && (
                        <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-md bg-destructive/10 text-destructive text-[10.5px] font-medium shrink-0">
                          <XCircle className="w-2.5 h-2.5" />
                          Avbokad
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11.5px] text-muted-foreground">
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


                  <div className={`flex flex-wrap items-center justify-end gap-x-4 gap-y-1 shrink-0 pl-4 border-l ${isCancelled ? 'border-destructive/20' : 'border-emerald-200/70'}`}>
                    {booking.booking_number && (
                      <span className="text-sm font-mono text-slate-400 order-2 sm:order-1">
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
                          className="h-9 px-3 text-xs gap-1.5 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
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
                          className="h-9 px-3 text-xs gap-1.5 rounded-lg"
                          title="Återställ till bekräftad"
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                          Ångra
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => setPlacementBookingId(booking.id)}
                        className="h-10 px-5 text-sm gap-2 font-semibold rounded-xl shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white whitespace-nowrap transition-colors order-1 sm:order-2"
                        title="Placera bokningen i kalendern"
                      >
                        <CalendarPlus className="w-4 h-4" />
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

      {updateDialog && (
        <ProjectUpdateDialog
          open={!!updateDialog}
          onOpenChange={(open) => !open && setUpdateDialog(null)}
          projectName={updateDialog.name}
          bookingIds={updateDialog.bookingIds}
          navigateTo={updateDialog.navigateTo}
        />
      )}
    </div>
  );
};