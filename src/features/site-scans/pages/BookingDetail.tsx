import { useParams, useNavigate } from "react-router-dom";
import BookingSiteScans from "@/features/site-scans/components/booking/BookingSiteScans";
import MeasurementsTerrainCard from "@/features/site-scans/components/booking-details/MeasurementsTerrainCard";
import BookingDrawingTab from "@/features/site-scans/components/booking-details/BookingDrawingTab";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CalendarDays } from "lucide-react";

const BookingDetail = () => {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();

  return (
    <div className="flex-1 p-6 md:p-8 space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="gap-1.5 text-muted-foreground -ml-2 mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> Tillbaka
        </Button>

        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/8 border border-primary/10 flex items-center justify-center">
            <CalendarDays className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-heading">Bokning</h1>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              {bookingId ?? "—"}
            </p>
          </div>
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* Active terrain surface */}
      <MeasurementsTerrainCard bookingId={bookingId} />

      {/* Site Scans section */}
      <BookingSiteScans bookingId={bookingId} />

      {/* 3D Drawing / Terrain view */}
      <BookingDrawingTab bookingId={bookingId} />
    </div>
  );
};

export default BookingDetail;
