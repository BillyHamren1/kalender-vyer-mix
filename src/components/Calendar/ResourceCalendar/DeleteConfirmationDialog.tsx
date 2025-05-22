
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface DeleteConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventToDelete: {id: string, title?: string, bookingId?: string, eventType?: string} | null;
  onConfirmDelete: () => Promise<void>;
}

export const DeleteConfirmationDialog: React.FC<DeleteConfirmationDialogProps> = ({
  open,
  onOpenChange,
  eventToDelete,
  onConfirmDelete
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm Event Deletion</DialogTitle>
          <DialogDescription>
            {eventToDelete?.bookingId ? (
              <>
                Are you sure you want to delete this {eventToDelete.eventType} event for booking {eventToDelete.bookingId}?
                {eventToDelete.eventType === 'event' && (
                  <p className="text-destructive mt-2 font-medium">
                    This will remove the event from the calendar but will not affect the booking itself.
                  </p>
                )}
              </>
            ) : (
              <>Are you sure you want to delete this event?</>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirmDelete}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
