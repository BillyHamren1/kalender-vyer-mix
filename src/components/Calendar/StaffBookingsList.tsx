
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarEvent, Resource } from './ResourceData';
import { format, startOfDay, endOfDay, addDays, subDays, isWithinInterval, startOfWeek, endOfWeek } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Users, RefreshCw, Calendar } from 'lucide-react';
import { toast } from 'sonner';

interface StaffBookingsListProps {
  events: CalendarEvent[];
  resources: Resource[];
  currentDate: Date;
  weeklyStaffOperations?: any;
  backgroundImport?: any;
}

const StaffBookingsList: React.FC<StaffBookingsListProps> = ({
  events,
  resources,
  currentDate,
  weeklyStaffOperations,
  backgroundImport
}) => {
  const navigate = useNavigate();
  
  // Default to current week (Monday to Sunday)
  const [startDate, setStartDate] = useState(() => 
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [endDate, setEndDate] = useState(() => 
    endOfWeek(new Date(), { weekStartsOn: 1 })
  );

  // Filter events within the date range
  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      const eventDate = new Date(event.start);
      return isWithinInterval(eventDate, { start: startDate, end: endDate });
    });
  }, [events, startDate, endDate]);

  // Group events by date
  const eventsByDate = useMemo(() => {
    const grouped: Record<string, CalendarEvent[]> = {};
    
    filteredEvents.forEach(event => {
      const dateKey = format(new Date(event.start), 'yyyy-MM-dd');
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(event);
    });
    
    return grouped;
  }, [filteredEvents]);

  const getEventColor = (eventType: string) => {
    switch (eventType) {
      case 'rig': return 'bg-green-500';
      case 'event': return 'bg-yellow-500';
      case 'rigDown': return 'bg-red-500';
      default: return 'bg-blue-500';
    }
  };

  const getTeamName = (resourceId: string) => {
    const resource = resources.find(r => r.id === resourceId);
    return resource?.title || resourceId;
  };

  const getStaffForTeamAndDate = (teamId: string, date: Date) => {
    if (!weeklyStaffOperations?.getStaffForTeamAndDate) return [];
    return weeklyStaffOperations.getStaffForTeamAndDate(teamId, date);
  };

  // Extract booking ID from event and handle click
  const handleBookingClick = (event: CalendarEvent) => {
    console.log('Booking clicked:', event);
    
    // Try multiple ways to get the booking ID
    const bookingId = event.extendedProps?.bookingId || 
                     event.extendedProps?.booking_id ||
                     event.bookingId ||
                     event.id;
    
    console.log('Extracted booking ID:', bookingId);
    
    if (bookingId) {
      try {
        navigate(`/booking/${bookingId}`);
      } catch (error) {
        console.error('Navigation error:', error);
        toast.error('Failed to open booking details');
      }
    } else {
      console.warn('No booking ID found for event:', event);
      toast.warning('Cannot open booking details', {
        description: 'This event is not linked to a booking'
      });
    }
  };

  const handleRefresh = async () => {
    try {
      if (backgroundImport?.performManualRefresh) {
        await backgroundImport.performManualRefresh();
        toast.success('Bookings refreshed successfully');
      }
    } catch (error) {
      console.error('Error refreshing bookings:', error);
      toast.error('Failed to refresh bookings');
    }
  };

  const sortedDates = Object.keys(eventsByDate).sort();

  return (
    <div className="space-y-6">
      {/* Header with controls */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold">Staff Bookings</h2>
            <p className="text-gray-600">
              Showing {filteredEvents.length} booking{filteredEvents.length !== 1 ? 's' : ''} 
            </p>
          </div>
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleRefresh}
              disabled={backgroundImport?.isImporting}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${backgroundImport?.isImporting ? 'animate-spin' : ''}`} />
              Refresh Data
            </Button>
          </div>
        </div>

        {/* Date Range Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-date">From Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={format(startDate, 'yyyy-MM-dd')}
                  onChange={(e) => setStartDate(new Date(e.target.value))}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-date">To Date</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={format(endDate, 'yyyy-MM-dd')}
                  onChange={(e) => setEndDate(new Date(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const today = new Date();
                  setStartDate(startOfWeek(today, { weekStartsOn: 1 }));
                  setEndDate(endOfWeek(today, { weekStartsOn: 1 }));
                }}
              >
                This Week
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const today = new Date();
                  setStartDate(startOfDay(today));
                  setEndDate(endOfDay(today));
                }}
              >
                Today
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const today = new Date();
                  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
                  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                  setStartDate(firstDay);
                  setEndDate(lastDay);
                }}
              >
                This Month
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bookings List */}
      <div className="space-y-4">
        {sortedDates.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8">
              <Calendar className="h-12 w-12 text-[#82b6c6] mb-4" />
              <h3 className="text-lg font-medium text-gray-600 mb-2">No bookings found</h3>
              <p className="text-gray-500 text-center">
                There are no bookings scheduled for the current date range.
                <br />
                Try refreshing the data or check a different date range.
              </p>
            </CardContent>
          </Card>
        ) : (
          sortedDates.map(dateKey => {
            const dayEvents = eventsByDate[dateKey];
            const eventDate = new Date(dateKey);
            
            return (
              <Card key={dateKey}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-[#82b6c6]" />
                    {format(eventDate, 'EEEE, MMMM d, yyyy')}
                    <Badge variant="secondary">{dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {dayEvents.map(event => {
                      const teamStaff = getStaffForTeamAndDate(event.resourceId, eventDate);
                      
                      return (
                        <div 
                          key={event.id} 
                          className="border rounded-lg p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                          onClick={() => handleBookingClick(event)}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <div className={`w-3 h-3 rounded-full ${getEventColor(event.eventType || 'event')}`} />
                                <h4 className="font-medium">{event.title}</h4>
                                <Badge variant="outline">{event.eventType}</Badge>
                              </div>
                              <p className="text-sm text-gray-600">
                                {format(new Date(event.start), 'HH:mm')} - {format(new Date(event.end), 'HH:mm')}
                              </p>
                              {event.extendedProps?.deliveryAddress && (
                                <p className="text-sm text-gray-500 mt-1">
                                  📍 {event.extendedProps.deliveryAddress}
                                </p>
                              )}
                            </div>
                            
                            <div className="text-right">
                              <div className="text-sm font-medium">{getTeamName(event.resourceId)}</div>
                              {event.bookingNumber && (
                                <div className="text-xs text-gray-500">{event.bookingNumber}</div>
                              )}
                            </div>
                          </div>
                          
                          {/* Staff Assignment */}
                          <div className="flex items-center gap-2 pt-3 border-t">
                            <Users className="h-4 w-4 text-[#82b6c6]" />
                            <span className="text-sm font-medium">Staff:</span>
                            {teamStaff.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {teamStaff.map(staff => (
                                  <Badge
                                    key={staff.id}
                                    variant="secondary"
                                    style={{ 
                                      backgroundColor: staff.color || '#E3F2FD',
                                      color: '#1976D2'
                                    }}
                                  >
                                    {staff.name}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-sm text-gray-500 italic">No staff assigned</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
};

export default StaffBookingsList;
