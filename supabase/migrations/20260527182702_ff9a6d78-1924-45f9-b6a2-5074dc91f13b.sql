-- Ta bort auto-skapande av medel-projekt vid CONFIRMED-booking.
-- Projekt ska skapas FÖRST när användaren trycker "Placera" och väljer Medel/Stort
-- i BookingPlacementDialog. Funktionen behålls kvar (kan kallas manuellt vid behov)
-- men trigger-kopplingen tas bort.
DROP TRIGGER IF EXISTS trg_auto_create_project_for_booking ON public.bookings;