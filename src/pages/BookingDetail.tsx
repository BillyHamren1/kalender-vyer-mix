
import React, { useEffect, useContext, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CalendarContext } from '@/App';
import { fetchBookingById, updateBookingDates } from '@/services/bookingService';
import { syncBookingEvents } from '@/services/bookingCalendarService';
import { Booking } from '@/types/booking';
import { Calendar as CalendarIcon, Clock, FileText, User, FileImage, Package, Paperclip, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';

const BookingDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { lastViewedDate, lastPath } = useContext(CalendarContext);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncingToCalendar, setIsSyncingToCalendar] = useState(false);
  
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
  
  const syncWithCalendar = async () => {
    if (!booking || !id) return;
    
    setIsSyncingToCalendar(true);
    
    try {
      // Create or update calendar events for each date
      if (booking.rigDayDate) {
        await syncBookingEvents(id, 'rig', booking.rigDayDate, 'auto', booking.client);
      }
      
      if (booking.eventDate) {
        await syncBookingEvents(id, 'event', booking.eventDate, 'auto', booking.client);
      }
      
      if (booking.rigDownDate) {
        await syncBookingEvents(id, 'rigDown', booking.rigDownDate, 'auto', booking.client);
      }
      
      toast.success('Booking synced to calendar successfully');
    } catch (err) {
      console.error('Error syncing with calendar:', err);
      toast.error('Failed to sync booking with calendar');
    } finally {
      setIsSyncingToCalendar(false);
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
          <h1 className="text-2xl font-bold">Booking Details: #{id}</h1>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={syncWithCalendar}
              disabled={isSyncingToCalendar || !booking}
              className="whitespace-nowrap"
            >
              <Save className="mr-2 h-4 w-4" />
              {isSyncingToCalendar ? 'Saving...' : 'Save to Calendar'}
            </Button>
            <Button 
              onClick={handleBack}
              className="whitespace-nowrap"
            >
              Back to Calendar
            </Button>
          </div>
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
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5" />
                  <span>Schedule</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
