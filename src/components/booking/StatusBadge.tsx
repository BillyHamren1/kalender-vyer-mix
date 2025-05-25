
import React from 'react';
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { getStatusColor } from '@/services/booking/bookingStatusService';

// Define all possible status types that can come from the external system
type BookingStatus = 'CONFIRMED' | 'Confirmed' | 'confirmed' | 'CANCELLED' | 'Cancelled' | 'cancelled' | 'OFFER' | 'Offer' | 'offer' | 'PENDING' | 'Pending' | 'pending' | string;

interface StatusBadgeProps {
  status: BookingStatus;
  className?: string;
  isNew?: boolean;
  isUpdated?: boolean;
  interactive?: boolean;
  onClick?: () => void;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ 
  status, 
  className = '',
  isNew = false,
  isUpdated = false,
  interactive = false,
  onClick
}) => {
  // Base classes for the badge depending on status
  let statusText = '';
  let icon = null;

  const normalizedStatus = status?.toUpperCase() || '';

  // Handle different status values with case-insensitive comparisons
  switch (normalizedStatus) {
    case 'CONFIRMED':
      statusText = 'Confirmed';
      icon = <CheckCircle className="h-3 w-3" />;
      break;
    case 'CANCELLED':
      statusText = 'Cancelled';
      icon = <XCircle className="h-3 w-3" />;
      break;
    case 'OFFER':
      statusText = 'Offer';
      icon = <Clock className="h-3 w-3" />;
      break;
    case 'PENDING':
      statusText = 'Pending';
      icon = <Clock className="h-3 w-3" />;
      break;
    default:
      // If we get an unknown status, display it with warning styling
      statusText = status || 'Unknown';
      icon = <AlertTriangle className="h-3 w-3" />;
  }

  // Get color from the service
  const badgeClasses = getStatusColor(normalizedStatus as any);

  // Add indicator for new or updated status
  const indicator = isNew ? (
    <Badge className="ml-1 px-1 py-0 text-[0.6rem] bg-blue-500 hover:bg-blue-500">
      New
    </Badge>
  ) : isUpdated ? (
    <Badge className="ml-1 px-1 py-0 text-[0.6rem] bg-purple-500 hover:bg-purple-500">
      Updated
    </Badge>
  ) : null;

  const handleClick = () => {
    if (interactive && onClick) {
      onClick();
    }
  };

  return (
    <div className="flex items-center">
      <Badge 
        className={`flex items-center gap-1 ${badgeClasses} ${className} ${interactive ? 'cursor-pointer hover:opacity-80' : ''}`}
        onClick={handleClick}
      >
        {icon}
        {statusText}
      </Badge>
      {indicator}
    </div>
  );
};

export default StatusBadge;
