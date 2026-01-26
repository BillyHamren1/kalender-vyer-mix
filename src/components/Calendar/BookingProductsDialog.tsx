import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Package,
  Calendar,
  MapPin,
  ExternalLink,
  Plus,
  Hash,
} from "lucide-react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface BookingProduct {
  id: string;
  name: string;
  quantity: number;
  notes: string | null;
}

interface BookingData {
  id: string;
  client: string;
  booking_number: string | null;
  eventdate: string | null;
  rigdaydate: string | null;
  rigdowndate: string | null;
  deliveryaddress: string | null;
  delivery_city: string | null;
}

interface BookingProductsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string | null;
  onCreatePacking?: (bookingId: string, bookingClient: string) => void;
}

const BookingProductsDialog = ({
  open,
  onOpenChange,
  bookingId,
  onCreatePacking,
}: BookingProductsDialogProps) => {
  const navigate = useNavigate();
  const [booking, setBooking] = useState<BookingData | null>(null);
  const [products, setProducts] = useState<BookingProduct[]>([]);
  const [existingPacking, setExistingPacking] = useState<{ id: string; name: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open && bookingId) {
      fetchBookingData(bookingId);
    }
  }, [open, bookingId]);

  const fetchBookingData = async (id: string) => {
    setIsLoading(true);
    try {
      // Fetch booking
      const { data: bookingData, error: bookingError } = await supabase
        .from("bookings")
        .select("id, client, booking_number, eventdate, rigdaydate, rigdowndate, deliveryaddress, delivery_city")
        .eq("id", id)
        .maybeSingle();

      if (bookingError) throw bookingError;
      setBooking(bookingData);

      // Fetch products
      const { data: productsData, error: productsError } = await supabase
        .from("booking_products")
        .select("id, name, quantity, notes")
        .eq("booking_id", id);

      if (productsError) throw productsError;
      setProducts(productsData || []);

      // Check for existing packing
      const { data: packingData } = await supabase
        .from("packing_projects")
        .select("id, name")
        .eq("booking_id", id)
        .maybeSingle();

      setExistingPacking(packingData);
    } catch (error) {
      console.error("Error fetching booking data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewBooking = () => {
    if (bookingId) {
      navigate(`/booking/${bookingId}`);
      onOpenChange(false);
    }
  };

  const handleViewPacking = () => {
    if (existingPacking) {
      navigate(`/warehouse/packing/${existingPacking.id}`);
      onOpenChange(false);
    }
  };

  const handleCreatePacking = () => {
    if (bookingId && booking && onCreatePacking) {
      onCreatePacking(bookingId, booking.client);
      onOpenChange(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return format(new Date(dateStr), "d MMM yyyy", { locale: sv });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          {isLoading ? (
            <>
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2 mt-2" />
            </>
          ) : booking ? (
            <>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-warehouse" />
                {booking.client}
                {booking.booking_number && (
                  <Badge variant="outline" className="ml-2">
                    <Hash className="h-3 w-3 mr-1" />
                    {booking.booking_number}
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="text-left">
                Produkter och detaljer för denna bokning
              </DialogDescription>
            </>
          ) : (
            <DialogTitle>Bokning hittades inte</DialogTitle>
          )}
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : booking ? (
          <div className="space-y-4 py-2">
            {/* Dates */}
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="text-center p-2 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">Montage</p>
                <p className="font-medium">{formatDate(booking.rigdaydate)}</p>
              </div>
              <div className="text-center p-2 bg-warehouse/10 rounded-lg">
                <p className="text-xs text-muted-foreground">Event</p>
                <p className="font-medium text-warehouse">{formatDate(booking.eventdate)}</p>
              </div>
              <div className="text-center p-2 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">Demontage</p>
                <p className="font-medium">{formatDate(booking.rigdowndate)}</p>
              </div>
            </div>

            {/* Address */}
            {(booking.deliveryaddress || booking.delivery_city) && (
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>
                  {[booking.deliveryaddress, booking.delivery_city]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              </div>
            )}

            <Separator />

            {/* Products */}
            <div>
              <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                <Package className="h-4 w-4" />
                Produkter att packa
              </h4>

              {products.length === 0 ? (
                <div className="text-center py-6 bg-muted/50 rounded-lg">
                  <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                  <p className="text-sm text-muted-foreground">
                    Inga produkter registrerade
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Produkter läggs till i bokningsdetaljerna
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {products.map((product) => (
                    <div
                      key={product.id}
                      className="flex items-start justify-between p-3 bg-muted/50 rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{product.name}</p>
                        {product.notes && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {product.notes}
                          </p>
                        )}
                      </div>
                      <Badge variant="secondary" className="ml-2 flex-shrink-0">
                        {product.quantity} st
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Existing packing info */}
            {existingPacking && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-green-800">
                      Packning skapad
                    </p>
                    <p className="text-xs text-green-600">{existingPacking.name}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleViewPacking}
                    className="text-green-700 border-green-300 hover:bg-green-100"
                  >
                    Visa packning
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleViewBooking}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Visa bokning
          </Button>
          {!existingPacking && onCreatePacking && (
            <Button onClick={handleCreatePacking} className="bg-warehouse hover:bg-warehouse/90">
              <Plus className="h-4 w-4 mr-2" />
              Skapa packning
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BookingProductsDialog;
