-- STEG 4O · Cleanup: raderar ENDAST data som E2E-sviten själv kan ha skapat.
-- Alla sektioner rullar tillbaka sina transaktioner, så detta är ett skyddsnät
-- ifall en sektion avbröts på ett sätt som lämnade rader kvar.
-- Körs bara i bekräftad testmiljö (se preflight). Rör aldrig annan data.
\set ON_ERROR_STOP on
BEGIN;

DELETE FROM public.booking_staff_assignments WHERE booking_id LIKE 'E2E-%';
DELETE FROM public.staff_assignments WHERE staff_id LIKE 'E2E-%';
DELETE FROM public.calendar_events WHERE booking_id LIKE 'E2E-%';
DELETE FROM public.warehouse_assignments WHERE booking_id LIKE 'E2E-%' OR staff_id LIKE 'E2E-%';
DELETE FROM public.sync_batch_jobs WHERE job_id IN (SELECT id FROM public.booking_sync_jobs WHERE booking_id LIKE 'E2E-%');
DELETE FROM public.booking_sync_jobs WHERE booking_id LIKE 'E2E-%';
DELETE FROM public.booking_source_state WHERE booking_id LIKE 'E2E-%';
DELETE FROM public.bookings WHERE id LIKE 'E2E-%';
DELETE FROM public.staff_members WHERE id LIKE 'E2E-%';
DELETE FROM public.sync_batches WHERE sync_type LIKE 'e2e_%';
DELETE FROM public.sync_state WHERE sync_type LIKE 'e2e_%';
DELETE FROM public.organizations WHERE slug LIKE 'e2e-%';

COMMIT;
