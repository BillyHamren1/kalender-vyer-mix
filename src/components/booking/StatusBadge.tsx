
import React from 'react';
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Clock } from 'lucide-react';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  switch (status) {
    case 'CONFIRMED':
      return (
        <Badge className={`bg-green-500 hover:bg-green-600 flex items-center gap-1 ${className}`}>
          <CheckCircle className="h-3 w-3" />
          Confirmed
        </Badge>
      );
    case 'CANCELLED':
      return (
        <Badge className={`bg-red-500 hover:bg-red-600 flex items-center gap-1 ${className}`}>
          <XCircle className="h-3 w-3" />
          Cancelled
        </Badge>
      );
    case 'OFFER':
      return (
        <Badge className={`bg-yellow-500 hover:bg-yellow-600 flex items-center gap-1 ${className}`}>
          <Clock className="h-3 w-3" />
          Offer
        </Badge>
      );
    default:
      return (
        <Badge className={`bg-gray-400 hover:bg-gray-500 ${className}`}>
          Pending
        </Badge>
      );
  }
};

export default StatusBadge;
