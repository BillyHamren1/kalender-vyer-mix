import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface StaffAssignmentWarningProps {
  bookingId: string;
  status: string;
}

const StaffAssignmentWarning: React.FC<StaffAssignmentWarningProps> = ({ bookingId, status }) => {
  const isConfirmed = status === 'CONFIRMED' || status === 'Bekräftad';

  const { data: hasStaff } = useQuery({
    queryKey: ['booking-staff-check', bookingId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('booking_staff_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('booking_id', bookingId);
      if (error) return true; // Don't show warning on error
      return (count ?? 0) > 0;
    },
    enabled: isConfirmed,
  });

  if (!isConfirmed || hasStaff !== false) return null;

  return (
    <Alert variant="destructive" className="border-destructive/50 bg-destructive/10 text-destructive">
      <AlertTriangle className="h-4 w-4 text-destructive" />
      <AlertDescription className="text-sm">
        Ingen personal är tilldelad denna bokning. Den visas inte i personalkalendern förrän personal tilldelas via planeringen.
      </AlertDescription>
    </Alert>
  );
};

export default StaffAssignmentWarning;
