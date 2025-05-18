import React, { useEffect, useContext, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CalendarContext } from '@/App';
import { 
  fetchBookingById, 
  updateBookingDates, 
  updateBookingNotes, 
  updateBookingLogistics,
  updateDeliveryDetails
} from '@/services/bookingService';
import { syncBookingEvents } from '@/services/bookingCalendarService';
import { Booking } from '@/types/booking';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  FileText, 
  User, 
  FileImage, 
  Package, 
  Paperclip, 
  Save, 
  MapPin,
  Truck,
  Clock4
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';

const BookingDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { lastViewedDate, lastPath } = useContext(CalendarContext);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncingToCalendar, setIsSyncingToCalendar] = useState(false);
  const [autoSync, setAutoSync] = useState(false);
  
  // States for date selection
  const [selectedRigDate, setSelectedRigDate] = useState<Date | undefined>(undefined);
  const [selectedEventDate, setSelectedEventDate] = useState<Date | undefined>(undefined);
  const [selectedRigDownDate, setSelectedRigDownDate] = useState<Date | undefined>(undefined);
  
  // States for logistics options
  const [carryMoreThan10m, setCarryMoreThan10m] = useState(false);
  const [groundNailsAllowed, setGroundNailsAllowed] = useState(false);
  const [exactTimeNeeded, setExactTimeNeeded] = useState(false);
  const [exactTimeInfo, setExactTimeInfo] = useState('');
  
  // States for delivery details
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryPostalCode, setDeliveryPostalCode] = useState('');
  
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
        
        // Initialize logistics states
        setCarryMoreThan10m(bookingData.carryMoreThan10m || false);
        setGroundNailsAllowed(bookingData.groundNailsAllowed || false);
        setExactTimeNeeded(bookingData.exactTimeNeeded || false);
        setExactTimeInfo(bookingData.exactTimeInfo || '');
        
        // Initialize delivery details
        setDeliveryAddress(bookingData.deliveryAddress || '');
        setDeliveryCity(bookingData.deliveryCity || '');
        setDeliveryPostalCode(bookingData.deliveryPostalCode || '');
        
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
      
      // If autoSync is enabled, automatically sync to calendar
      if (autoSync) {
        await syncWithCalendar();
      }
    } catch (err) {
      console.error(`Error updating ${dateType}:`, err);
      toast.error(`Failed to update ${dateType === 'rigDayDate' ? 'rig day' : dateType === 'eventDate' ? 'event day' : 'rig down day'}`);
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleLogisticsChange = async () => {
    if (!booking || !id) return;
    
    try {
      setIsSaving(true);
      
      await updateBookingLogistics(id, {
        carryMoreThan10m,
        groundNailsAllowed,
        exactTimeNeeded,
        exactTimeInfo
      });
      
      // Update local state
      setBooking({
        ...booking,
        carryMoreThan10m,
        groundNailsAllowed,
        exactTimeNeeded,
        exactTimeInfo
      });
      
      toast.success('Logistics information updated successfully');
    } catch (err) {
      console.error('Error updating logistics information:', err);
      toast.error('Failed to update logistics information');
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleDeliveryDetailsChange = async () => {
    if (!booking || !id) return;
    
    try {
      setIsSaving(true);
      
      await updateDeliveryDetails(id, {
        deliveryAddress,
        deliveryCity,
        deliveryPostalCode
      });
      
      // Update local state
      setBooking({
        ...booking,
        deliveryAddress,
        deliveryCity,
        deliveryPostalCode
      });
      
      toast.success('Delivery details updated successfully');
    } catch (err) {
      console.error('Error updating delivery details:', err);
      toast.error('Failed to update delivery details');
    } finally {
      setIsSaving(false);
    }
  };
  
  const syncWithCalendar = async () => {
    if (!booking || !id) return;
    
    setIsSyncingToCalendar(true);
    
    try {
      // Create or update calendar events for each date
      const syncPromises = [];
      
      if (booking.rigDayDate) {
        syncPromises.push(syncBookingEvents(id, 'rig', booking.rigDayDate, 'auto', booking.client));
      }
      
      if (booking.eventDate) {
        syncPromises.push(syncBookingEvents(id, 'event', booking.eventDate, 'auto', booking.client));
      }
      
      if (booking.rigDownDate) {
        syncPromises.push(syncBookingEvents(id, 'rigDown', booking.rigDownDate, 'auto', booking.client));
      }
      
      await Promise.all(syncPromises);
      
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
              </CardContent>
            </Card>

            {/* Delivery Address */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  <span>Delivery Address</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid gap-4">
                    <div>
                      <FormLabel>Address</FormLabel>
                      <Textarea 
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        placeholder="Street address"
                        className="mt-1"
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <FormLabel>City</FormLabel>
                        <Input 
                          value={deliveryCity}
                          onChange={(e) => setDeliveryCity(e.target.value)}
                          placeholder="City"
                          className="mt-1"
                        />
                      </div>
                      
                      <div>
                        <FormLabel>Postal Code</FormLabel>
                        <Input 
                          value={deliveryPostalCode}
                          onChange={(e) => setDeliveryPostalCode(e.target.value)}
                          placeholder="Postal code"
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>
                  
                  {(booking.deliveryLatitude && booking.deliveryLongitude) ? (
                    <div className="mt-4">
                      <p className="text-sm text-gray-500">Location coordinates: {booking.deliveryLatitude}, {booking.deliveryLongitude}</p>
                    </div>
                  ) : null}
                  
                  <Button
                    onClick={handleDeliveryDetailsChange}
                    disabled={isSaving}
                    className="mt-2"
                  >
                    Save Delivery Details
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Logistics Options */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-5 w-5" />
                  <span>Logistics Options</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="carry-more-than-10m"
                      checked={carryMoreThan10m}
                      onCheckedChange={setCarryMoreThan10m}
                    />
                    <label
                      htmlFor="carry-more-than-10m"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Items need to be carried more than 10 meters
                    </label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="ground-nails-allowed"
                      checked={groundNailsAllowed}
                      onCheckedChange={setGroundNailsAllowed}
                    />
                    <label
                      htmlFor="ground-nails-allowed"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Ground nails are allowed at the venue
                    </label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="exact-time-needed"
                      checked={exactTimeNeeded}
                      onCheckedChange={setExactTimeNeeded}
                    />
                    <label
                      htmlFor="exact-time-needed"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Exact delivery time is required
                    </label>
                  </div>
                  
                  {exactTimeNeeded && (
                    <div>
                      <FormLabel>Time Details</FormLabel>
                      <Textarea 
                        value={exactTimeInfo}
                        onChange={(e) => setExactTimeInfo(e.target.value)}
                        placeholder="Specify the exact time requirements"
                        className="mt-1"
                      />
                    </div>
                  )}
                  
                  <Button
                    onClick={handleLogisticsChange}
                    disabled={isSaving}
                    className="mt-2"
                  >
                    Save Logistics Options
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Date Information */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5" />
                  <span>Schedule</span>
                </CardTitle>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="auto-sync"
                    checked={autoSync}
                    onCheckedChange={setAutoSync}
                  />
                  <label
                    htmlFor="auto-sync"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Auto sync to calendar
                  </label>
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
              {!autoSync && (
                <div className="px-6 pb-4 text-sm text-muted-foreground">
                  Note: Changes to dates will not appear in the calendar until you click "Save to Calendar"
                </div>
              )}
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
