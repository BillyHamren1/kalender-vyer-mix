
import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle, XCircle, Clock, AlertTriangle, Edit } from 'lucide-react';
import { BookingStatus, updateBookingStatusWithCalendarSync } from "@/services/booking/bookingStatusService";
import StatusBadge from './StatusBadge';
import { toast } from 'sonner';

interface StatusChangeFormProps {
  currentStatus: string;
  bookingId: string;
  onStatusChange: (newStatus: string) => void;
  disabled?: boolean;
}

const StatusChangeForm: React.FC<StatusChangeFormProps> = ({
  currentStatus,
  bookingId,
  onStatusChange,
  disabled = false
}) => {
  const [selectedStatus, setSelectedStatus] = useState<BookingStatus>(currentStatus.toUpperCase() as BookingStatus);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showSelector, setShowSelector] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<BookingStatus | null>(null);

  const statusOptions: { value: BookingStatus; label: string; icon: React.ReactNode }[] = [
    { 
      value: 'OFFER', 
      label: 'Offer', 
      icon: <Clock className="h-3 w-3" /> 
    },
    { 
      value: 'CONFIRMED', 
      label: 'Confirmed', 
      icon: <CheckCircle className="h-3 w-3" /> 
    },
    { 
      value: 'CANCELLED', 
      label: 'Cancelled', 
      icon: <XCircle className="h-3 w-3" /> 
    }
  ];

  const needsConfirmation = (newStatus: BookingStatus): boolean => {
    const current = currentStatus.toUpperCase();
    return (current === 'CONFIRMED' && newStatus === 'CANCELLED') || 
           (current !== 'CONFIRMED' && newStatus === 'CONFIRMED');
  };

  const getConfirmationMessage = (newStatus: BookingStatus): string => {
    const current = currentStatus.toUpperCase();
    
    if (current === 'CONFIRMED' && newStatus === 'CANCELLED') {
      return 'This will remove the booking from the calendar. Are you sure you want to cancel this booking?';
    }
    
    if (current !== 'CONFIRMED' && newStatus === 'CONFIRMED') {
      return 'This will add the booking to the calendar if it has valid dates. Are you sure you want to confirm this booking?';
    }
    
    return `Are you sure you want to change the status to ${newStatus}?`;
  };

  const handleStatusSelect = (newStatus: BookingStatus) => {
    if (newStatus === currentStatus.toUpperCase()) {
      setShowSelector(false);
      return;
    }
    
    setSelectedStatus(newStatus);
    
    if (needsConfirmation(newStatus)) {
      setPendingStatus(newStatus);
      setShowConfirmDialog(true);
    } else {
      handleStatusUpdate(newStatus);
    }
    setShowSelector(false);
  };

  const handleStatusUpdate = async (newStatus: BookingStatus) => {
    setIsUpdating(true);
    
    try {
      await updateBookingStatusWithCalendarSync(bookingId, newStatus, currentStatus);
      
      onStatusChange(newStatus);
      
      if (newStatus === 'CONFIRMED') {
        toast.success('Booking confirmed', {
          description: 'Booking has been confirmed and synced to calendar'
        });
      } else if (newStatus === 'CANCELLED') {
        toast.success('Booking cancelled', {
          description: 'Booking has been cancelled and removed from calendar'
        });
      } else {
        toast.success('Status updated', {
          description: `Booking status changed to ${newStatus}`
        });
      }
      
    } catch (error) {
      console.error('Error updating booking status:', error);
      toast.error('Failed to update booking status', {
        description: 'Please try again or contact support'
      });
      
      setSelectedStatus(currentStatus.toUpperCase() as BookingStatus);
    } finally {
      setIsUpdating(false);
      setShowConfirmDialog(false);
      setPendingStatus(null);
    }
  };

  const handleConfirmStatusChange = () => {
    if (pendingStatus) {
      handleStatusUpdate(pendingStatus);
    }
  };

  const handleCancelStatusChange = () => {
    setShowConfirmDialog(false);
    setPendingStatus(null);
    setSelectedStatus(currentStatus.toUpperCase() as BookingStatus);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Status Badge Display */}
        <StatusBadge
          status={currentStatus}
          interactive={!disabled && !isUpdating}
          onClick={() => !disabled && !isUpdating && setShowSelector(true)}
        />

        {/* Edit Button */}
        {!disabled && !isUpdating && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSelector(true)}
            className="h-6 w-6 p-0"
          >
            <Edit className="h-3 w-3" />
          </Button>
        )}

        {isUpdating && (
          <div className="text-sm text-gray-500">Updating...</div>
        )}
      </div>

      {/* Status Selector Dialog */}
      <Dialog open={showSelector} onOpenChange={setShowSelector}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Status</DialogTitle>
            <DialogDescription>
              Select a new status for this booking
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {statusOptions.map((option) => (
              <Button
                key={option.value}
                variant={selectedStatus === option.value ? "default" : "outline"}
                className="w-full justify-start"
                onClick={() => handleStatusSelect(option.value)}
              >
                <div className="flex items-center gap-2">
                  {option.icon}
                  {option.label}
                </div>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Status Change</DialogTitle>
            <DialogDescription>
              {pendingStatus && getConfirmationMessage(pendingStatus)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={handleCancelStatusChange}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmStatusChange}
              disabled={isUpdating}
              variant={pendingStatus === 'CANCELLED' ? 'destructive' : 'default'}
            >
              {isUpdating ? 'Updating...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default StatusChangeForm;
