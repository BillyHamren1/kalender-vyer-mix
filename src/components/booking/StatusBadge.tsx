
import React from 'react';
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';

// Define all possible status types that can come from the external system
type BookingStatus = 'CONFIRMED' | 'Confirmed' | 'confirmed' | 'CANCELLED' | 'Cancelled' | 'cancelled' | 'OFFER' | 'Offer' | 'offer' | string;

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
  let badgeClasses = '';

  const normalizedStatus = status?.toUpperCase() || '';

  // Handle different status values with case-insensitive comparisons
  switch (normalizedStatus) {
    case 'CONFIRMED':
      statusText = 'Confirmed';
      icon = <CheckCircle className="h-3 w-3" />;
      badgeClasses = 'bg-gray-50 text-gray-500 hover:bg-gray-50 border border-gray-200';
      break;
    case 'CANCELLED':
      statusText = 'Cancelled';
      icon = <XCircle className="h-3 w-3" />;
      badgeClasses = 'bg-red-100 text-red-700 hover:bg-red-100 border-red-200';
      break;
    case 'OFFER':
      statusText = 'Offer';
      icon = <Clock className="h-3 w-3" />;
      badgeClasses = 'bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200';
      break;
    default:
      // If we get an unknown status, display it with warning styling
      statusText = status || 'Unknown';
      icon = <AlertTriangle className="h-3 w-3" />;
      badgeClasses = 'bg-orange-100 text-orange-700 hover:bg-orange-100 border-orange-200';
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
