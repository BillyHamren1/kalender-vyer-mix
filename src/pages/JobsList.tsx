import React, { useEffect, useState } from 'react';
import { useJobsListRealTime } from '@/hooks/useJobsListRealTime';
import { getTeamsForFilter } from '@/services/jobsListService';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Calendar, MapPin, Users, RefreshCw, Search, Filter, X } from 'lucide-react';
import { format } from 'date-fns';
import { JobsListFilters } from '@/types/jobsList';

const JobsList = () => {
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

  const [teams, setTeams] = useState<string[]>([]);
  const [localSearch, setLocalSearch] = useState(filters.search || '');

  // Load available teams for filter
  useEffect(() => {
    const loadTeams = async () => {
      try {
        const availableTeams = await getTeamsForFilter();
        setTeams(availableTeams);
      } catch (error) {
        console.error('Error loading teams:', error);
      }
    };
    loadTeams();
  }, []);

  // Handle search with debouncing
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      updateFilters({ search: localSearch });
    }, 500);

    return () => clearTimeout(debounceTimer);
  }, [localSearch, updateFilters]);

  const handleDateFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateFilters({ dateFrom: e.target.value });
  };

  const handleDateToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateFilters({ dateTo: e.target.value });
  };

  const handleTeamChange = (value: string) => {
    updateFilters({ team: value === 'all' ? undefined : value });
  };

  const handleStatusChange = (value: string) => {
    updateFilters({ status: value === 'all' ? undefined : value });
  };

  const clearAllFilters = () => {
    setLocalSearch('');
    clearFilters();
  };

  const getStatusColor = (status: string) => {
    switch (status.toUpperCase()) {
      case 'CONFIRMED': return 'bg-green-100 text-green-800';
      case 'PENDING': return 'bg-yellow-100 text-yellow-800';
      case 'CANCELLED': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Helper function to display teams
  const displayTeams = (teams?: string[]) => {
    if (!teams || teams.length === 0) return 'No team assigned';
    if (teams.length === 1) return `Team ${teams[0]}`;
    return `Teams ${teams.join(', ')}`;
  };

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card className="p-6">
          <div className="text-center text-red-600">
            <h2 className="text-xl font-semibold mb-2">Error Loading Jobs</h2>
            <p className="mb-4">{error.message}</p>
            <Button onClick={refreshJobs} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Jobs List</h1>
          <p className="text-gray-600 mt-1">All jobs with calendar events and staff assignments</p>
        </div>
        <Button onClick={refreshJobs} disabled={isLoading} variant="outline">
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-blue-500" />
            <div>
              <p className="text-sm text-gray-600">Total Jobs</p>
              <p className="text-2xl font-bold">{totalJobs}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-green-500" />
            <div>
              <p className="text-sm text-gray-600">With Calendar Events</p>
              <p className="text-2xl font-bold">{jobsWithCalendarEvents}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center space-x-2">
            <X className="w-5 h-5 text-orange-500" />
            <div>
              <p className="text-sm text-gray-600">Without Calendar Events</p>
              <p className="text-2xl font-bold">{jobsWithoutCalendarEvents}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center space-x-2">
            <Badge variant="secondary" className="w-5 h-5" />
            <div>
              <p className="text-sm text-gray-600">New Jobs</p>
              <p className="text-2xl font-bold">{newJobs}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-6">
        <div className="flex items-center space-x-2 mb-4">
          <Filter className="w-5 h-5 text-gray-500" />
          <h2 className="text-lg font-semibold">Filters</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search jobs..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Date From */}
          <Input
            type="date"
            placeholder="Date From"
            value={filters.dateFrom || ''}
            onChange={handleDateFromChange}
          />

          {/* Date To */}
          <Input
            type="date"
            placeholder="Date To"
            value={filters.dateTo || ''}
            onChange={handleDateToChange}
          />

          {/* Team Filter */}
          <Select value={filters.team || 'all'} onValueChange={handleTeamChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select Team" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Teams</SelectItem>
              {teams.map((team) => (
                <SelectItem key={team} value={team}>
                  Team {team}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status Filter */}
          <Select value={filters.status || 'all'} onValueChange={handleStatusChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="CONFIRMED">Confirmed</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Clear Filters */}
        {(filters.search || filters.dateFrom || filters.dateTo || filters.team || filters.status) && (
          <div className="mt-4">
            <Button onClick={clearAllFilters} variant="outline" size="sm">
              <X className="w-4 h-4 mr-2" />
              Clear All Filters
            </Button>
          </div>
        )}
      </Card>

      {/* Jobs List */}
      <div className="space-y-4">
        {isLoading ? (
          <Card className="p-6">
            <div className="flex items-center justify-center">
              <RefreshCw className="w-6 h-6 animate-spin mr-2" />
              <span>Loading jobs...</span>
            </div>
          </Card>
        ) : jobsList.length === 0 ? (
          <Card className="p-6">
            <div className="text-center text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No jobs found</h3>
              <p>Try adjusting your filters or check back later.</p>
            </div>
          </Card>
        ) : (
          jobsList.map((job) => (
            <Card key={job.bookingId} className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-xl font-semibold">{job.bookingNumber}</h3>
                    <Badge className={getStatusColor(job.status)}>
                      {job.status}
                    </Badge>
                    {!job.viewed && (
                      <Badge variant="secondary">New</Badge>
                    )}
                  </div>
                  <p className="text-lg text-gray-700 mb-1">{job.client}</p>
                  {job.deliveryAddress && (
                    <div className="flex items-center text-gray-600">
                      <MapPin className="w-4 h-4 mr-1" />
                      <span>{job.deliveryAddress}</span>
                      {job.deliveryCity && <span>, {job.deliveryCity}</span>}
                    </div>
                  )}
                </div>
              </div>

              <Separator className="my-4" />

              {/* Enhanced Event Details with Multiple Teams */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Rig Day */}
                {job.rigDate && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-orange-700">Rig Day</h4>
                    <div className="space-y-1">
                      <div className="flex items-center text-sm">
                        <Calendar className="w-4 h-4 mr-2 text-gray-500" />
                        <span>{job.rigDate}</span>
                      </div>
                      {job.rigTime && (
                        <div className="text-sm text-gray-600 ml-6">
                          {job.rigTime}
                        </div>
                      )}
                      {job.rigTeams && job.rigTeams.length > 0 && (
                        <div className="text-sm text-gray-600 ml-6">
                          {displayTeams(job.rigTeams)}
                        </div>
                      )}
                      {job.rigStaff && job.rigStaff.length > 0 && (
                        <div className="text-sm text-gray-600 ml-6">
                          Staff: {job.rigStaff.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Event Day */}
                {job.eventDate && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-yellow-700">Event Day</h4>
                    <div className="space-y-1">
                      <div className="flex items-center text-sm">
                        <Calendar className="w-4 h-4 mr-2 text-gray-500" />
                        <span>{job.eventDate}</span>
                      </div>
                      {job.eventTime && (
                        <div className="text-sm text-gray-600 ml-6">
                          {job.eventTime}
                        </div>
                      )}
                      {job.eventTeams && job.eventTeams.length > 0 && (
                        <div className="text-sm text-gray-600 ml-6">
                          {displayTeams(job.eventTeams)}
                        </div>
                      )}
                      {job.eventStaff && job.eventStaff.length > 0 && (
                        <div className="text-sm text-gray-600 ml-6">
                          Staff: {job.eventStaff.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Rig Down */}
                {job.rigDownDate && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-purple-700">Rig Down</h4>
                    <div className="space-y-1">
                      <div className="flex items-center text-sm">
                        <Calendar className="w-4 h-4 mr-2 text-gray-500" />
                        <span>{job.rigDownDate}</span>
                      </div>
                      {job.rigDownTime && (
                        <div className="text-sm text-gray-600 ml-6">
                          {job.rigDownTime}
                        </div>
                      )}
                      {job.rigDownTeams && job.rigDownTeams.length > 0 && (
                        <div className="text-sm text-gray-600 ml-6">
                          {displayTeams(job.rigDownTeams)}
                        </div>
                      )}
                      {job.rigDownStaff && job.rigDownStaff.length > 0 && (
                        <div className="text-sm text-gray-600 ml-6">
                          Staff: {job.rigDownStaff.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Calendar Events Info */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>
                    {job.hasCalendarEvents ? (
                      <span className="flex items-center">
                        <Calendar className="w-4 h-4 mr-1 text-green-500" />
                        {job.totalCalendarEvents} calendar event(s)
                      </span>
                    ) : (
                      <span className="flex items-center">
                        <X className="w-4 h-4 mr-1 text-red-500" />
                        No calendar events
                      </span>
                    )}
                  </span>
                  <span>Booking ID: {job.bookingId}</span>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default JobsList;
