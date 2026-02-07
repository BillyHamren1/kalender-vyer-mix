import { useState, useMemo } from "react";
import { RefreshCw, Plus, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays, isSameDay, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import WeekPackingsView from "@/components/warehouse-dashboard/WeekPackingsView";
import NewPackingJobsCard from "@/components/warehouse-dashboard/NewPackingJobsCard";
import ActivePackingsCard from "@/components/warehouse-dashboard/ActivePackingsCard";
import CompletedPackingsCard from "@/components/warehouse-dashboard/CompletedPackingsCard";
import WarehouseStaffUtilizationCard from "@/components/warehouse-dashboard/WarehouseStaffUtilizationCard";
import BookingProductsDialog from "@/components/Calendar/BookingProductsDialog";
import CreatePackingWizard from "@/components/packing/CreatePackingWizard";
import { toast } from "sonner";

interface WeekPacking {
  id: string;
  bookingId: string;
  bookingNumber: string | null;
  client: string;
  date: Date;
  eventType: 'packing' | 'delivery' | 'return' | 'inventory' | 'unpacking' | 'rig' | 'event' | 'rigdown';
  status: string;
}

const WarehouseDashboard = () => {
  const navigate = useNavigate();
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });

  // Dialog states
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [showBookingDialog, setShowBookingDialog] = useState(false);

  const goToPreviousWeek = () => setCurrentWeekStart(prev => subWeeks(prev, 1));
  const goToNextWeek = () => setCurrentWeekStart(prev => addWeeks(prev, 1));
  const goToCurrentWeek = () => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  // Query hooks
  const weekPackingsQuery = useQuery({
    queryKey: ['warehouse-week-packings', format(currentWeekStart, 'yyyy-MM-dd')],
    queryFn: async () => {
      const startStr = format(currentWeekStart, 'yyyy-MM-dd');
      const endStr = format(weekEnd, 'yyyy-MM-dd');

      const { data, error } = await supabase
        .from('warehouse_calendar_events')
        .select('id, booking_id, booking_number, title, event_type, start_time')
        .gte('start_time', startStr)
        .lte('start_time', endStr + 'T23:59:59')
        .order('start_time', { ascending: true });

      if (error) throw error;

      const packings: WeekPacking[] = (data || []).map(event => ({
        id: event.id,
        bookingId: event.booking_id || '',
        bookingNumber: event.booking_number,
        client: event.title,
        date: new Date(event.start_time),
        eventType: (event.event_type?.toLowerCase() || 'other') as WeekPacking['eventType'],
        status: 'active'
      }));

      return packings;
    }
  });

  const newJobsQuery = useQuery({
    queryKey: ['warehouse-new-jobs'],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      
      const { data: bookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('id, client, booking_number, rigdaydate, eventdate, created_at')
        .eq('status', 'CONFIRMED')
        .gte('rigdaydate', today)
        .order('rigdaydate', { ascending: true })
        .limit(20);

      if (bookingsError) throw bookingsError;

      const { data: packings } = await supabase
        .from('packing_projects')
        .select('booking_id');

      const packingBookingIds = new Set((packings || []).map(p => p.booking_id));

      return (bookings || []).map(booking => ({
        id: booking.id,
        bookingNumber: booking.booking_number,
        client: booking.client,
        rigDate: booking.rigdaydate,
        eventDate: booking.eventdate,
        createdAt: booking.created_at,
        hasPacking: packingBookingIds.has(booking.id)
      }));
    }
  });

  const activePackingsQuery = useQuery({
    queryKey: ['warehouse-active-packings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('packing_projects')
        .select(`id, name, status, project_leader, updated_at, booking_id`)
        .in('status', ['planning', 'in_progress'])
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const packingIds = (data || []).map(p => p.id);
      const { data: listItems } = await supabase
        .from('packing_list_items')
        .select('packing_id, quantity_to_pack, quantity_packed')
        .in('packing_id', packingIds);

      const itemsByPacking = (listItems || []).reduce((acc, item) => {
        if (!acc[item.packing_id]) {
          acc[item.packing_id] = { total: 0, packed: 0 };
        }
        acc[item.packing_id].total += item.quantity_to_pack || 0;
        acc[item.packing_id].packed += item.quantity_packed || 0;
        return acc;
      }, {} as Record<string, { total: number; packed: number }>);

      return (data || []).map(packing => {
        const items = itemsByPacking[packing.id] || { total: 0, packed: 0 };
        const progress = items.total > 0 ? Math.round((items.packed / items.total) * 100) : 0;
        
        return {
          id: packing.id,
          name: packing.name,
          status: packing.status,
          progress,
          totalItems: items.total,
          packedItems: items.packed,
          projectLeader: packing.project_leader,
          updatedAt: packing.updated_at
        };
      });
    }
  });

  const completedPackingsQuery = useQuery({
    queryKey: ['warehouse-completed-packings', format(currentWeekStart, 'yyyy-MM-dd')],
    queryFn: async () => {
      const startStr = format(currentWeekStart, 'yyyy-MM-dd');
      const endStr = format(weekEnd, 'yyyy-MM-dd');

      const { data, error } = await supabase
        .from('packing_projects')
        .select('id, name, updated_at')
        .eq('status', 'completed')
        .gte('updated_at', startStr)
        .lte('updated_at', endStr + 'T23:59:59')
        .order('updated_at', { ascending: false });

      if (error) throw error;

      return (data || []).map(packing => ({
        id: packing.id,
        name: packing.name,
        completedAt: packing.updated_at
      }));
    }
  });

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

  const isLoading = weekPackingsQuery.isLoading || newJobsQuery.isLoading || 
    activePackingsQuery.isLoading || completedPackingsQuery.isLoading || staffUtilizationQuery.isLoading;

  const refetchAll = () => {
    weekPackingsQuery.refetch();
    newJobsQuery.refetch();
    activePackingsQuery.refetch();
    completedPackingsQuery.refetch();
    staffUtilizationQuery.refetch();
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
    <div className="h-full overflow-y-auto" style={{ background: 'var(--gradient-page)' }}>
      {/* Subtle radial overlay */}
      <div className="relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(184_60%_38%/0.04),transparent)]" />
        
        <div className="relative p-6 max-w-[1600px] mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6 p-7 rounded-2xl bg-card border border-border/40 shadow-2xl">
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg shadow-warehouse/15"
                style={{ background: 'linear-gradient(135deg, hsl(38 92% 55%) 0%, hsl(32 95% 40%) 100%)' }}
              >
                <Package className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-[hsl(var(--heading))]">Lagerdashboard</h1>
                <p className="text-muted-foreground text-[0.925rem]">
                  {format(new Date(), "EEEE d MMMM yyyy", { locale: sv })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setShowCreateWizard(true)}
                className="bg-warehouse hover:bg-warehouse-hover shadow-xl shadow-warehouse/25 font-semibold"
              >
                <Plus className="h-4 w-4 mr-2" />
                Ny packning
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={refetchAll}
                disabled={isLoading}
                className="border-border/60"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Uppdatera
              </Button>
            </div>
          </div>

          {/* Week Planning - Packings View */}
          <div className="mb-6">
            <WeekPackingsView 
              packings={weekPackingsQuery.data || []}
              weekStart={currentWeekStart}
              onPreviousWeek={goToPreviousWeek}
              onNextWeek={goToNextWeek}
              onCurrentWeek={goToCurrentWeek}
              isLoading={weekPackingsQuery.isLoading}
            />
          </div>

          {/* Main Grid - 5 columns */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-1">
              <NewPackingJobsCard 
                jobs={newJobsQuery.data || []}
                isLoading={newJobsQuery.isLoading}
                onCreatePacking={handleCreatePacking}
              />
            </div>

            <div className="lg:col-span-2">
              <ActivePackingsCard 
                packings={activePackingsQuery.data || []}
                isLoading={activePackingsQuery.isLoading}
              />
            </div>

            <div className="lg:col-span-1">
              <WarehouseStaffUtilizationCard 
                staff={staffUtilizationQuery.data || []}
                isLoading={staffUtilizationQuery.isLoading}
                weekNumber={format(currentWeekStart, 'w')}
              />
            </div>

            <div className="lg:col-span-1">
              <CompletedPackingsCard 
                packings={completedPackingsQuery.data || []}
                isLoading={completedPackingsQuery.isLoading}
                weekNumber={format(currentWeekStart, 'w')}
              />
            </div>
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
