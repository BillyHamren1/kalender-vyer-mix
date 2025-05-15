
import React from 'react';
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

// Tillfällig bokningsdata som senare kan ersättas med riktig data
interface Booking {
  id: string;
  client: string;
  rigDayDate: string;
  eventDate: string;
  rigDownDate: string;
}

const sampleBookings: Booking[] = [
  {
    id: "BOK-001",
    client: "Volvo AB",
    rigDayDate: "2025-05-20",
    eventDate: "2025-05-21",
    rigDownDate: "2025-05-22",
  },
  {
    id: "BOK-002",
    client: "Ericsson",
    rigDayDate: "2025-06-01",
    eventDate: "2025-06-02",
    rigDownDate: "2025-06-03",
  },
  {
    id: "BOK-003",
    client: "IKEA",
    rigDayDate: "2025-06-15",
    eventDate: "2025-06-16",
    rigDownDate: "2025-06-17",
  },
  {
    id: "BOK-004",
    client: "Scania",
    rigDayDate: "2025-07-10",
    eventDate: "2025-07-11",
    rigDownDate: "2025-07-12",
  },
  {
    id: "BOK-005",
    client: "H&M",
    rigDayDate: "2025-07-20",
    eventDate: "2025-07-21",
    rigDownDate: "2025-07-22",
  },
];

const BookingList = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-[#2d3748]">Bokningslista</h1>
        </div>
        
        <Card className="overflow-hidden border-0 shadow-md rounded-lg">
          <Table>
            <TableCaption className="text-gray-500">Lista över alla bokningar</TableCaption>
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
              {sampleBookings.map((booking) => (
                <TableRow key={booking.id} className="hover:bg-gray-50">
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
    </div>
  );
};

export default BookingList;
