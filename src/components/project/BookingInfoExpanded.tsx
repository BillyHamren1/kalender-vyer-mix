import { 
  User, MapPin, Phone, Mail, 
  AlertTriangle, StickyNote, Truck, Hammer, Clock, Package, Calendar as CalendarIcon
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import ProjectScheduleEditable from "./ProjectScheduleEditable";
import ProjectProductsList from "./ProjectProductsList";

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

const BookingInfoExpanded = ({ booking, projectLeader, bookingAttachments = [], onBookingUpdated, packingStartDate, packingEndDate, onPackingDateChange }: BookingInfoExpandedProps) => {
  const hasLogistics = booking.carry_more_than_10m || booking.ground_nails_allowed !== undefined || booking.exact_time_needed;
  const hasAddress = booking.deliveryaddress || booking.delivery_city || booking.delivery_postal_code;
  const hasPackingDates = packingStartDate !== undefined || packingEndDate !== undefined;
  const isWarehouseView = !!onPackingDateChange;

  return (
    <Card className="mb-4 border-border/40 shadow-2xl rounded-2xl">
      <div className="p-5">
        <div className="flex items-center gap-6 flex-wrap mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: isWarehouseView ? 'linear-gradient(135deg, hsl(38 92% 55%) 0%, hsl(32 95% 40%) 100%)' : 'var(--gradient-icon)', boxShadow: isWarehouseView ? undefined : 'var(--shadow-icon)' }}
            >
              <User className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground tracking-tight">{booking.client}</span>
          </div>
          {booking.booking_number && (
            <div className="text-sm text-muted-foreground">
              Bokning: <span className="font-medium text-foreground">{booking.booking_number}</span>
            </div>
          )}
        </div>

        <ProjectProductsList bookingId={booking.id} />
      </div>
    </Card>
  );
};

export default BookingInfoExpanded;
