
import React, { useState, useEffect } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { StaffMember } from './StaffAssignmentRow';
import { syncStaffMember } from '@/services/staffService';
import { toast } from 'sonner';

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

// Draggable staff item component
const DraggableStaffItem: React.FC<{ staff: StaffMember }> = ({ staff }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'STAFF',
    item: staff,
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  }));

  return (
    <div
      ref={drag}
      className={`p-2 mb-2 bg-white border rounded shadow-sm cursor-move ${
        isDragging ? 'opacity-50' : 'opacity-100'
      }`}
    >
      <div className="font-medium">{staff.name}</div>
      {staff.email && (
        <div className="text-xs text-gray-500">{staff.email}</div>
      )}
      {staff.phone && (
        <div className="text-xs text-gray-500">{staff.phone}</div>
      )}
    </div>
  );
};

// Main component
const AvailableStaffDisplay: React.FC<AvailableStaffDisplayProps> = ({ currentDate, onStaffDrop }) => {
  const [availableStaff, setAvailableStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch available staff from the edge function
  useEffect(() => {
    const fetchAvailableStaff = async () => {
      try {
        setIsLoading(true);
        const formattedDate = currentDate.toISOString().split('T')[0];
        
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
        
        console.log('Fetched staff data:', data);
        
        if (data && data.success && data.data) {
          // Transform the data into StaffMember format
          const staffList: StaffMember[] = [];
          
          // Process each staff member and ensure they exist in our database
          for (const externalStaff of data.data as ExternalStaffMember[]) {
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
                toast.error(`Failed to sync staff member: ${externalStaff.name}`);
              }
            }
          }
          
          setAvailableStaff(staffList);
        } else {
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
  }, [currentDate]);

  // Drop zone for returning staff back to available pool
  const [{ isOver }, drop] = useDrop(() => ({
    accept: 'STAFF',
    drop: (item: StaffMember) => {
      // When a staff member is dropped back here, we remove their assignment
      onStaffDrop(item.id, null);
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
    }),
  }));

  return (
    <Card className={`border ${isOver ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Available Staff</CardTitle>
      </CardHeader>
      <CardContent ref={drop} className="pt-0">
        {isLoading ? (
          // Show skeletons while loading
          <>
            <Skeleton className="h-12 mb-2" />
            <Skeleton className="h-12 mb-2" />
            <Skeleton className="h-12" />
          </>
        ) : availableStaff.length > 0 ? (
          // Show available staff members
          availableStaff.map(staff => (
            <DraggableStaffItem key={staff.id} staff={staff} />
          ))
        ) : (
          // Show message when no staff available
          <div className="text-gray-500 text-center py-4">
            No staff available for this date
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AvailableStaffDisplay;
