
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Users, MapPin, Calendar } from 'lucide-react';
import { StaffCalendarEvent, StaffResource } from '@/services/staffCalendarService';
import { format, differenceInHours } from 'date-fns';

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
  bookingNumber: string;
  date: string;
  staffMembers: string[];
  totalHours: number;
  events: StaffCalendarEvent[];
  teamName?: string;
}

const JobSummaryList: React.FC<JobSummaryListProps> = ({
  events,
  staffResources,
  selectedClients,
  currentDate,
  viewMode
}) => {
  // Filter and group events by job/client
  const filteredEvents = events.filter(event => {
    if (selectedClients.length === 0) return true;
    return selectedClients.some(client => 
      (event.client && event.client.toLowerCase().includes(client.toLowerCase())) ||
      event.title.toLowerCase().includes(client.toLowerCase())
    );
  });

  // Group events into job summaries
  const jobSummaries: JobSummary[] = [];
  const groupedEvents = new Map<string, StaffCalendarEvent[]>();

  filteredEvents.forEach(event => {
    const bookingId = event.bookingId || event.extendedProps?.bookingId || '';
    const key = `${bookingId}-${format(new Date(event.start), 'yyyy-MM-dd')}`;
    if (!groupedEvents.has(key)) {
      groupedEvents.set(key, []);
    }
    groupedEvents.get(key)?.push(event);
  });

  groupedEvents.forEach((eventGroup, key) => {
    const firstEvent = eventGroup[0];
    const client = firstEvent.client || firstEvent.extendedProps?.client || 'Unknown Client';
    const bookingNumber = firstEvent.extendedProps?.bookingNumber || firstEvent.bookingId || 'No ID';
    const jobTitle = firstEvent.title;
    
    // Get unique staff members for this job with proper names
    const staffIds = [...new Set(eventGroup.map(e => e.resourceId))];
    const staffNames = staffIds.map(id => {
      // First try to get the name from the event itself
      const eventWithStaff = eventGroup.find(e => e.resourceId === id);
      if (eventWithStaff?.staffName) {
        return eventWithStaff.staffName;
      }
      // Fallback to staff resources
      return staffResources.find(s => s.id === id)?.name || `Staff-${id}`;
    });

    // Calculate total hours
    const totalHours = eventGroup.reduce((total, event) => {
      const start = new Date(event.start);
      const end = new Date(event.end);
      return total + differenceInHours(end, start);
    }, 0);

    jobSummaries.push({
      client,
      jobTitle,
      bookingNumber,
      date: format(new Date(firstEvent.start), 'MMM d, yyyy'),
      staffMembers: staffNames,
      totalHours,
      events: eventGroup,
      teamName: firstEvent.teamName || firstEvent.extendedProps?.teamName
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
      {/* Summary Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{totalJobs}</div>
              <div className="text-sm text-gray-600">Total Jobs</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{totalStaffHours}h</div>
              <div className="text-sm text-gray-600">Staff Hours</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{uniqueStaff.size}</div>
              <div className="text-sm text-gray-600">Staff Members</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {totalStaffHours > 0 ? Math.round(totalStaffHours / uniqueStaff.size) : 0}h
              </div>
              <div className="text-sm text-gray-600">Avg Hours/Staff</div>
            </div>
          </div>
        </CardContent>
      </Card>

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
                <div key={`${job.bookingNumber}-${job.date}-${index}`} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-lg text-gray-900">{job.client}</h3>
                      <p className="text-sm text-gray-600">#{job.bookingNumber}</p>
                      {job.teamName && (
                        <Badge variant="outline" className="mt-1">
                          {job.teamName}
                        </Badge>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="flex items-center text-sm text-gray-600 mb-1">
                        <Calendar className="h-4 w-4 mr-1" />
                        {job.date}
                      </div>
                      <div className="flex items-center text-sm text-gray-600">
                        <Clock className="h-4 w-4 mr-1" />
                        {job.totalHours}h total
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center mb-2">
                    <Users className="h-4 w-4 mr-2 text-gray-500" />
                    <span className="text-sm font-medium">Assigned Staff:</span>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 mb-3">
                    {job.staffMembers.map((staffName, staffIndex) => (
                      <Badge key={staffIndex} variant="secondary">
                        {staffName}
                      </Badge>
                    ))}
                  </div>
                  
                  <div className="space-y-2">
                    <span className="text-sm font-medium text-gray-700">Events:</span>
                    {job.events.map((event, eventIndex) => (
                      <div key={eventIndex} className="bg-gray-50 rounded p-2 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">{event.title}</span>
                          <span className="text-gray-600">
                            {format(new Date(event.start), 'HH:mm')} - {format(new Date(event.end), 'HH:mm')}
                          </span>
                        </div>
                        {event.extendedProps?.deliveryAddress && (
                          <div className="flex items-center mt-1 text-gray-600">
                            <MapPin className="h-3 w-3 mr-1" />
                            <span className="text-xs">{event.extendedProps.deliveryAddress}</span>
                          </div>
                        )}
                      </div>
                    ))}
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
