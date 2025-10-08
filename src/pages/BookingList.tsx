import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Command, CommandInput } from '@/components/ui/command';
import { useBackgroundImport } from '@/hooks/useBackgroundImport';
import { Booking } from '../types/booking';
import { 
  fetchBookings, 
  markBookingAsViewed, 
  fetchUpcomingBookings,
  fetchConfirmedBookings 
} from '@/services/bookingService';
import { fetchRecentBookingChanges, getFieldChangeType, BookingChange } from '@/services/booking/bookingChangeService';
import { toast } from 'sonner';
import { RefreshCcw, Search, CalendarDays, AlertTriangle, Filter, CalendarRange, Calendar } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import StatusBadge from '@/components/booking/StatusBadge';
import ChangeHighlight from '@/components/booking/ChangeHighlight';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

const BookingList = () => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [recentlyUpdatedBookingIds, setRecentlyUpdatedBookingIds] = useState<string[]>([]);
  const [statusChangedBookingIds, setStatusChangedBookingIds] = useState<string[]>([]);
  const [showPlannedBookings, setShowPlannedBookings] = useState(false);
  const [plannedBookings, setPlannedBookings] = useState<Booking[]>([]);
  const [isLoadingPlanned, setIsLoadingPlanned] = useState(false);
  const [bookingChanges, setBookingChanges] = useState<BookingChange[]>([]);
  
  // New state for planned bookings filters
  const [plannedDaysAhead, setPlannedDaysAhead] = useState<number>(30);
  const [plannedStatusFilter, setPlannedStatusFilter] = useState<string>("confirmed");
  const [includeTodayBookings, setIncludeTodayBookings] = useState<boolean>(true);

  // Use the background import hook - now takes no parameters
  const backgroundImport = useBackgroundImport();

  // Function to load bookings - now loads ALL bookings, not just confirmed ones
  const loadBookings = async () => {
    try {
      setIsLoading(true);
      const data = await fetchBookings();
      setBookings(data);
      
      // Fetch recent changes for all bookings
      const bookingIds = data.map(booking => booking.id);
      const changes = await fetchRecentBookingChanges(bookingIds);
      setBookingChanges(changes);
      
      return data.length > 0;
    } catch (error) {
      console.error('Failed to load bookings:', error);
      toast.error('Failed to load bookings');
      return false;
    } finally {
      setIsLoading(false);
    }
  };
  
  // Updated function to load planned bookings with custom filters
  const loadPlannedBookings = async () => {
    try {
      setIsLoadingPlanned(true);
      
      // Calculate date range based on user preferences
      const today = new Date();
      let startDate = new Date(today);
      
      // Set hours to start of day to ensure proper comparison
      startDate.setHours(0, 0, 0, 0);
      
      // If not including today, add 1 day to start date
      if (!includeTodayBookings) {
        startDate.setDate(startDate.getDate() + 1);
      }
      
      // Convert to ISO string and extract the date part (YYYY-MM-DD)
      const startDateString = startDate.toISOString().split('T')[0];
      
      // Fetch all bookings - we'll filter them client-side based on user preferences
      const allBookings = await fetchBookings();
      
      // Apply filters
      const filtered = allBookings.filter(booking => {
        // Date filter - check if event date is after or equal to start date
        // and within the specified days ahead range
        if (booking.eventDate) {
          const eventDate = new Date(booking.eventDate);
          eventDate.setHours(0, 0, 0, 0);
          
          // Calculate end date based on days ahead
          const endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + plannedDaysAhead);
          
          const isInDateRange = eventDate >= startDate && eventDate <= endDate;
          if (!isInDateRange) return false;
        } else {
          // Skip bookings without event date
          return false;
        }
        
        // Status filter
        if (plannedStatusFilter) {
          const bookingStatus = booking.status?.toLowerCase() || '';
          // If status filter is "all", show all bookings, otherwise filter by status
          if (plannedStatusFilter !== "all" && bookingStatus !== plannedStatusFilter.toLowerCase()) {
            return false;
          }
        }
        
        return true;
      });
      
      // Sort by event date ascending
      const sorted = [...filtered].sort((a, b) => {
        return new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime();
      });
      
      setPlannedBookings(sorted);
      setShowPlannedBookings(true);
    } catch (error) {
      console.error('Failed to load planned bookings:', error);
      toast.error('Failed to load planned bookings');
    } finally {
      setIsLoadingPlanned(false);
    }
  };
  
  // Function to toggle the display of planned bookings
  const togglePlannedBookings = async () => {
    if (!showPlannedBookings) {
      await loadPlannedBookings();
    } else {
      setShowPlannedBookings(false);
    }
  };
  
  // Function to mark a booking as viewed
  const handleMarkAsViewed = async (id: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent row click from navigating
    try {
      await markBookingAsViewed(id);
      toast.success('Booking marked as viewed');
      // Update local state to reflect change
      setBookings(prevBookings => prevBookings.map(booking => 
        booking.id === id ? { ...booking, viewed: true } : booking
      ));
      // Remove from recently updated list and status changed list if present
      setRecentlyUpdatedBookingIds(prev => prev.filter(bookingId => bookingId !== id));
      setStatusChangedBookingIds(prev => prev.filter(bookingId => bookingId !== id));
      
      // Remove from booking changes
      setBookingChanges(prev => prev.filter(change => change.booking_id !== id));
    } catch (error) {
      console.error('Error marking booking as viewed:', error);
      toast.error('Failed to mark booking as viewed');
    }
  };
  
  // Helper function to render table cell with change highlighting
  const renderHighlightedCell = (content: React.ReactNode, bookingId: string, fieldName: string) => {
    const changeType = getFieldChangeType(bookingChanges, bookingId, fieldName);
    
    if (changeType) {
      return (
        <ChangeHighlight changeType={changeType} className="px-1 py-0.5 rounded">
          {content}
        </ChangeHighlight>
      );
    }
    
    return content;
  };
  
  // Load bookings on initial component mount
  useEffect(() => {
    loadBookings();
  }, []);
  
  const handleRowClick = (id: string) => {
    navigate(`/booking/${id}`);
  };

  // Split bookings into categories
  const newBookings = bookings.filter(booking => !booking.viewed);
  
  // Combine recently updated and status changed bookings into a single "Updated Bookings" section
  const updatedBookings = bookings.filter(
    booking => booking.viewed && 
               (recentlyUpdatedBookingIds.includes(booking.id) || statusChangedBookingIds.includes(booking.id))
  );
  
  // Filter viewed bookings based on search term
  const filteredViewedBookings = bookings
    .filter(booking => booking.viewed)
    .filter(booking => !recentlyUpdatedBookingIds.includes(booking.id)) // Exclude recently updated
    .filter(booking => !statusChangedBookingIds.includes(booking.id)) // Exclude status changed
    .filter(booking => 
      searchTerm === '' ? false : // Don't show any if no search term
      booking.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
      booking.client.toLowerCase().includes(searchTerm.toLowerCase())
    );
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-[#2d3748]">Bokningslista</h1>
          <div className="flex space-x-3">
            <Link to="/resource-view">
              <Button 
                variant="outline" 
                className="flex items-center gap-2"
              >
                <Calendar className="h-4 w-4" />
                Calendar view
              </Button>
            </Link>
            <Button 
              onClick={backgroundImport.performManualRefresh} 
              variant="outline" 
              disabled={isLoading || backgroundImport.isImporting}
              className="flex items-center gap-2"
            >
              <RefreshCcw className={`h-4 w-4 ${isLoading || backgroundImport.isImporting ? 'animate-spin' : ''}`} />
              {backgroundImport.isImporting ? 'Importing...' : 'Update'}
            </Button>
          </div>
        </div>

        {/* New Search and Filter UI based on the provided image */}
        <div className="mb-6 flex justify-between items-center">
          <div className="relative w-full max-w-xl">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              className="pl-10 border border-gray-300 rounded-md pr-4 h-12 text-base focus-visible:ring-1 focus-visible:ring-[#9b87f5]"
              placeholder="Search bookings..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex space-x-3">
            <Button 
              variant="outline" 
              className="flex items-center gap-2 h-12 px-4 border border-gray-300 shadow-sm hover:bg-gray-50"
              onClick={() => setPlannedStatusFilter("all")}
            >
              <Filter className="h-5 w-5" />
              Show all
            </Button>
            <Button 
              variant="outline" 
              className="flex items-center gap-2 h-12 px-4 border border-gray-300 shadow-sm hover:bg-gray-50"
            >
              <CalendarRange className="h-5 w-5" />
              Date Range
            </Button>
          </div>
        </div>

        {/* Sync Status Display */}
        {backgroundImport.lastSyncTime && (
          <div className="mb-4 text-sm text-gray-600 flex items-center gap-2">
            <span>Last sync: {new Date(backgroundImport.lastSyncTime).toLocaleTimeString()}</span>
            {backgroundImport.syncStatus && (
              <Badge variant={backgroundImport.syncStatus === 'success' ? 'default' : 'destructive'} className="text-xs">
                {backgroundImport.syncStatus}
              </Badge>
            )}
          </div>
        )}

        {/* Planned Bookings Section with Filtering Controls */}
        {showPlannedBookings && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <h2 className="text-xl font-semibold text-[#2d3748]">Planned Bookings</h2>
                <Badge className="ml-2 bg-[#4299E1] hover:bg-[#3182CE]">
                  {plannedBookings.length}
                </Badge>
              </div>
              
              {/* Filter controls for planned bookings */}
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600">Status:</span>
                  <Select value={plannedStatusFilter} onValueChange={setPlannedStatusFilter}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="offer">Offer</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600">Days ahead:</span>
                  <Select 
                    value={plannedDaysAhead.toString()} 
                    onValueChange={(value) => setPlannedDaysAhead(parseInt(value))}
                  >
                    <SelectTrigger className="w-[100px]">
                      <SelectValue placeholder="Days" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="14">14 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="60">60 days</SelectItem>
                      <SelectItem value="90">90 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="includeTodayBookings" 
                    checked={includeTodayBookings}
                    onCheckedChange={(checked) => setIncludeTodayBookings(checked as boolean)}
                  />
                  <label 
                    htmlFor="includeTodayBookings" 
                    className="text-sm text-gray-600 cursor-pointer"
                  >
                    Include today
                  </label>
                </div>
                
                <Button 
                  onClick={loadPlannedBookings} 
                  size="sm" 
                  variant="outline" 
                  className="flex items-center gap-1"
                >
                  <Filter className="h-3 w-3" />
                  Apply
                </Button>
              </div>
            </div>
            
            {isLoadingPlanned ? (
              <div className="flex justify-center items-center p-8">
                <p className="text-gray-500">Loading planned bookings...</p>
              </div>
            ) : (
              plannedBookings.length > 0 ? (
                <Card className="overflow-hidden border-0 shadow-md rounded-lg">
                  <Table>
                    <TableHeader className="bg-[#EBF8FF]">
                      <TableRow>
                        <TableHead className="text-[#2d3748]">Booking ID</TableHead>
                        <TableHead className="text-[#2d3748]">Client</TableHead>
                        <TableHead className="text-[#2d3748]">Rig day date</TableHead>
                        <TableHead className="text-[#2d3748]">Event date</TableHead>
                        <TableHead className="text-[#2d3748]">Rig down date</TableHead>
                        <TableHead className="text-[#2d3748]">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {plannedBookings.map((booking) => (
                        <TableRow 
                          key={booking.id} 
                          className="hover:bg-[#F7FAFC] cursor-pointer" 
                          onClick={() => handleRowClick(booking.id)}
                        >
                          <TableCell className="font-medium text-[#2d3748]">{booking.bookingNumber || booking.id}</TableCell>
                          <TableCell>{booking.client}</TableCell>
                          <TableCell>{booking.rigDayDate}</TableCell>
                          <TableCell>{booking.eventDate}</TableCell>
                          <TableCell>{booking.rigDownDate}</TableCell>
                          <TableCell>
                            <StatusBadge status={booking.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              ) : (
                <Card className="p-8 text-center border-0 shadow-md rounded-lg">
                  <p className="text-gray-500">
                    No bookings found matching your filter criteria.
                  </p>
                </Card>
              )
            )}
            {plannedBookings.length > 0 && (
              <Separator className="my-6" />
            )}
          </div>
        )}

        {/* New Bookings Section */}
        {newBookings.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center mb-4">
              <h2 className="text-xl font-semibold text-[#2d3748]">Nya bokningar</h2>
              <Badge className="ml-2 bg-[#9b87f5] hover:bg-[#8B5CF6]">
                {newBookings.length}
              </Badge>
            </div>
            <Card className="overflow-hidden border-0 shadow-md rounded-lg">
              <Table>
                <TableHeader className="bg-[#E5DEFF]">
                  <TableRow>
                    <TableHead className="text-[#2d3748]">Booking ID</TableHead>
                    <TableHead className="text-[#2d3748]">Client</TableHead>
                    <TableHead className="text-[#2d3748]">Rig day date</TableHead>
                    <TableHead className="text-[#2d3748]">Event date</TableHead>
                    <TableHead className="text-[#2d3748]">Rig down date</TableHead>
                    <TableHead className="text-[#2d3748]">Status</TableHead>
                    <TableHead className="text-[#2d3748]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {newBookings.map((booking) => (
                    <TableRow 
                      key={booking.id} 
                      className="hover:bg-[#F5F3FF] cursor-pointer" 
                      onClick={() => handleRowClick(booking.id)}
                    >
                      <TableCell className="font-medium text-[#2d3748]">
                        {renderHighlightedCell(booking.bookingNumber || booking.id, booking.id, 'booking_number')}
                      </TableCell>
                      <TableCell>
                        {renderHighlightedCell(booking.client, booking.id, 'client')}
                      </TableCell>
                      <TableCell>
                        {renderHighlightedCell(booking.rigDayDate, booking.id, 'rigdaydate')}
                      </TableCell>
                      <TableCell>
                        {renderHighlightedCell(booking.eventDate, booking.id, 'eventdate')}
                      </TableCell>
                      <TableCell>
                        {renderHighlightedCell(booking.rigDownDate, booking.id, 'rigdowndate')}
                      </TableCell>
                      <TableCell>
                        {renderHighlightedCell(
                          <StatusBadge status={booking.status} isNew={true} />, 
                          booking.id, 
                          'status'
                        )}
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={(e) => handleMarkAsViewed(booking.id, e)}
                          className="text-xs"
                        >
                          Mark as viewed
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        )}

        {/* Updated Bookings Section - includes both status changes and regular updates */}
        {updatedBookings.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center mb-4">
              <h2 className="text-xl font-semibold text-[#2d3748]">Updated Bookings</h2>
              <Badge className="ml-2 bg-[#22C55E] hover:bg-[#16A34A]">
                {updatedBookings.length}
              </Badge>
            </div>
            <Card className="overflow-hidden border-0 shadow-md rounded-lg">
              <Table>
                <TableHeader className="bg-[#DCFCE7]">
                  <TableRow>
                    <TableHead className="text-[#2d3748]">Booking ID</TableHead>
                    <TableHead className="text-[#2d3748]">Client</TableHead>
                    <TableHead className="text-[#2d3748]">Rig day date</TableHead>
                    <TableHead className="text-[#2d3748]">Event date</TableHead>
                    <TableHead className="text-[#2d3748]">Rig down date</TableHead>
                    <TableHead className="text-[#2d3748]">Status</TableHead>
                    <TableHead className="text-[#2d3748]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {updatedBookings.map((booking) => (
                    <TableRow 
                      key={booking.id} 
                      className="hover:bg-[#F0FDF4] cursor-pointer"
                      onClick={() => handleRowClick(booking.id)}
                    >
                      <TableCell className="font-medium text-[#2d3748]">
                        {renderHighlightedCell(booking.bookingNumber || booking.id, booking.id, 'booking_number')}
                      </TableCell>
                      <TableCell>
                        {renderHighlightedCell(booking.client, booking.id, 'client')}
                      </TableCell>
                      <TableCell>
                        {renderHighlightedCell(booking.rigDayDate, booking.id, 'rigdaydate')}
                      </TableCell>
                      <TableCell>
                        {renderHighlightedCell(booking.eventDate, booking.id, 'eventdate')}
                      </TableCell>
                      <TableCell>
                        {renderHighlightedCell(booking.rigDownDate, booking.id, 'rigdowndate')}
                      </TableCell>
                      <TableCell>
                        {renderHighlightedCell(
                          <StatusBadge status={booking.status} isUpdated={true} />, 
                          booking.id, 
                          'status'
                        )}
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={(e) => handleMarkAsViewed(booking.id, e)}
                          className="text-xs"
                        >
                          Mark as viewed
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        )}

        {/* Separator between sections if multiple sections are visible */}
        {((newBookings.length > 0 || updatedBookings.length > 0) && 
          filteredViewedBookings.length > 0) && (
          <Separator className="my-6" />
        )}

        {/* Search Results Section */}
        {filteredViewedBookings.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-4 text-[#2d3748]">Sökresultat</h2>
            <Card className="overflow-hidden border-0 shadow-md rounded-lg">
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead className="text-[#2d3748]">Booking ID</TableHead>
                    <TableHead className="text-[#2d3748]">Client</TableHead>
                    <TableHead className="text-[#2d3748]">Rig day date</TableHead>
                    <TableHead className="text-[#2d3748]">Event date</TableHead>
                    <TableHead className="text-[#2d3748]">Rig down date</TableHead>
                    <TableHead className="text-[#2d3748]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredViewedBookings.map((booking) => (
                    <TableRow 
                      key={booking.id} 
                      className="hover:bg-gray-50 cursor-pointer" 
                      onClick={() => handleRowClick(booking.id)}
                    >
                      <TableCell className="font-medium text-[#2d3748]">{booking.bookingNumber || booking.id}</TableCell>
                      <TableCell>{booking.client}</TableCell>
                      <TableCell>{booking.rigDayDate}</TableCell>
                      <TableCell>{booking.eventDate}</TableCell>
                      <TableCell>{booking.rigDownDate}</TableCell>
                      <TableCell>
                        <StatusBadge status={booking.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        )}

        {/* Message when no bookings are found */}
        {newBookings.length === 0 && 
         updatedBookings.length === 0 && 
         filteredViewedBookings.length === 0 && (
          <Card className="p-8 text-center border-0 shadow-md rounded-lg">
            <p className="text-gray-500 mb-4">
              {searchTerm 
                ? 'No bookings found matching your search criteria.' 
                : 'No new or updated bookings found. Enter a search term to find existing bookings.'}
            </p>
          </Card>
        )}
      </div>
    </div>
  );
};

export default BookingList;
