import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { quietImportBookings } from '@/services/importService';
import { Booking } from '../types/booking';
import { 
  fetchBookings, 
  markBookingAsViewed, 
  fetchUpcomingBookings,
  fetchConfirmedBookings 
} from '@/services/bookingService';
import { toast } from 'sonner';
import { RefreshCcw, Search, CalendarDays, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import StatusBadge from '@/components/booking/StatusBadge';

const BookingList = () => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [recentlyUpdatedBookingIds, setRecentlyUpdatedBookingIds] = useState<string[]>([]);
  const [statusChangedBookingIds, setStatusChangedBookingIds] = useState<string[]>([]);
  const [showPlannedBookings, setShowPlannedBookings] = useState(false);
  const [plannedBookings, setPlannedBookings] = useState<Booking[]>([]);
  const [isLoadingPlanned, setIsLoadingPlanned] = useState(false);
  
  // Function to load bookings - now loads ALL bookings, not just confirmed ones
  const loadBookings = async () => {
    try {
      setIsLoading(true);
      setImportError(null);
      const data = await fetchBookings(); // Use fetchBookings instead of fetchConfirmedBookings
      setBookings(data);
      return data.length > 0;
    } catch (error) {
      console.error('Failed to load bookings:', error);
      toast.error('Failed to load bookings');
      return false;
    } finally {
      setIsLoading(false);
    }
  };
  
  // Function to load upcoming bookings - always loads confirmed bookings with case-insensitive handling
  const loadPlannedBookings = async () => {
    try {
      setIsLoadingPlanned(true);
      const data = await fetchUpcomingBookings(15, true); // Only confirmed bookings for planned view
      setPlannedBookings(data);
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

  // Function for quiet background import
  const performQuietImport = async () => {
    try {
      setIsImporting(true);
      const result = await quietImportBookings();
      
      if (result.success && result.results) {
        // Track newly imported, updated, and status changed bookings
        const newOrUpdatedIds = [...(result.results.new_bookings || []), ...(result.results.updated_bookings || [])];
        const statusChangedIds = [...(result.results.status_changed_bookings || [])];
        
        if (newOrUpdatedIds.length > 0 || statusChangedIds.length > 0) {
          setRecentlyUpdatedBookingIds(prevIds => {
            const combined = [...prevIds, ...newOrUpdatedIds];
            // Remove duplicates
            return [...new Set(combined)];
          });
          
          setStatusChangedBookingIds(prevIds => {
            const combined = [...prevIds, ...statusChangedIds];
            // Remove duplicates
            return [...new Set(combined)];
          });
          
          // Reload bookings to show the newly imported ones
          await loadBookings();
        }
      } else {
        // Just log errors but don't show UI error messages
        console.error('Quiet import failed:', result);
      }
    } catch (error) {
      console.error('Error during quiet import:', error);
    } finally {
      setIsImporting(false);
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
    } catch (error) {
      console.error('Error marking booking as viewed:', error);
      toast.error('Failed to mark booking as viewed');
    }
  };
  
  // Auto-import and load bookings on initial component mount
  useEffect(() => {
    const initializeBookings = async () => {
      setIsLoading(true);
      
      // Try to load existing bookings first
      const hasExistingBookings = await loadBookings();
      
      // Perform a quiet import in the background
      await performQuietImport();
    };
    
    initializeBookings();
    
    // Set up periodic background imports more frequently (every 2 minutes instead of 5)
    const intervalId = setInterval(performQuietImport, 2 * 60 * 1000);
    
    return () => {
      clearInterval(intervalId);
    };
  }, []);
  
  const handleRowClick = (id: string) => {
    navigate(`/booking/${id}`);
  };

  // Split bookings into categories
  const newBookings = bookings.filter(booking => !booking.viewed);
  
  // Status changed bookings (shown in a special section with warning)
  const statusChangedBookings = bookings.filter(
    booking => booking.viewed && statusChangedBookingIds.includes(booking.id)
  );
  
  const recentlyUpdatedBookings = bookings.filter(
    booking => booking.viewed && 
               recentlyUpdatedBookingIds.includes(booking.id) && 
               !statusChangedBookingIds.includes(booking.id) // Don't show bookings that changed status here
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
            <Button 
              onClick={togglePlannedBookings} 
              variant="outline" 
              disabled={isLoadingPlanned}
              className="flex items-center gap-2"
            >
              <CalendarDays className="h-4 w-4" />
              {showPlannedBookings ? 'Hide planned bookings' : 'Show planned bookings'}
            </Button>
            <Button 
              onClick={() => loadBookings()} 
              variant="outline" 
              disabled={isLoading || isImporting}
              className="flex items-center gap-2"
            >
              <RefreshCcw className={`h-4 w-4 ${isLoading || isImporting ? 'animate-spin' : ''}`} />
              {isImporting ? 'Importing...' : 'Update'}
            </Button>
          </div>
        </div>
        
        {importError && (
          <Alert variant="destructive" className="mb-6">
            <AlertTitle>Import Error</AlertTitle>
            <AlertDescription>
              {importError}
              <div className="mt-2 text-sm">
                Please verify that the API keys are correctly configured in the Supabase project settings
                and that the export-bookings function is properly deployed.
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Planned Bookings Section */}
        {showPlannedBookings && (
          <div className="mb-8">
            <div className="flex items-center mb-4">
              <h2 className="text-xl font-semibold text-[#2d3748]">Planned Bookings</h2>
              <Badge className="ml-2 bg-[#4299E1] hover:bg-[#3182CE]">
                {plannedBookings.length}
              </Badge>
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
                          <TableCell className="font-medium text-[#2d3748]">{booking.id}</TableCell>
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
                    No upcoming confirmed bookings found.
                  </p>
                </Card>
              )
            )}
            {plannedBookings.length > 0 && (
              <Separator className="my-6" />
            )}
          </div>
        )}

        {/* Search input */}
        <div className="flex w-full max-w-sm mb-6 mt-4 shadow-sm">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              className="pl-10 border border-gray-300 rounded-md w-full focus-visible:ring-1 focus-visible:ring-[#9b87f5]"
              placeholder="Search for client or booking ID"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        
        {isLoading ? (
          <div className="flex justify-center items-center p-8">
            <p className="text-gray-500">Loading bookings...</p>
          </div>
        ) : (
          <>
            {/* Status Changed Bookings Section - New section for bookings that changed status */}
            {statusChangedBookings.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center mb-4">
                  <h2 className="text-xl font-semibold text-[#2d3748] flex items-center">
                    <AlertTriangle className="h-5 w-5 text-amber-500 mr-2" />
                    Status Changed
                  </h2>
                  <Badge className="ml-2 bg-[#F59E0B] hover:bg-[#D97706]">
                    {statusChangedBookings.length}
                  </Badge>
                </div>
                <Card className="overflow-hidden border-0 shadow-md rounded-lg border-l-4 border-l-amber-500">
                  <Table>
                    <TableHeader className="bg-[#FFFBEB]">
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
                      {statusChangedBookings.map((booking) => (
                        <TableRow 
                          key={booking.id} 
                          className="hover:bg-[#FEF3C7] cursor-pointer" 
                          onClick={() => handleRowClick(booking.id)}
                        >
                          <TableCell className="font-medium text-[#2d3748]">{booking.id}</TableCell>
                          <TableCell>{booking.client}</TableCell>
                          <TableCell>{booking.rigDayDate}</TableCell>
                          <TableCell>{booking.eventDate}</TableCell>
                          <TableCell>{booking.rigDownDate}</TableCell>
                          <TableCell>
                            <StatusBadge 
                              status={booking.status} 
                              isUpdated={true}
                            />
                          </TableCell>
                          <TableCell>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={(e) => handleMarkAsViewed(booking.id, e)}
                              className="text-xs bg-[#FEF3C7]"
                            >
                              Acknowledge
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
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
                          <TableCell className="font-medium text-[#2d3748]">{booking.id}</TableCell>
                          <TableCell>{booking.client}</TableCell>
                          <TableCell>{booking.rigDayDate}</TableCell>
                          <TableCell>{booking.eventDate}</TableCell>
                          <TableCell>{booking.rigDownDate}</TableCell>
                          <TableCell>
                            <StatusBadge 
                              status={booking.status} 
                              isNew={true}
                            />
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

            {/* Recently Updated Bookings Section */}
            {recentlyUpdatedBookings.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center mb-4">
                  <h2 className="text-xl font-semibold text-[#2d3748]">Uppdaterade bokningar</h2>
                  <Badge className="ml-2 bg-[#22C55E] hover:bg-[#16A34A]">
                    {recentlyUpdatedBookings.length}
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
                      {recentlyUpdatedBookings.map((booking) => (
                        <TableRow 
                          key={booking.id} 
                          className="hover:bg-[#F0FDF4] cursor-pointer" 
                          onClick={() => handleRowClick(booking.id)}
                        >
                          <TableCell className="font-medium text-[#2d3748]">{booking.id}</TableCell>
                          <TableCell>{booking.client}</TableCell>
                          <TableCell>{booking.rigDayDate}</TableCell>
                          <TableCell>{booking.eventDate}</TableCell>
                          <TableCell>{booking.rigDownDate}</TableCell>
                          <TableCell>
                            <StatusBadge 
                              status={booking.status} 
                              isUpdated={true}
                            />
                          </TableCell>
                          <TableCell>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={(e) => handleMarkAsViewed(booking.id, e)}
                              className="text-xs bg-[#F0FDF4]"
                            >
                              Mark as reviewed
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
            {((newBookings.length > 0 || recentlyUpdatedBookings.length > 0 || statusChangedBookings.length > 0) && 
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
                          <TableCell className="font-medium text-[#2d3748]">{booking.id}</TableCell>
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
             recentlyUpdatedBookings.length === 0 && 
             statusChangedBookings.length === 0 && 
             filteredViewedBookings.length === 0 && (
              <Card className="p-8 text-center border-0 shadow-md rounded-lg">
                <p className="text-gray-500 mb-4">
                  {searchTerm 
                    ? 'No bookings found matching your search criteria.' 
                    : 'No new or updated bookings found. Enter a search term to find existing bookings.'}
                </p>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default BookingList;
