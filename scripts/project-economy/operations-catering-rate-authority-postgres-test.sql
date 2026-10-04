-- Isolated JWT-claim/RPC fixture. No real authenticated user or hosted source.
-- Actual person inactivity/history remains a separate protected source-read gate.
begin;
insert into public.operations_catering_publish_gates values('11111111-1111-4111-8111-111111111111',true);
insert into public.operations_catering_source_bindings values
 ('11111111-1111-4111-8111-111111111111','99999999-9999-4999-8999-999999999999','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','https://catering.example/api/project-economy-read','catering-rate-key',true),
 ('11111111-1111-4111-8111-111111111111','66666666-6666-4666-8666-666666666666','33333333-3333-4333-8333-333333333333','45454545-4545-4545-8545-454545454545','https://catering.example/api/project-economy-read','catering-rate-key',false);
insert into public.operations_personnel_source_bindings values
 ('11111111-1111-4111-8111-111111111111','77777777-7777-4777-8777-777777777777','22222222-2222-4222-8222-222222222222','55555555-5555-4555-8555-555555555555','88888888-8888-4888-8888-888888888888','time','existing-Time-path',false);
insert into public.operations_personnel_rate_history(organization_id,worker_id,rate_revision,category,currency,hourly_rate_minor,effective_from,effective_to,source_reference)
 values('11111111-1111-4111-8111-111111111111','99999999-9999-4999-8999-999999999999','native-saved-August','work','SEK',20001,'2026-08-01','2026-09-01','isolated-saved-historical-rate');
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
do $test$
declare command jsonb:='{"schema":"operations-personnel-rate-admin.v1","worker_id":"99999999-9999-4999-8999-999999999999","rate_revision":"native-September","category":"work","currency":"SEK","hourly_rate_minor":30001,"effective_from":"2026-09-01","effective_to":"2026-10-01","reason":"Isolated native historical-rate enrollment","source_reference":"isolated-native-actual-scope","idempotency_key":"fixture-native-rate-admin-1","expected_history_sequence":0}';r jsonb;caught boolean;
begin
 r:=public.enroll_operations_personnel_rate_v1(command);
 if r->>'status'<>'accepted' then raise exception 'Catering-only administrator could not enroll historical rate';end if;
 r:=public.enroll_operations_personnel_rate_v1(command);
 if r->>'status'<>'duplicate' then raise exception 'native admin exact replay failed';end if;
 r:=public.get_operations_personnel_rate_history_v1('99999999-9999-4999-8999-999999999999');
 if jsonb_array_length(r->'rates')<>2 or not exists(select 1 from jsonb_array_elements(r->'rates') x where x->>'rate_revision'='native-saved-August' and x->>'hourly_rate_minor'='20001')
 then raise exception 'new native rate revised original historical amount';end if;
 caught:=false;begin perform public.get_operations_personnel_rate_history_v1('66666666-6666-4666-8666-666666666666');exception when insufficient_privilege then caught:=true;end;
 if not caught then raise exception 'disabled native enrollment authorized admin';end if;
 -- Original Time path retains its original existence semantics unchanged.
 perform public.get_operations_personnel_rate_history_v1('77777777-7777-4777-8777-777777777777');
 perform set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
 caught:=false;begin perform public.get_operations_personnel_rate_history_v1('99999999-9999-4999-8999-999999999999');exception when insufficient_privilege then caught:=true;end;
 if not caught then raise exception 'foreign organization admin authorized native worker';end if;
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009999',true);
 caught:=false;begin perform public.get_operations_personnel_rate_history_v1('99999999-9999-4999-8999-999999999999');exception when insufficient_privilege then caught:=true;end;
 if not caught then raise exception 'unknown or removed authenticated system user authorized native rates';end if;
 perform set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
 caught:=false;begin perform public.get_operations_personnel_rate_history_v1('99999999-9999-4999-8999-999999999999');exception when insufficient_privilege then caught:=true;end;
 if not caught then raise exception 'nonadmin occupational/project role authorized rate admin';end if;
 perform set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
 caught:=false;begin perform operations_economy_private.authorize_rate_admin_v1('99999999-9999-4999-8999-999999999999');exception when insufficient_privilege then caught:=true;end;
 if not caught then raise exception 'private native authority was directly callable';end if;
end;$test$;
reset role;
update public.operations_catering_source_bindings set enabled=false where worker_id='99999999-9999-4999-8999-999999999999';
set local role authenticated;
do $test$ declare caught boolean:=false;begin
 begin perform public.get_operations_personnel_rate_history_v1('99999999-9999-4999-8999-999999999999');exception when insufficient_privilege then caught:=true;end;
 if not caught then raise exception 'revoked native enrollment retained future admin authority';end if;
end;$test$;
reset role;
update public.operations_catering_source_bindings set enabled=true where worker_id='99999999-9999-4999-8999-999999999999';
update public.operations_catering_publish_gates set enabled=false where organization_id='11111111-1111-4111-8111-111111111111';
set local role authenticated;
do $test$ declare caught boolean:=false;begin
 begin perform public.get_operations_personnel_rate_history_v1('99999999-9999-4999-8999-999999999999');exception when insufficient_privilege then caught:=true;end;
 if not caught then raise exception 'disabled tenant gate authorized native rate administration';end if;
end;$test$;
reset role;
do $test$ begin
 if (select count(*) from public.operations_personnel_source_bindings where worker_id='99999999-9999-4999-8999-999999999999')<>0 then raise exception 'fake Time identity invented for native worker';end if;
 if (select count(*) from public.operations_personnel_rate_history where worker_id='99999999-9999-4999-8999-999999999999')<>2 then raise exception 'revocation deleted or changed historical rates';end if;
end;$test$;
select 'native Catering additive rate-admin authority fixture passed' as result;
rollback;
