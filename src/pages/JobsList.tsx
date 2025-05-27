import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Filter, ArrowUpDown, Calendar, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
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
  const [sortField, setSortField] = useState<SortField>('eventDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [showFilters, setShowFilters] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Use the new real-time hook
  const {
    jobsList,
    isLoading,
    error,
    filters,
    updateFilters,
    clearFilters,
    refreshJobs,
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
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Jobs List</h1>
          
          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-600">Total Jobs</p>
                    <p className="text-2xl font-bold">{totalJobs}</p>
                  </div>
                  <Calendar className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-600">With Calendar Events</p>
                    <p className="text-2xl font-bold">{jobsWithCalendarEvents}</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-600">Missing Calendar Events</p>
                    <p className="text-2xl font-bold">{jobsWithoutCalendarEvents}</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-orange-500" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-600">New Jobs</p>
                    <p className="text-2xl font-bold">{newJobs}</p>
                  </div>
                  <Clock className="h-8 w-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Search and Filter Controls */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search by booking number, client, or address..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="shrink-0"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </Button>

            <Button
              variant="outline"
              onClick={() => refreshJobs()}
              className="shrink-0"
            >
              Refresh
            </Button>
          </div>

          {/* Advanced Filters */}
          {showFilters && (
            <div className="bg-white p-4 rounded-lg border mb-6">
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

        {/* Jobs Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center">Loading jobs...</div>
          ) : sortedJobs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No jobs found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => handleSort('bookingId')}
                  >
                    <div className="flex items-center gap-2">
                      Booking Nr
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => handleSort('client')}
                  >
                    <div className="flex items-center gap-2">
                      Client
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead>Rig</TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => handleSort('eventDate')}
                  >
                    <div className="flex items-center gap-2">
                      Event
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead>Rig Down</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => handleSort('hasCalendarEvents')}
                  >
                    <div className="flex items-center gap-2">
                      Calendar
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => handleSort('status')}
                  >
                    <div className="flex items-center gap-2">
                      Status
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedJobs.map((job) => (
                  <TableRow 
                    key={job.bookingId}
                    className={`hover:bg-gray-50 ${!job.viewed ? 'bg-blue-50' : ''}`}
                  >
                    <TableCell>
                      <Link 
                        to={`/booking/${job.bookingId}`}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {job.bookingNumber || job.bookingId}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium">{job.client}</TableCell>
                    <TableCell>
                      {job.rigDate ? (
                        <div className="space-y-2">
                          <div>
                            <div className="text-sm font-medium">{job.rigDate}</div>
                            <div className="text-xs text-gray-500">{job.rigTime}</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-600 mb-1">Assigned Staff:</div>
                            {formatStaffList(job.rigStaff)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {job.eventDate ? (
                        <div className="space-y-2">
                          <div>
                            <div className="text-sm font-medium">{job.eventDate}</div>
                            <div className="text-xs text-gray-500">{job.eventTime}</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-600 mb-1">Assigned Staff:</div>
                            {formatStaffList(job.eventStaff)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {job.rigDownDate ? (
                        <div className="space-y-2">
                          <div>
                            <div className="text-sm font-medium">{job.rigDownDate}</div>
                            <div className="text-xs text-gray-500">{job.rigDownTime}</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-600 mb-1">Assigned Staff:</div>
                            {formatStaffList(job.rigDownStaff)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{job.deliveryAddress || 'No address'}</div>
                        {job.deliveryCity && (
                          <div className="text-xs text-gray-500">{job.deliveryCity}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {job.hasCalendarEvents ? (
                          <Badge variant="default" className="bg-green-100 text-green-800">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            {job.totalCalendarEvents} events
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="bg-orange-100 text-orange-800">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Missing
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
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
          )}
        </div>

        {/* Summary */}
        {sortedJobs.length > 0 && (
          <div className="mt-6 text-sm text-gray-600">
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
