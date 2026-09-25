\set ON_ERROR_STOP 1
CREATE TEMP TABLE r(name text, ok boolean, detail text); GRANT ALL ON r TO authenticated, service_role, anon;
CREATE OR REPLACE FUNCTION pg_temp.as_user(u text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 PERFORM set_config('request.jwt.claim.sub',u,true); EXECUTE 'SET LOCAL ROLE authenticated'; END $$;
SELECT e2e_snapshot() AS snap0 \gset

-- T1 success + legacy + primary
BEGIN; SELECT pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
SELECT link_booking_to_large_project('11111111-0000-0000-0000-000000000001','e2e-a1',true) AS l1 \gset
INSERT INTO r SELECT 'T1 success: join+legacy+primary',
 (select count(*) from large_project_bookings where booking_id='e2e-a1')=1
 and (select large_project_id from bookings where id='e2e-a1')='11111111-0000-0000-0000-000000000001'
 and (select primary_booking_id from large_projects where id='11111111-0000-0000-0000-000000000001')='e2e-a1', null;
-- T2 idempotens
INSERT INTO r SELECT 'T2 idempotent (samma link-id, ingen dubblett)',
 link_booking_to_large_project('11111111-0000-0000-0000-000000000001','e2e-a1',true)=:'l1'
 and (select count(*) from large_project_bookings where booking_id='e2e-a1')=1, null;
-- T3 primary endast en gång
SELECT link_booking_to_large_project('11111111-0000-0000-0000-000000000001','e2e-a2',true);
INSERT INTO r SELECT 'T3 primary sätts bara en gång',
 (select primary_booking_id from large_projects where id='11111111-0000-0000-0000-000000000001')='e2e-a1'
 and (select sort_order from large_project_bookings where booking_id='e2e-a2')=2, null;
-- T4 aktiv konflikt
DO $$ BEGIN PERFORM link_booking_to_large_project('11111111-0000-0000-0000-000000000002','e2e-a1',false);
 INSERT INTO r VALUES ('T4 aktiv projektkonflikt avvisas',false,'ingen exception');
EXCEPTION WHEN unique_violation THEN INSERT INTO r VALUES ('T4 aktiv projektkonflikt avvisas', SQLERRM LIKE 'BOOKING_IN_OTHER_PROJECT:11111111-0000-0000-0000-000000000001%', SQLERRM); END $$;
INSERT INTO r SELECT 'T4b konflikt lämnade ingen halv länk', (select count(*) from large_project_bookings where large_project_id='11111111-0000-0000-0000-000000000002')=0
 and (select large_project_id from bookings where id='e2e-a1')='11111111-0000-0000-0000-000000000001', null;
-- T5 soft-deleted projekt blockerar inte återanvändning
SELECT link_booking_to_large_project('11111111-0000-0000-0000-000000000002','e2e-a4',false);
INSERT INTO r SELECT 'T5 återanvändning efter soft-delete', (select large_project_id from bookings where id='e2e-a4')='11111111-0000-0000-0000-000000000002'
 and (select count(*) from large_project_bookings where booking_id='e2e-a4')=2, 'gamla raden kvar för restore';
-- T6 raderat projekt som mål
DO $$ BEGIN PERFORM link_booking_to_large_project('11111111-0000-0000-0000-000000000003','e2e-a3',false); INSERT INTO r VALUES ('T6 soft-raderat mål avvisas',false,null);
EXCEPTION WHEN no_data_found THEN INSERT INTO r VALUES ('T6 soft-raderat mål avvisas', SQLERRM='PROJECT_NOT_FOUND', SQLERRM); END $$;
-- T7 cross-org: org A-användare mot org B-bokning (RLS gömmer -> BOOKING_NOT_FOUND)
DO $$ BEGIN PERFORM link_booking_to_large_project('11111111-0000-0000-0000-000000000001','e2e-b1',false); INSERT INTO r VALUES ('T7 RLS: annan orgs bokning',false,null);
EXCEPTION WHEN no_data_found THEN INSERT INTO r VALUES ('T7 RLS: annan orgs bokning', SQLERRM='BOOKING_NOT_FOUND', SQLERRM); END $$;
RESET ROLE;
INSERT INTO r SELECT 'T8 skyddade tabeller oförändrade (snapshot)', e2e_snapshot()=:'snap0', null;
RESET ROLE; SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END, name, coalesce(detail,'') FROM r; ROLLBACK;

-- T9 ORGANIZATION_MISMATCH (service_role förbi RLS -> explicit kontroll)
BEGIN; SET LOCAL ROLE service_role;
DO $$ BEGIN PERFORM link_booking_to_large_project('11111111-0000-0000-0000-000000000001','e2e-b1',false); INSERT INTO r VALUES ('T9 cross-org mismatch',false,null);
EXCEPTION WHEN raise_exception THEN INSERT INTO r VALUES ('T9 cross-org mismatch', SQLERRM='ORGANIZATION_MISMATCH', SQLERRM); END $$;
INSERT INTO r SELECT 'T9b mismatch ingen write', (select count(*) from large_project_bookings where booking_id='e2e-b1')=0 and (select large_project_id from bookings where id='e2e-b1') is null, null;
RESET ROLE; SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END, name, coalesce(detail,'') FROM r; ROLLBACK;

-- T10 anon nekas
BEGIN; SET LOCAL ROLE anon;
DO $$ BEGIN PERFORM link_booking_to_large_project('11111111-0000-0000-0000-000000000001','e2e-a1',false); INSERT INTO r VALUES ('T10 anon nekas',false,null);
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO r VALUES ('T10 anon nekas',true,SQLERRM); END $$;
RESET ROLE; SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END, name, coalesce(detail,'') FROM r; ROLLBACK;

-- T11 atomicitet: legacy-UPDATE tvingas fela -> join-raden rullas tillbaka
CREATE FUNCTION public.e2e_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'E2E_FORCED_FAIL'; END $$;
CREATE TRIGGER e2e_fail BEFORE UPDATE OF large_project_id ON bookings FOR EACH ROW WHEN (NEW.id='e2e-a3') EXECUTE FUNCTION e2e_fail();
BEGIN; SELECT pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
DO $$ BEGIN PERFORM link_booking_to_large_project('11111111-0000-0000-0000-000000000001','e2e-a3',true);
 INSERT INTO r VALUES ('T11 legacy-fel rullar tillbaka join',false,'ingen exception');
EXCEPTION WHEN OTHERS THEN INSERT INTO r SELECT 'T11 legacy-fel rullar tillbaka join',
 (select count(*) from large_project_bookings where booking_id='e2e-a3')=0 and (select primary_booking_id from large_projects where id='11111111-0000-0000-0000-000000000001') is null, SQLERRM; END $$;
RESET ROLE; SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END, name, coalesce(detail,'') FROM r; ROLLBACK;
DROP TRIGGER e2e_fail ON bookings; DROP FUNCTION e2e_fail();
INSERT INTO r SELECT 'T12 snapshot efter alla tester', e2e_snapshot()=:'snap0' and (select count(*) from large_project_bookings)=1, null;
SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END, name, coalesce(detail,'') FROM r;
