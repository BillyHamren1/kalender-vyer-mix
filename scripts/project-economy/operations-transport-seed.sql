-- ISOLATED SYNTHETIC DATABASE ONLY. Actual source/route enrollment stays default-disabled.
insert into public.operations_personnel_source_bindings
  (organization_id,worker_id,time_organization_id,time_auth_worker_id,time_personnel_id,time_source_system,external_personnel_id,enabled)
values('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444',
  '22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',
  '99999999-9999-4999-8999-999999999999','planning','44444444-4444-4444-8444-444444444444',true);
insert into public.operations_personnel_target_bindings
  (organization_id,source_system,target_kind,external_id,target_version,source_project_id,source_booking_id,currency,source_reference)
values
('11111111-1111-4111-8111-111111111111','planning','project','55555555-5555-4555-8555-555555555555','binding-v1',
 '55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666','SEK','isolated-engine-fixture-v1'),
('11111111-1111-4111-8111-111111111111','planning','booking','66666666-6666-4666-8666-666666666666','operations-target-v1',
 '55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666','SEK','isolated-real-time-builder-fixture-v1');
insert into public.operations_personnel_rate_history
 (organization_id,worker_id,rate_revision,category,currency,hourly_rate_minor,effective_from,effective_to,source_reference)
values('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444',
 'rate-v1','work','SEK',30000,'2026-10-01','2026-10-02','isolated-synthetic-approved-rate-v1');
insert into public.operations_personnel_transport_routes
 (organization_id,destination_organization_id,key_id,endpoint_url,enabled)
values('11111111-1111-4111-8111-111111111111','77777777-7777-4777-8777-777777777777','fixture_ops_key',
 'https://localhost:55504/functions/v1/operations-personnel-cost-receive',true);
