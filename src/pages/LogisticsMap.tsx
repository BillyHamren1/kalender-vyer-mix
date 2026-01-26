
import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Map, Filter, Loader, ArrowLeft } from 'lucide-react';
import MapComponent from '@/components/logistics/MapComponent';
import BookingListSidebar from '@/components/logistics/BookingListSidebar';
import FilterControls from '@/components/logistics/FilterControls';
import { useLogisticsMap } from '@/hooks/useLogisticsMap';

const LogisticsMap = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const bookingId = searchParams.get('bookingId');
  const hideControls = searchParams.get('hideControls') === 'true';
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  
  const {
    filteredBookings,
    isLoading,
    selectedBooking,
    filterDate,
    setFilterDate,
    setSelectedBooking,
    loadBookings
  } = useLogisticsMap(bookingId);
  
  const [showSidebar, setShowSidebar] = useState(!hideControls);

  // Determine if user is coming from a booking context
  const isFromBooking = !!bookingId;

  useEffect(() => {
    loadBookings();
  }, []);

  // Auto-select booking if bookingId is provided in URL
  useEffect(() => {
    if (bookingId && filteredBookings.length > 0) {
      const booking = filteredBookings.find(b => b.id === bookingId);
      if (booking) {
        setSelectedBooking(booking);
      }
    }
  }, [bookingId, filteredBookings, setSelectedBooking]);

  const toggleSidebar = () => {
    setShowSidebar(!showSidebar);
  };

  const handleSnapshotSaved = (attachment: any) => {
    console.log('Map snapshot saved:', attachment);
  };

  const handleBackToBooking = () => {
    navigate(-1);
  };

  // In iframe mode, show only the map without any headers or padding
  if (hideControls) {
    return (
      <div className="h-screen w-full">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader className="h-8 w-8 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-500">Loading map...</span>
          </div>
        ) : (
          <MapComponent 
            bookings={filteredBookings} 
            selectedBooking={selectedBooking}
            onBookingSelect={setSelectedBooking}
            centerLat={lat ? parseFloat(lat) : undefined}
            centerLng={lng ? parseFloat(lng) : undefined}
            onSnapshotSaved={handleSnapshotSaved}
            isFromBooking={isFromBooking}
          />
        )}
      </div>
    );
  }

  // Regular full page mode
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {/* Back to Booking button - only show when a booking is selected */}
            {selectedBooking && (
              <Button 
                onClick={handleBackToBooking}
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <Map className="h-8 w-8 text-[#82b6c6]" />
            <h1 className="text-3xl font-bold text-gray-900">
              {bookingId ? `Booking Location` : 'Logistics Map'}
            </h1>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">
        <div className="w-full">
          <Card className="flex-grow">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>
                {bookingId ? `Location for ${selectedBooking?.bookingNumber || 'Booking'}` : 'Booking Locations'}
              </CardTitle>
              <div className="flex items-center gap-2">
                {/* Only show sidebar toggle if not filtering by specific booking */}
                {!bookingId && (
                  <Button variant="outline" size="sm" onClick={toggleSidebar}>
                    {showSidebar ? 'Hide List' : 'Show List'}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0 relative">
              {/* Filter Controls at the top of the map - only show if not filtering by specific booking */}
              {!bookingId && (
                <div className="p-4 border-b bg-gray-50">
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
              )}

              {/* Map Area */}
              <div className="h-[70vh]">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader className="h-8 w-8 animate-spin text-gray-400" />
                    <span className="ml-2 text-gray-500">Loading bookings...</span>
                  </div>
                ) : (
                  <div className="flex h-full">
                    {/* Only show sidebar if not filtering by specific booking and sidebar is enabled */}
                    {showSidebar && !bookingId && (
                      <BookingListSidebar 
                        bookings={filteredBookings} 
                        selectedBooking={selectedBooking}
                        onBookingSelect={setSelectedBooking}
                      />
                    )}
                    <div className={`${showSidebar && !bookingId ? 'w-2/3' : 'w-full'} h-full`}>
                      <MapComponent 
                        bookings={filteredBookings} 
                        selectedBooking={selectedBooking}
                        onBookingSelect={setSelectedBooking}
                        centerLat={lat ? parseFloat(lat) : undefined}
                        centerLng={lng ? parseFloat(lng) : undefined}
                        onSnapshotSaved={handleSnapshotSaved}
                        isFromBooking={isFromBooking}
                      />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default LogisticsMap;
