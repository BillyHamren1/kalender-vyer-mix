import { useState, useMemo } from "react";
import { RefreshCw, Plus } from "lucide-react";
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

  // Fetch week packings/events from warehouse calendar
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

      // Map events to WeekPacking format
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

  // Fetch new jobs without packing
  const newJobsQuery = useQuery({
    queryKey: ['warehouse-new-jobs'],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      
      // Get confirmed bookings with upcoming rig dates
      const { data: bookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('id, client, booking_number, rigdaydate, eventdate, created_at')
        .eq('status', 'CONFIRMED')
        .gte('rigdaydate', today)
        .order('rigdaydate', { ascending: true })
        .limit(20);

      if (bookingsError) throw bookingsError;

      // Get packing projects to check which bookings have packings
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

  // Fetch active packings
  const activePackingsQuery = useQuery({
    queryKey: ['warehouse-active-packings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('packing_projects')
        .select(`
          id, 
          name, 
          status, 
          project_leader, 
          updated_at,
          booking_id
        `)
        .in('status', ['planning', 'in_progress'])
        .order('updated_at', { ascending: false });

      if (error) throw error;

      // Get packing list items count for progress
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

  // Fetch completed packings for selected week
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

  const isLoading = weekPackingsQuery.isLoading || newJobsQuery.isLoading || 
    activePackingsQuery.isLoading || completedPackingsQuery.isLoading;

  const refetchAll = () => {
    weekPackingsQuery.refetch();
    newJobsQuery.refetch();
    activePackingsQuery.refetch();
    completedPackingsQuery.refetch();
  };

  // Handle create packing
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
    <div className="h-full overflow-y-auto bg-muted/30 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Lagerdashboard</h1>
          <p className="text-muted-foreground">
            {format(new Date(), "EEEE d MMMM yyyy", { locale: sv })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowCreateWizard(true)}
            className="bg-warehouse hover:bg-warehouse/90"
          >
            <Plus className="h-4 w-4 mr-2" />
            Ny packning
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={refetchAll}
            disabled={isLoading}
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

      {/* Main Grid - 4 columns like PlanningDashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* New Packing Jobs */}
        <div className="lg:col-span-1">
          <NewPackingJobsCard 
            jobs={newJobsQuery.data || []}
            isLoading={newJobsQuery.isLoading}
            onCreatePacking={handleCreatePacking}
          />
        </div>

        {/* Active Packings - span 2 columns */}
        <div className="lg:col-span-2">
          <ActivePackingsCard 
            packings={activePackingsQuery.data || []}
            isLoading={activePackingsQuery.isLoading}
          />
        </div>

        {/* Completed Packings */}
        <div className="lg:col-span-1">
          <CompletedPackingsCard 
            packings={completedPackingsQuery.data || []}
            isLoading={completedPackingsQuery.isLoading}
            weekNumber={format(currentWeekStart, 'w')}
          />
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
