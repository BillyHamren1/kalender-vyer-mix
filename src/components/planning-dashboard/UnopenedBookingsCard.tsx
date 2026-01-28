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
      <CardContent>
        {bookings.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Inga oöppnade bokningar
          </p>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {bookings.map((booking) => (
              <div
                key={booking.id}
                onClick={() => handleClick(booking.id)}
                className="p-3 rounded-lg border bg-accent/50 border-border hover:bg-accent cursor-pointer transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {booking.client}
                      </span>
                      {booking.bookingNumber && (
                        <Badge variant="outline" className="text-xs shrink-0">
                          #{booking.bookingNumber}
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex flex-col gap-1 mt-1.5 text-xs text-muted-foreground">
                      {booking.eventDate && (
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3 h-3" />
                          <span>
                            {format(parseISO(booking.eventDate), "d MMM yyyy", { locale: sv })}
                          </span>
                        </div>
                      )}
                      {booking.deliveryAddress && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3 h-3" />
                          <span className="truncate">{booking.deliveryAddress}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <Clock className="w-3 h-3" />
                    <span>
                      {format(parseISO(booking.createdAt), "d/M HH:mm", { locale: sv })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default UnopenedBookingsCard;
