import { useState } from "react";
import { RefreshCw, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWarehouseDashboard } from "@/hooks/useWarehouseDashboard";
import { useNavigate } from "react-router-dom";
import WarehouseStatsRow from "@/components/warehouse-dashboard/WarehouseStatsRow";
import UpcomingJobsTimeline from "@/components/warehouse-dashboard/UpcomingJobsTimeline";
import UrgentPackingsList from "@/components/warehouse-dashboard/UrgentPackingsList";
import ActivePackingsGrid from "@/components/warehouse-dashboard/ActivePackingsGrid";
import PackingTasksAttention from "@/components/warehouse-dashboard/PackingTasksAttention";
import BookingProductsDialog from "@/components/Calendar/BookingProductsDialog";
import CreatePackingWizard from "@/components/packing/CreatePackingWizard";
import { UpcomingJob } from "@/services/warehouseDashboardService";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const WarehouseDashboard = () => {
  const navigate = useNavigate();
  const {
    stats,
    upcomingJobs,
    urgentPackings,
    activePackings,
    tasksAttention,
    isLoading,
    isStatsLoading,
    isUpcomingLoading,
    isUrgentLoading,
    isActiveLoading,
    isTasksLoading,
    refetchAll
  } = useWarehouseDashboard();

  // Dialog states
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [selectedJob, setSelectedJob] = useState<UpcomingJob | null>(null);

  // Handle job click - open booking dialog
  const handleJobClick = (job: UpcomingJob) => {
    setSelectedJob(job);
    setSelectedBookingId(job.id);
    setShowBookingDialog(true);
  };

  // Handle create packing from job
  const handleCreatePackingFromJob = (job: UpcomingJob) => {
    setSelectedJob(job);
    setSelectedBookingId(job.id);
    setShowBookingDialog(true);
  };

  // Handle view existing packing
  const handleViewPacking = (packingId: string) => {
    navigate(`/warehouse/packing/${packingId}`);
  };

  // Handle create packing from dialog
  const handleCreatePacking = async (bookingId: string, bookingClient: string) => {
    try {
      // Create packing project
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
      setSelectedJob(null);
      refetchAll();
      
      // Navigate to new packing
      navigate(`/warehouse/packing/${data.id}`);
    } catch (error) {
      console.error('Error creating packing:', error);
      toast.error('Kunde inte skapa packning');
    }
  };

  // Handle packing created from wizard
  const handlePackingCreated = () => {
    setShowCreateWizard(false);
    refetchAll();
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Lagerdashboard</h1>
            <p className="text-muted-foreground text-sm">
              Översikt över lagerlogistik och packningsarbete
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
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Uppdatera
            </Button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="mb-6">
          <WarehouseStatsRow stats={stats} isLoading={isStatsLoading} />
        </div>

        {/* Timeline */}
        <div className="mb-6">
          <UpcomingJobsTimeline 
            jobs={upcomingJobs} 
            isLoading={isUpcomingLoading}
            onJobClick={handleJobClick}
            onCreatePacking={handleCreatePackingFromJob}
            onViewPacking={handleViewPacking}
          />
        </div>

        {/* Urgent + Tasks grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <UrgentPackingsList packings={urgentPackings} isLoading={isUrgentLoading} />
          <PackingTasksAttention tasks={tasksAttention} isLoading={isTasksLoading} />
        </div>

        {/* Active Packings */}
        <div className="mb-6">
          <ActivePackingsGrid packings={activePackings} isLoading={isActiveLoading} />
        </div>
      </div>

      {/* Booking Products Dialog */}
      <BookingProductsDialog
        bookingId={selectedBookingId}
        open={showBookingDialog}
        onOpenChange={(open) => {
          setShowBookingDialog(open);
          if (!open) {
            setSelectedBookingId(null);
            setSelectedJob(null);
          }
        }}
        onCreatePacking={handleCreatePacking}
      />

      {/* Create Packing Wizard */}
      <CreatePackingWizard
        open={showCreateWizard}
        onOpenChange={setShowCreateWizard}
        onSuccess={handlePackingCreated}
      />
    </div>
  );
};

export default WarehouseDashboard;
