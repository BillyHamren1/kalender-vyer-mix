
import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Clock, Users, Calendar, MapPin, Search, Filter, FileDown, ChevronDown, ChevronUp, RefreshCcw } from 'lucide-react';
import { format, differenceInHours, isWithinInterval, parseISO } from 'date-fns';
import { CalendarEvent, Resource } from './ResourceData';
import StatusChangeForm from '@/components/booking/StatusChangeForm';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface StaffAssignment {
  staffId: string;
  staffName: string;
  eventType: string;
  startTime: string;
  endTime: string;
  duration: number;
  color?: string;
}

interface EventRow {
  bookingId: string;
  bookingNumber?: string;
  client: string;
  date: string;
  eventType: string;
  staffAssignments: StaffAssignment[];
  status?: string;
  originalBookingData?: any;
  deliveryAddress?: string;
}

interface StaffBookingsListProps {
  events: CalendarEvent[];
  resources: Resource[];
  currentDate: Date;
  weeklyStaffOperations?: {
    getStaffForTeamAndDate: (teamId: string, date: Date) => Array<{id: string, name: string, color?: string}>;
  };
  backgroundImport?: {
    isImporting: boolean;
    lastSyncTime: string | null;
    syncStatus: string | null;
    performManualRefresh: () => Promise<any>;
    updateSyncStatus: () => Promise<void>;
  };
}

