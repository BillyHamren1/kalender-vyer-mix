
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from '@/components/ui/card';
import { Booking } from '../types/booking';
import { fetchBookings } from '@/services/bookingService';
import { toast } from 'sonner';

const BookingList = () => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    const loadBookings = async () => {
      try {
        setIsLoading(true);
        const data = await fetchBookings();
        setBookings(data);
      } catch (error) {
        console.error('Failed to load bookings:', error);
        toast.error('Failed to load bookings');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadBookings();
  }, []);
  
  const handleRowClick = (id: string) => {
    navigate(`/booking/${id}`);
  };
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-[#2d3748]">Bokningslista</h1>
        </div>
        
        <Card className="overflow-hidden border-0 shadow-md rounded-lg">
          {isLoading ? (
            <div className="flex justify-center items-center p-8">
              <p className="text-gray-500">Loading bookings...</p>
            </div>
          ) : (
            <Table>
              {/* Removed the TableCaption with the text "Lista över alla bokningar" */}
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
                {bookings.map((booking) => (
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
          )}
        </Card>
      </div>
    </div>
  );
};

export default BookingList;
