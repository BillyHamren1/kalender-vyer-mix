
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  XCircle, 
  HelpCircle 
} from 'lucide-react';
import { toast } from 'sonner';
import { markBookingAsViewed } from '@/services/bookingService';
import CancelledBookingDialog from './CancelledBookingDialog';

export interface StatusBadgeProps {
  status: string;
  viewed?: boolean;
  bookingId?: string;
  clientName?: string;
  onStatusUpdate?: () => void;
  isNew?: boolean;
  isUpdated?: boolean;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ 
  status, 
  viewed = false, 
  bookingId = '', 
  clientName = '',
  onStatusUpdate,
  isNew,
  isUpdated
}) => {
  let color = 'bg-gray-500';
  let icon = <HelpCircle className="h-3.5 w-3.5 mr-1" />;
  let label = status;
  
  // Normalize status to lower case for comparison
  const statusLower = status.toLowerCase();
  
  if (statusLower === 'confirmed') {
    color = 'bg-green-500';
    icon = <CheckCircle className="h-3.5 w-3.5 mr-1" />;
  } else if (statusLower === 'pending') {
    color = 'bg-amber-500';
    icon = <Clock className="h-3.5 w-3.5 mr-1" />;
  } else if (statusLower === 'cancelled') {
    color = 'bg-red-500';
    icon = <XCircle className="h-3.5 w-3.5 mr-1" />;
  } else if (statusLower === 'problem') {
    color = 'bg-orange-500';
    icon = <AlertTriangle className="h-3.5 w-3.5 mr-1" />;
  }
  
  const handleViewedClick = async () => {
    try {
      await markBookingAsViewed(bookingId);
      toast.success('Booking marked as viewed');
      
      // If this is a cancelled booking that was just deleted, we should
      // refresh the page or navigate away since the booking no longer exists
      if (statusLower === 'cancelled') {
        toast.info('Cancelled booking has been deleted');
        
        // Trigger the parent component's update handler if provided
        if (onStatusUpdate) {
          onStatusUpdate();
        }
        
        // Redirect to the bookings list after a short delay
        setTimeout(() => {
          window.location.href = '/bookings';
        }, 1500);
      } else if (onStatusUpdate) {
        onStatusUpdate();
      }
    } catch (error) {
      console.error('Error marking booking as viewed:', error);
      toast.error('Failed to update booking status');
    }
  };
  
  return (
    <div className="flex items-center gap-2">
      <Badge 
        className={`${color} text-white capitalize py-1 ${isNew ? 'animate-pulse' : ''} ${isUpdated ? 'ring-2 ring-blue-300' : ''}`}
      >
        <div className="flex items-center">
          {icon}
          {label}
        </div>
      </Badge>
      
      {!viewed && bookingId && clientName && (
        statusLower === 'cancelled' ? (
          <CancelledBookingDialog 
            bookingId={bookingId}
            clientName={clientName}
            onConfirm={handleViewedClick}
          />
        ) : (
          <Badge 
            className="bg-blue-500 text-white cursor-pointer"
            onClick={handleViewedClick}
          >
            New
          </Badge>
        )
      )}
    </div>
  );
};

export default StatusBadge;
