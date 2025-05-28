
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Users, MapPin, Calendar } from 'lucide-react';
import { format, differenceInHours } from 'date-fns';

interface StaffCalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  resourceId: string;
  teamId?: string;
  teamName?: string;
  staffName?: string;
  bookingId?: string;
  eventType: 'assignment' | 'booking_event';
  backgroundColor?: string;
  borderColor?: string;
  client?: string;
  extendedProps?: {
    bookingId?: string;
    booking_id?: string;
    deliveryAddress?: string;
    bookingNumber?: string;
    eventType?: string;
    staffName?: string;
    client?: string;
    teamName?: string;
  };
}

interface StaffResource {
  id: string;
  title: string;
  name: string;
  email?: string;
}

interface JobSummaryListProps {
  events: StaffCalendarEvent[];
  staffResources: StaffResource[];
  selectedClients: string[];
  currentDate: Date;
  viewMode: 'day' | 'week' | 'month';
}

interface JobSummary {
  client: string;
  jobTitle: string;
  date: string;
  staffMembers: string[];
  totalHours: number;
  events: StaffCalendarEvent[];
  bookingId?: string;
  bookingNumber?: string;
}

const JobSummaryList: React.FC<JobSummaryListProps> = ({
  events,
  staffResources,
  selectedClients,
  currentDate,
  viewMode
}) => {
  // Helper function to extract clean client name from title
  const extractClientName = (title: string): string => {
    // Remove booking ID pattern like "#2025-123 - " or "999149e3-abd5-4199-ae51-cae5c62a0173: "
    const cleanTitle = title
      .replace(/^#?\d{4}-\d+\s*-\s*/, '') // Remove "#2025-123 - "
      .replace(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}:\s*/, '') // Remove UUID pattern
      .trim();
    
    return cleanTitle || 'Unknown Client';
  };

  // Helper function to get staff name with fallback
  const getStaffName = (event: StaffCalendarEvent): string => {
    // First try extendedProps.staffName
    if (event.extendedProps?.staffName) {
      return event.extendedProps.staffName;
    }
    
    // Then try staffName property
    if (event.staffName) {
      return event.staffName;
    }
    
    // Look up in staffResources by resourceId
    const staffResource = staffResources.find(s => s.id === event.resourceId);
    if (staffResource) {
      return staffResource.name;
    }
    
    // Final fallback
    return `Staff Member`;
  };

  // Helper function to get booking number from event
  const getBookingNumber = (event: StaffCalendarEvent): string | undefined => {
    // Try extendedProps.bookingNumber first
    if (event.extendedProps?.bookingNumber) {
      return event.extendedProps.bookingNumber;
    }
    
    // Extract from title if it has a booking number pattern
    const bookingNumberMatch = event.title.match(/^#?(\d{4}-\d+)/);
    if (bookingNumberMatch) {
      return bookingNumberMatch[1];
    }
    
    return undefined;
  };

  // Helper function to get event type display name
  const getEventTypeDisplayName = (event: StaffCalendarEvent): string => {
    const eventType = event.extendedProps?.eventType || event.eventType;
    
    switch (eventType) {
      case 'rig':
        return 'Rig Setup';
      case 'event':
        return 'Event';
      case 'rigDown':
        return 'Rig Down';
      case 'booking_event':
        return 'Booking Event';
      default:
        return 'Work Assignment';
    }
  };

  // Filter and group events by job/client
  const filteredEvents = events.filter(event => {
    if (selectedClients.length === 0) return true;
    const clientName = extractClientName(event.title);
    return selectedClients.some(client => 
      clientName.toLowerCase().includes(client.toLowerCase())
    );
  });

  // Group events into job summaries
  const jobSummaries: JobSummary[] = [];
  const groupedEvents = new Map<string, StaffCalendarEvent[]>();

  filteredEvents.forEach(event => {
    const bookingId = event.bookingId || event.extendedProps?.bookingId || event.extendedProps?.booking_id;
    const eventDate = format(new Date(event.start), 'yyyy-MM-dd');
    const key = bookingId ? `${bookingId}-${eventDate}` : `${event.title}-${eventDate}`;
    
    if (!groupedEvents.has(key)) {
      groupedEvents.set(key, []);
    }
    groupedEvents.get(key)?.push(event);
  });

  groupedEvents.forEach((eventGroup, key) => {
    const firstEvent = eventGroup[0];
    const client = extractClientName(firstEvent.title);
    const bookingId = firstEvent.bookingId || firstEvent.extendedProps?.bookingId || firstEvent.extendedProps?.booking_id;
    const bookingNumber = getBookingNumber(firstEvent);
    
    // Create a clean job title
    const jobTitle = client;
    
    // Get unique staff members for this job
    const staffNames = [...new Set(eventGroup.map(e => getStaffName(e)))];

    // Calculate total hours
    const totalHours = eventGroup.reduce((total, event) => {
      const start = new Date(event.start);
      const end = new Date(event.end);
      return total + differenceInHours(end, start);
    }, 0);

    jobSummaries.push({
      client,
      jobTitle,
      date: format(new Date(firstEvent.start), 'MMM d, yyyy'),
      staffMembers: staffNames,
      totalHours,
      events: eventGroup,
      bookingId,
      bookingNumber
    });
  });

  // Sort by date
  jobSummaries.sort((a, b) => new Date(a.events[0].start).getTime() - new Date(b.events[0].start).getTime());

  // Calculate summary statistics
  const totalJobs = jobSummaries.length;
  const totalStaffHours = jobSummaries.reduce((total, job) => total + job.totalHours, 0);
  const uniqueStaff = new Set(jobSummaries.flatMap(job => job.staffMembers));

  return (
    <div className="space-y-4">
      {/* Job List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Jobs & Assignments</CardTitle>
        </CardHeader>
        <CardContent>
          {jobSummaries.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No jobs found for the selected criteria
            </div>
          ) : (
            <div className="space-y-4">
              {jobSummaries.map((job, index) => (
                <div key={`${job.bookingId || job.jobTitle}-${job.date}-${index}`} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">{job.client}</h3>
                      {job.bookingNumber ? (
                        <p className="text-xs text-gray-500">Booking: #{job.bookingNumber}</p>
                      ) : job.bookingId ? (
                        <p className="text-xs text-gray-500">Booking ID: {job.bookingId}</p>
                      ) : null}
                    </div>
                    <Badge variant="outline" className="ml-2">
                      {job.totalHours}h total
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="flex items-center space-x-2">
                      <Calendar className="h-4 w-4 text-gray-500" />
                      <span>{job.date}</span>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Users className="h-4 w-4 text-gray-500" />
                      <span>{job.staffMembers.length} staff</span>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Clock className="h-4 w-4 text-gray-500" />
                      <span>{job.events.length} events</span>
                    </div>
                  </div>

                  {/* Staff assignments */}
                  <div className="mt-3">
                    <div className="text-xs text-gray-500 mb-1">Assigned Staff:</div>
                    <div className="flex flex-wrap gap-1">
                      {job.staffMembers.map((staff, idx) => (
                        <Badge key={`${staff}-${idx}`} variant="secondary" className="text-xs">
                          {staff}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Event breakdown */}
                  <div className="mt-3">
                    <div className="text-xs text-gray-500 mb-1">Events:</div>
                    <div className="space-y-1">
                      {job.events.map(event => {
                        const duration = differenceInHours(new Date(event.end), new Date(event.start));
                        const staffName = getStaffName(event);
                        const eventTypeName = getEventTypeDisplayName(event);
                        
                        return (
                          <div key={event.id} className="text-xs bg-gray-50 p-2 rounded flex justify-between">
                            <span>{staffName} - {eventTypeName}</span>
                            <span>{format(new Date(event.start), 'HH:mm')} - {format(new Date(event.end), 'HH:mm')} ({duration}h)</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default JobSummaryList;
