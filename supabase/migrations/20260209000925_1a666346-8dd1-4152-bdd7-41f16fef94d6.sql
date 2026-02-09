-- Add missing foreign key from transport_assignments.booking_id to bookings.id
ALTER TABLE public.transport_assignments
ADD CONSTRAINT transport_assignments_booking_id_fkey
FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;