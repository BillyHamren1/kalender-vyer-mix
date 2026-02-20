import { 
  User, MapPin, Phone, Mail, 
  AlertTriangle, StickyNote, Truck, Hammer, Clock, Package
} from "lucide-react";
import { Card } from "@/components/ui/card";
import ProjectScheduleTimeline from "./ProjectScheduleTimeline";
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
}

interface BookingInfoExpandedProps {
  booking: BookingData;
  projectLeader?: string | null;
  bookingAttachments?: BookingAttachment[];
}

const BookingInfoExpanded = ({ booking, projectLeader, bookingAttachments = [] }: BookingInfoExpandedProps) => {
  const hasLogistics = booking.carry_more_than_10m || booking.ground_nails_allowed !== undefined || booking.exact_time_needed;
  const hasAddress = booking.deliveryaddress || booking.delivery_city || booking.delivery_postal_code;

  return (
    <Card className="mb-4 border-border/40 shadow-2xl rounded-2xl">
      {/* Key info */}
      <div className="p-5">
        <div className="flex items-center gap-6 flex-wrap mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--gradient-icon)', boxShadow: 'var(--shadow-icon)' }}
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
          {projectLeader && (
            <div className="flex items-center gap-1.5 text-sm">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: 'var(--gradient-icon)' }}
              >
                <span className="text-xs font-bold text-primary-foreground">
                  {projectLeader.charAt(0).toUpperCase()}
                </span>
              </div>
              <span className="text-muted-foreground">Projektledare:</span>
              <span className="font-medium text-foreground">{projectLeader}</span>
            </div>
          )}
        </div>

        {/* Schedule timeline */}
        <ProjectScheduleTimeline
          rigDate={booking.rigdaydate}
          eventDate={booking.eventdate}
          rigdownDate={booking.rigdowndate}
        />
      </div>

      {/* Address / Contact / Logistics */}
      <div className="px-5 pb-5 pt-2 border-t border-border/40 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
          {hasAddress && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Leveransadress</span>
              </div>
              {booking.deliveryaddress && (
                <p className="text-sm text-foreground">{booking.deliveryaddress}</p>
              )}
              <p className="text-sm text-foreground">
                {[booking.delivery_postal_code, booking.delivery_city].filter(Boolean).join(' ')}
              </p>
            </div>
          )}

          {booking.contact_name && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 mb-2">
                <Phone className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Kontaktperson</span>
              </div>
              <p className="text-sm font-medium text-foreground">{booking.contact_name}</p>
              {booking.contact_phone && (
                <a href={`tel:${booking.contact_phone}`} className="text-sm text-primary hover:underline flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {booking.contact_phone}
                </a>
              )}
              {booking.contact_email && (
                <a href={`mailto:${booking.contact_email}`} className="text-sm text-primary hover:underline flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {booking.contact_email}
                </a>
              )}
            </div>
          )}

          {hasLogistics && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <Truck className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Logistik</span>
              </div>
              <div className="space-y-1.5">
                {booking.carry_more_than_10m && (
                  <div className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                    <span className="text-foreground">Bärningsavstånd &gt; 10m</span>
                  </div>
                )}
                {booking.ground_nails_allowed !== null && booking.ground_nails_allowed !== undefined && (
                  <div className="flex items-center gap-2 text-sm">
                    <Hammer className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-foreground">
                      Markspett: {booking.ground_nails_allowed ? 'Tillåtet' : 'Ej tillåtet'}
                    </span>
                  </div>
                )}
                {booking.exact_time_needed && (
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-3.5 w-3.5 text-destructive" />
                    <span className="text-foreground">
                      Exakt tid krävs{booking.exact_time_info ? `: ${booking.exact_time_info}` : ''}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Internal notes */}
        {booking.internalnotes && (
          <div className="pt-2 border-t border-border/40">
            <div className="flex items-center gap-2 mb-2">
              <StickyNote className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Interna anteckningar</span>
            </div>
            <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/50 rounded-xl p-3">
              {booking.internalnotes}
            </p>
          </div>
        )}
      </div>

      {/* Equipment */}
      <div className="px-5 pb-2 border-t border-border/40">
        <div className="flex items-center gap-2 mt-4 mb-3">
          <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-primary/10">
            <Package className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-base font-semibold text-foreground tracking-tight">Utrustning</h2>
        </div>
        <ProjectProductsList bookingId={booking.id} />
      </div>

    </Card>
  );
};

export default BookingInfoExpanded;
