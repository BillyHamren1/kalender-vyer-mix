import { useState } from 'react';
import { AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import ClosingProjectsList from "@/components/project/ClosingProjectsList";
import { resyncClosedProjects } from "@/services/bookingCloseSyncService";
import { toast } from "sonner";

const ProjectClosing = () => {
  const [isSyncing, setIsSyncing] = useState(false);

  const handleResync = async () => {
    setIsSyncing(true);
    try {
      const result = await resyncClosedProjects();
      if (result.totalProjects === 0) {
        toast.info('Inga stängda projekt med kopplade bokningar hittades.');
      } else if (result.failedIds.length === 0) {
        toast.success(
          `${result.successIds.length} bokningar synkade till Booking från ${result.totalProjects} stängda projekt.`,
          { duration: 6000 }
        );
      } else {
        toast.warning(
          `${result.successIds.length} lyckades, ${result.failedIds.length} misslyckades av totalt ${result.successIds.length + result.failedIds.length} bokningar.`,
          { duration: 8000 }
        );
      }
    } catch (err) {
      console.error(err);
      toast.error('Kunde inte synka stängda projekt');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <PageContainer theme="purple">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          icon={AlertCircle}
          title="Under slutförande"
          subtitle="Projekt som passerat eventdatum och bör stängas"
          variant="purple"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleResync}
          disabled={isSyncing}
          className="shrink-0 mt-1"
        >
          {isSyncing ? (
            <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Synkar...</>
          ) : (
            <><RefreshCw className="h-4 w-4 mr-1.5" /> Skicka stängda igen</>
          )}
        </Button>
      </div>
      <ClosingProjectsList />
    </PageContainer>
  );
};

export default ProjectClosing;
