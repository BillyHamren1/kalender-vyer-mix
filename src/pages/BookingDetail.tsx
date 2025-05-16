
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, isAfter, differenceInDays } from "date-fns";
import { MapPin, User, Calendar as CalendarIcon, Package, ArrowLeft, FileText, FilePlus, Pencil, Check, CalendarPlus, X, Download, ExternalLink, CheckCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Booking } from "@/types/booking";
import { 
  fetchBookingById, 
  updateBookingDates, 
  updateBookingNotes,
  uploadBookingAttachment
} from "@/services/bookingService";
import { syncBookingEvents, fetchEventsByBookingId } from "@/services/bookingCalendarService";

const BookingDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [internalNotes, setInternalNotes] = useState("");
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [bookingData, setBookingData] = useState<Booking | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [calendarDates, setCalendarDates] = useState<{[key: string]: boolean}>({
    rig: false,
    event: false,
    rigDown: false
  });
  
  // Load booking data from Supabase and existing events
  useEffect(() => {
    const loadBookingAndEvents = async () => {
      if (!id) return;
      
      try {
        setIsLoading(true);
        // Fetch booking data
        const data = await fetchBookingById(id);
        setBookingData(data);
        
        if (data.internalNotes) {
          setInternalNotes(data.internalNotes);
        }
        
        // Fetch existing calendar events for this booking
        const events = await fetchEventsByBookingId(id);
        
        // Check which date types already exist in the calendar
        const dateStatus = {
          rig: false,
          event: false,
          rigDown: false
        };
        
        events.forEach(event => {
          if (event.eventType === 'rig') dateStatus.rig = true;
          if (event.eventType === 'event') dateStatus.event = true;
          if (event.eventType === 'rigDown') dateStatus.rigDown = true;
        });
        
        setCalendarDates(dateStatus);
      } catch (error) {
        console.error('Failed to load booking:', error);
        toast.error('Failed to load booking details');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadBookingAndEvents();
  }, [id]);
  
  const handleSaveNotes = async () => {
    if (!bookingData || !id) return;
    
    try {
      setIsUpdating(true);
      await updateBookingNotes(id, internalNotes);
      
      setBookingData({
        ...bookingData,
        internalNotes: internalNotes
      });
      
      toast.success("Internal notes saved successfully");
      setIsEditingNotes(false);
    } catch (error) {
      console.error('Failed to save notes:', error);
      toast.error('Failed to save notes');
    } finally {
      setIsUpdating(false);
    }
  };
  
  const handleSaveDates = async (field: 'rigDayDate' | 'eventDate' | 'rigDownDate', date: Date | undefined) => {
    if (!date || !bookingData || !id) return;
    
    const formattedDate = format(date, "yyyy-MM-dd");
    
    try {
      setIsUpdating(true);
      
      // Update date in the database
      await updateBookingDates(id, field, formattedDate);
      
      // Update local state
      setBookingData({
        ...bookingData,
        [field]: formattedDate
      });
      
      // Sync with calendar events
      let eventType: 'rig' | 'event' | 'rigDown';
      let title: string;
      
      switch (field) {
        case 'rigDayDate':
          eventType = 'rig';
          title = 'Rig Day';
          break;
        case 'eventDate':
          eventType = 'event';
          title = 'Event Day';
          break;
        case 'rigDownDate':
          eventType = 'rigDown';
          title = 'Rig Down Day';
          break;
      }
      
      // Sync with calendar (create or update associated event)
      await syncBookingEvents(
        id,
        eventType,
        formattedDate,
        'auto', // Use auto-assignment instead of specific team
        bookingData.client
      );
      
      // Update calendar dates status
      setCalendarDates({
        ...calendarDates,
        [eventType]: true
      });
      
      toast.success(`${field.charAt(0).toUpperCase() + field.slice(1).replace('Date', '')} date updated to ${formattedDate}`);
    } catch (error) {
      console.error(`Failed to update ${field}:`, error);
      toast.error(`Failed to update ${field}`);
    } finally {
      setIsUpdating(false);
    }
  };
  
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !bookingData || !id) return;
    
    const file = e.target.files[0];
    
    try {
      setIsUpdating(true);
      toast.loading('Uploading file...');
      
      // Upload the file using our new service function
      await uploadBookingAttachment(id, file);
      
      // Refresh booking data to get the new attachment
      const updatedBooking = await fetchBookingById(id);
      setBookingData(updatedBooking);
      
      toast.dismiss();
      toast.success(`File "${file.name}" uploaded successfully`);
    } catch (error) {
      console.error('Failed to upload file:', error);
      toast.dismiss();
      toast.error('Failed to upload file');
    } finally {
      setIsUpdating(false);
      // Reset the file input
      e.target.value = '';
    }
  };
  
  // Function to handle adding date to calendar
  const handleAddToCalendar = async (dateName: string, dateValue: string) => {
    if (!bookingData || !id) return;
    
    // Determine event type based on date name
    let eventType: 'rig' | 'event' | 'rigDown';
    
    switch (dateName) {
      case 'Rig Day':
        eventType = 'rig';
        break;
      case 'Event Day':
        eventType = 'event';
        break;
      case 'Rig Down Day':
        eventType = 'rigDown';
        break;
      default:
        eventType = 'event';
    }
    
    try {
      setIsUpdating(true);
      // Create and add event to calendar with auto team assignment
      await syncBookingEvents(
        id,
        eventType,
        dateValue,
        'auto', // Use auto assignment instead of specific team
        bookingData.client
      );
      
      // Update calendar dates status
      setCalendarDates({
        ...calendarDates,
        [eventType]: true
      });
      
      toast.success(`${dateName} added to calendar`);
    } catch (error) {
      console.error('Failed to add event to calendar:', error);
      toast.error('Failed to add event to calendar');
    } finally {
      setIsUpdating(false);
    }
  };
  
  // Function to navigate back to calendar view
  const handleBackToCalendar = () => {
    navigate('/resource-view');
  };
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading booking details...</p>
      </div>
    );
  }
  
  if (!bookingData) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="max-w-4xl mx-auto">
          <CardContent className="p-6">
            <div className="text-center py-8">
              <h2 className="text-xl font-medium text-[#2d3748] mb-4">Booking not found</h2>
              <Button 
                onClick={() => navigate('/booking-list')}
                className="mt-4"
              >
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Booking List
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-[#2d3748]">Booking Details</h1>
          <Button 
            variant="outline" 
            onClick={handleBackToCalendar}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Calendar
          </Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {/* Booking Information Card */}
          <Card className="md:col-span-2 border-0 shadow-md rounded-lg overflow-hidden">
            <CardHeader className="bg-gray-50 border-b pb-4">
              <CardTitle className="text-xl text-[#2d3748] flex items-center">
                <span>Booking #{bookingData.id}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-6">
                <div className="flex items-start gap-3">
                  <User className="h-5 w-5 text-[#82b6c6] mt-0.5" />
                  <div>
                    <h3 className="text-sm font-medium text-[#4a5568]">Client</h3>
                    <p className="text-[#2d3748] font-medium">{bookingData.client}</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-[#82b6c6] mt-0.5" />
                  <div>
                    <h3 className="text-sm font-medium text-[#4a5568]">Delivery Address</h3>
                    <p className="text-[#2d3748]">{bookingData.deliveryAddress || 'Not specified'}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Dates Card */}
          <Card className="border-0 shadow-md rounded-lg overflow-hidden">
            <CardHeader className="bg-gray-50 border-b pb-4">
              <CardTitle className="text-xl text-[#2d3748] flex items-center">
                <CalendarIcon className="h-5 w-5 mr-2 text-[#82b6c6]" />
                <span>Important Dates</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-[#4a5568] flex items-center">
                    Rig Day
                    {calendarDates.rig && (
                      <span className="ml-2" aria-label="Added to calendar">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      </span>
                    )}
                  </h3>
                  <div className="flex gap-2 items-center">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button 
                          variant="outline" 
                          className="w-full justify-start text-left font-normal hover:bg-gray-100 cursor-pointer"
                          disabled={isUpdating}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {bookingData.rigDayDate}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={bookingData.rigDayDate ? new Date(bookingData.rigDayDate) : undefined}
                          onSelect={(date) => handleSaveDates('rigDayDate', date)}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className={`flex-shrink-0 ${calendarDates.rig ? 'bg-green-50 text-green-600 border-green-200' : ''}`}
                      onClick={() => handleAddToCalendar('Rig Day', bookingData.rigDayDate)}
                      aria-label={calendarDates.rig ? "Already in calendar" : "Add to calendar"}
                      disabled={isUpdating || !bookingData.rigDayDate}
                    >
                      {calendarDates.rig ? 
                        <Check className="h-4 w-4 text-green-600" /> : 
                        <CalendarPlus className="h-4 w-4 text-[#82b6c6]" />
                      }
                    </Button>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-[#4a5568] flex items-center">
                    Event Day
                    {calendarDates.event && (
                      <span className="ml-2" aria-label="Added to calendar">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      </span>
                    )}
                  </h3>
                  <div className="flex gap-2 items-center">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button 
                          variant="outline" 
                          className="w-full justify-start text-left font-normal hover:bg-gray-100 cursor-pointer"
                          disabled={isUpdating}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {bookingData.eventDate}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={bookingData.eventDate ? new Date(bookingData.eventDate) : undefined}
                          onSelect={(date) => handleSaveDates('eventDate', date)}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className={`flex-shrink-0 ${calendarDates.event ? 'bg-green-50 text-green-600 border-green-200' : ''}`}
                      onClick={() => handleAddToCalendar('Event Day', bookingData.eventDate)}
                      aria-label={calendarDates.event ? "Already in calendar" : "Add to calendar"}
                      disabled={isUpdating || !bookingData.eventDate}
                    >
                      {calendarDates.event ? 
                        <Check className="h-4 w-4 text-green-600" /> : 
                        <CalendarPlus className="h-4 w-4 text-[#82b6c6]" />
                      }
                    </Button>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-[#4a5568] flex items-center">
                    Rig Down Day
                    {calendarDates.rigDown && (
                      <span className="ml-2" aria-label="Added to calendar">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      </span>
                    )}
                  </h3>
                  <div className="flex gap-2 items-center">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button 
                          variant="outline" 
                          className="w-full justify-start text-left font-normal hover:bg-gray-100 cursor-pointer"
                          disabled={isUpdating}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {bookingData.rigDownDate}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={bookingData.rigDownDate ? new Date(bookingData.rigDownDate) : undefined}
                          onSelect={(date) => handleSaveDates('rigDownDate', date)}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className={`flex-shrink-0 ${calendarDates.rigDown ? 'bg-green-50 text-green-600 border-green-200' : ''}`}
                      onClick={() => handleAddToCalendar('Rig Down Day', bookingData.rigDownDate)}
                      aria-label={calendarDates.rigDown ? "Already in calendar" : "Add to calendar"}
                      disabled={isUpdating || !bookingData.rigDownDate}
                    >
                      {calendarDates.rigDown ? 
                        <Check className="h-4 w-4 text-green-600" /> : 
                        <CalendarPlus className="h-4 w-4 text-[#82b6c6]" />
                      }
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Products Card */}
        {bookingData.products && bookingData.products.length > 0 && (
          <Card className="border-0 shadow-md rounded-lg overflow-hidden mb-6">
            <CardHeader className="bg-gray-50 border-b pb-4">
              <CardTitle className="text-xl text-[#2d3748] flex items-center">
                <Package className="h-5 w-5 mr-2 text-[#82b6c6]" />
                <span>Product List</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead className="text-[#2d3748]">Product ID</TableHead>
                    <TableHead className="text-[#2d3748]">Product Name</TableHead>
                    <TableHead className="text-[#2d3748]">Quantity</TableHead>
                    <TableHead className="text-[#2d3748]">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bookingData.products.map((product) => (
                    <TableRow key={product.id} className="hover:bg-gray-50">
                      <TableCell className="font-medium text-[#2d3748]">{product.id}</TableCell>
                      <TableCell>{product.name}</TableCell>
                      <TableCell>{product.quantity}</TableCell>
                      <TableCell>{product.notes || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
        
        {/* Internal Notes Card */}
        <Card className="border-0 shadow-md rounded-lg overflow-hidden mb-6">
          <CardHeader className="bg-gray-50 border-b pb-4">
            <CardTitle className="text-xl text-[#2d3748] flex items-center">
              <FileText className="h-5 w-5 mr-2 text-[#82b6c6]" />
              <span>Internal Notes</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {isEditingNotes ? (
              <div className="space-y-4">
                <Textarea 
                  placeholder="Add internal notes here..."
                  className="w-full min-h-[100px]"
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  disabled={isUpdating}
                />
                <div className="flex justify-end gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setIsEditingNotes(false)}
                    disabled={isUpdating}
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleSaveNotes}
                    disabled={isUpdating}
                  >
                    {isUpdating ? 'Saving...' : 'Save Notes'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-[#2d3748]">
                  {bookingData.internalNotes || "No internal notes available."}
                </p>
                <div className="flex justify-end">
                  <Button 
                    variant="outline" 
                    onClick={() => setIsEditingNotes(true)}
                  >
                    Edit Notes
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Attachments Card */}
        <Card className="border-0 shadow-md rounded-lg overflow-hidden mb-6">
          <CardHeader className="bg-gray-50 border-b pb-4">
            <CardTitle className="text-xl text-[#2d3748] flex items-center">
              <FilePlus className="h-5 w-5 mr-2 text-[#82b6c6]" />
              <span>Attachments</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-6">
              {/* File Upload Input */}
              <div className="flex items-center justify-between">
                <label htmlFor="file-upload" className="cursor-pointer">
                  <div className="flex items-center gap-2 text-[#2d3748] hover:text-[#82b6c6] transition-colors">
                    <FilePlus className="h-5 w-5" />
                    <span className="font-medium">Add picture or file</span>
                  </div>
                  <Input 
                    id="file-upload" 
                    type="file" 
                    className="hidden" 
                    onChange={handleFileUpload}
                    disabled={isUpdating}
                  />
                </label>
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={isUpdating}
                  onClick={() => document.getElementById('file-upload')?.click()}
                >
                  Upload
                </Button>
              </div>
              
              {/* Attachments Grid */}
              {bookingData.attachments && bookingData.attachments.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                  {bookingData.attachments.map((attachment, index) => {
                    const isImage = attachment.fileType?.startsWith('image/');
                    
                    return (
                      <div key={attachment.id || index} className="relative group border border-gray-200 rounded-md overflow-hidden shadow-sm">
                        {isImage ? (
                          <div className="relative h-40 w-full">
                            <img 
                              src={attachment.url} 
                              alt={attachment.fileName || `Attachment ${index + 1}`} 
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-40 w-full bg-gray-100">
                            <FileText className="h-16 w-16 text-gray-400" />
                          </div>
                        )}
                        
                        <div className="p-2 bg-white border-t border-gray-200">
                          <p className="text-sm font-medium text-gray-700 truncate" title={attachment.fileName}>
                            {attachment.fileName || `File ${index + 1}`}
                          </p>
                        </div>
                        
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <div className="flex gap-2">
                            <a 
                              href={attachment.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="bg-white text-blue-600 p-2 rounded-full hover:bg-blue-50"
                              aria-label="View"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                            <a 
                              href={attachment.url} 
                              download={attachment.fileName}
                              className="bg-white text-green-600 p-2 rounded-full hover:bg-green-50"
                              aria-label="Download"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[#4a5568] italic text-center py-6">
                  No files attached to this booking yet.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BookingDetail;
