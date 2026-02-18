
import React from 'react';
import { Booking } from '@/types/booking';
import { ClientInformation } from '../ClientInformation';
import { DeliveryInformationCard } from '../DeliveryInformationCard';
import ProjectAssignmentCard from '../ProjectAssignmentCard';
import { ScheduleCard } from '../ScheduleCard';
import { ProductsList } from '../ProductsList';
import { AttachmentsList } from '../AttachmentsList';
import { InternalNotes } from '../InternalNotes';
import { MapDrawingCard } from '../MapDrawingCard';
import BookingEconomicsCard from '../BookingEconomicsCard';

interface BookingDetailContentProps {
  booking: Booking;
  rigDates: string[];
  eventDates: string[];
  rigDownDates: string[];
  isSaving: boolean;
  onAddDate: (date: Date, eventType: 'rig' | 'event' | 'rigDown', autoSync: boolean) => void;
  onRemoveDate: (date: string, eventType: 'rig' | 'event' | 'rigDown', autoSync: boolean) => void;
  onDeliveryDetailsChange: (deliveryData: any) => Promise<void>;
  onInternalNotesChange: (notes: string) => Promise<void>;
  isSavingInternalNotes: boolean;
  onAttachmentAdded?: (attachment: any) => void;
  onAttachmentDeleted?: (attachmentId: string) => void;
  onAttachmentRenamed?: (attachmentId: string, newName: string) => void;
}

const BookingDetailContent: React.FC<BookingDetailContentProps> = ({ 
  booking,
  rigDates,
  eventDates,
  rigDownDates,
  isSaving,
  onAddDate,
  onRemoveDate,
  onDeliveryDetailsChange,
  onInternalNotesChange,
  isSavingInternalNotes,
  onAttachmentAdded,
  onAttachmentDeleted,
  onAttachmentRenamed
}) => {
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
          <MapDrawingCard mapDrawingUrl={booking.mapDrawingUrl} />
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
            onAddDate={onAddDate}
            onRemoveDate={onRemoveDate}
          />
          {booking.economics && <BookingEconomicsCard economics={booking.economics} />}
          <ProductsList products={booking.products || []} />
          <AttachmentsList 
            bookingId={booking.id}
            attachments={booking.attachments || []} 
            onAttachmentAdded={onAttachmentAdded}
            onAttachmentDeleted={onAttachmentDeleted}
            onAttachmentRenamed={onAttachmentRenamed}
          />
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
