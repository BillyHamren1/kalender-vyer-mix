
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, User, Calendar, Package, ArrowLeft } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Extended mock data for BOK-001
const mockBookingData = {
  "BOK-001": {
    id: "BOK-001",
    client: "Volvo AB",
    rigDayDate: "2025-05-20",
    eventDate: "2025-05-21",
    rigDownDate: "2025-05-22",
    deliveryAddress: "Volvo Headquarters, Gothenburg 405 31, Sweden",
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
  
  // Get booking data based on ID
  const booking = id ? mockBookingData[id as keyof typeof mockBookingData] : undefined;
  
  if (!booking) {
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
                <span>Booking #{booking.id}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-6">
                <div className="flex items-start gap-3">
                  <User className="h-5 w-5 text-[#82b6c6] mt-0.5" />
                  <div>
                    <h3 className="text-sm font-medium text-[#4a5568]">Client</h3>
                    <p className="text-[#2d3748] font-medium">{booking.client}</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-[#82b6c6] mt-0.5" />
                  <div>
                    <h3 className="text-sm font-medium text-[#4a5568]">Delivery Address</h3>
                    <p className="text-[#2d3748]">{booking.deliveryAddress}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Dates Card */}
          <Card className="border-0 shadow-md rounded-lg overflow-hidden">
            <CardHeader className="bg-gray-50 border-b pb-4">
              <CardTitle className="text-xl text-[#2d3748] flex items-center">
                <Calendar className="h-5 w-5 mr-2 text-[#82b6c6]" />
                <span>Important Dates</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-[#4a5568]">Rig Day</h3>
                  <p className="text-[#2d3748] font-medium">{booking.rigDayDate}</p>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-[#4a5568]">Event Day</h3>
                  <p className="text-[#2d3748] font-medium">{booking.eventDate}</p>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-[#4a5568]">Rig Down Day</h3>
                  <p className="text-[#2d3748] font-medium">{booking.rigDownDate}</p>
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
                {booking.products?.map((product) => (
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
      </div>
    </div>
  );
};

export default BookingDetail;
