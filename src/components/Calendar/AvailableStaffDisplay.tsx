
import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { RefreshCcw, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';

type StaffMember = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  availability?: string;
};

interface AvailableStaffDisplayProps {
  currentDate: Date;
}

const AvailableStaffDisplay: React.FC<AvailableStaffDisplayProps> = ({ currentDate }) => {
  const [availableStaff, setAvailableStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isMobile = useIsMobile();
  
  // Format date as YYYY-MM-DD for API
  const formatDate = (date: Date) => {
    return date.toISOString().split('T')[0];
  };
  
  const fetchStaffData = async () => {
    setIsLoading(true);
    try {
      toast.info('Fetching available staff...');
      
      const { data, error } = await supabase.functions.invoke('fetch_staff_for_planning', {
        body: { date: formatDate(currentDate) }
      });
      
      if (error) {
        throw error;
      }
      
      console.log('Fetched staff data:', data);
      
      // Make sure we have an array of staff members
      const staffArray = data && data.data && Array.isArray(data.data) 
        ? data.data 
        : [];
        
      setAvailableStaff(staffArray);
      toast.success('Staff data updated');
    } catch (error) {
      console.error('Error fetching staff data:', error);
      toast.error('Failed to fetch staff data');
      // Ensure we always set an array even on error
      setAvailableStaff([]);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Fetch staff data when the component mounts or date changes
  useEffect(() => {
    fetchStaffData();
  }, [currentDate]);
  
  return (
    <div className="bg-white rounded-lg shadow-md p-3 mb-4">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-medium flex items-center">
          <Users className="mr-2 h-5 w-5" />
          Available Staff
        </h2>
        <Button 
          onClick={fetchStaffData} 
          variant="outline" 
          size="sm"
          disabled={isLoading}
          className="flex items-center gap-1"
        >
          <RefreshCcw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
          {isMobile ? '' : 'Refresh'}
        </Button>
      </div>
      
      {isLoading ? (
        <div className="text-center py-4">Loading staff data...</div>
      ) : availableStaff.length === 0 ? (
        <div className="text-center py-4 text-gray-500">No staff data available</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
          {availableStaff.map((staff) => (
            <div 
              key={staff.id} 
              className="border rounded p-2 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="font-medium">{staff.name}</div>
              {staff.availability && (
                <div className="text-xs text-gray-500">
                  {staff.availability}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AvailableStaffDisplay;
