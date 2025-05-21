
import React from 'react';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { History } from 'lucide-react';
import { BookingChange } from '@/types/booking';
import { Badge } from '@/components/ui/badge';

interface BookingChangesDialogProps {
  bookingId: string;
  changes: BookingChange[];
  trigger?: React.ReactNode;
}

const BookingChangesDialog: React.FC<BookingChangesDialogProps> = ({
  bookingId,
  changes,
  trigger
}) => {
  // Function to format the change type for display
  const formatChangeType = (type: string) => {
    switch (type) {
      case 'new':
        return <Badge className="bg-green-500">New</Badge>;
      case 'update':
        return <Badge className="bg-blue-500">Update</Badge>;
      case 'status_change':
        return <Badge className="bg-amber-500">Status Change</Badge>;
      case 'delete':
        return <Badge className="bg-red-500">Deleted</Badge>;
      default:
        return <Badge>{type}</Badge>;
    }
  };

  // Function to format field names for display
  const formatFieldName = (field: string) => {
    switch (field) {
      case 'client':
        return 'Client Name';
      case 'rigdaydate':
        return 'Rig Day Date';
      case 'eventdate':
        return 'Event Date';
      case 'rigdowndate':
        return 'Rig Down Date';
      case 'deliveryaddress':
        return 'Delivery Address';
      case 'delivery_city':
        return 'City';
      case 'delivery_postal_code':
        return 'Postal Code';
      case 'status':
        return 'Status';
      case 'location':
        return 'Map Location';
      case 'carry_more_than_10m':
        return 'Carry > 10m';
      case 'ground_nails_allowed':
        return 'Ground Nails';
      case 'exact_time_needed':
        return 'Exact Time Needed';
      case 'exact_time_info':
        return 'Time Info';
      case 'internalnotes':
        return 'Internal Notes';
      default:
        // Convert camelCase to Title Case
        return field
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, (str) => str.toUpperCase());
    }
  };

  // Function to format the change value for display
  const formatChangeValue = (field: string, value: any) => {
    if (value === null || value === undefined) {
      return <span className="text-gray-400">No value</span>;
    }

    // Format dates
    if (['rigdaydate', 'eventdate', 'rigdowndate', 'created_at', 'updated_at'].includes(field)) {
      try {
        return format(new Date(value), 'PPP');
      } catch (e) {
        return value;
      }
    }

    // Format booleans
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }

    // Format status
    if (field === 'status') {
      return <Badge variant={value.toLowerCase() === 'confirmed' ? 'default' : 'secondary'}>{value}</Badge>;
    }

    return String(value);
  };

  if (changes.length === 0) {
    return (
      <Dialog>
        <DialogTrigger asChild>
          {trigger || <Button variant="outline" size="sm"><History className="h-4 w-4 mr-2" /> History</Button>}
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Booking History</DialogTitle>
            <DialogDescription>
              No changes have been recorded for this booking.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger || <Button variant="outline" size="sm"><History className="h-4 w-4 mr-2" /> History ({changes.length})</Button>}
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Booking History</DialogTitle>
          <DialogDescription>
            Change history for booking {bookingId}
          </DialogDescription>
        </DialogHeader>
        
        <div className="max-h-[500px] overflow-auto">
          <Table>
            <TableCaption>A history of changes to this booking</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Changed Fields</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {changes.map((change) => (
                <TableRow key={change.id}>
                  <TableCell className="font-medium">{change.version}</TableCell>
                  <TableCell>{formatChangeType(change.changeType)}</TableCell>
                  <TableCell>{format(new Date(change.changedAt), 'PPP p')}</TableCell>
                  <TableCell>
                    {change.changedFields.length === 0 ? (
                      <span className="text-gray-400">No fields changed</span>
                    ) : change.changedFields.map((field) => (
                      <Badge key={field} variant="outline" className="mr-1 mb-1">
                        {formatFieldName(field)}
                      </Badge>
                    ))}
                  </TableCell>
                  <TableCell>
                    {change.changeType === 'status_change' && change.previousValues?.status && (
                      <div className="text-sm">
                        Status changed from{' '}
                        <Badge variant="outline">{change.previousValues.status}</Badge>{' '}
                        to{' '}
                        <Badge>{change.newValues?.status}</Badge>
                      </div>
                    )}
                    
                    {change.changeType === 'update' && change.changedFields.map(field => (
                      <div key={field} className="text-sm mb-1">
                        <span className="font-medium">{formatFieldName(field)}:</span>{' '}
                        {formatChangeValue(field, change.previousValues?.[field])} →{' '}
                        {formatChangeValue(field, change.newValues?.[field])}
                      </div>
                    ))}
                    
                    {change.changeType === 'new' && (
                      <span className="text-sm text-green-600">New booking created</span>
                    )}
                    
                    {change.changeType === 'delete' && (
                      <span className="text-sm text-red-600">Booking was deleted</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BookingChangesDialog;
