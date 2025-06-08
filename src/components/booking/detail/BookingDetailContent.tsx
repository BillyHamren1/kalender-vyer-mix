
import React from 'react';
import { Booking } from '@/types/booking';
import { BookingDetailHeader } from './BookingDetailHeader';
import { ClientInformation } from '../ClientInformation';
import { DeliveryInformationCard } from '../DeliveryInformationCard';
import { EventInformationCard } from '../EventInformationCard';
import ProjectAssignmentCard from '../ProjectAssignmentCard';
import { ScheduleCard } from '../ScheduleCard';
import { ProductsList } from '../ProductsList';
import { AttachmentsList } from '../AttachmentsList';
import { InternalNotes } from '../InternalNotes';

interface BookingDetailContentProps {
  booking: Booking;
  isChanged?: boolean;
}

const BookingDetailContent: React.FC<BookingDetailContentProps> = ({ 
  booking, 
  isChanged = false 
}) => {
  return (
    <div className="space-y-6">
      <BookingDetailHeader booking={booking} isChanged={isChanged} />
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <ClientInformation client={booking.client} />
          <DeliveryInformationCard booking={booking} />
          <EventInformationCard booking={booking} />
          <ProjectAssignmentCard 
            assignedProjectId={booking.assignedProjectId}
            assignedProjectName={booking.assignedProjectName}
            assignedToProject={booking.assignedToProject}
          />
        </div>
        
        <div className="space-y-6">
          <ScheduleCard booking={booking} />
          <ProductsList products={booking.products || []} />
          <AttachmentsList attachments={booking.attachments || []} />
          <InternalNotes 
            bookingId={booking.id} 
            initialNotes={booking.internalNotes || ''} 
          />
        </div>
      </div>
    </div>
  );
};

export default BookingDetailContent;
