
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search, Filter, ArrowUpDown } from 'lucide-react';
import Navbar from '@/components/Navigation/Navbar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fetchJobsList, getTeamsForFilter } from '@/services/jobsListService';
import { JobsListFilters, JobsListItem } from '@/types/jobsList';

type SortField = 'bookingId' | 'client' | 'eventDate' | 'status';
type SortDirection = 'asc' | 'desc';

const JobsList: React.FC = () => {
  const [filters, setFilters] = useState<JobsListFilters>({});
  const [sortField, setSortField] = useState<SortField>('eventDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [showFilters, setShowFilters] = useState(false);

  const { data: jobsList = [], isLoading, error } = useQuery({
    queryKey: ['jobsList', filters],
    queryFn: () => fetchJobsList(filters),
  });

  const { data: availableTeams = [] } = useQuery({
    queryKey: ['teamsForFilter'],
    queryFn: getTeamsForFilter,
  });

  // Sort the jobs list
  const sortedJobs = useMemo(() => {
    const sorted = [...jobsList].sort((a, b) => {
      let aValue: string | undefined;
      let bValue: string | undefined;

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
        default:
          return 0;
      }

      if (!aValue && !bValue) return 0;
      if (!aValue) return 1;
      if (!bValue) return -1;

      const comparison = aValue.localeCompare(bValue);
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

  const handleFilterChange = (key: keyof JobsListFilters, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value || undefined
    }));
  };

  const clearFilters = () => {
    setFilters({});
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status.toUpperCase()) {
      case 'CONFIRMED':
        return 'default';
      case 'PENDING':
        return 'secondary';
      case 'CANCELLED':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const formatStaffList = (staff: string[] = []) => {
    if (staff.length === 0) return '-';
    if (staff.length <= 2) return staff.join(', ');
    return `${staff.slice(0, 2).join(', ')} +${staff.length - 2}`;
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
          
          {/* Search and Filter Controls */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search by booking number or client..."
                value={filters.search || ''}
                onChange={(e) => handleFilterChange('search', e.target.value)}
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
          </div>

          {/* Advanced Filters */}
          {showFilters && (
            <div className="bg-white p-4 rounded-lg border mb-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                  <Select value={filters.status || ''} onValueChange={(value) => handleFilterChange('status', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All statuses</SelectItem>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Team</label>
                  <Select value={filters.team || ''} onValueChange={(value) => handleFilterChange('team', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="All teams" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All teams</SelectItem>
                      {availableTeams.map(team => (
                        <SelectItem key={team} value={team}>{team}</SelectItem>
                      ))}
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
                    className={`cursor-pointer hover:bg-gray-50 ${!job.viewed ? 'bg-blue-50' : ''}`}
                  >
                    <TableCell>
                      <Link 
                        to={`/booking/${job.bookingId}`}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {job.bookingId}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium">{job.client}</TableCell>
                    <TableCell>
                      {job.rigDate ? (
                        <div className="space-y-1">
                          <div className="text-sm font-medium">{job.rigDate}</div>
                          <div className="text-xs text-gray-500">{job.rigTime}</div>
                          <div className="text-xs text-blue-600">{formatStaffList(job.rigStaff)}</div>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {job.eventDate ? (
                        <div className="space-y-1">
                          <div className="text-sm font-medium">{job.eventDate}</div>
                          <div className="text-xs text-gray-500">{job.eventTime}</div>
                          <div className="text-xs text-blue-600">{formatStaffList(job.eventStaff)}</div>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {job.rigDownDate ? (
                        <div className="space-y-1">
                          <div className="text-sm font-medium">{job.rigDownDate}</div>
                          <div className="text-xs text-gray-500">{job.rigDownTime}</div>
                          <div className="text-xs text-blue-600">{formatStaffList(job.rigDownStaff)}</div>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(job.status)}>
                        {job.status}
                      </Badge>
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
            {Object.keys(filters).some(key => filters[key as keyof JobsListFilters]) && ' (filtered)'}
          </div>
        )}
      </div>
    </div>
  );
};

export default JobsList;
