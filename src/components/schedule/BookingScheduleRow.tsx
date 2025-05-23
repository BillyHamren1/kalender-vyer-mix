
import React from 'react';
import { Link } from 'react-router-dom';
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from 'date-fns';
import StaffAssignmentDisplay from './StaffAssignmentDisplay';
import { MonthlyBookingSchedule } from "@/services/monthlyScheduleService";

interface BookingScheduleRowProps {
  booking: MonthlyBookingSchedule;
}

const BookingScheduleRow: React.FC<BookingScheduleRowProps> = ({ booking }) => {
  const getStatusColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'CONFIRMED':
        return 'bg-green-100 text-green-800';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'CANCELLED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getEventDate = () => {
    return booking.rigDate || booking.eventDate || booking.rigDownDate || '';
  };

  return (
    <TableRow className="hover:bg-gray-50">
      <TableCell className="font-medium">
        {getEventDate() && format(new Date(getEventDate()), 'MMM dd')}
      </TableCell>
      <TableCell>
        <Link 
          to={`/booking/${booking.bookingId}`}
          className="text-blue-600 hover:text-blue-800 hover:underline"
        >
          {booking.bookingId}
        </Link>
      </TableCell>
      <TableCell className="font-medium">{booking.client}</TableCell>
      <TableCell>
        <StaffAssignmentDisplay staff={booking.assignedStaff} />
      </TableCell>
      <TableCell>
        {booking.rigDate && (
          <div className="text-sm">
            <div>{format(new Date(booking.rigDate), 'MMM dd')}</div>
            {booking.rigTime && <div className="text-gray-500">{booking.rigTime}</div>}
          </div>
        )}
      </TableCell>
      <TableCell>
        {booking.eventDate && (
          <div className="text-sm">
            <div>{format(new Date(booking.eventDate), 'MMM dd')}</div>
            {booking.eventTime && <div className="text-gray-500">{booking.eventTime}</div>}
          </div>
        )}
      </TableCell>
      <TableCell>
        {booking.rigDownDate && (
          <div className="text-sm">
            <div>{format(new Date(booking.rigDownDate), 'MMM dd')}</div>
            {booking.rigDownTime && <div className="text-gray-500">{booking.rigDownTime}</div>}
          </div>
        )}
      </TableCell>
      <TableCell className="max-w-xs">
        <div className="truncate text-sm text-gray-600">
          {booking.internalNotes}
        </div>
      </TableCell>
      <TableCell>
        <Badge className={getStatusColor(booking.status)}>
          {booking.status}
        </Badge>
      </TableCell>
    </TableRow>
  );
};

export default BookingScheduleRow;
