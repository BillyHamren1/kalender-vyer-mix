import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import BookingChangesDetail from '@/components/booking/BookingChangesDetail';
import { useMarkBookingChangesSeen } from '@/hooks/useUnseenBookingUpdates';
import { CheckCircle2 } from 'lucide-react';

interface ProjectUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  bookingIds: string[];
  navigateTo: string;
}

const ProjectUpdateDialog: React.FC<ProjectUpdateDialogProps> = ({
  open,
  onOpenChange,
  projectName,
  bookingIds,
  navigateTo,
}) => {
  const navigate = useNavigate();
  const markSeen = useMarkBookingChangesSeen();

  const handleMarkAndOpen = async () => {
    await Promise.all(bookingIds.map((id) => markSeen.mutateAsync(id).catch(() => null)));
    onOpenChange(false);
    navigate(navigateTo);
  };

  const handleMarkOnly = async () => {
    await Promise.all(bookingIds.map((id) => markSeen.mutateAsync(id).catch(() => null)));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Uppdaterat: {projectName}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto -mx-2 px-2 space-y-3">
          {bookingIds.map((id) => (
            <div key={id} className="rounded-lg border border-border/50 bg-muted/10">
              <BookingChangesDetail bookingId={id} />
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={handleMarkOnly} disabled={markSeen.isPending}>
            <CheckCircle2 className="h-4 w-4 mr-1.5" /> Markera som läst
          </Button>
          <Button onClick={handleMarkAndOpen} disabled={markSeen.isPending}>
            Markera & öppna projekt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProjectUpdateDialog;
