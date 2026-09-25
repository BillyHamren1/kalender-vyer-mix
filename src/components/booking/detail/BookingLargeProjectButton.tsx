import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AddToLargeProjectDialog } from '@/components/project/AddToLargeProjectDialog';
import { findActiveLargeProjectForBooking } from '@/lib/largeProject/largeProjectMembers';

interface Props {
  bookingId: string;
  bookingClient?: string;
}

/** Visar grupprojektet bokningen ingår i, eller låter användaren koppla den. */
export const BookingLargeProjectButton: React.FC<Props> = ({ bookingId, bookingClient }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data: project, isLoading } = useQuery({
    queryKey: ['booking-large-project', bookingId],
    queryFn: () => findActiveLargeProjectForBooking(bookingId),
  });

  if (isLoading) return null;
  if (project) {
    return (
      <Button variant="outline" size="sm" onClick={() => navigate(`/large-project/${project.id}`)}>
        <Building2 className="h-4 w-4 mr-1" />
        Stort projekt: {project.name || 'Öppna'}
      </Button>
    );
  }
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Building2 className="h-4 w-4 mr-1" />
        Koppla till stort projekt
      </Button>
      <AddToLargeProjectDialog open={open} onOpenChange={setOpen} bookingId={bookingId} bookingClient={bookingClient} />
    </>
  );
};
