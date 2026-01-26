import { useState, useMemo } from "react";
import { RefreshCw, Plus, Clock, CalendarDays, Package, CheckCircle2, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, isWithinInterval, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardListWidget, { ListItem } from "@/components/warehouse-dashboard/DashboardListWidget";
import WarehouseStatsRow from "@/components/warehouse-dashboard/WarehouseStatsRow";
import BookingProductsDialog from "@/components/Calendar/BookingProductsDialog";
import CreatePackingWizard from "@/components/packing/CreatePackingWizard";
import { toast } from "sonner";

// Helper to get week filter options
const getWeekOptions = () => {
  const today = new Date();
  const options = [];
  
  for (let i = -2; i <= 4; i++) {
    const weekStart = startOfWeek(addWeeks(today, i), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(addWeeks(today, i), { weekStartsOn: 1 });
    const weekNum = format(weekStart, 'w');
    const label = i === 0 
      ? `Vecka ${weekNum} (denna vecka)` 
      : `Vecka ${weekNum}`;
    
    options.push({
      value: i.toString(),
      label,
      start: weekStart,
      end: weekEnd
    });
  }
  
  return options;
};

const WarehouseDashboard = () => {
  const navigate = useNavigate();
  const [weekOffset, setWeekOffset] = useState("0");
  const weekOptions = useMemo(() => getWeekOptions(), []);
  
  const selectedWeek = weekOptions.find(w => w.value === weekOffset) || weekOptions[2];
  const weekStart = selectedWeek.start;
  const weekEnd = selectedWeek.end;

  // Dialog states
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [showBookingDialog, setShowBookingDialog] = useState(false);

  // Fetch stats
  const statsQuery = useQuery({
    queryKey: ['warehouse-stats'],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      
      const [upcomingRes, activeRes, overdueRes] = await Promise.all([
        supabase.from('bookings').select('*', { count: 'exact', head: true })
          .gte('rigdaydate', today).eq('status', 'CONFIRMED'),
        supabase.from('packing_projects').select('*', { count: 'exact', head: true })
          .eq('status', 'in_progress'),
        supabase.from('packing_tasks').select('*', { count: 'exact', head: true })
          .lt('deadline', today).eq('completed', false)
      ]);

      return {
        upcomingJobs: upcomingRes.count || 0,
        activePackings: activeRes.count || 0,
        urgentPackings: 0,
        overdueTasks: overdueRes.count || 0
      };
    }
  });

  // Fetch recently received jobs (last 7 days)
  const recentJobsQuery = useQuery({
    queryKey: ['warehouse-recent-jobs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('id, client, booking_number, created_at, status')
        .eq('status', 'CONFIRMED')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data || [];
    }
  });

  // Fetch jobs for selected week (by rig date)
  const weekJobsQuery = useQuery({
    queryKey: ['warehouse-week-jobs', weekOffset],
    queryFn: async () => {
      const startStr = format(weekStart, 'yyyy-MM-dd');
      const endStr = format(weekEnd, 'yyyy-MM-dd');

      const { data, error } = await supabase
        .from('bookings')
        .select('id, client, booking_number, rigdaydate, status')
        .gte('rigdaydate', startStr)
        .lte('rigdaydate', endStr)
        .eq('status', 'CONFIRMED')
        .order('rigdaydate', { ascending: true });

      if (error) throw error;
      return data || [];
    }
  });

  // Fetch in-progress packings
  const inProgressPackingsQuery = useQuery({
    queryKey: ['warehouse-inprogress-packings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('packing_projects')
        .select('id, name, status, booking_id, updated_at')
        .eq('status', 'in_progress')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return data || [];
    }
  });

  // Fetch completed packings for selected week
  const completedPackingsQuery = useQuery({
    queryKey: ['warehouse-completed-packings', weekOffset],
    queryFn: async () => {
      const startStr = format(weekStart, 'yyyy-MM-dd');
      const endStr = format(weekEnd, 'yyyy-MM-dd');

      const { data, error } = await supabase
        .from('packing_projects')
        .select('id, name, status, updated_at')
        .eq('status', 'completed')
        .gte('updated_at', startStr)
        .lte('updated_at', endStr + 'T23:59:59')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return data || [];
    }
  });

  const isLoading = statsQuery.isLoading || recentJobsQuery.isLoading || 
    weekJobsQuery.isLoading || inProgressPackingsQuery.isLoading || completedPackingsQuery.isLoading;

  const refetchAll = () => {
    statsQuery.refetch();
    recentJobsQuery.refetch();
    weekJobsQuery.refetch();
    inProgressPackingsQuery.refetch();
    completedPackingsQuery.refetch();
  };

  // Transform data to list items
  const recentJobItems: ListItem[] = (recentJobsQuery.data || []).map(job => ({
    id: job.id,
    primaryText: `#${job.booking_number || '—'} - ${job.client}`,
    secondaryText: job.created_at ? format(new Date(job.created_at), 'd MMM yyyy', { locale: sv }) : undefined,
    status: 'Bekräftad',
    statusVariant: 'default' as const,
    onClick: () => {
      setSelectedBookingId(job.id);
      setShowBookingDialog(true);
    }
  }));

  const weekJobItems: ListItem[] = (weekJobsQuery.data || []).map(job => ({
    id: job.id,
    primaryText: `#${job.booking_number || '—'} - ${job.client}`,
    secondaryText: job.rigdaydate ? `Montage: ${format(new Date(job.rigdaydate), 'd MMM', { locale: sv })}` : undefined,
    status: 'Bekräftad',
    statusVariant: 'default' as const,
    onClick: () => {
      setSelectedBookingId(job.id);
      setShowBookingDialog(true);
    }
  }));

  const inProgressItems: ListItem[] = (inProgressPackingsQuery.data || []).map(packing => ({
    id: packing.id,
    primaryText: packing.name,
    secondaryText: packing.updated_at ? `Uppdaterad: ${format(new Date(packing.updated_at), 'd MMM', { locale: sv })}` : undefined,
    status: 'Pågående',
    statusVariant: 'warning' as const,
    onClick: () => navigate(`/warehouse/packing/${packing.id}`)
  }));

  const completedItems: ListItem[] = (completedPackingsQuery.data || []).map(packing => ({
    id: packing.id,
    primaryText: packing.name,
    secondaryText: packing.updated_at ? `Slutförd: ${format(new Date(packing.updated_at), 'd MMM', { locale: sv })}` : undefined,
    status: 'Klar',
    statusVariant: 'success' as const,
    onClick: () => navigate(`/warehouse/packing/${packing.id}`)
  }));

  // Handle create packing from dialog
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
      setShowBookingDialog(false);
      setSelectedBookingId(null);
      refetchAll();
      navigate(`/warehouse/packing/${data.id}`);
    } catch (error) {
      console.error('Error creating packing:', error);
      toast.error('Kunde inte skapa packning');
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Lagerdashboard</h1>
            <p className="text-muted-foreground text-sm">
              Översikt över lagerlogistik och packningsarbete
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Week filter */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={weekOffset} onValueChange={setWeekOffset}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {weekOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => setShowCreateWizard(true)}
              className="bg-warehouse hover:bg-warehouse/90"
            >
              <Plus className="h-4 w-4 mr-2" />
              Ny packning
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={refetchAll}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="mb-6">
          <WarehouseStatsRow 
            stats={statsQuery.data || { upcomingJobs: 0, activePackings: 0, urgentPackings: 0, overdueTasks: 0 }} 
            isLoading={statsQuery.isLoading} 
          />
        </div>

        {/* List Widgets Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Senast inkomna jobb */}
          <DashboardListWidget
            title="Senast inkomna jobb"
            icon={<Clock className="h-5 w-5 text-primary" />}
            items={recentJobItems}
            isLoading={recentJobsQuery.isLoading}
            emptyText="Inga nya jobb"
            maxVisible={5}
          />

          {/* Jobb denna vecka */}
          <DashboardListWidget
            title={`Jobb vecka ${format(weekStart, 'w')}`}
            icon={<CalendarDays className="h-5 w-5 text-warehouse" />}
            items={weekJobItems}
            isLoading={weekJobsQuery.isLoading}
            emptyText="Inga jobb denna vecka"
            maxVisible={5}
          />

          {/* Påbörjade packningar */}
          <DashboardListWidget
            title="Påbörjade packningar"
            icon={<Package className="h-5 w-5 text-amber-500" />}
            items={inProgressItems}
            isLoading={inProgressPackingsQuery.isLoading}
            emptyText="Inga pågående packningar"
            maxVisible={5}
          />

          {/* Slutförda packningar */}
          <DashboardListWidget
            title={`Slutförda vecka ${format(weekStart, 'w')}`}
            icon={<CheckCircle2 className="h-5 w-5 text-green-500" />}
            items={completedItems}
            isLoading={completedPackingsQuery.isLoading}
            emptyText="Inga slutförda packningar denna vecka"
            maxVisible={5}
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
        onCreatePacking={handleCreatePacking}
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
