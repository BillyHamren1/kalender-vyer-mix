
import React, { useEffect, useContext, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CalendarContext } from '@/App';
import { useBookingDetail } from '@/hooks/useBookingDetail';
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
  Clock4,
  Plus,
  Trash2,
  X,
  CalendarX
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
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

const BookingDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { lastViewedDate, lastPath } = useContext(CalendarContext);
  const [autoSync, setAutoSync] = useState(false);
  
  // States for date selection for multi-date support
  const [selectedNewDate, setSelectedNewDate] = useState<Date | undefined>(undefined);
  
  // Use our custom hook for booking details
  const {
    booking,
    isLoading,
    error,
    isSaving,
    isSyncingToCalendar,
    rigDates,
    eventDates,
    rigDownDates,
    loadBookingData,
    handleDateChange,
    handleLogisticsChange,
    handleDeliveryDetailsChange,
    syncWithCalendar,
    setBooking,
    addDate,
    removeDate
  } = useBookingDetail(id);
  
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
    loadBookingData();
  }, [id]);
  
  useEffect(() => {
    if (booking) {
      // Initialize logistics states
      setCarryMoreThan10m(booking.carryMoreThan10m || false);
      setGroundNailsAllowed(booking.groundNailsAllowed || false);
      setExactTimeNeeded(booking.exactTimeNeeded || false);
      setExactTimeInfo(booking.exactTimeInfo || '');
      
      // Initialize delivery details
      setDeliveryAddress(booking.deliveryAddress || '');
      setDeliveryCity(booking.deliveryCity || '');
      setDeliveryPostalCode(booking.deliveryPostalCode || '');
    }
  }, [booking]);
  
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
  
  // Component for adding a new date
  const AddDateButton = ({ 
    eventType 
  }: { 
    eventType: 'rig' | 'event' | 'rigDown' 
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    
    const handleAddDate = () => {
      if (selectedNewDate) {
        addDate(selectedNewDate, eventType, autoSync);
        setSelectedNewDate(undefined);
        setIsOpen(false);
      }
    };
    
    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="mt-2 flex items-center gap-1">
            <Plus className="h-3 w-3" />
            Add date
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-4" align="start">
          <div className="space-y-4">
            <h4 className="font-medium">Add new date</h4>
            <Calendar
              mode="single"
              selected={selectedNewDate}
              onSelect={setSelectedNewDate}
              initialFocus
            />
            <div className="flex justify-end gap-2">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                variant="default" 
                size="sm" 
                onClick={handleAddDate} 
                disabled={!selectedNewDate}
              >
                Add Date
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  };
  
  // Component for displaying a date with delete option
  const DateBadge = ({ 
    date, 
    eventType,
    canDelete = true
  }: { 
    date: string; 
    eventType: 'rig' | 'event' | 'rigDown';
    canDelete?: boolean;
  }) => {
    return (
      <div className="flex items-center gap-1 mb-1">
        <Badge variant="secondary" className="px-2 py-1">
          {formatDate(date)}
        </Badge>
        
        {canDelete && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full">
                <X className="h-3 w-3" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove date?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to remove this date? This action will also remove the associated calendar event.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => removeDate(date, eventType, autoSync)}>
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    );
  };
  
  // Component for displaying multiple dates of a specific type
  const DatesSection = ({ 
    title, 
    dates, 
    eventType 
  }: { 
    title: string; 
    dates: string[]; 
    eventType: 'rig' | 'event' | 'rigDown' 
  }) => {
    return (
      <div>
        <div className="flex items-center justify-between">
          <p className="font-medium mb-1">{title}:</p>
          <AddDateButton eventType={eventType} />
        </div>
        
        {dates.length > 0 ? (
          <div className="flex flex-wrap gap-1 mt-2">
            {dates.map(date => (
              <DateBadge key={date} date={date} eventType={eventType} />
            ))}
          </div>
        ) : (
          <div className="text-gray-500 text-sm flex items-center mt-2">
            <CalendarX className="h-4 w-4 mr-1" />
            No dates scheduled
          </div>
        )}
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
                      <Label htmlFor="delivery-address">Address</Label>
                      <Textarea 
                        id="delivery-address"
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        placeholder="Street address"
                        className="mt-1"
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="delivery-city">City</Label>
                        <Input 
                          id="delivery-city"
                          value={deliveryCity}
                          onChange={(e) => setDeliveryCity(e.target.value)}
                          placeholder="City"
                          className="mt-1"
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="delivery-postal-code">Postal Code</Label>
                        <Input 
                          id="delivery-postal-code"
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
                    <Label
                      htmlFor="carry-more-than-10m"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Items need to be carried more than 10 meters
                    </Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="ground-nails-allowed"
                      checked={groundNailsAllowed}
                      onCheckedChange={setGroundNailsAllowed}
                    />
                    <Label
                      htmlFor="ground-nails-allowed"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Ground nails are allowed at the venue
                    </Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="exact-time-needed"
                      checked={exactTimeNeeded}
                      onCheckedChange={setExactTimeNeeded}
                    />
                    <Label
                      htmlFor="exact-time-needed"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Exact delivery time is required
                    </Label>
                  </div>
                  
                  {exactTimeNeeded && (
                    <div>
                      <Label htmlFor="exact-time-info">Time Details</Label>
                      <Textarea 
                        id="exact-time-info"
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
                  <Label
                    htmlFor="auto-sync"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Auto sync to calendar
                  </Label>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-6 pt-4">
                <DatesSection 
                  title="Rig Days" 
                  dates={rigDates} 
                  eventType="rig" 
                />
                
                <DatesSection 
                  title="Event Dates" 
                  dates={eventDates} 
                  eventType="event" 
                />
                
                <DatesSection 
                  title="Rig Down Dates" 
                  dates={rigDownDates} 
                  eventType="rigDown" 
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
