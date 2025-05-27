import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Filter, ArrowUpDown, Calendar, AlertTriangle, CheckCircle, Clock, Bug } from 'lucide-react';
import Navbar from '@/components/Navigation/Navbar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import StatusChangeForm from '@/components/booking/StatusChangeForm';
import { useJobsListRealTime } from '@/hooks/useJobsListRealTime';
import { getTeamsForFilter } from '@/services/jobsListService';
import { JobsListItem } from '@/types/jobsList';
import { useQuery } from '@tanstack/react-query';

type SortField = 'bookingId' | 'client' | 'eventDate' | 'status' | 'hasCalendarEvents';
type SortDirection = 'asc' | 'desc';

const JobsList: React.FC = () => {
  const navigate = useNavigate();
  const [sortField, setSortField] = useState<SortField>('eventDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [showFilters, setShowFilters] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Use the enhanced real-time hook
  const {
    jobsList,
    isLoading,
    error,
    filters,
    updateFilters,
    clearFilters,
    refreshJobs,
    debugStaffAssignments,
    totalJobs,
    jobsWithCalendarEvents,
    jobsWithoutCalendarEvents,
    newJobs
  } = useJobsListRealTime();

  const { data: availableTeams = [] } = useQuery({
    queryKey: ['teamsForFilter'],
    queryFn: getTeamsForFilter,
  });

  // Handle search with debouncing
  React.useEffect(() => {
    const timeoutId = setTimeout(() => {
      updateFilters({ search: searchTerm || undefined });
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, updateFilters]);

  // Sort the jobs list
  const sortedJobs = React.useMemo(() => {
    const sorted = [...jobsList].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'bookingId':
          aValue = a.bookingId;
          bValue = b.bookingId;
          break;
        case 'client':
          aValue = a.client;
          bValue = b.client;
          break;
        case 'eventDate':
          aValue = a.eventDate;
          bValue = b.eventDate;
          break;
        case 'status':
          aValue = a.status;
          bValue = b.status;
          break;
        case 'hasCalendarEvents':
          aValue = a.hasCalendarEvents ? 1 : 0;
          bValue = b.hasCalendarEvents ? 1 : 0;
          break;
        default:
          return 0;
      }

      if (!aValue && !bValue) return 0;
      if (!aValue) return 1;
      if (!bValue) return -1;

      const comparison = String(aValue).localeCompare(String(bValue));
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [jobsList, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    updateFilters({
      [key]: value === 'all' ? undefined : (value || undefined)
    });
  };

  const handleRowClick = (bookingId: string, event: React.MouseEvent) => {
    // Prevent navigation if clicking on interactive elements
    const target = event.target as HTMLElement;
    if (target.closest('button') || target.closest('select') || target.closest('a')) {
      return;
    }
    navigate(`/booking/${bookingId}`);
  };

  const formatStaffList = (staff: string[] = []) => {
    if (staff.length === 0) return <span className="text-gray-400 text-xs">No staff assigned</span>;
    if (staff.length <= 2) {
      return (
        <div className="flex flex-wrap gap-1">
          {staff.map((member, index) => (
            <Badge key={index} variant="secondary" className="text-xs">
              {member}
            </Badge>
          ))}
        </div>
      );
    }
    return (
      <div className="flex flex-wrap gap-1">
        {staff.slice(0, 2).map((member, index) => (
          <Badge key={index} variant="secondary" className="text-xs">
            {member}
          </Badge>
        ))}
        <Badge variant="outline" className="text-xs">
          +{staff.length - 2} more
        </Badge>
      </div>
    );
  };

  // Get all assigned staff for a job (across all phases)
  const getAllAssignedStaff = (job: JobsListItem) => {
    const allStaff = [
      ...(job.rigStaff || []),
      ...(job.eventStaff || []),
      ...(job.rigDownStaff || [])
    ];
    // Remove duplicates
    const uniqueStaff = [...new Set(allStaff)];
    return uniqueStaff;
  };

  const handleDebug = async () => {
    console.log('=== JOBS LIST DEBUG ===');
    await debugStaffAssignments();
    console.log('Current filters:', filters);
    console.log('Current jobs:', jobsList);
    console.log('=== END DEBUG ===');
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center text-red-600">
            Error loading jobs list: {error.message}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="container mx-auto px-6 py-8">
        <div className="mb-8">
          {/* Header with job count */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <span className="text-sm text-gray-600 font-medium">{totalJobs} bookings</span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => refreshJobs()}
                className="text-sm font-medium"
              >
                Refresh
              </Button>
              <Button
                variant="outline"
                onClick={handleDebug}
                className="text-sm font-medium"
                size="sm"
              >
                <Bug className="h-4 w-4 mr-2" />
                Debug
              </Button>
            </div>
          </div>
          
          {/* Search and Filter Controls */}
          <div className="flex flex-col sm:flex-row gap-4 mb-8">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search bookings..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 border-gray-200 focus:border-gray-300 focus:ring-0"
              />
            </div>
            
            <div className="flex space-x-3">
              <Button
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
                className="shrink-0 border-gray-200"
              >
                <Filter className="h-4 w-4 mr-2" />
                Filter
              </Button>

              <Button
                variant="outline"
                className="shrink-0 border-gray-200"
              >
                <Calendar className="h-4 w-4 mr-2" />
                Date Range
              </Button>
            </div>
          </div>

          {/* Advanced Filters */}
          {showFilters && (
            <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Date From</label>
                  <Input
                    type="date"
                    value={filters.dateFrom || ''}
                    onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Date To</label>
                  <Input
                    type="date"
                    value={filters.dateTo || ''}
                    onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <Select value={filters.status || 'all'} onValueChange={(value) => handleFilterChange('status', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                      <SelectItem value="offer">Offer</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Team</label>
                  <Select value={filters.team || 'all'} onValueChange={(value) => handleFilterChange('team', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="All teams" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All teams</SelectItem>
                      {availableTeams.map(team => (
                        <SelectItem key={team} value={team}>{team}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Calendar Events</label>
                  <Select value={filters.hasCalendarEvents?.toString() || 'all'} onValueChange={(value) => handleFilterChange('hasCalendarEvents', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="All jobs" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All jobs</SelectItem>
                      <SelectItem value="true">With calendar events</SelectItem>
                      <SelectItem value="false">Missing calendar events</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="mt-4">
                <Button variant="outline" onClick={clearFilters}>
                  Clear Filters
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Jobs Table - Clean minimal style */}
        <div className="bg-white">
          {isLoading ? (
            <div className="p-8 text-center">Loading jobs...</div>
          ) : sortedJobs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No jobs found</div>
          ) : (
            <div className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-gray-200">
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-50 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider"
                      onClick={() => handleSort('bookingId')}
                    >
                      BOOKING NUMBER
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-50 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider"
                      onClick={() => handleSort('client')}
                    >
                      CLIENT
                    </TableHead>
                    <TableHead className="py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      RIG
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-50 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider"
                      onClick={() => handleSort('eventDate')}
                    >
                      DATE
                    </TableHead>
                    <TableHead className="py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      RIG DOWN
                    </TableHead>
                    <TableHead className="py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      ADDRESS
                    </TableHead>
                    <TableHead className="py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      ASSIGNED STAFF
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-50 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider"
                      onClick={() => handleSort('hasCalendarEvents')}
                    >
                      CALENDAR
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-50 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider"
                      onClick={() => handleSort('status')}
                    >
                      STATUS
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedJobs.map((job) => (
                    <TableRow 
                      key={job.bookingId}
                      className="hover:bg-gray-50 border-b border-gray-100 cursor-pointer"
                      onClick={(event) => handleRowClick(job.bookingId, event)}
                    >
                      <TableCell className="py-4">
                        <div className="text-gray-900 font-medium">
                          {job.bookingNumber || job.bookingId}
                        </div>
                      </TableCell>
                      <TableCell className="py-4 text-gray-900">{job.client}</TableCell>
                      <TableCell className="py-4">
                        {job.rigDate ? (
                          <div className="space-y-1">
                            <div className="text-sm text-gray-900">{job.rigDate}</div>
                            <div className="text-xs text-gray-500">{job.rigTime}</div>
                            {job.rigStaff && job.rigStaff.length > 0 && (
                              <div className="mt-1">
                                {formatStaffList(job.rigStaff)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="py-4">
                        {job.eventDate ? (
                          <div className="space-y-1">
                            <div className="text-sm text-gray-900">{job.eventDate}</div>
                            <div className="text-xs text-gray-500">{job.eventTime}</div>
                            {job.eventStaff && job.eventStaff.length > 0 && (
                              <div className="mt-1">
                                {formatStaffList(job.eventStaff)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="py-4">
                        {job.rigDownDate ? (
                          <div className="space-y-1">
                            <div className="text-sm text-gray-900">{job.rigDownDate}</div>
                            <div className="text-xs text-gray-500">{job.rigDownTime}</div>
                            {job.rigDownStaff && job.rigDownStaff.length > 0 && (
                              <div className="mt-1">
                                {formatStaffList(job.rigDownStaff)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="text-sm text-gray-900">
                          <div>{job.deliveryAddress || 'No address'}</div>
                          {job.deliveryCity && (
                            <div className="text-xs text-gray-500">{job.deliveryCity}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="space-y-1">
                          {formatStaffList(getAllAssignedStaff(job))}
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex items-center gap-2">
                          {job.hasCalendarEvents ? (
                            <Badge variant="default" className="bg-green-100 text-green-800 text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              {job.totalCalendarEvents} events
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="bg-orange-100 text-orange-800 text-xs">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Missing
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <StatusChangeForm
                          currentStatus={job.status}
                          bookingId={job.bookingId}
                          onStatusChange={() => refreshJobs()}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Summary */}
        {sortedJobs.length > 0 && (
          <div className="mt-6 text-sm text-gray-500">
            Showing {sortedJobs.length} job{sortedJobs.length !== 1 ? 's' : ''}
            {Object.keys(filters).some(key => filters[key as keyof typeof filters]) && ' (filtered)'}
            • {jobsWithCalendarEvents} with calendar events • {jobsWithoutCalendarEvents} missing calendar events
          </div>
        )}
      </div>
    </div>
  );
};

export default JobsList;
