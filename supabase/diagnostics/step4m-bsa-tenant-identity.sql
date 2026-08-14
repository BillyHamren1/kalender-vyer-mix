-- STEG 4M – READ-ONLY diagnostik för booking_staff_assignments tenant-identitet.
-- Innehåller INGA DELETE/UPDATE/TRUNCATE. Kör manuellt i SQL-editorn.

-- 1) Alla unika nycklar/index på tabellen
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'booking_staff_assignments'
ORDER BY indexname;

-- 2) Blockerare för den tenant-säkra nyckeln (ska vara 0 rader)
SELECT organization_id, booking_id, staff_id, assignment_date, count(*) AS rows,
       array_agg(id ORDER BY created_at) AS bsa_ids
FROM public.booking_staff_assignments
GROUP BY 1,2,3,4
HAVING count(*) > 1
ORDER BY rows DESC;

-- 3) Rader som skulle kollidera under den GAMLA globala nyckeln
--    (samma booking/staff/datum i flera organisationer)
SELECT booking_id, staff_id, assignment_date,
       count(DISTINCT organization_id) AS orgs,
       array_agg(DISTINCT organization_id) AS organization_ids
FROM public.booking_staff_assignments
GROUP BY 1,2,3
HAVING count(DISTINCT organization_id) > 1
ORDER BY orgs DESC;

-- 4) Kvarvarande beroenden av den globala unique-nyckeln
--    (funktioner vars ON CONFLICT saknar organization_id)
SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosrc ILIKE '%booking_staff_assignments%'
  AND p.prosrc ILIKE '%ON CONFLICT (booking_id, staff_id, assignment_date)%'
ORDER BY p.proname;
