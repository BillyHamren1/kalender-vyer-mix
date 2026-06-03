BEGIN;

UPDATE public.bookings
   SET large_project_id = 'a5d3f31b-13dd-4850-b091-3f6f83fa753c'
 WHERE large_project_id = '2c7e393c-9fd8-478b-997f-faddb2aeefa3';

UPDATE public.large_project_bookings
   SET large_project_id = 'a5d3f31b-13dd-4850-b091-3f6f83fa753c'
 WHERE large_project_id = '2c7e393c-9fd8-478b-997f-faddb2aeefa3';

DELETE FROM public.large_project_staff
 WHERE large_project_id = '2c7e393c-9fd8-478b-997f-faddb2aeefa3'
   AND staff_id IN (
     SELECT staff_id FROM public.large_project_staff
      WHERE large_project_id = 'a5d3f31b-13dd-4850-b091-3f6f83fa753c'
   );

UPDATE public.large_project_staff
   SET large_project_id = 'a5d3f31b-13dd-4850-b091-3f6f83fa753c'
 WHERE large_project_id = '2c7e393c-9fd8-478b-997f-faddb2aeefa3';

COMMIT;