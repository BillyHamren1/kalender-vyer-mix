
import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Calendar } from 'lucide-react';
import Navbar from "@/components/Navigation/Navbar";
import MonthNavigation from "@/components/schedule/MonthNavigation";
import ScheduleFilters from "@/components/schedule/ScheduleFilters";
import BookingScheduleRow from "@/components/schedule/BookingScheduleRow";
import { fetchMonthlyBookingSchedule, MonthlyBookingSchedule } from "@/services/monthlyScheduleService";

const MonthlyBookingSchedulePage: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: scheduleData = [], isLoading, error, refetch } = useQuery({
    queryKey: ['monthlySchedule', currentDate],
    queryFn: () => fetchMonthlyBookingSchedule(currentDate),
  });

  // Filter data based on search and status
  const filteredData = scheduleData.filter((booking: MonthlyBookingSchedule) => {
    const matchesSearch = !searchTerm || 
      booking.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.bookingId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.assignedStaff.some(staff => 
        staff.staffName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    
    const matchesStatus = statusFilter === 'all' || booking.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const handleExport = () => {
    // Basic CSV export functionality
    const headers = ['Day', 'Booking ID', 'Client', 'Staff', 'Rig', 'Event', 'Rig Down', 'Notes', 'Status'];
    const csvContent = [
      headers.join(','),
      ...filteredData.map(booking => [
        booking.rigDate || booking.eventDate || booking.rigDownDate || '',
        booking.bookingId,
        booking.client,
        booking.assignedStaff.map(s => s.staffName).join('; '),
        booking.rigDate && booking.rigTime ? `${booking.rigDate} ${booking.rigTime}` : '',
        booking.eventDate && booking.eventTime ? `${booking.eventDate} ${booking.eventTime}` : '',
        booking.rigDownDate && booking.rigDownTime ? `${booking.rigDownDate} ${booking.rigDownTime}` : '',
        booking.internalNotes || '',
        booking.status
      ].map(field => `"${field}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `booking-schedule-${currentDate.getFullYear()}-${currentDate.getMonth() + 1}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <p className="text-red-600">Error loading schedule data: {error.message}</p>
            <Button onClick={() => refetch()} className="mt-4">Retry</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <Calendar className="h-8 w-8 text-[#82b6c6]" />
            <h1 className="text-3xl font-bold text-gray-900">Monthly Booking Schedule</h1>
          </div>
          <Button onClick={handleExport} variant="outline" className="flex items-center">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>

        <MonthNavigation 
          currentDate={currentDate}
          onDateChange={setCurrentDate}
        />

        <ScheduleFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Bookings ({filteredData.length})</span>
              {isLoading && <span className="text-sm text-gray-500">Loading...</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Day</TableHead>
                    <TableHead>Booking ID</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Assigned Staff</TableHead>
                    <TableHead>Rig</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Rig Down</TableHead>
                    <TableHead>Internal Notes</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.length === 0 ? (
                    <TableRow>
                      <td colSpan={9} className="text-center py-8 text-gray-500">
                        {isLoading ? 'Loading bookings...' : 'No bookings found for this month'}
                      </td>
                    </TableRow>
                  ) : (
                    filteredData.map((booking) => (
                      <BookingScheduleRow 
                        key={booking.id} 
                        booking={booking} 
                      />
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MonthlyBookingSchedulePage;
