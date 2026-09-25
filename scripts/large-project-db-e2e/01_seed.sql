-- ORG_A = aaaa..., ORG_B = bbbb...; användare uA (org A), uB (org B)
INSERT INTO profiles VALUES ('00000000-0000-0000-0000-00000000000a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),('00000000-0000-0000-0000-00000000000b','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
INSERT INTO large_projects(id,organization_id,name,deleted_at) VALUES
 ('11111111-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','E2E-P1',null),
 ('11111111-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','E2E-P2',null),
 ('11111111-0000-0000-0000-000000000003','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','E2E-P3-deleted',now()),
 ('22222222-0000-0000-0000-000000000001','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','E2E-PB',null);
INSERT INTO bookings VALUES
 ('e2e-a1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','2605-1','Kund A1','CONFIRMED',null,'2026-10-01','2026-10-02','2026-10-03'),
 ('e2e-a2','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','2605-2','Kund A2','CONFIRMED',null,'2026-10-05','2026-10-06','2026-10-07'),
 ('e2e-a3','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','2605-3','Kund A3','CONFIRMED',null,null,'2026-10-08',null),
 ('e2e-a4','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','2605-4','Kund A4','CONFIRMED','11111111-0000-0000-0000-000000000003',null,null,null),
 ('e2e-b1','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','9001','Kund B1','CONFIRMED',null,null,null,null);
INSERT INTO large_project_bookings(large_project_id,booking_id,sort_order,organization_id) VALUES ('11111111-0000-0000-0000-000000000003','e2e-a4',1,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
INSERT INTO booking_products(booking_id,name,quantity,organization_id) SELECT id,'Tält '||id,3,organization_id FROM bookings;
INSERT INTO calendar_events(booking_id,event_type,start_time,resource_id,organization_id) SELECT id,'rig','2026-10-01 07:00+00','team-1',organization_id FROM bookings;
INSERT INTO packing_projects(booking_id,status,organization_id) SELECT id,'planning',organization_id FROM bookings;
INSERT INTO packing_list_items(packing_id,quantity_packed,organization_id) SELECT id,1,organization_id FROM packing_projects;
-- Snapshot-funktion: hash av skyddade tabeller (exkl. bookings.large_project_id som RPC:n får ändra)
CREATE FUNCTION public.e2e_snapshot() RETURNS text LANGUAGE sql AS $$
 select md5(string_agg(x,'|' order by x)) from (
  select 'b:'||(b.id,b.organization_id,b.booking_number,b.client,b.status,b.rigdaydate,b.eventdate,b.rigdowndate)::text x from bookings b
  union all select 'bp:'||t::text from booking_products t
  union all select 'ce:'||t::text from calendar_events t
  union all select 'pp:'||t::text from packing_projects t
  union all select 'pli:'||t::text from packing_list_items t) s $$;
