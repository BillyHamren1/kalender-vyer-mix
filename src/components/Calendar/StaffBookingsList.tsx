
import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Clock, Users, Calendar, MapPin, Search, Filter, FileDown } from 'lucide-react';
import { format, differenceInHours } from 'date-fns';
import { CalendarEvent, Resource } from './ResourceData';

interface StaffAssignment {
  staffId: string;
  staffName: string;
  eventType: string;
  startTime: string;
  endTime: string;
  duration: number;
  color?: string;
}

interface BookingWithStaff {
  bookingId: string;
  client: string;
  bookingNumber?: string;
  date: string;
  deliveryAddress?: string;
  staffAssignments: StaffAssignment[];
  totalStaffHours: number;
  eventTypes: string[];
}

interface StaffBookingsListProps {
  events: CalendarEvent[];
  resources: Resource[];
  currentDate: Date;
  weeklyStaffOperations?: {
    getStaffForTeamAndDate: (teamId: string, date: Date) => Array<{id: string, name: string, color?: string}>;
  };
}

const StaffBookingsList: React.FC<StaffBookingsListProps> = ({
  events,
  resources,
  currentDate,
  weeklyStaffOperations
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEventType, setSelectedEventType] = useState<string>('all');
  const [selectedStaff, setSelectedStaff] = useState<string>('all');

  // Extract client name from event title
  const extractClientName = (title: string): string => {
    return title.replace(/^#?\d{4}-\d+\s*-\s*/, '').trim() || 'Unknown Client';
  };

  // Get event type display name
  const getEventTypeDisplayName = (eventType: string): string => {
    switch (eventType) {
      case 'rig': return 'Rig Setup';
      case 'event': return 'Event';
      case 'rigDown': return 'Rig Down';
      default: return 'Work';
    }
  };

  // Get event type color
  const getEventTypeColor = (eventType: string): string => {
    switch (eventType) {
      case 'rig': return 'bg-green-100 text-green-800';
      case 'event': return 'bg-yellow-100 text-yellow-800';
      case 'rigDown': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Process events into bookings with staff assignments
  const bookingsWithStaff = useMemo(() => {
    const bookingMap = new Map<string, BookingWithStaff>();

    events.forEach(event => {
      if (!event.extendedProps?.bookingId && !event.id.includes('booking')) return;

      const bookingId = event.extendedProps?.bookingId || event.id;
      const client = extractClientName(event.title);
      const eventDate = format(new Date(event.start), 'yyyy-MM-dd');
      const eventType = event.extendedProps?.eventType || 'event';

      // Get staff assigned to this team for this date
      const assignedStaff = weeklyStaffOperations?.getStaffForTeamAndDate(
        event.resourceId, 
        new Date(event.start)
      ) || [];

      if (!bookingMap.has(bookingId)) {
        bookingMap.set(bookingId, {
          bookingId,
          client,
          bookingNumber: event.extendedProps?.bookingNumber,
          date: eventDate,
          deliveryAddress: event.extendedProps?.deliveryAddress,
          staffAssignments: [],
          totalStaffHours: 0,
          eventTypes: []
        });
      }

      const booking = bookingMap.get(bookingId)!;

      // Add staff assignments for this event
      assignedStaff.forEach(staff => {
        const duration = differenceInHours(new Date(event.end), new Date(event.start));
        
        const assignment: StaffAssignment = {
          staffId: staff.id,
          staffName: staff.name,
          eventType,
          startTime: event.start,
          endTime: event.end,
          duration,
          color: staff.color
        };

        booking.staffAssignments.push(assignment);
        booking.totalStaffHours += duration;
      });

      // Track event types
      if (!booking.eventTypes.includes(eventType)) {
        booking.eventTypes.push(eventType);
      }
    });

    return Array.from(bookingMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [events, weeklyStaffOperations]);

  // Get unique staff members for filter
  const allStaff = useMemo(() => {
    const staffSet = new Set<string>();
    bookingsWithStaff.forEach(booking => {
      booking.staffAssignments.forEach(assignment => {
        staffSet.add(`${assignment.staffId}:${assignment.staffName}`);
      });
    });
    return Array.from(staffSet).map(staff => {
      const [id, name] = staff.split(':');
      return { id, name };
    });
  }, [bookingsWithStaff]);

  // Filter bookings based on search and filters
  const filteredBookings = useMemo(() => {
    return bookingsWithStaff.filter(booking => {
      // Search filter
      if (searchTerm && !booking.client.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }

      // Event type filter
      if (selectedEventType !== 'all' && !booking.eventTypes.includes(selectedEventType)) {
        return false;
      }

      // Staff filter
      if (selectedStaff !== 'all') {
        const hasStaff = booking.staffAssignments.some(assignment => 
          assignment.staffId === selectedStaff
        );
        if (!hasStaff) return false;
      }

      return true;
    });
  }, [bookingsWithStaff, searchTerm, selectedEventType, selectedStaff]);

  // Calculate summary statistics
  const totalBookings = filteredBookings.length;
  const totalStaffHours = filteredBookings.reduce((sum, booking) => sum + booking.totalStaffHours, 0);
  const unassignedBookings = filteredBookings.filter(booking => booking.staffAssignments.length === 0).length;

  return (
    <div className="space-y-4">
      {/* Header with filters */}
      <Card>
        <CardHeader>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Staff Assignments Overview</CardTitle>
              <div className="flex gap-4 text-sm text-gray-600 mt-2">
                <span>{totalBookings} bookings</span>
                <span>{totalStaffHours}h total</span>
                {unassignedBookings > 0 && (
                  <span className="text-red-600">{unassignedBookings} unassigned</span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <FileDown className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by client name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <select
                value={selectedEventType}
                onChange={(e) => setSelectedEventType(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="all">All Event Types</option>
                <option value="rig">Rig Setup</option>
                <option value="event">Event</option>
                <option value="rigDown">Rig Down</option>
              </select>
              <select
                value={selectedStaff}
                onChange={(e) => setSelectedStaff(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="all">All Staff</option>
                {allStaff.map(staff => (
                  <option key={staff.id} value={staff.id}>{staff.name}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bookings list */}
      <div className="space-y-4">
        {filteredBookings.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8 text-gray-500">
              No bookings found matching the current filters
            </CardContent>
          </Card>
        ) : (
          filteredBookings.map((booking) => (
            <Card key={booking.bookingId} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{booking.client}</h3>
                    <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        <span>{format(new Date(booking.date), 'MMM d, yyyy')}</span>
                      </div>
                      {booking.bookingNumber && (
                        <span>#{booking.bookingNumber}</span>
                      )}
                      {booking.deliveryAddress && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-4 w-4" />
                          <span className="truncate max-w-xs">{booking.deliveryAddress}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {booking.staffAssignments.length} staff
                    </Badge>
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {booking.totalStaffHours}h
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {booking.staffAssignments.length === 0 ? (
                  <div className="text-center py-4 text-red-600">
                    ⚠️ No staff assigned to this booking
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Group staff assignments by event type */}
                    {booking.eventTypes.map(eventType => {
                      const eventAssignments = booking.staffAssignments.filter(
                        assignment => assignment.eventType === eventType
                      );
                      
                      if (eventAssignments.length === 0) return null;

                      return (
                        <div key={eventType} className="border-l-4 border-gray-200 pl-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className={getEventTypeColor(eventType)}>
                              {getEventTypeDisplayName(eventType)}
                            </Badge>
                            <span className="text-sm text-gray-500">
                              {eventAssignments.length} staff member{eventAssignments.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                            {eventAssignments.map((assignment, index) => (
                              <div 
                                key={`${assignment.staffId}-${eventType}-${index}`}
                                className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm"
                                style={{ borderLeft: `3px solid ${assignment.color || '#E3F2FD'}` }}
                              >
                                <div>
                                  <div className="font-medium">{assignment.staffName}</div>
                                  <div className="text-gray-500">
                                    {format(new Date(assignment.startTime), 'HH:mm')} - {format(new Date(assignment.endTime), 'HH:mm')}
                                  </div>
                                </div>
                                <Badge variant="secondary" className="ml-2">
                                  {assignment.duration}h
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default StaffBookingsList;
