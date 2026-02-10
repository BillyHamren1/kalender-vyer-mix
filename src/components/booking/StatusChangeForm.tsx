
import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { BookingStatus, updateBookingStatusWithCalendarSync, getStatusColor } from "@/services/booking/bookingStatusService";
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
    // Confirm when moving from CONFIRMED to CANCELLED (removes from calendar)
    // Or when moving TO CONFIRMED (adds to calendar)
    return (current === 'CONFIRMED' && newStatus === 'CANCELLED') || 
           (current !== 'CONFIRMED' && newStatus === 'CONFIRMED');
  };

  const getConfirmationMessage = (newStatus: BookingStatus): string => {
    const current = currentStatus.toUpperCase();
    
    if (current === 'CONFIRMED' && newStatus === 'CANCELLED') {
      return 'Detta tar bort bokningen från kalendern. Är du säker på att du vill avboka?';
    }
    
    if (current !== 'CONFIRMED' && newStatus === 'CONFIRMED') {
      return 'Detta lägger till bokningen i kalendern om den har giltiga datum. Är du säker på att du vill bekräfta bokningen?';
    }
    
    return `Är du säker på att du vill ändra status till ${newStatus}?`;
  };

  const handleStatusSelect = (newStatus: BookingStatus) => {
    if (newStatus === currentStatus.toUpperCase()) return;
    
    setSelectedStatus(newStatus);
    
    if (needsConfirmation(newStatus)) {
      setPendingStatus(newStatus);
      setShowConfirmDialog(true);
    } else {
      handleStatusUpdate(newStatus);
    }
  };

  const handleStatusUpdate = async (newStatus: BookingStatus) => {
    setIsUpdating(true);
    
    try {
      await updateBookingStatusWithCalendarSync(bookingId, newStatus, currentStatus);
      
      onStatusChange(newStatus);
      
      // Show appropriate toast message
      if (newStatus === 'CONFIRMED') {
        toast.success('Bokning bekräftad', {
          description: 'Bokningen har bekräftats och synkats till kalendern'
        });
      } else if (newStatus === 'CANCELLED') {
        toast.success('Bokning avbokad', {
          description: 'Bokningen har avbokats och tagits bort från kalendern'
        });
      } else {
        toast.success('Status uppdaterad', {
          description: `Bokningsstatus ändrad till ${newStatus}`
        });
      }
      
    } catch (error) {
      console.error('Error updating booking status:', error);
      toast.error('Misslyckades att uppdatera status', {
        description: 'Försök igen eller kontakta support'
      });
      
      // Reset to current status on error
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

  // Get the current status styling
  const currentStatusColors = getStatusColor(selectedStatus);
  const currentOption = statusOptions.find(opt => opt.value === selectedStatus);

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Status Selector with colored background */}
        <Select
          value={selectedStatus}
          onValueChange={handleStatusSelect}
          disabled={disabled || isUpdating}
        >
          <SelectTrigger className={`w-28 h-8 text-xs ${currentStatusColors}`}>
            <div className="flex items-center gap-1.5">
              {currentOption?.icon}
              <SelectValue placeholder="Status" />
            </div>
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-sm">
                <div className="flex items-center gap-1.5">
                  {option.icon}
                  {option.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isUpdating && (
          <div className="text-xs text-gray-500">Updating...</div>
        )}
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Bekräfta statusändring</DialogTitle>
            <DialogDescription className="text-sm pt-2">
              {pendingStatus && getConfirmationMessage(pendingStatus)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={handleCancelStatusChange}
              disabled={isUpdating}
              size="sm"
            >
              Avbryt
            </Button>
            <Button 
              onClick={handleConfirmStatusChange}
              disabled={isUpdating}
              variant={pendingStatus === 'CANCELLED' ? 'destructive' : 'default'}
              size="sm"
            >
              {isUpdating ? 'Uppdaterar...' : 'Bekräfta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default StatusChangeForm;
