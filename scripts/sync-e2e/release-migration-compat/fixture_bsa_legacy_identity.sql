-- VERIFIED_EXISTENCE_ONLY:
-- legacy global BSA-identitet (booking_id, staff_id, assignment_date).
-- Namnet är det som release-migration 20260815193400 (STEG 4Q) förväntar sig.
-- Exakt historisk CREATE-form är okänd; här skapas den som constraint (vilket
-- matchar det *_key-suffix som migrationen droppar via ALTER TABLE ... DROP CONSTRAINT).
ALTER TABLE public.booking_staff_assignments
  ADD CONSTRAINT booking_staff_assignments_booking_id_staff_id_assignment_da_key
  UNIQUE (booking_id, staff_id, assignment_date);
