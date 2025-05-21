
import React from 'react';
import { Booking } from '@/types/booking';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import StatusBadge from './StatusBadge';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface ClientInformationProps {
  booking: Booking;
  onBookingUpdated?: () => void;
}

const ClientInformation: React.FC<ClientInformationProps> = ({ booking, onBookingUpdated }) => {
  const navigate = useNavigate();
  
  return (
    <Card className="overflow-hidden">
      <div className="bg-gray-100 p-4 border-b flex justify-between items-start">
        <div>
          <Button 
            variant="outline" 
            size="sm" 
            className="mb-2" 
            onClick={() => navigate('/bookings')}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to List
          </Button>
          <h2 className="text-2xl font-bold text-gray-900">
            {booking.client}
          </h2>
          <p className="text-sm text-gray-500">
            Booking: <span className="font-medium">{booking.id}</span>
          </p>
        </div>
        <StatusBadge 
          status={booking.status || 'PENDING'} 
          viewed={booking.viewed}
          bookingId={booking.id}
          clientName={booking.client}
          onStatusUpdate={onBookingUpdated}
        />
      </div>
      <CardContent className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="text-md font-medium mb-1">Contact Information</h3>
            <p className="text-sm text-gray-500">
              Add client contact information here if needed.
            </p>
          </div>
          <div>
            <h3 className="text-md font-medium mb-1">Delivery Address</h3>
            {booking.deliveryAddress ? (
              <p className="text-sm">
                {booking.deliveryAddress}
                {booking.deliveryCity && <span>, {booking.deliveryCity}</span>}
                {booking.deliveryPostalCode && <span> {booking.deliveryPostalCode}</span>}
              </p>
            ) : (
              <p className="text-sm text-gray-500 italic">No delivery address provided</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ClientInformation;