const StaffBookingsList: React.FC<StaffBookingsListProps> = ({
  events,
  resources,
  currentDate,
  weeklyStaffOperations,
  backgroundImport
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEventType, setSelectedEventType] = useState<string>('all');
  const [selectedStaff, setSelectedStaff] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const queryClient = useQueryClient();

  // Fetch booking data to get status information
  const { data: bookingsData = [] } = useQuery({
    queryKey: ['bookings-for-status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('id, status, client, booking_number, deliveryaddress')
        .not('status', 'is', null);
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 30000,
  });

  // Handle manual refresh
  const handleManualRefresh = async () => {
    if (!backgroundImport) {
      toast.error('Refresh functionality not available');
      return;
    }

    try {
      const result = await backgroundImport.performManualRefresh();
      if (result.success) {
        toast.success('Bookings refreshed successfully');
      } else {
        toast.error('Failed to refresh bookings');
      }
    } catch (error) {
      console.error('Manual refresh failed:', error);
      toast.error('Failed to refresh bookings');
    }
  };

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

  // Get event type color classes
  const getEventTypeColorClasses = (eventType: string): string => {
    switch (eventType) {
      case 'rig': return 'bg-green-50 text-green-800 border-l-4 border-green-500';
      case 'event': return 'bg-yellow-50 text-yellow-800 border-l-4 border-yellow-500';
      case 'rigDown': return 'bg-red-50 text-red-800 border-l-4 border-red-500';
      default: return 'bg-gray-50 text-gray-800 border-l-4 border-gray-500';
    }
  };

  // Get event type badge color
  const getEventTypeBadgeColor = (eventType: string): string => {
    switch (eventType) {
      case 'rig': return 'bg-green-500 text-white';
      case 'event': return 'bg-yellow-500 text-white';
      case 'rigDown': return 'bg-red-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  // Process events into individual event rows
  const eventRows = useMemo(() => {
    const rows: EventRow[] = [];

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

      // Find booking data for status
      const bookingData = bookingsData.find(b => b.id === bookingId);

      // Create staff assignments for this event
      const staffAssignments: StaffAssignment[] = assignedStaff.map(staff => {
        const duration = differenceInHours(new Date(event.end), new Date(event.start));
        
        return {
          staffId: staff.id,
          staffName: staff.name,
          eventType,
          startTime: event.start,
          endTime: event.end,
          duration,
          color: staff.color
        };
      });

      // Create a row for this specific event
      rows.push({
        bookingId,
        bookingNumber: event.extendedProps?.bookingNumber || bookingData?.booking_number,
        client,
        date: eventDate,
        eventType,
        staffAssignments,
        status: bookingData?.status || 'PENDING',
        originalBookingData: bookingData,
        deliveryAddress: event.extendedProps?.deliveryAddress || bookingData?.deliveryaddress
      });
    });

    return rows.sort((a, b) => {
      // Sort by date first, then by event type priority (rig, event, rigDown)
      const dateComparison = a.date.localeCompare(b.date);
      if (dateComparison !== 0) return dateComparison;
      
      const eventTypeOrder = { 'rig': 1, 'event': 2, 'rigDown': 3 };
      const aOrder = eventTypeOrder[a.eventType as keyof typeof eventTypeOrder] || 4;
      const bOrder = eventTypeOrder[b.eventType as keyof typeof eventTypeOrder] || 4;
      return aOrder - bOrder;
    });
  }, [events, weeklyStaffOperations, bookingsData]);

  // Get unique staff members for filter
  const allStaff = useMemo(() => {
    const staffSet = new Set<string>();
    eventRows.forEach(row => {
      row.staffAssignments.forEach(assignment => {
        staffSet.add(`${assignment.staffId}:${assignment.staffName}`);
      });
    });
    return Array.from(staffSet).map(staff => {
      const [id, name] = staff.split(':');
      return { id, name };
    });
  }, [eventRows]);

  // Filter event rows based on search and filters
  const filteredRows = useMemo(() => {
    return eventRows.filter(row => {
      // Search filter
      if (searchTerm && !row.client.toLowerCase().includes(searchTerm.toLowerCase()) && 
          !(row.bookingNumber && row.bookingNumber.toLowerCase().includes(searchTerm.toLowerCase()))) {
        return false;
      }

      // Event type filter
      if (selectedEventType !== 'all' && row.eventType !== selectedEventType) {
        return false;
      }

      // Staff filter
      if (selectedStaff !== 'all') {
        const hasStaff = row.staffAssignments.some(assignment => 
          assignment.staffId === selectedStaff
        );
        if (!hasStaff) return false;
      }

      // Status filter
      if (selectedStatus !== 'all' && row.status !== selectedStatus) {
        return false;
      }

      // Date range filter
      if (dateFrom || dateTo) {
        const rowDate = parseISO(row.date);
        
        if (dateFrom && rowDate < parseISO(dateFrom)) {
          return false;
        }
        
        if (dateTo && rowDate > parseISO(dateTo)) {
          return false;
        }
      }

      return true;
    });
  }, [eventRows, searchTerm, selectedEventType, selectedStaff, selectedStatus, dateFrom, dateTo]);

  // Calculate summary statistics
  const totalRows = filteredRows.length;
  const totalStaffHours = filteredRows.reduce((sum, row) => 
    sum + row.staffAssignments.reduce((rowSum, assignment) => rowSum + assignment.duration, 0), 0
  );
  const unassignedRows = filteredRows.filter(row => row.staffAssignments.length === 0).length;

  // Handle status change
  const handleStatusChange = async (bookingId: string, newStatus: string) => {
    // Refresh the bookings data to get updated status
    await queryClient.invalidateQueries({ queryKey: ['bookings-for-status'] });
  };

  // Clear all filters
  const clearFilters = () => {
    setSearchTerm('');
    setSelectedEventType('all');
    setSelectedStaff('all');
    setSelectedStatus('all');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <div className="space-y-4">
      {/* Header with filters */}
      <Card>
        <CardHeader>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Staff Assignments Overview</CardTitle>
              <div className="flex gap-4 text-sm text-gray-600 mt-2">
                <span>{totalRows} events</span>
                <span>{totalStaffHours}h total</span>
                {unassignedRows > 0 && (
                  <span className="text-red-600">{unassignedRows} unassigned</span>
                )}
                {backgroundImport?.lastSyncTime && (
                  <span className="text-blue-600">
                    Last sync: {format(new Date(backgroundImport.lastSyncTime), 'HH:mm')}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {backgroundImport && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleManualRefresh}
                  disabled={backgroundImport.isImporting}
                  className="flex items-center gap-2"
                >
                  <RefreshCcw className={`h-4 w-4 ${backgroundImport.isImporting ? 'animate-spin' : ''}`} />
                  {backgroundImport.isImporting ? 'Refreshing...' : 'Refresh'}
                </Button>
              )}
              <Button variant="outline" size="sm">
                <FileDown className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Basic Filters */}
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by client name or booking number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="all">All Statuses</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="OFFER">Offer</option>
                <option value="PENDING">Pending</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="flex items-center gap-2"
              >
                <Filter className="h-4 w-4" />
                Filters
                {showAdvancedFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Advanced Filters */}
          {showAdvancedFilters && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Event Type</label>
                  <select
                    value={selectedEventType}
                    onChange={(e) => setSelectedEventType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="all">All Event Types</option>
                    <option value="rig">Rig Setup</option>
                    <option value="event">Event</option>
                    <option value="rigDown">Rig Down</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Staff Member</label>
                  <select
                    value={selectedStaff}
                    onChange={(e) => setSelectedStaff(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="all">All Staff</option>
                    {allStaff.map(staff => (
                      <option key={staff.id} value={staff.id}>{staff.name}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="text-sm"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="text-sm"
                  />
                </div>
              </div>
              
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear All Filters
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {filteredRows.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No events found matching the current filters
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Booking #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="w-32">Date</TableHead>
                  <TableHead className="w-32">Event Type</TableHead>
                  <TableHead>Staff Assigned</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row, index) => (
                  <TableRow 
                    key={`${row.bookingId}-${row.eventType}-${index}`}
                    className={`${getEventTypeColorClasses(row.eventType)} hover:opacity-80 transition-opacity`}
                  >
                    <TableCell className="font-medium">
                      {row.bookingNumber ? `#${row.bookingNumber}` : '-'}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{row.client}</div>
                        {row.deliveryAddress && (
                          <div className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                            <MapPin className="h-3 w-3" />
                            <span className="truncate max-w-xs">{row.deliveryAddress}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {format(new Date(row.date), 'MMM d, yyyy')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={`${getEventTypeBadgeColor(row.eventType)} border-0`}>
                        {getEventTypeDisplayName(row.eventType)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {row.staffAssignments.length === 0 ? (
                        <span className="text-red-600 text-sm">⚠️ No staff assigned</span>
                      ) : (
                        <div className="space-y-1">
                          {row.staffAssignments.map((assignment, staffIndex) => (
                            <div 
                              key={`${assignment.staffId}-${staffIndex}`}
                              className="flex items-center justify-between text-sm bg-white/50 rounded px-2 py-1"
                              style={{ borderLeft: `3px solid ${assignment.color || '#E3F2FD'}` }}
                            >
                              <span className="font-medium">{assignment.staffName}</span>
                              <div className="flex items-center gap-2 text-xs text-gray-600">
                                <span>{format(new Date(assignment.startTime), 'HH:mm')} - {format(new Date(assignment.endTime), 'HH:mm')}</span>
                                <Badge variant="secondary" className="text-xs">
                                  {assignment.duration}h
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.originalBookingData && (
                        <StatusChangeForm
                          currentStatus={row.status || 'PENDING'}
                          bookingId={row.bookingId}
                          onStatusChange={(newStatus) => handleStatusChange(row.bookingId, newStatus)}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StaffBookingsList;
