/**
 * NewBookingsPopup — visas överst i planeringskalendern första gången efter att
 * en ny bokning kommit in. Kryssa bort = ligger kvar i inkorgen på dashboarden.
 * Planera = öppnar den vanliga placeringsdialogen direkt i kalendervyn.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, CalendarPlus, Inbox, Loader2, MapPin, X } from 'lucide-react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useUnplannedProjects } from '@/hooks/useUnplannedProjects';
import { useTeamResources } from '@/hooks/useTeamResources';
import { placeBookingWithDefaults } from '@/services/bookingDefaultPlacement';
import { BookingPlacementDialog } from '@/components/project/BookingPlacementDialog';
import {
  filterDismissed,
  readDismissedIds,
  writeDismissedIds,
} from '@/lib/calendar/newBookingsDismissal';


interface PopupItem {
  dismissKey: string;
  bookingId: string | null;
  client: string;
  bookingNumber: string | null;
  eventdate: string | null;
  deliveryaddress: string | null;
}

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '-';
  try {
    return format(new Date(dateStr), 'd MMM yyyy', { locale: sv });
  } catch {
    return dateStr;
  }
};

const NewBookingsPopup: React.FC = () => {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState<string[]>(() => readDismissedIds());
  const [closed, setClosed] = useState(false);
  const [placementBookingId, setPlacementBookingId] = useState<string | null>(null);

  const { data: bookings = [] } = useQuery({
    queryKey: ['bookings-without-project'],
    queryFn: async () => {
      const { data: candidates, error } = await supabase
        .from('bookings')
        .select('id, client, status, booking_number, eventdate, deliveryaddress, large_project_id')
        .eq('status', 'CONFIRMED')
        .or('assigned_to_project.is.null,assigned_to_project.eq.false')
        .is('large_project_id', null)
        .order('created_at', { ascending: false });
      if (error || !candidates || candidates.length === 0) return [];

      const candidateIds = candidates.map((b) => b.id);
      const [{ data: activeJobs }, { data: activeProjects }, { data: largeLinks }] = await Promise.all([
        supabase.from('jobs').select('booking_id').in('booking_id', candidateIds).is('deleted_at', null).not('status', 'in', '("completed","cancelled")'),
        supabase.from('projects').select('booking_id').in('booking_id', candidateIds).not('status', 'in', '("completed","cancelled")'),
        supabase.from('large_project_bookings').select('booking_id').in('booking_id', candidateIds),
      ]);
      const assigned = new Set([
        ...(activeJobs || []).map((j: any) => j.booking_id),
        ...(activeProjects || []).map((p: any) => p.booking_id),
        ...(largeLinks || []).map((l: any) => l.booking_id),
      ]);
      return candidates.filter((b) => !assigned.has(b.id));
    },
    placeholderData: [],
  });

  const { data: unplanned = [] } = useUnplannedProjects();

  const items = useMemo<PopupItem[]>(() => {
    const fromBookings: PopupItem[] = (bookings as any[]).map((b) => ({
      dismissKey: b.id,
      bookingId: b.id,
      client: b.client || b.booking_number || 'Ny bokning',
      bookingNumber: b.booking_number ?? null,
      eventdate: b.eventdate ?? null,
      deliveryaddress: b.deliveryaddress ?? null,
    }));
    const fromProjects: PopupItem[] = unplanned.map((p) => ({
      dismissKey: p.bookingId || p.id,
      bookingId: p.bookingId,
      client: p.client || p.name,
      bookingNumber: p.booking_number ?? null,
      eventdate: p.eventdate ?? null,
      deliveryaddress: p.deliveryaddress ?? null,
    }));
    const seen = new Set<string>();
    return [...fromBookings, ...fromProjects].filter((i) => {
      if (seen.has(i.dismissKey)) return false;
      seen.add(i.dismissKey);
      return true;
    });
  }, [bookings, unplanned]);

  const visible = useMemo(() => filterDismissed(items, dismissed), [items, dismissed]);

  // Nya bokningar som kommer in senare ska trigga popupen igen.
  useEffect(() => {
    if (visible.length > 0) setClosed(false);
  }, [visible.length]);

  const dismiss = (key: string) => {
    const next = [...dismissed, key];
    setDismissed(next);
    writeDismissedIds(next);
  };

  const planAll = async () => {
    if (planningAll) return;
    setPlanningAll(true);
    let ok = 0;
    const failed: string[] = [];
    const done: string[] = [];
    for (const item of visible) {
      if (!item.bookingId) continue;
      try {
        await placeBookingWithDefaults(item.bookingId, teamOptions);
        ok += 1;
        done.push(item.dismissKey);
      } catch (e) {
        console.error('[NewBookingsPopup] planAll failed', item.bookingId, e);
        failed.push(item.bookingNumber ? `#${item.bookingNumber}` : item.client);
      }
    }
    if (done.length > 0) {
      const next = [...dismissed, ...done];
      setDismissed(next);
      writeDismissedIds(next);
    }
    setPlanningAll(false);
    queryClient.invalidateQueries({ queryKey: ['bookings-without-project'] });
    queryClient.invalidateQueries({ queryKey: ['unplanned-projects'] });
    queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
    queryClient.invalidateQueries({ queryKey: ['planner-calendar'] });
    if (ok > 0) toast.success(`${ok} bokning${ok === 1 ? '' : 'ar'} planerad${ok === 1 ? '' : 'e'} enligt standard`);
    if (failed.length > 0) toast.error(`Kunde inte planera: ${failed.join(', ')}`);
    if (failed.length === 0) setClosed(true);
  };

  const open = !closed && visible.length > 0 && !placementBookingId;


  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) setClosed(true); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-emerald-600" />
              {visible.length === 1 ? 'Ny bokning att planera' : `${visible.length} nya bokningar att planera`}
            </DialogTitle>
          </DialogHeader>

          <div className="divide-y divide-border/50 rounded-lg border border-emerald-500/40 bg-emerald-500/[0.04]">
            {visible.map((item) => (
              <div key={item.dismissKey} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{item.client}</span>
                    {item.bookingNumber && (
                      <span className="shrink-0 text-[11px] text-muted-foreground">#{item.bookingNumber}</span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(item.eventdate)}
                    </span>
                    {item.deliveryaddress && (
                      <span className="flex max-w-[180px] items-center gap-1 truncate">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {item.deliveryaddress}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 gap-1.5 border-emerald-500/50 text-emerald-700 hover:bg-emerald-500/10"
                  disabled={!item.bookingId}
                  onClick={() => item.bookingId && setPlacementBookingId(item.bookingId)}
                >
                  <CalendarPlus className="h-3.5 w-3.5" />
                  Planera
                </Button>
                <button
                  type="button"
                  aria-label="Kryssa bort"
                  className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={() => dismiss(item.dismissKey)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Bortkryssade bokningar ligger kvar i inkorgen på dashboarden.
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setClosed(true)} disabled={planningAll}>
              Senare
            </Button>
            <Button size="sm" onClick={planAll} disabled={planningAll || visible.length === 0}>
              {planningAll ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Planerar…
                </>
              ) : (
                <>
                  <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
                  Planera alla
                </>
              )}
            </Button>
          </div>

        </DialogContent>
      </Dialog>

      <BookingPlacementDialog
        open={!!placementBookingId}
        onOpenChange={(v) => {
          if (!v) {
            setPlacementBookingId(null);
            queryClient.invalidateQueries({ queryKey: ['bookings-without-project'] });
            queryClient.invalidateQueries({ queryKey: ['unplanned-projects'] });
          }
        }}
        bookingId={placementBookingId}
      />
    </>
  );
};

export default NewBookingsPopup;
