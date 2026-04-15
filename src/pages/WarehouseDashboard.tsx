import { useState, useMemo } from "react";
import { RefreshCw, Plus, Package } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { format, startOfWeek, endOfWeek, addDays, isSameDay, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";

import WarehouseStaffUtilizationCard from "@/components/warehouse-dashboard/WarehouseStaffUtilizationCard";
import WarehouseStaffActivationCard from "@/components/warehouse-dashboard/WarehouseStaffActivationCard";
import TodaysTransportsCard, { TransportItem } from "@/components/warehouse-dashboard/TodaysTransportsCard";
import WarehouseRecentPackingsWidgets from "@/components/warehouse-dashboard/WarehouseRecentPackingsWidgets";
import BookingProductsDialog from "@/components/Calendar/BookingProductsDialog";
import CreatePackingWizard from "@/components/packing/CreatePackingWizard";
import { IncomingPackingList } from "@/components/packing/IncomingPackingList";
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
      
      ['warehouse-new-jobs'],
      ['warehouse-active-packings'],
      ['warehouse-completed-packings'],
      ['warehouse-staff-utilization'],
      ['warehouse-transports'],
    ],
  });

  // Query hooks




  const staffUtilizationQuery = useQuery({
    queryKey: ['warehouse-staff-utilization', format(currentWeekStart, 'yyyy-MM-dd')],
    queryFn: async () => {
      const startStr = format(currentWeekStart, 'yyyy-MM-dd');
      const endStr = format(weekEnd, 'yyyy-MM-dd');

      const { data: staffMembers } = await supabase
        .from('staff_members')
        .select('id, name')
        .eq('is_active', true);

      const { data: laborCosts } = await supabase
        .from('packing_labor_costs')
        .select('staff_id, hours')
        .gte('work_date', startStr)
        .lte('work_date', endStr);

      const { data: packingTasks } = await supabase
        .from('packing_tasks')
        .select('assigned_to, packing_id')
        .eq('completed', false);

      const hoursMap = (laborCosts || []).reduce((acc, row) => {
        acc[row.staff_id] = (acc[row.staff_id] || 0) + (row.hours || 0);
        return acc;
      }, {} as Record<string, number>);

      const activePackingsMap = (packingTasks || []).reduce((acc, task) => {
        if (task.assigned_to) {
          if (!acc[task.assigned_to]) acc[task.assigned_to] = new Set();
          acc[task.assigned_to].add(task.packing_id);
        }
        return acc;
      }, {} as Record<string, Set<string>>);

      const TARGET_HOURS = 40;

      return (staffMembers || []).map(staff => ({
        id: staff.id,
        name: staff.name,
        hoursThisWeek: hoursMap[staff.id] || 0,
        targetHours: TARGET_HOURS,
        utilizationPercent: Math.round(((hoursMap[staff.id] || 0) / TARGET_HOURS) * 100),
        activePackings: activePackingsMap[staff.id]?.size || 0
      })).filter(s => s.hoursThisWeek > 0 || s.activePackings > 0);
    }
  });

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

  const isLoading = newJobsQuery.isLoading || 
    activePackingsQuery.isLoading || completedPackingsQuery.isLoading || staffUtilizationQuery.isLoading ||
    transportsQuery.isLoading;

  const refetchAll = () => {
    newJobsQuery.refetch();
    activePackingsQuery.refetch();
    completedPackingsQuery.refetch();
    staffUtilizationQuery.refetch();
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
              Ny packning
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

          {/* Incoming projects without packing */}
          <div className="mb-6">
            <IncomingPackingList />
          </div>

          {/* Recent packnings widgets */}
          <div className="mb-6">
            <WarehouseRecentPackingsWidgets />
          </div>

          {/* Staff Activation + Transport + Utilization */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <WarehouseStaffActivationCard />

            <TodaysTransportsCard 
              transports={transportsQuery.data || []}
              isLoading={transportsQuery.isLoading}
            />

            <WarehouseStaffUtilizationCard 
              staff={staffUtilizationQuery.data || []}
              isLoading={staffUtilizationQuery.isLoading}
              weekNumber={format(currentWeekStart, 'w')}
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

      {/* Create Packing Wizard */}
      <CreatePackingWizard
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
