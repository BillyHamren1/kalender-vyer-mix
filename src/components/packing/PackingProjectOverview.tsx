import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Package, Scissors, RefreshCw, Calendar, User, Hash, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { syncBookingToPacking } from '@/services/booking/bookingPackingSyncService';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface BookingInfo {
  bookingId: string;
  client: string;
  bookingNumber: string | null;
  eventdate: string | null;
  rigdaydate: string | null;
  productCount: number;
  organizationId: string;
  deliveryaddress: string | null;
}

interface PackingProjectOverviewProps {
  packingId: string;
  largeProjectId: string;
  onSyncComplete: () => void;
  onNavigateToChecklist: () => void;
}

const PackingProjectOverview: React.FC<PackingProjectOverviewProps> = ({
  packingId,
  largeProjectId,
  onSyncComplete,
  onNavigateToChecklist,
}) => {
  const [bookings, setBookings] = useState<BookingInfo[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSplitting, setIsSplitting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showSplitDialog, setShowSplitDialog] = useState(false);
  const [hasPackingItems, setHasPackingItems] = useState(false);

  useEffect(() => {
    loadBookings();
  }, [packingId]);

  const loadBookings = async () => {
    setIsLoading(true);
    try {
      // Get linked bookings
      const { data: links, error: linksErr } = await supabase
        .from('packing_project_bookings')
        .select('booking_id')
        .eq('packing_id', packingId);

      if (linksErr) throw linksErr;
      const bookingIds = (links || []).map(l => l.booking_id);
      if (bookingIds.length === 0) { setIsLoading(false); return; }

      // Fetch booking details
      const { data: bookingsData } = await supabase
        .from('bookings')
        .select('id, client, booking_number, eventdate, rigdaydate, deliveryaddress, organization_id')
        .in('id', bookingIds);

      // Count products per booking
      const { data: productCounts } = await supabase
        .from('booking_products')
        .select('booking_id')
        .in('booking_id', bookingIds);

      const countMap: Record<string, number> = {};
      (productCounts || []).forEach(p => {
        countMap[p.booking_id] = (countMap[p.booking_id] || 0) + 1;
      });

      // Check if packing items already exist
      const { count } = await supabase
        .from('packing_list_items')
        .select('id', { count: 'exact', head: true })
        .eq('packing_id', packingId);

      setHasPackingItems((count || 0) > 0);

      const result: BookingInfo[] = (bookingsData || []).map(b => ({
        bookingId: b.id,
        client: b.client,
        bookingNumber: b.booking_number,
        eventdate: b.eventdate,
        rigdaydate: b.rigdaydate,
        productCount: countMap[b.id] || 0,
        organizationId: b.organization_id,
        deliveryaddress: b.deliveryaddress,
      }));

      result.sort((a, b) => {
        const dateA = a.rigdaydate || a.eventdate || '';
        const dateB = b.rigdaydate || b.eventdate || '';
        return dateA.localeCompare(dateB);
      });

      setBookings(result);
    } catch (err) {
      console.error('Error loading bookings:', err);
      toast.error('Kunde inte ladda bokningar');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === bookings.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(bookings.map(b => b.bookingId)));
    }
  };

  const handleSplitSelected = async () => {
    if (selectedIds.size === 0) return;
    setIsSplitting(true);
    setShowSplitDialog(false);
    try {
      const selectedBookings = bookings.filter(b => selectedIds.has(b.bookingId));

      for (const booking of selectedBookings) {
        const dateStr = booking.eventdate
          ? format(new Date(booking.eventdate), 'd MMMM yyyy', { locale: sv })
          : '';
        const packingName = `${booking.client}${dateStr ? ` - ${dateStr}` : ''}`;

        // Create individual packing project
        const { error: insertErr } = await supabase
          .from('packing_projects')
          .insert({
            name: packingName,
            booking_id: booking.bookingId,
            client_name: booking.client,
            delivery_address: booking.deliveryaddress,
            status: 'planning',
            organization_id: booking.organizationId,
          });

        if (!insertErr) {
          syncBookingToPacking(booking.bookingId, booking.organizationId);
        }

        // Remove from consolidated packing
        await supabase
          .from('packing_project_bookings')
          .delete()
          .eq('packing_id', packingId)
          .eq('booking_id', booking.bookingId);

        // Remove packing_list_items for this booking's products
        const { data: productIds } = await supabase
          .from('booking_products')
          .select('id')
          .eq('booking_id', booking.bookingId);

        if (productIds && productIds.length > 0) {
          await supabase
            .from('packing_list_items')
            .delete()
            .eq('packing_id', packingId)
            .in('booking_product_id', productIds.map(p => p.id));
        }
      }

      toast.success(`${selectedBookings.length} bokning(ar) utbrutna till separata packlistor`);
      setSelectedIds(new Set());
      await loadBookings();
      onSyncComplete();
    } catch (err) {
      console.error('Error splitting:', err);
      toast.error('Kunde inte bryta ut bokningar');
    } finally {
      setIsSplitting(false);
    }
  };

  const handleGeneratePackingList = async () => {
    setIsSyncing(true);
    try {
      const bookingIds = bookings.map(b => b.bookingId);

      // Use fullSyncMultiBooking logic inline
      let totalAdded = 0;
      for (const bookingId of bookingIds) {
        const { data: products } = await supabase
          .from('booking_products')
          .select('id, quantity')
          .eq('booking_id', bookingId);

        const { data: existing } = await supabase
          .from('packing_list_items')
          .select('id, booking_product_id')
          .eq('packing_id', packingId);

        const existingProductIds = new Set((existing || []).map(e => e.booking_product_id));
        const toAdd = (products || []).filter(p => !existingProductIds.has(p.id));

        if (toAdd.length > 0) {
          await supabase.from('packing_list_items').insert(
            toAdd.map(p => ({
              packing_id: packingId,
              booking_product_id: p.id,
              quantity_to_pack: p.quantity,
              quantity_packed: 0,
            }))
          );
          totalAdded += toAdd.length;
        }
      }

      toast.success(totalAdded > 0
        ? `Packlista genererad: ${totalAdded} artiklar tillagda`
        : 'Packlistan är redan uppdaterad'
      );
      setHasPackingItems(true);
      onSyncComplete();
    } catch (err) {
      console.error('Error generating packing list:', err);
      toast.error('Kunde inte generera packlista');
    } finally {
      setIsSyncing(false);
    }
  };

  const totalProducts = bookings.reduce((sum, b) => sum + b.productCount, 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg text-foreground flex items-center gap-2">
            <Package className="h-5 w-5" />
            Bokningsöversikt
          </h3>
          <p className="text-sm text-muted-foreground">
            {bookings.length} bokningar • {totalProducts} produkter totalt
          </p>
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSplitDialog(true)}
              disabled={isSplitting}
            >
              <Scissors className="h-4 w-4 mr-1.5" />
              Bryt ut ({selectedIds.size})
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleGeneratePackingList}
            disabled={isSyncing}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isSyncing ? 'animate-spin' : ''}`} />
            {hasPackingItems ? 'Synka packlista' : 'Generera packlista'}
          </Button>
          {hasPackingItems && (
            <Button size="sm" variant="default" onClick={onNavigateToChecklist}>
              <ArrowRight className="h-4 w-4 mr-1.5" />
              Gå till packlista
            </Button>
          )}
        </div>
      </div>

      {/* Select all */}
      <div className="flex items-center gap-2 px-1">
        <Checkbox
          checked={selectedIds.size === bookings.length && bookings.length > 0}
          onCheckedChange={toggleAll}
        />
        <span className="text-sm text-muted-foreground">Välj alla</span>
      </div>

      {/* Booking list */}
      <div className="border rounded-lg overflow-hidden bg-card divide-y divide-border/30">
        {bookings.map(booking => (
          <div
            key={booking.bookingId}
            className={`flex items-center gap-3 px-4 py-3 transition-colors ${
              selectedIds.has(booking.bookingId) ? 'bg-primary/5' : 'hover:bg-muted/30'
            }`}
          >
            <Checkbox
              checked={selectedIds.has(booking.bookingId)}
              onCheckedChange={() => toggleSelection(booking.bookingId)}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate">{booking.client}</span>
                {booking.bookingNumber && (
                  <Badge variant="outline" className="text-xs shrink-0">
                    <Hash className="h-3 w-3 mr-0.5" />
                    {booking.bookingNumber}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                {booking.eventdate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(booking.eventdate), 'd MMM', { locale: sv })}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Package className="h-3 w-3" />
                  {booking.productCount} produkter
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Split dialog */}
      <AlertDialog open={showSplitDialog} onOpenChange={setShowSplitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bryt ut till separata packlistor?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedIds.size} bokning(ar) bryts ut till egna packlistor och tas bort från den samlade listan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleSplitSelected} disabled={isSplitting}>
              {isSplitting ? 'Bryter ut...' : 'Bryt ut'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PackingProjectOverview;
