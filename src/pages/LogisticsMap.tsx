
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader, Filter } from 'lucide-react';
import MapComponent from '@/components/logistics/MapComponent';
import BookingListSidebar from '@/components/logistics/BookingListSidebar';
import FilterControls from '@/components/logistics/FilterControls';
import { useLogisticsMap } from '@/hooks/useLogisticsMap';
import Navbar from '@/components/Navigation/Navbar';

const LogisticsMap = () => {
  const {
    filteredBookings,
    isLoading,
    selectedBooking,
    filterDate,
    setFilterDate,
    setSelectedBooking,
    loadBookings
  } = useLogisticsMap();
  
  const [showSidebar, setShowSidebar] = useState(true);

  useEffect(() => {
    loadBookings();
  }, []);

  const toggleSidebar = () => {
    setShowSidebar(!showSidebar);
  };

  return (
    <>
      <Navbar />
      <div className="container mx-auto p-2">
        <h1 className="text-2xl font-bold mb-2">Logistics Map Dashboard</h1>
        
        {/* Main Content - Full Width */}
        <div className="w-full">
          <Card className="flex-grow">
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <CardTitle>Booking Locations</CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={toggleSidebar}>
                  {showSidebar ? 'Hide List' : 'Show List'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0 relative">
              {/* Filter Controls at the top of the map */}
              <div className="p-3 border-b bg-gray-50">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Filter className="h-5 w-5" />
                    <span className="font-medium">Filters:</span>
                  </div>
                  <div className="flex-1 max-w-56">
                    <FilterControls 
                      onDateChange={setFilterDate} 
                      filterDate={filterDate}
                    />
                  </div>
                </div>
              </div>

              {/* Map Area - Much larger height */}
              <div className="h-[85vh]">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader className="h-8 w-8 animate-spin text-gray-400" />
                    <span className="ml-2 text-gray-500">Loading bookings...</span>
                  </div>
                ) : (
                  <div className="flex h-full">
                    {showSidebar && (
                      <BookingListSidebar 
                        bookings={filteredBookings} 
                        selectedBooking={selectedBooking}
                        onBookingSelect={setSelectedBooking}
                      />
                    )}
                    <div className={`${showSidebar ? 'w-2/3' : 'w-full'} h-full`}>
                      <MapComponent 
                        bookings={filteredBookings} 
                        selectedBooking={selectedBooking}
                        onBookingSelect={setSelectedBooking}
                      />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default LogisticsMap;
