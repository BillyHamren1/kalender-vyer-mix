
import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Resource, CalendarEvent } from '@/components/Calendar/ResourceData';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from '@/components/ui/label';

interface UseEventDuplicateDialogProps {
  resources: Resource[];
  duplicateEvent?: (eventId: string, targetResourceId: string) => Promise<string | null>;
  refreshEvents?: () => Promise<void | any[]>;
}

export const useEventDuplicateDialog = ({
  resources,
  duplicateEvent,
  refreshEvents
}: UseEventDuplicateDialogProps) => {
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [targetTeam, setTargetTeam] = useState<string>("");

  // Effect to listen for custom duplicate dialog event
  useEffect(() => {
    const handleOpenDuplicateDialog = (event: CustomEvent) => {
      const eventData = event.detail;
      console.log('Received duplicate dialog event with data:', eventData);
      
      // Set the full event object, not just the basic data
      if (eventData && eventData.fullEvent) {
        setSelectedEvent(eventData.fullEvent);
        setShowDuplicateDialog(true);
      } else {
        console.error('Invalid event data received:', eventData);
        toast.error('Unable to duplicate event: missing event data');
      }
    };

    // Add event listener for the custom event
    document.addEventListener('openDuplicateDialog', handleOpenDuplicateDialog as EventListener);

    return () => {
      document.removeEventListener('openDuplicateDialog', handleOpenDuplicateDialog as EventListener);
    };
  }, []);

  const handleDuplicateEvent = async () => {
    if (!selectedEvent || !duplicateEvent) {
      toast.error("Cannot duplicate event");
      return;
    }

    if (!targetTeam) {
      toast.warning("Please select a target team");
      return;
    }

    try {
      await duplicateEvent(selectedEvent.id, targetTeam);
      handleCloseDialog();
      
      // Refresh the events to show the duplicated event
      if (refreshEvents) {
        await refreshEvents();
      }
    } catch (error) {
      console.error('Error in handleDuplicateEvent:', error);
      // Error is already handled in duplicateEvent function
    }
  };

  const handleCloseDialog = () => {
    setShowDuplicateDialog(false);
    setSelectedEvent(null);
    setTargetTeam("");
  };

  // Duplicate dialog component
  const DuplicateEventDialog = () => (
    <Dialog open={showDuplicateDialog} onOpenChange={handleCloseDialog}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Duplicate Event</DialogTitle>
          <DialogDescription>
            {selectedEvent?.title ? `Duplicate "${selectedEvent.title}" to another team` : 'Select a team to duplicate this event to'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="sourceTeam" className="text-right">
              Source Team
            </Label>
            <div className="col-span-3 text-sm text-gray-700">
              {resources.find(r => r.id === selectedEvent?.resourceId)?.title || selectedEvent?.resourceId || 'Unknown'}
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="teamSelect" className="text-right">
              Target Team
            </Label>
            <Select onValueChange={setTargetTeam} value={targetTeam}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select a team" />
              </SelectTrigger>
              <SelectContent>
                {resources
                  .filter(resource => resource.id !== selectedEvent?.resourceId)
                  .map(resource => (
                    <SelectItem key={resource.id} value={resource.id}>
                      {resource.title}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCloseDialog}>
            Cancel
          </Button>
          <Button onClick={handleDuplicateEvent}>
            Duplicate Event
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return {
    setSelectedEvent,
    setShowDuplicateDialog,
    DuplicateEventDialog
  };
};
