import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Inbox, Calendar, MapPin, Package, ChevronRight, Loader2, Layers } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { syncBookingToPacking } from '@/services/booking/bookingPackingSyncService';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';

interface IncomingBooking {
  id: string;
  client: string;
  booking_number: string | null;
  eventdate: string | null;
  deliveryaddress: string | null;
  organization_id: string;
  large_project_id: string | null;
}

interface LargeProjectGroup {
  type: 'large_project';
  large_project_id: string;
  project_name: string;
  bookings: IncomingBooking[];
}

interface SingleBookingRow {
  type: 'single';
  booking: IncomingBooking;
}

type IncomingRow = LargeProjectGroup | SingleBookingRow;

export const IncomingPackingList: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['bookings-without-packing'],
    queryFn: async () => {
      // Fetch booking IDs from active projects
      const [{ data: jobBookingIds }, { data: projectBookingIds }, { data: largeLinks }, { data: ppBookings }] = await Promise.all([
        supabase.from('jobs').select('booking_id').not('status', 'in', '("completed","cancelled")').not('booking_id', 'is', null),
        supabase.from('projects').select('booking_id').not('status', 'in', '("completed","cancelled")').not('booking_id', 'is', null),
        supabase.from('large_project_bookings').select('booking_id, large_project_id'),
        supabase.from('packing_project_bookings').select('booking_id'),
      ]);

      const jobIds = new Set((jobBookingIds || []).map(j => j.booking_id).filter(Boolean));
      const projectIds = new Set((projectBookingIds || []).map(p => p.booking_id).filter(Boolean));
      
      // Bookings already linked via packing_project_bookings (multi-booking packings)
      const alreadyLinkedIds = new Set((ppBookings || []).map(p => p.booking_id).filter(Boolean));

      // Map booking_id -> large_project_id
      const largeProjectMap = new Map<string, string>();
      (largeLinks || []).forEach(l => {
        if (l.booking_id && l.large_project_id) {
          largeProjectMap.set(l.booking_id, l.large_project_id);
        }
      });

      const allIds = new Set([...jobIds, ...projectIds, ...largeProjectMap.keys()]);
      if (allIds.size === 0) return [];

      const ids = Array.from(allIds);

      const { data: existingPackings } = await supabase
        .from('packing_projects')
        .select('booking_id')
        .in('booking_id', ids);

      const packedIds = new Set((existingPackings || []).map(p => p.booking_id).filter(Boolean));
      // Filter out bookings that already have a packing OR are linked via packing_project_bookings
      const missingIds = ids.filter(id => !packedIds.has(id) && !alreadyLinkedIds.has(id));
      if (missingIds.length === 0) return [];

      const { data: bookings, error } = await supabase
        .from('bookings')
        .select('id, client, booking_number, eventdate, deliveryaddress, organization_id, is_internal')
        .in('id', missingIds)
        .neq('status', 'CANCELLED')
        .neq('is_internal', true)
        .order('eventdate', { ascending: true });

      if (error || !bookings) return [];

      // Enrich with large_project_id
      const enriched: IncomingBooking[] = bookings.map(b => ({
        ...b,
        large_project_id: largeProjectMap.get(b.id) || null,
      }));

      // Fetch large project names for grouped display
      const uniqueLargeIds = [...new Set(enriched.map(b => b.large_project_id).filter(Boolean))] as string[];
      let projectNames = new Map<string, string>();
      if (uniqueLargeIds.length > 0) {
        const { data: projects } = await supabase
          .from('large_projects')
          .select('id, name')
          .in('id', uniqueLargeIds);
        (projects || []).forEach(p => projectNames.set(p.id, p.name));
      }

      // Group into rows
      const largeGroups = new Map<string, LargeProjectGroup>();
      const singles: SingleBookingRow[] = [];

      enriched.forEach(b => {
        if (b.large_project_id && projectNames.has(b.large_project_id)) {
          if (!largeGroups.has(b.large_project_id)) {
            largeGroups.set(b.large_project_id, {
              type: 'large_project',
              large_project_id: b.large_project_id,
              project_name: projectNames.get(b.large_project_id)!,
              bookings: [],
            });
          }
          largeGroups.get(b.large_project_id)!.bookings.push(b);
        } else {
          singles.push({ type: 'single', booking: b });
        }
      });

      // Large projects first, then singles
      return [...largeGroups.values(), ...singles] as IncomingRow[];
    },
    placeholderData: [],
  });

  const handleCreatePacking = async (booking: IncomingBooking) => {
    setCreatingId(booking.id);
    try {
      const dateStr = booking.eventdate
        ? format(new Date(booking.eventdate), 'd MMMM yyyy', { locale: sv })
        : '';
      const packingName = `${booking.client}${dateStr ? ` - ${dateStr}` : ''}`;

      const { data: newPacking, error: createError } = await supabase
        .from('packing_projects')
        .insert({
          name: packingName,
          booking_id: booking.id,
          client_name: booking.client,
          delivery_address: booking.deliveryaddress,
          status: 'planning',
          organization_id: booking.organization_id,
        })
        .select('id')
        .single();

      if (createError) throw createError;

      syncBookingToPacking(booking.id, booking.organization_id);

      await queryClient.invalidateQueries({ queryKey: ['bookings-without-packing'] });
      await queryClient.invalidateQueries({ queryKey: ['packings'] });

      toast.success(`Packning skapad för ${booking.client}`);

      if (newPacking) {
        navigate(`/warehouse/packing/${newPacking.id}`);
      }
    } catch (err) {
      console.error('Error creating packing:', err);
      toast.error('Kunde inte skapa packning');
    } finally {
      setCreatingId(null);
    }
  };

  const handleCreateCombinedPacking = async (group: LargeProjectGroup) => {
    setCreatingId(group.large_project_id);
    try {
      // Calculate date range from all bookings
      const { data: dateRange } = await supabase
        .from('bookings')
        .select('rigdaydate, rigdowndate')
        .in('id', group.bookings.map(b => b.id));

      const rigDates = (dateRange || []).map(d => d.rigdaydate).filter(Boolean) as string[];
      const rigdownDates = (dateRange || []).map(d => d.rigdowndate).filter(Boolean) as string[];
      const startDate = rigDates.length > 0 ? rigDates.sort()[0] : null;
      const endDate = rigdownDates.length > 0 ? rigdownDates.sort().reverse()[0] : null;

      // Create ONE packing project for the entire large project
      const { data: newPacking, error: createError } = await supabase
        .from('packing_projects')
        .insert({
          name: group.project_name,
          booking_id: group.bookings[0]?.id || null,
          large_project_id: group.large_project_id,
          client_name: group.bookings[0]?.client || null,
          delivery_address: group.bookings[0]?.deliveryaddress || null,
          status: 'planning',
          organization_id: group.bookings[0]?.organization_id,
          start_date: startDate,
          end_date: endDate,
        })
        .select('id')
        .single();

      if (createError) throw createError;

      // Link all bookings via packing_project_bookings
      const bookingLinks = group.bookings.map(b => ({
        packing_id: newPacking.id,
        booking_id: b.id,
        organization_id: b.organization_id,
      }));

      const { error: linkError } = await supabase
        .from('packing_project_bookings')
        .insert(bookingLinks);

      if (linkError) throw linkError;

      // Sync products from all bookings into this packing
      for (const booking of group.bookings) {
        syncBookingToPacking(booking.id, booking.organization_id);
      }

      await queryClient.invalidateQueries({ queryKey: ['bookings-without-packing'] });
      await queryClient.invalidateQueries({ queryKey: ['packings'] });

      toast.success(`Samlad packning skapad för ${group.project_name}`);
      navigate(`/warehouse/packing/${newPacking.id}`);
    } catch (err) {
      console.error('Error creating combined packing:', err);
      toast.error('Kunde inte skapa packning');
    } finally {
      setCreatingId(null);
    }
  };

  if (isLoading || rows.length === 0) return null;

  const totalCount = rows.reduce((sum, r) => sum + (r.type === 'large_project' ? 1 : 1), 0);

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
      <div className="px-4 py-2.5 border-b border-border/40 bg-amber-50/30 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-amber-500/10">
            <Inbox className="h-4 w-4 text-amber-600" />
          </div>
          <h3 className="font-semibold text-sm text-foreground">Projekt utan packning</h3>
        </div>
        <Badge className="h-5 px-2 text-xs font-medium bg-amber-100 text-amber-800 border-0">
          {totalCount} nya
        </Badge>
      </div>

      <div className="divide-y divide-border/30">
        {rows.map(row => {
          if (row.type === 'large_project') {
            const isCreating = creatingId === row.large_project_id;
            return (
              <div
                key={`lp-${row.large_project_id}`}
                className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
                    <h4 className="text-sm font-medium truncate text-foreground">
                      {row.project_name}
                    </h4>
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0">
                      Stort projekt
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 ml-5.5">
                    {row.bookings.length} bokningar utan packlista
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCreateCombinedPacking(row)}
                    disabled={isCreating}
                    className="h-7 px-2 text-xs gap-1 hover:bg-primary/10 hover:text-primary"
                  >
                    {isCreating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Package className="w-3.5 h-3.5" />
                    )}
                    <span>Skapa packning</span>
                  </Button>
                </div>
              </div>
            );
          }

          const booking = row.booking;
          return (
            <div
              key={booking.id}
              className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors"
            >
              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => navigate(`/booking/${booking.id}`)}
              >
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium truncate group-hover:text-primary transition-colors text-foreground">
                    {booking.client}
                  </h4>
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCreatePacking(booking)}
                  disabled={creatingId === booking.id}
                  className="h-7 px-2 text-xs gap-1 hover:bg-primary/10 hover:text-primary"
                >
                  {creatingId === booking.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Package className="w-3.5 h-3.5" />
                  )}
                  <span>Skapa packning</span>
                </Button>
                <ChevronRight className="h-4 w-4 text-muted-foreground/20 ml-1" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
