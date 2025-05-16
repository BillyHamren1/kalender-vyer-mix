
import React, { useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CalendarContext } from '@/App';

const BookingDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { lastViewedDate, lastPath } = useContext(CalendarContext);
  
  useEffect(() => {
    console.log('Viewing booking with ID:', id);
    console.log('Last viewed date:', lastViewedDate);
    console.log('Last path:', lastPath);
  }, [id, lastViewedDate, lastPath]);
  
  const handleBack = () => {
    if (lastPath) {
      navigate(lastPath);
      console.log(`Navigating back to ${lastPath} with date:`, lastViewedDate);
    } else {
      navigate('/resource-view');
    }
  };
  
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Booking Details: #{id}</h1>
          <button 
            onClick={handleBack}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
          >
            Back to Calendar
          </button>
        </div>
        
        <div className="space-y-4">
          <p className="text-gray-600">
            Booking information will be displayed here. This is booking #{id}.
          </p>
          
          {lastViewedDate && (
            <p className="text-sm text-blue-600">
              You came from calendar view on: {lastViewedDate.toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default BookingDetail;
