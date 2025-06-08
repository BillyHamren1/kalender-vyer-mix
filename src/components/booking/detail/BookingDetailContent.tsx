
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
  rigDates: string[];
  eventDates: string[];
  rigDownDates: string[];
  isSaving: boolean;
  autoSync: boolean;
  lastViewedDate: Date;
  onAddDate: (date: Date, eventType: 'rig' | 'event' | 'rigDown', autoSync: boolean) => void;
  onRemoveDate: (date: string, eventType: 'rig' | 'event' | 'rigDown', autoSync: boolean) => void;
  onDeliveryDetailsChange: (deliveryData: any) => Promise<void>;
  onLogisticsChange: (logisticsData: {
    carryMoreThan10m: boolean;
    groundNailsAllowed: boolean;
    exactTimeNeeded: boolean;
    exactTimeInfo: string;
  }) => Promise<void>;
  onInternalNotesChange: (notes: string) => Promise<void>;
  onReloadData: () => void;
  isSavingInternalNotes: boolean;
}

const BookingDetailContent: React.FC<BookingDetailContentProps> = ({ 
  booking,
  rigDates,
  eventDates,
  rigDownDates,
  isSaving,
  autoSync,
  onAddDate,
  onRemoveDate,
  onDeliveryDetailsChange,
  onLogisticsChange,
  onInternalNotesChange,
  isSavingInternalNotes
}) => {
  // Debug logging for booking data
  console.log('BookingDetailContent - booking data:', {
    id: booking.id,
    rigDayDate: booking.rigDayDate,
    eventDate: booking.eventDate,
    rigDownDate: booking.rigDownDate,
    rigDates,
    eventDates,
    rigDownDates
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <ClientInformation client={booking.client} />
          <DeliveryInformationCard 
            contactName={booking.contactName}
            contactPhone={booking.contactPhone}
            contactEmail={booking.contactEmail}
            initialAddress={booking.deliveryAddress || ''}
            initialCity={booking.deliveryCity || ''}
            initialPostalCode={booking.deliveryPostalCode || ''}
            deliveryLatitude={booking.deliveryLatitude}
            deliveryLongitude={booking.deliveryLongitude}
            bookingId={booking.id}
            isSaving={isSaving}
            onSave={onDeliveryDetailsChange}
          />
          <EventInformationCard 
            rigDates={rigDates}
            eventDates={eventDates}
            rigDownDates={rigDownDates}
            onAddDate={onAddDate}
            onRemoveDate={onRemoveDate}
            autoSync={autoSync}
            bookingRigDate={booking.rigDayDate}
            bookingEventDate={booking.eventDate}
            bookingRigDownDate={booking.rigDownDate}
          />
          <ProjectAssignmentCard 
            assignedProjectId={booking.assignedProjectId}
            assignedProjectName={booking.assignedProjectName}
            assignedToProject={booking.assignedToProject}
          />
        </div>
        
        <div className="space-y-6">
          <ScheduleCard 
            bookingId={booking.id}
            rigDates={rigDates}
            eventDates={eventDates}
            rigDownDates={rigDownDates}
            autoSync={autoSync}
            onAutoSyncChange={() => {}} // Will be implemented later
            onAddDate={onAddDate}
            onRemoveDate={onRemoveDate}
          />
          <ProductsList products={booking.products || []} />
          <AttachmentsList attachments={booking.attachments || []} />
          <InternalNotes 
            notes={booking.internalNotes || ''}
            bookingId={booking.id}
            isSaving={isSavingInternalNotes}
            onSave={onInternalNotesChange}
          />
        </div>
      </div>
    </div>
  );
};

export default BookingDetailContent;
