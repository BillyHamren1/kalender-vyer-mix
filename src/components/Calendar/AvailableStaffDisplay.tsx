
import React, { useState, useEffect } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { StaffMember } from './StaffAssignmentRow';
import { syncStaffMember } from '@/services/staffService';
import { toast } from 'sonner';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Users } from 'lucide-react';

// External staff member interface from the API
interface ExternalStaffMember {
  id: string;
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
  specialties: string[];
  isavailable: boolean;
  username: string;
  password: string;
  notes: string | null;
}

// Interface for the available staff display component
interface AvailableStaffDisplayProps {
  currentDate: Date;
  onStaffDrop: (staffId: string, resourceId: string | null) => Promise<void>;
}

// Helper function to format staff name
const formatStaffName = (fullName: string): string => {
  const nameParts = fullName.trim().split(' ');
  if (nameParts.length === 1) return nameParts[0];
  
  const firstName = nameParts[0];
  const lastNameInitial = nameParts[nameParts.length - 1][0];
  
  return `${firstName} ${lastNameInitial}`;
};

// Draggable staff item component
const DraggableStaffItem: React.FC<{ staff: StaffMember }> = ({ staff }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'STAFF',
    item: staff,
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  }));

  // Get the initials for avatar
  const getInitials = (name: string): string => {
    const nameParts = name.trim().split(' ');
    if (nameParts.length === 1) return nameParts[0].substring(0, 2).toUpperCase();
    return (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
  };

  // Format the name for display
  const displayName = formatStaffName(staff.name);

  return (
    <div
      ref={drag}
      className={`p-1 mb-1 bg-white border rounded-md shadow-sm cursor-move flex items-center gap-1 ${
        isDragging ? 'opacity-50' : 'opacity-100'
      }`}
      style={{ width: '95px', height: '24px' }}
    >
      <Avatar className="h-4 w-4 bg-purple-100">
        <AvatarFallback className="text-[10px] text-purple-700">
          {getInitials(staff.name)}
        </AvatarFallback>
      </Avatar>
      <span className="text-xs font-medium truncate">{displayName}</span>
    </div>
  );
};

// Main component
const AvailableStaffDisplay: React.FC<AvailableStaffDisplayProps> = ({ currentDate, onStaffDrop }) => {
  const [availableStaff, setAvailableStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInIframe, setIsInIframe] = useState(false);

  // Detect if we're in an iframe
  useEffect(() => {
    setIsInIframe(window.self !== window.top);
    console.log('AvailableStaffDisplay running in iframe:', window.self !== window.top);
  }, []);

  // Handle message events from parent if in iframe
  useEffect(() => {
    if (isInIframe) {
      const handleMessage = (event: MessageEvent) => {
        // Make sure the message is from a trusted source
        if (event.data?.type === 'STAFF_DATA') {
          console.log('Received staff data via postMessage:', event.data.staff);
          setAvailableStaff(event.data.staff);
          setIsLoading(false);
        }
      };

      window.addEventListener('message', handleMessage);
      
      // Signal to parent that we're ready to receive staff data
      try {
        window.parent.postMessage({ type: 'READY_FOR_STAFF_DATA', date: currentDate.toISOString() }, '*');
        console.log('Sent READY_FOR_STAFF_DATA message to parent');
      } catch (e) {
        console.error('Error sending message to parent:', e);
      }

      return () => {
        window.removeEventListener('message', handleMessage);
      };
    }
  }, [isInIframe, currentDate]);

  // Fetch available staff from the edge function
  useEffect(() => {
    const fetchAvailableStaff = async () => {
      try {
        console.log('Fetching available staff, isInIframe:', isInIframe);
        if (isInIframe) {
          // In iframe mode, we rely on postMessage for data
          // This code will still run, but we expect data to come from parent window
          console.log('In iframe - waiting for staff data from parent window');
          return;
        }

        setIsLoading(true);
        const formattedDate = currentDate.toISOString().split('T')[0];
        console.log('Fetching staff data for date:', formattedDate);
        
        // Call the edge function to get staff availability
        const { data, error } = await supabase.functions.invoke('fetch_staff_for_planning', {
          body: { date: formattedDate }
        });
        
        if (error) {
          console.error('Error fetching staff availability:', error);
          toast.error('Failed to load available staff');
          setIsLoading(false);
          return;
        }
        
        console.log('Fetched staff data response:', data);
        
        if (data && data.success && data.data) {
          // Transform the data into StaffMember format
          const staffList: StaffMember[] = [];
          
          // Process each staff member and ensure they exist in our database
          for (const externalStaff of data.data as ExternalStaffMember[]) {
            console.log('Processing staff member:', externalStaff.name, 'Available:', externalStaff.isavailable);
            if (externalStaff.isavailable) {
              try {
                // Sync the staff member to our database
                await syncStaffMember(
                  externalStaff.id,
                  externalStaff.name,
                  externalStaff.email || undefined,
                  externalStaff.phone || undefined
                );
                
                // Add to our available staff list
                staffList.push({
                  id: externalStaff.id,
                  name: externalStaff.name,
                  email: externalStaff.email || undefined,
                  phone: externalStaff.phone || undefined
                });
              } catch (syncError) {
                console.error(`Error syncing staff member ${externalStaff.id}:`, syncError);
              }
            }
          }
          
          console.log('Setting available staff list with', staffList.length, 'staff members');
          setAvailableStaff(staffList);
        } else {
          console.warn('No staff data in response or invalid format');
          setAvailableStaff([]);
        }
      } catch (error) {
        console.error('Error in fetchAvailableStaff:', error);
        toast.error('Failed to load available staff');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAvailableStaff();
  }, [currentDate, isInIframe]);

  // Drop zone for returning staff back to available pool
  const [{ isOver }, drop] = useDrop(() => ({
    accept: 'STAFF',
    drop: (item: StaffMember) => {
      // When a staff member is dropped back here, we remove their assignment
      console.log('Staff member dropped back to available pool:', item);
      onStaffDrop(item.id, null);
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
    }),
  }));

  return (
    <Card className={`border ${isOver ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
      <CardHeader className="pb-1 pt-2">
        <CardTitle className="text-sm flex items-center gap-1">
          <Users className="h-4 w-4" />
          Available Staff {isInIframe ? '(iframe mode)' : ''}
        </CardTitle>
      </CardHeader>
      <CardContent ref={drop} className="pt-0 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-1">
        {isLoading ? (
          // Show skeletons while loading
          <>
            <Skeleton className="h-6 mb-1" />
            <Skeleton className="h-6 mb-1" />
            <Skeleton className="h-6 mb-1" />
            <Skeleton className="h-6 mb-1" />
          </>
        ) : availableStaff.length > 0 ? (
          // Show available staff members
          availableStaff.map(staff => (
            <DraggableStaffItem key={staff.id} staff={staff} />
          ))
        ) : (
          // Show message when no staff available
          <div className="text-gray-500 text-center py-2 col-span-full text-xs">
            {isInIframe ? 'Waiting for staff data from parent window...' : 'No staff available for this date'}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AvailableStaffDisplay;
