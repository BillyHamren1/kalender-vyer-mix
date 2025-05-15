import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { MapPin, User, Calendar as CalendarIcon, Package, ArrowLeft, FileText, FilePlus, Pencil, Check } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

// Extended mock data for BOK-001
const mockBookingData = {
  "BOK-001": {
    id: "BOK-001",
    client: "Volvo AB",
    rigDayDate: "2025-05-20",
    eventDate: "2025-05-21",
    rigDownDate: "2025-05-22",
    deliveryAddress: "Volvo Headquarters, Gothenburg 405 31, Sweden",
    internalNotes: "This is a high-priority client. Make sure to bring extra equipment as backup.",
    attachments: [
      "https://images.unsplash.com/photo-1649972904349-6e44c42644a7",
      "https://images.unsplash.com/photo-1488590528505-98d2b5aba04b"
    ],
    products: [
      { id: "P1", name: "Stage System", quantity: 1, notes: "Main stage 8x6m" },
      { id: "P2", name: "Sound System", quantity: 2, notes: "Premium audio setup" },
      { id: "P3", name: "Lighting Kit", quantity: 4, notes: "Including RGB spots" },
      { id: "P4", name: "Video Wall", quantity: 1, notes: "4x3m LED wall" }
    ]
  }
};

const BookingDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [internalNotes, setInternalNotes] = useState("");
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [bookingData, setBookingData] = useState(
    id ? mockBookingData[id as keyof typeof mockBookingData] : undefined
  );
  
  const [tempDates, setTempDates] = useState({
    rigDayDate: bookingData?.rigDayDate || "",
    eventDate: bookingData?.eventDate || "",
    rigDownDate: bookingData?.rigDownDate || "",
  });
  
  // Initialize notes state with existing notes if available
  React.useEffect(() => {
    if (bookingData?.internalNotes) {
      setInternalNotes(bookingData.internalNotes);
    }
  }, [bookingData]);
  
  const handleSaveNotes = () => {
    // In a real application, this would send the updated notes to an API
    if (bookingData) {
      setBookingData({
        ...bookingData,
        internalNotes: internalNotes
      });
    }
    toast.success("Internal notes saved successfully");
    setIsEditingNotes(false);
  };
  
  const handleSaveDates = (field: string, date: Date | undefined) => {
    if (!date || !bookingData) return;
    
    const formattedDate = format(date, "yyyy-MM-dd");
    const updatedDates = {
      ...tempDates,
      [field]: formattedDate
    };
    
    setTempDates(updatedDates);
    
    // In a real application, this would send the updated dates to an API
    setBookingData({
      ...bookingData,
      [field]: formattedDate
    });
    
    toast.success(`${field.charAt(0).toUpperCase() + field.slice(1).replace('Date', '')} date updated to ${formattedDate}`);
  };
  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      // In a real application, this would upload the file to storage
      toast.success(`File "${e.target.files[0].name}" added successfully`);
    }
  };
  
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
            onClick={() => navigate('/booking-list')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" /> Back to List
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
                    <p className="text-[#2d3748]">{bookingData.deliveryAddress}</p>
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
                  <h3 className="text-sm font-medium text-[#4a5568]">Rig Day</h3>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button 
                        variant="outline" 
                        className="w-full justify-start text-left font-normal hover:bg-gray-100 cursor-pointer"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {bookingData.rigDayDate}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={new Date(bookingData.rigDayDate)}
                        onSelect={(date) => handleSaveDates('rigDayDate', date)}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-[#4a5568]">Event Day</h3>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button 
                        variant="outline" 
                        className="w-full justify-start text-left font-normal hover:bg-gray-100 cursor-pointer"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {bookingData.eventDate}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={new Date(bookingData.eventDate)}
                        onSelect={(date) => handleSaveDates('eventDate', date)}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-[#4a5568]">Rig Down Day</h3>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button 
                        variant="outline" 
                        className="w-full justify-start text-left font-normal hover:bg-gray-100 cursor-pointer"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {bookingData.rigDownDate}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={new Date(bookingData.rigDownDate)}
                        onSelect={(date) => handleSaveDates('rigDownDate', date)}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Products Card */}
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
                {bookingData.products?.map((product) => (
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
                />
                <div className="flex justify-end gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setIsEditingNotes(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleSaveNotes}
                  >
                    Save Notes
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
                  />
                </label>
                <Button variant="outline" size="sm">Upload</Button>
              </div>
              
              {/* Attachments Grid */}
              {bookingData.attachments && bookingData.attachments.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                  {bookingData.attachments.map((url, index) => (
                    <div key={index} className="relative group">
                      <img 
                        src={url} 
                        alt={`Attachment ${index + 1}`} 
                        className="w-full h-40 object-cover rounded-md border border-gray-200 shadow-sm"
                      />
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <Button variant="outline" size="sm" className="bg-white">
                          View
                        </Button>
                      </div>
                    </div>
                  ))}
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
