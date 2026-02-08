import { useState } from "react";
import { Link } from "react-router-dom";
import { 
  User, Calendar, MapPin, Phone, Mail, ChevronDown, ChevronUp, 
  AlertTriangle, StickyNote, ExternalLink, Truck, Hammer, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import ProjectScheduleTimeline from "./ProjectScheduleTimeline";

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
}

const BookingInfoExpanded = ({ booking, projectLeader }: BookingInfoExpandedProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const hasLogistics = booking.carry_more_than_10m || booking.ground_nails_allowed !== undefined || booking.exact_time_needed;
  const hasAddress = booking.deliveryaddress || booking.delivery_city || booking.delivery_postal_code;

  return (
    <Card className="mb-6 border-border">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        {/* Always visible summary */}
        <div className="p-4">
          {/* Row 1: Key info + actions */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold text-foreground">{booking.client}</span>
              </div>
              {booking.booking_number && (
                <div className="text-sm text-muted-foreground">
                  Bokning: <span className="font-medium text-foreground">{booking.booking_number}</span>
                </div>
              )}
              {projectLeader && (
                <div className="flex items-center gap-1.5 text-sm">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary">
                      {projectLeader.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-muted-foreground">Projektledare:</span>
                  <span className="font-medium text-foreground">{projectLeader}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Link to={`/booking/${booking.id}`}>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Visa bokning
                </Button>
              </Link>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {isExpanded ? 'Mindre' : 'Mer info'}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>

          {/* Row 2: Schedule timeline */}
          <ProjectScheduleTimeline
            rigDate={booking.rigdaydate}
            eventDate={booking.eventdate}
            rigdownDate={booking.rigdowndate}
          />
        </div>

        {/* Expandable content */}
        <CollapsibleContent>
          <div className="px-4 pb-4 pt-2 border-t border-border">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
              {/* Address section */}
              {hasAddress && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Leveransadress</span>
                  </div>
                  {booking.deliveryaddress && (
                    <p className="text-sm text-foreground">{booking.deliveryaddress}</p>
                  )}
                  <p className="text-sm text-foreground">
                    {[booking.delivery_postal_code, booking.delivery_city].filter(Boolean).join(' ')}
                  </p>
                </div>
              )}

              {/* Contact section */}
              {booking.contact_name && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Kontaktperson</span>
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

              {/* Logistics section */}
              {hasLogistics && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Truck className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Logistik</span>
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
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex items-center gap-2 mb-2">
                  <StickyNote className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Interna anteckningar</span>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/50 rounded-lg p-3">
                  {booking.internalnotes}
                </p>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default BookingInfoExpanded;
