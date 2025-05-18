
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
import { importBookings } from '@/services/importService';
import { Booking } from '../types/booking';
import { fetchBookings, markBookingAsViewed } from '@/services/bookingService';
import { toast } from 'sonner';
import { ArrowDown, RefreshCcw, Search, Wrench } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const BookingList = () => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  
  // Function to load bookings
  const loadBookings = async () => {
    try {
      setIsLoading(true);
      setImportError(null);
      const data = await fetchBookings();
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
  
  // Function to import bookings
  const handleImportBookings = async () => {
    try {
      setIsImporting(true);
      setImportError(null);
      toast.info('Importing bookings...', {
        description: 'Please wait while we import bookings from the external system'
      });
      
      const result = await importBookings();
      
      if (result.success && result.results) {
        toast.success('Bookings imported successfully', {
          description: `Imported ${result.results.imported} of ${result.results.total} bookings with ${result.results.calendar_events_created} calendar events`
        });
        
        // Reload bookings to show the newly imported ones
        await loadBookings();
      } else {
        // Show detailed error information
        console.error('Import failed:', result);
        const errorMessage = result.error || 'Unknown error occurred during import';
        const detailsMessage = result.details ? `Details: ${result.details}` : '';
        
        setImportError(`${errorMessage} ${detailsMessage}`);
        
        toast.error('Import failed', {
          description: errorMessage
        });
      }
    } catch (error) {
      console.error('Error during import:', error);
      setImportError(error instanceof Error ? error.message : 'Unknown error during import');
      toast.error('Import operation failed');
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
      
      // If no bookings or very few, try to import
      if (!hasExistingBookings || bookings.length < 3) {
        console.log('Few or no bookings found, attempting auto-import');
        await handleImportBookings();
      }
    };
    
    initializeBookings();
  }, []);
  
  const handleRowClick = (id: string) => {
    navigate(`/booking/${id}`);
  };

  // Split bookings into new and viewed
  const newBookings = bookings.filter(booking => !booking.viewed);
  
  // Filter viewed bookings based on search term
  const filteredViewedBookings = bookings
    .filter(booking => booking.viewed)
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
              onClick={() => loadBookings()} 
              variant="outline" 
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Uppdatera
            </Button>
            <Button 
              onClick={handleImportBookings} 
              disabled={isImporting}
              className="flex items-center gap-2"
            >
              <ArrowDown className="h-4 w-4" />
              {isImporting ? 'Importerar...' : 'Importera bokningar'}
            </Button>
            <Button 
              onClick={() => navigate('/api-tester')} 
              variant="secondary"
              className="flex items-center gap-2"
            >
              <Wrench className="h-4 w-4" />
              API Tester
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

        {/* Search input */}
        <div className="flex w-full max-w-sm mb-6 mt-4 shadow-sm">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              className="pl-10 border border-gray-300 rounded-md w-full focus-visible:ring-1 focus-visible:ring-[#9b87f5]"
              placeholder="Sök efter kund eller boknings-ID"
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

            {/* Separator between sections if both are visible */}
            {newBookings.length > 0 && filteredViewedBookings.length > 0 && (
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
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              </div>
            )}

            {/* Message when no bookings are found */}
            {newBookings.length === 0 && filteredViewedBookings.length === 0 && (
              <Card className="p-8 text-center border-0 shadow-md rounded-lg">
                <p className="text-gray-500 mb-4">
                  {searchTerm 
                    ? 'No bookings found matching your search criteria.' 
                    : 'No new bookings found. Enter a search term to find existing bookings.'}
                </p>
                <Button 
                  onClick={handleImportBookings} 
                  disabled={isImporting}
                  className="flex items-center gap-2 mx-auto"
                >
                  <ArrowDown className="h-4 w-4" />
                  {isImporting ? 'Importerar...' : 'Importera bokningar'}
                </Button>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default BookingList;
