import { Card } from "@/components/ui/card";
import ProjectProductsList from "./ProjectProductsList";
import CustomerInfoBlock from "./CustomerInfoBlock";

interface BookingAttachment {
  id: string;
  booking_id: string;
  url: string;
  file_name: string | null;
  file_type: string | null;
  uploaded_at: string;
}

interface BookingData {
  id: string;
  client: string;
  eventdate?: string | null;
  rigdaydate?: string | null;
  rigdowndate?: string | null;
  deliveryaddress?: string | null;
  delivery_city?: string | null;
  delivery_postal_code?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  booking_number?: string | null;
  carry_more_than_10m?: boolean | null;
  ground_nails_allowed?: boolean | null;
  exact_time_needed?: boolean | null;
  exact_time_info?: string | null;
  rental_only?: boolean | null;
  internalnotes?: string | null;
  rig_start_time?: string | null;
  rig_end_time?: string | null;
  event_start_time?: string | null;
  event_end_time?: string | null;
  rigdown_start_time?: string | null;
  rigdown_end_time?: string | null;
}

interface BookingInfoExpandedProps {
  booking: BookingData;
  projectLeader?: string | null;
  bookingAttachments?: BookingAttachment[];
  onBookingUpdated?: () => void;
  packingStartDate?: string | null;
  packingEndDate?: string | null;
  onPackingDateChange?: (updates: { start_date?: string | null; end_date?: string | null }) => void;
}

const BookingInfoExpanded = ({ booking, projectLeader }: BookingInfoExpandedProps) => {
  return (
    <>
      <CustomerInfoBlock
        client={booking.client}
        bookingNumber={booking.booking_number}
        deliveryAddress={booking.deliveryaddress}
        deliveryCity={booking.delivery_city}
        deliveryPostalCode={booking.delivery_postal_code}
        contactName={booking.contact_name}
        contactPhone={booking.contact_phone}
        contactEmail={booking.contact_email}
        eventdate={booking.eventdate}
        rigdaydate={booking.rigdaydate}
        rigdowndate={booking.rigdowndate}
        carryMoreThan10m={booking.carry_more_than_10m}
        groundNailsAllowed={booking.ground_nails_allowed}
        exactTimeNeeded={booking.exact_time_needed}
        exactTimeInfo={booking.exact_time_info}
        rentalOnly={booking.rental_only}
        projectLeader={projectLeader}
      />
      <Card className="mb-4 border-border/40 rounded-2xl">
        <div className="p-5">
          <ProjectProductsList bookingId={booking.id} showGroupingControls={false} showSummary={false} />
        </div>
      </Card>
    </>
  );
};

export default BookingInfoExpanded;

