import React, { useEffect, useContext, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CalendarContext } from '@/App';
import { fetchBookingById, updateBookingDates, markBookingAsViewed } from '@/services/bookingService';
import { Booking } from '@/types/booking';
import { CalendarIcon, Clock, FileText, User, FileImage, Package, Paperclip } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

const BookingDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { lastViewedDate, lastPath } = useContext(CalendarContext);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isNewBooking, setIsNewBooking] = useState(false);
  
  // States for date selection
  const [selectedRigDate, setSelectedRigDate] = useState<Date | undefined>(undefined);
  const [selectedEventDate, setSelectedEventDate] = useState<Date | undefined>(undefined);
  const [selectedRigDownDate, setSelectedRigDownDate] = useState<Date | undefined>(undefined);
  
  useEffect(() => {
    const loadBookingData = async () => {
      if (!id) return;
      
      try {
        setIsLoading(true);
        const bookingData = await fetchBookingById(id);
        setBooking(bookingData);
        
        // Check if this is a new/unviewed booking
        setIsNewBooking(!bookingData.viewed);
        
        // If booking is not viewed yet, mark it as viewed
        if (!bookingData.viewed) {
          await markBookingAsViewed(id);
        }
        
        // Initialize date states from booking data
        if (bookingData.rigDayDate) {
          setSelectedRigDate(new Date(bookingData.rigDayDate));
        }
        if (bookingData.eventDate) {
          setSelectedEventDate(new Date(bookingData.eventDate));
        }
        if (bookingData.rigDownDate) {
          setSelectedRigDownDate(new Date(bookingData.rigDownDate));
        }
        
        setError(null);
      } catch (err) {
        console.error('Error fetching booking:', err);
        setError('Failed to load booking details');
        toast.error('Could not load booking details');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadBookingData();
  }, [id]);
  
  // Subscribe to real-time updates for this booking
  useEffect(() => {
    if (!id) return;
    
    console.log('Setting up real-time subscription for booking updates');
    
    const channel = supabase
      .channel(`booking-${id}-updates`)
      .on('postgres_changes', 
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'bookings',
          filter: `id=eq.${id}`
        }, 
        (payload) => {
          console.log('Real-time booking update received:', payload);
          
          // Update our local state based on the database change
          if (payload.new) {
            // Transform the booking data to match our format
            const updatedBooking: Booking = {
              id: payload.new.id,
              client: payload.new.client,
              rigDayDate: payload.new.rigdaydate,
              eventDate: payload.new.eventdate,
              rigDownDate: payload.new.rigdowndate,
              deliveryAddress: payload.new.deliveryaddress,
              internalNotes: payload.new.internalnotes,
              viewed: payload.new.viewed,
              // Preserve existing products and attachments
              products: booking?.products || [],
              attachments: booking?.attachments || []
            };
            
            // Update local state
            setBooking(updatedBooking);
            
            // Update date states
            if (updatedBooking.rigDayDate) {
              setSelectedRigDate(new Date(updatedBooking.rigDayDate));
            }
            if (updatedBooking.eventDate) {
              setSelectedEventDate(new Date(updatedBooking.eventDate));
            }
            if (updatedBooking.rigDownDate) {
              setSelectedRigDownDate(new Date(updatedBooking.rigDownDate));
            }
            
            toast.info('Booking details have been updated');
          }
        })
      .subscribe();
      
    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, booking]);
  
  const handleBack = () => {
    if (lastPath) {
      navigate(lastPath);
    } else {
      navigate('/resource-view');
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Not scheduled';
    return new Date(dateString).toLocaleDateString();
  };
  
  const handleDateChange = async (date: Date | undefined, dateType: 'rigDayDate' | 'eventDate' | 'rigDownDate') => {
    if (!booking || !id || !date) return;
    
    try {
      setIsSaving(true);
      
      // Format the date as ISO string (without time)
      const formattedDate = date.toISOString().split('T')[0];
      
      // Update the booking date in the database
      await updateBookingDates(id, dateType, formattedDate);
      
      // Update the correct date selection state
      if (dateType === 'rigDayDate') {
        setSelectedRigDate(date);
      } else if (dateType === 'eventDate') {
        setSelectedEventDate(date);
      } else if (dateType === 'rigDownDate') {
        setSelectedRigDownDate(date);
      }
      
      // Update local state to reflect changes
      setBooking({
        ...booking,
        [dateType]: formattedDate
      });
      
      toast.success(`${dateType === 'rigDayDate' ? 'Rig day' : dateType === 'eventDate' ? 'Event day' : 'Rig down day'} updated successfully`);
      
    } catch (err) {
      console.error(`Error updating ${dateType}:`, err);
      toast.error(`Failed to update ${dateType === 'rigDayDate' ? 'rig day' : dateType === 'eventDate' ? 'event day' : 'rig down day'}`);
    } finally {
      setIsSaving(false);
    }
  };
  
  const DatePickerWithButton = ({ 
    date, 
    onSelect, 
    label, 
    dateType 
  }: { 
    date: Date | undefined; 
    onSelect: (date: Date | undefined, type: 'rigDayDate' | 'eventDate' | 'rigDownDate') => void;
    label: string;
    dateType: 'rigDayDate' | 'eventDate' | 'rigDownDate';
  }) => {
    return (
      <div className="flex flex-col">
        <p className="font-medium mb-1">{label}:</p>
        <div className="flex items-center">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start text-left font-normal"
                disabled={isSaving}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date ? format(date, 'PPP') : 'Select date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(newDate) => onSelect(newDate, dateType)}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>
    );
  };
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">Loading booking details...</h1>
            <button 
              onClick={handleBack}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
            >
              Back to Calendar
            </button>
          </div>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-red-500">Error Loading Booking</h1>
            <button 
              onClick={handleBack}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
            >
              Back to Calendar
            </button>
          </div>
          <p className="text-gray-700">{error}</p>
          <p className="mt-4">Booking ID: {id}</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Booking Details: #{id}</h1>
            {isNewBooking && (
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                New
              </Badge>
            )}
          </div>
          <Button 
            onClick={handleBack}
            className="whitespace-nowrap"
          >
            Back to Calendar
          </Button>
        </div>
        
        {booking ? (
          <div className="space-y-6">
            {/* Main booking information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  <span>Client Information</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div>
                  <p className="font-medium">Client:</p>
                  <p className="text-lg">{booking.client}</p>
                </div>
                
                {booking.deliveryAddress && (
                  <div>
                    <p className="font-medium">Delivery Address:</p>
                    <p className="text-gray-700">{booking.deliveryAddress}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Date Information */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5" />
                  <span>Schedule</span>
                </CardTitle>
                <div className="text-sm text-muted-foreground">
                  Changes are automatically synced to calendar
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                <DatePickerWithButton 
                  date={selectedRigDate} 
                  onSelect={handleDateChange}
                  label="Rig Day"
                  dateType="rigDayDate"
                />
                <DatePickerWithButton 
                  date={selectedEventDate} 
                  onSelect={handleDateChange}
                  label="Event Date"
                  dateType="eventDate"
                />
                <DatePickerWithButton 
                  date={selectedRigDownDate} 
                  onSelect={handleDateChange}
                  label="Rig Down Date"
                  dateType="rigDownDate"
                />
              </CardContent>
            </Card>

            {/* Internal Notes if any */}
            {booking.internalNotes && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    <span>Internal Notes</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700 whitespace-pre-wrap">{booking.internalNotes}</p>
                </CardContent>
              </Card>
            )}

            {/* Products section if there are any */}
            {booking.products && booking.products.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    <span>Products</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y">
                    {booking.products.map(product => (
                      <li key={product.id} className="py-3">
                        <div className="flex justify-between">
                          <span className="font-medium">{product.name}</span>
                          <span className="text-gray-600">Qty: {product.quantity}</span>
                        </div>
                        {product.notes && (
                          <p className="text-sm text-gray-500 mt-1">{product.notes}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Attachments section if there are any */}
            {booking.attachments && booking.attachments.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Paperclip className="h-5 w-5" />
                    <span>Attachments</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y">
                    {booking.attachments.map(attachment => (
                      <li key={attachment.id} className="py-3">
                        <a 
                          href={attachment.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center text-blue-600 hover:underline"
                        >
                          <FileImage className="h-4 w-4 mr-2" />
                          {attachment.fileName}
                          <span className="text-xs text-gray-500 ml-2">
                            ({attachment.fileType})
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {lastViewedDate && (
              <p className="text-sm text-blue-500 mt-6">
                You came from calendar view on: {lastViewedDate.toLocaleDateString()}
              </p>
            )}
          </div>
        ) : (
          <p className="text-gray-700">No booking data available.</p>
        )}
      </div>
    </div>
  );
};

export default BookingDetail;
