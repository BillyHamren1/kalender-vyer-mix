import { useState, useMemo } from "react";
import { RefreshCw, Plus, Package } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { format, startOfWeek, endOfWeek, addDays } from "date-fns";
import { sv } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";


import WarehouseStaffActivationCard from "@/components/warehouse-dashboard/WarehouseStaffActivationCard";
import TodaysTransportsCard, { TransportItem } from "@/components/warehouse-dashboard/TodaysTransportsCard";
import WarehouseRecentPackingsWidgets from "@/components/warehouse-dashboard/WarehouseRecentPackingsWidgets";
import BookingProductsDialog from "@/components/Calendar/BookingProductsDialog";
import CreateInternalTaskDialog from "@/components/warehouse/CreateInternalTaskDialog";
import { IncomingPackingList } from "@/components/packing/IncomingPackingList";
import WarehouseProjectInbox from "@/components/warehouse/WarehouseProjectInbox";
import { toast } from "sonner";




const WarehouseDashboard = () => {
  const navigate = useNavigate();
  const currentWeekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);
  const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
  // Dialog states
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [showBookingDialog, setShowBookingDialog] = useState(false);

  // Realtime subscriptions for warehouse dashboard
  useRealtimeInvalidation({
    channelName: 'warehouse-page-realtime',
    tables: ['packing_projects', 'packing_list_items', 'transport_assignments', 'bookings'],
    queryKeys: [
      ['warehouse-recent-packings'],
      ['warehouse-staff-utilization'],
      ['warehouse-transports'],
    ],
  });

  // Query hooks





  // Transport assignments query - upcoming loadings/unloadings
  const transportsQuery = useQuery<TransportItem[]>({
    queryKey: ['warehouse-transports'],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const sevenDaysFromNow = format(addDays(new Date(), 7), 'yyyy-MM-dd');

      const { data, error } = await supabase
        .from('transport_assignments')
        .select('id, booking_id, vehicle_id, transport_date, transport_time, status')
        .gte('transport_date', today)
        .lte('transport_date', sevenDaysFromNow)
        .order('transport_date', { ascending: true });

      if (error) throw error;

      // Get bookings and vehicles in parallel
      const bookingIds = [...new Set((data || []).map(t => t.booking_id))];
      const vehicleIds = [...new Set((data || []).map(t => t.vehicle_id).filter(Boolean))];

      const [bookingsRes, vehiclesRes] = await Promise.all([
        supabase.from('bookings')
          .select('id, client, booking_number, deliveryaddress, rigdaydate, rigdowndate')
          .in('id', bookingIds),
        vehicleIds.length > 0
          ? supabase.from('vehicles').select('id, name').in('id', vehicleIds)
          : Promise.resolve({ data: [] })
      ]);

      const bookingMap = new Map((bookingsRes.data || []).map(b => [b.id, b]));
      const vehicleMap = new Map((vehiclesRes.data || []).map(v => [v.id, v.name]));

      return (data || []).map(t => {
        const booking = bookingMap.get(t.booking_id);
        const isLastning = booking?.rigdaydate === t.transport_date;
        return {
          id: t.id,
          bookingId: t.booking_id,
          client: booking?.client || 'Okänd',
          bookingNumber: booking?.booking_number || null,
          transportDate: t.transport_date,
          transportTime: t.transport_time,
          deliveryAddress: booking?.deliveryaddress || null,
          type: isLastning ? 'lastning' : 'lossning',
          vehicleName: vehicleMap.get(t.vehicle_id) || null,
          status: t.status || 'pending',
        } as TransportItem;
      });
    },
    refetchInterval: 300000,
  });

  const isLoading = transportsQuery.isLoading;

  const refetchAll = () => {
    transportsQuery.refetch();
  };

  const handleCreatePacking = async (bookingId: string, bookingClient: string) => {
    try {
      const { data, error } = await supabase
        .from('packing_projects')
        .insert({
          name: bookingClient,
          booking_id: bookingId,
          status: 'planning'
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Packning skapad');
      refetchAll();
      navigate(`/warehouse/packing/${data.id}`);
    } catch (error) {
      console.error('Error creating packing:', error);
      toast.error('Kunde inte skapa packning');
    }
  };

  const handleDialogCreatePacking = async (bookingId: string, bookingClient: string) => {
    await handleCreatePacking(bookingId, bookingClient);
    setShowBookingDialog(false);
    setSelectedBookingId(null);
  };

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden" style={{ background: 'var(--gradient-page)' }}>
      {/* Subtle radial overlay */}
      <div className="relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(184_60%_38%/0.04),transparent)]" />
        
        <div className="relative p-6 max-w-[1600px] mx-auto">
          {/* Header */}
          <PageHeader
            icon={Package}
            title="Lagerdashboard"
            subtitle={format(new Date(), "EEEE d MMMM yyyy", { locale: sv })}
            variant="warehouse"
          >
            <Button
              onClick={() => setShowCreateWizard(true)}
              size="sm"
              className="bg-warehouse hover:bg-warehouse-hover shadow-sm shadow-warehouse/20 font-medium rounded-lg px-4 h-8"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Skapa lageruppgift
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={refetchAll}
              disabled={isLoading}
              className="border-border/60 h-8 rounded-lg"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Uppdatera
            </Button>
          </PageHeader>

          {/* Inbox: nya projekt från Planning */}
          <div className="mb-6">
            <WarehouseProjectInbox />
          </div>

          {/* Legacy: bokningar utan packlista */}
          <div className="mb-6">
            <IncomingPackingList />
          </div>

          {/* Recent packnings widgets */}
          <div className="mb-6">
            <WarehouseRecentPackingsWidgets />
          </div>

          {/* Staff Activation + Transport */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <WarehouseStaffActivationCard />

            <TodaysTransportsCard 
              transports={transportsQuery.data || []}
              isLoading={transportsQuery.isLoading}
            />
          </div>
        </div>
      </div>

      {/* Booking Products Dialog */}
      <BookingProductsDialog
        bookingId={selectedBookingId}
        open={showBookingDialog}
        onOpenChange={(open) => {
          setShowBookingDialog(open);
          if (!open) setSelectedBookingId(null);
        }}
        onCreatePacking={handleDialogCreatePacking}
      />

      {/* Create Internal Warehouse Task */}
      <CreateInternalTaskDialog
        open={showCreateWizard}
        onOpenChange={setShowCreateWizard}
        onSuccess={() => {
          setShowCreateWizard(false);
          refetchAll();
        }}
      />
    </div>
  );
};

export default WarehouseDashboard;
