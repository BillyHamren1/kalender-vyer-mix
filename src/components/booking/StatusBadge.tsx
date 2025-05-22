
import React from 'react';
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Clock, AlertTriangle, HelpCircle } from 'lucide-react';

// Define all possible status types that can come from the external system
type BookingStatus = 'CONFIRMED' | 'Confirmed' | 'confirmed' | 'CANCELLED' | 'Cancelled' | 'cancelled' | 'OFFER' | 'Offer' | 'offer' | 'PENDING' | 'Pending' | 'pending' | string;

interface StatusBadgeProps {
  status: BookingStatus;
  className?: string;
  isNew?: boolean;
  isUpdated?: boolean;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ 
  status, 
  className = '',
  isNew = false,
  isUpdated = false
}) => {
  // Base classes for the badge depending on status
  let badgeClasses = '';
  let statusText = '';
  let icon = null;

  const normalizedStatus = status?.toUpperCase() || '';

  // Handle different status values with case-insensitive comparisons
  switch (normalizedStatus) {
    case 'CONFIRMED':
      badgeClasses = 'bg-[#7BAEBF] hover:bg-[#7BAEBF]'; // Using the teal color from theme.css
      statusText = 'Confirmed';
      icon = <CheckCircle className="h-3 w-3" />;
      break;
    case 'CANCELLED':
      badgeClasses = 'bg-red-500 hover:bg-red-500';
      statusText = 'Cancelled';
      icon = <XCircle className="h-3 w-3" />;
      break;
    case 'OFFER':
      badgeClasses = 'bg-yellow-500 hover:bg-yellow-500';
      statusText = 'Offer';
      icon = <Clock className="h-3 w-3" />;
      break;
    case 'PENDING':
      badgeClasses = 'bg-gray-400 hover:bg-gray-400';
      statusText = 'Pending';
      icon = <Clock className="h-3 w-3" />;
      break;
    default:
      // If we get an unknown status, display it with warning styling
      badgeClasses = 'bg-orange-400 hover:bg-orange-400';
      statusText = status || 'Unknown';
      icon = <AlertTriangle className="h-3 w-3" />;
  }

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

  return (
    <div className="flex items-center">
      <Badge className={`flex items-center gap-1 ${badgeClasses} ${className}`}>
        {icon}
        {statusText}
      </Badge>
      {indicator}
    </div>
  );
};

export default StatusBadge;
