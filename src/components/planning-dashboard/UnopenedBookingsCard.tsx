import { Eye, Calendar, MapPin, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

interface UnopenedBooking {
  id: string;
  bookingNumber: string | null;
  client: string;
  eventDate: string | null;
  deliveryAddress: string | null;
  createdAt: string;
  status: string | null;
}

interface UnopenedBookingsCardProps {
  bookings: UnopenedBooking[];
  isLoading: boolean;
}

const UnopenedBookingsCard = ({ bookings, isLoading }: UnopenedBookingsCardProps) => {
  const navigate = useNavigate();

  const handleClick = (bookingId: string) => {
    navigate(`/bookings/${bookingId}`);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Eye className="w-4 h-4 text-destructive" />
            Nya oöppnade bokningar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <Eye className="w-4 h-4 text-destructive" />
          Nya oöppnade bokningar
          {bookings.length > 0 && (
            <Badge variant="destructive" className="ml-auto text-xs">
              {bookings.length} nya
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {bookings.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4 px-4">
            Inga oöppnade bokningar
          </p>
        ) : (
          <div className="max-h-[200px] overflow-y-auto">
            {bookings.map((booking, index) => (
              <div
                key={booking.id}
                onClick={() => handleClick(booking.id)}
                className={`flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer transition-colors ${
                  index !== bookings.length - 1 ? 'border-b border-border' : ''
                }`}
              >
                {/* Booking number badge */}
                <Badge variant="secondary" className="text-xs shrink-0 font-mono">
                  #{booking.bookingNumber || '—'}
                </Badge>
                
                {/* Client name */}
                <span className="font-medium text-sm truncate flex-1 min-w-0">
                  {booking.client}
                </span>
                
                {/* Event date - compact */}
                {booking.eventDate && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(parseISO(booking.eventDate), "d/M", { locale: sv })}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default UnopenedBookingsCard;
