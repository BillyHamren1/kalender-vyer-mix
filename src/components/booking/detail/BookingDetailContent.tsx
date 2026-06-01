
import React from 'react';
import { Booking } from '@/types/booking';
import { ClientInformation } from '../ClientInformation';
import { DeliveryInformationCard } from '../DeliveryInformationCard';
import ProjectAssignmentCard from '../ProjectAssignmentCard';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { CalendarIcon } from 'lucide-react';
import ProjectScheduleEditable from '@/components/project/ProjectScheduleEditable';
import { ProductsList } from '../ProductsList';
import { AttachmentsList } from '../AttachmentsList';
import { InternalNotes } from '../InternalNotes';
import { MapDrawingCard } from '../MapDrawingCard';
import BookingEconomicsCard from '../BookingEconomicsCard';
import PackingStatusCard from '../PackingStatusCard';
import StaffAssignmentWarning from '../StaffAssignmentWarning';
import BookingTodosChecklist from './BookingTodosChecklist';

interface BookingDetailContentProps {
  booking: Booking;
  rigDates: string[];
  eventDates: string[];
  rigDownDates: string[];
  isSaving: boolean;
  onAddDate: (date: Date, eventType: 'rig' | 'event' | 'rigDown', autoSync: boolean) => void;
  onRemoveDate: (date: string, eventType: 'rig' | 'event' | 'rigDown', autoSync: boolean) => void;
  onEditDate: (oldDate: string, newDate: string, startTime: string, endTime: string, eventType: 'rig' | 'event' | 'rigDown') => void;
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
  onEditDate,
  onDeliveryDetailsChange,
  onInternalNotesChange,
  isSavingInternalNotes,
  onAttachmentAdded,
  onAttachmentDeleted,
  onAttachmentRenamed
}) => {
  return (
    <div className="space-y-6">
      <StaffAssignmentWarning bookingId={booking.id} status={booking.status} />
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
          <PackingStatusCard bookingId={booking.id} />
          <ProjectAssignmentCard 
            assignedProjectId={booking.assignedProjectId}
            assignedProjectName={booking.assignedProjectName}
            assignedToProject={booking.assignedToProject}
          />
        </div>
        
        <div className="space-y-6">
          {/*
            Schedule layout — shared with project view (ProjectScheduleEditable).
            All three slots (RIGG / EVENT / NEDRIVNING) are ALWAYS visible, even
            when empty. Single-source-of-truth: update flows directly through
            updateBookingDatesViaApi — no separate "+ Add date" widget.
          */}
          <Card className="shadow-sm">
            <CardHeader className="py-3 px-4">
              <CardTitle className="flex items-center gap-1.5 text-base">
                <CalendarIcon className="h-4 w-4" />
                <span>Schema</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-1 px-4 pb-4">
              <ProjectScheduleEditable
                bookingId={booking.id}
                rigDate={rigDates[0] ?? null}
                eventDate={eventDates[0] ?? null}
                rigdownDate={rigDownDates[0] ?? null}
                rigStartTime={booking.rigStartTime ?? null}
                rigEndTime={booking.rigEndTime ?? null}
                eventStartTime={booking.eventStartTime ?? null}
                eventEndTime={booking.eventEndTime ?? null}
                rigdownStartTime={booking.rigDownStartTime ?? null}
                rigdownEndTime={booking.rigDownEndTime ?? null}
                onUpdated={() => window.location.reload()}
              />
            </CardContent>
          </Card>
          <BookingTodosChecklist
            bookingId={booking.id}
            largeProjectId={booking.largeProjectId ?? null}
            rigDates={rigDates}
            eventDates={eventDates}
            rigDownDates={rigDownDates}
          />
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

      {/* Economics full-width section */}
      {booking.economics && (
        <BookingEconomicsCard economics={booking.economics} />
      )}
    </div>
  );
};

export default BookingDetailContent;
