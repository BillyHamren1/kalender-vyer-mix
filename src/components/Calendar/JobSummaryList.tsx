
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
  viewMode: 'week' | 'month';
}

interface JobSummary {
  client: string;
  jobTitle: string;
  date: string;
  staffMembers: string[];
  totalHours: number;
  events: StaffCalendarEvent[];
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
      event.title.toLowerCase().includes(client.toLowerCase())
    );
  });

  // Group events into job summaries
  const jobSummaries: JobSummary[] = [];
  const groupedEvents = new Map<string, StaffCalendarEvent[]>();

  filteredEvents.forEach(event => {
    const key = `${event.title}-${format(new Date(event.start), 'yyyy-MM-dd')}`;
    if (!groupedEvents.has(key)) {
      groupedEvents.set(key, []);
    }
    groupedEvents.get(key)?.push(event);
  });

  groupedEvents.forEach((eventGroup, key) => {
    const firstEvent = eventGroup[0];
    const client = firstEvent.title.split(' - ')[0] || 'Unknown Client';
    const jobTitle = firstEvent.title;
    
    // Get unique staff members for this job
    const staffIds = [...new Set(eventGroup.map(e => e.resourceId))];
    const staffNames = staffIds.map(id => 
      staffResources.find(s => s.id === id)?.name || `Staff-${id}`
    );

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
      events: eventGroup
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
                <div key={`${job.jobTitle}-${job.date}-${index}`} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">{job.client}</h3>
                      <p className="text-sm text-gray-600">{job.jobTitle}</p>
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
                      {job.staffMembers.map(staff => (
                        <Badge key={staff} variant="secondary" className="text-xs">
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
                        const staffName = staffResources.find(s => s.id === event.resourceId)?.name || 'Unknown';
                        return (
                          <div key={event.id} className="text-xs bg-gray-50 p-2 rounded flex justify-between">
                            <span>{staffName}</span>
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
