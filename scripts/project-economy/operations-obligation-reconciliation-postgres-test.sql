\set ON_ERROR_STOP on
create function pg_temp.assert_true(v boolean,label text) returns void language plpgsql as $$
begin if v is distinct from true then raise exception 'obligation reconciliation assertion failed: %',label;end if;end$$;
select pg_temp.assert_true(
  has_schema_privilege('authenticated','operations_economy_private','USAGE')
  and has_schema_privilege('service_role','operations_economy_private','USAGE'),
  'security_invoker_schema_usage_matrix');

insert into public.operations_obligation_reconciliation_gates values('11111111-1111-4111-8111-111111111111',true);
set role authenticated;

do $$declare cmd jsonb;reply jsonb;readback jsonb;first_id text;first_fp text;begin
  cmd:=jsonb_build_object('schema_version','operations-obligation-reconciliation-append.v1','project_id','22222222-2222-4222-8222-222222222222',
    'obligation_id','33333333-3333-4333-8333-333333333333','expected_revision',0,'expected_baseline_event_id','44444444-4444-4444-8444-444444444444',
    'expected_invoice_source_count',1,'expected_credit_source_count',0,'expected_hired_source_count',0,'supersessions','[]'::jsonb,'close_action','none',
    'idempotency_key','reconcile-preliminary-0001','reason','capture preliminary supplier obligation');
  reply:=public.append_operations_obligation_reconciliation_v1(cmd);
  perform pg_temp.assert_true(reply->>'outcome'='accepted' and reply->>'revision'='1' and reply->>'current_amount_minor'='5400'
    and reply->>'finance_copy_eligible'='true' and reply->>'finance_recalculated'='false','preliminary_current_amount');
  readback:=public.read_operations_obligation_reconciliation_v1('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333');
  perform pg_temp.assert_true(readback#>>'{current,visible_unallocated_minor}'='600'
    and (readback#>>'{current,gross_document_minor}')::bigint+(readback#>>'{current,visible_unallocated_minor}')::bigint=6000,
    'allocated_plus_unallocated_equals_document');
  first_id:=reply->>'snapshot_id';first_fp:=reply->>'snapshot_fingerprint';
  reply:=public.append_operations_obligation_reconciliation_v1(cmd);
  perform pg_temp.assert_true(reply->>'outcome'='replayed' and reply->>'snapshot_id'=first_id and reply->>'snapshot_fingerprint'=first_fp,'exact_retry_replays_receipt');
  begin
    perform public.append_operations_obligation_reconciliation_v1(cmd||jsonb_build_object('reason','changed body must conflict'));
    raise exception 'changed body replay accepted';
  exception when unique_violation then null;end;
  perform set_config('request.jwt.claim.sub','20202020-2020-4020-8020-202020202020',false);
  begin
    perform public.append_operations_obligation_reconciliation_v1(cmd);
    raise exception 'changed actor replay accepted';
  exception when unique_violation then null;end;
  perform set_config('request.jwt.claim.sub','10101010-1010-4010-8010-101010101010',false);
  readback:=public.read_operations_obligation_reconciliation_v1('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333');
  perform pg_temp.assert_true(readback->>'current_revision'='1','changed_body_and_actor_replays_fail_closed');
end$$;
reset role;

-- Same saved allocation identity moves preliminary -> confirmed at a new economic revision.
update public.operations_finance_invoice_economic_current_v2 set source_economic_revision=2,source_economic_fingerprint=repeat('3',64),
 envelope=jsonb_build_object('recipient_net_minor',6000,'allocations',jsonb_build_array(jsonb_build_object('allocation_id','66666666-6666-4666-8666-666666666666','amount_minor',5400,'status','confirmed')))
where invoice_id='88888888-8888-4888-8888-888888888888';
insert into public.operations_project_obligation_invoice_bindings(event_id,organization_id,project_id,obligation_id,source_anchor,baseline_event_id,source_snapshot_id,source_allocation_id,source_organization_id,invoice_id,source_economic_revision,source_economic_fingerprint,source_raw_body_sha256,source_status)
values('12121212-1212-4212-8212-121212121212','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',repeat('a',64),'44444444-4444-4444-8444-444444444444','13131313-1313-4313-8313-131313131313','66666666-6666-4666-8666-666666666666','77777777-7777-4777-8777-777777777777','88888888-8888-4888-8888-888888888888',2,repeat('3',64),repeat('5',64),'confirmed');
insert into public.operations_obligation_source_policies values
 ('14141414-1414-4414-8414-141414141414','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',repeat('a',64),2,'44444444-4444-4444-8444-444444444444','12121212-1212-4212-8212-121212121212',2,repeat('3',64),5000,5000);
update public.operations_obligation_source_policy_heads set current_revision=2 where source_anchor=repeat('a',64);
set role authenticated;
do $$declare cmd jsonb;reply jsonb;doc jsonb;readback jsonb;begin
  cmd:=jsonb_build_object('schema_version','operations-obligation-reconciliation-append.v1','project_id','22222222-2222-4222-8222-222222222222','obligation_id','33333333-3333-4333-8333-333333333333',
    'expected_revision',1,'expected_baseline_event_id','44444444-4444-4444-8444-444444444444','expected_invoice_source_count',1,'expected_credit_source_count',0,'expected_hired_source_count',0,
    'supersessions','[]'::jsonb,'close_action','none','idempotency_key','reconcile-confirmed-0002','reason','confirm same supplier allocation identity');
  reply:=public.append_operations_obligation_reconciliation_v1(cmd);
  readback:=public.read_operations_obligation_reconciliation_v1('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333');doc:=readback->'current';
  perform pg_temp.assert_true(reply->>'current_amount_minor'='5400' and doc->>'active_document_count'='1'
    and doc#>>'{documents,0,source_anchor}'=repeat('a',64) and doc#>>'{documents,0,status}'='confirmed','confirmation_same_identity_no_double_count');
end$$;
reset role;

-- Saved reallocation is explicit: the prior anchor stays visible but becomes inactive.
insert into public.operations_finance_invoice_economic_current_v2 values
 ('11111111-1111-4111-8111-111111111111','15151515-1515-4515-8515-151515151515','16161616-1616-4616-8616-161616161616',1,repeat('6',64),'saved_receiver_heads_only',
  jsonb_build_object('recipient_net_minor',2000,'allocations',jsonb_build_array(jsonb_build_object('allocation_id','17171717-1717-4717-8717-171717171717','amount_minor',2000,'status','confirmed'))));
insert into public.operations_project_obligation_invoice_bindings(event_id,organization_id,project_id,obligation_id,source_anchor,baseline_event_id,source_snapshot_id,source_allocation_id,source_organization_id,invoice_id,source_economic_revision,source_economic_fingerprint,source_raw_body_sha256,source_status)
values('18181818-1818-4818-8818-181818181818','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',repeat('b',64),'44444444-4444-4444-8444-444444444444','19191919-1919-4919-8919-191919191919','17171717-1717-4717-8717-171717171717','15151515-1515-4515-8515-151515151515','16161616-1616-4616-8616-161616161616',1,repeat('6',64),repeat('7',64),'confirmed');
insert into public.operations_obligation_source_policy_heads values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',repeat('b',64),1);
insert into public.operations_obligation_source_policies values
 ('20202020-2020-4020-8020-202020202020','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',repeat('b',64),1,'44444444-4444-4444-8444-444444444444','18181818-1818-4818-8818-181818181818',1,repeat('6',64),5000,5000);
set role authenticated;
do $$declare reply jsonb;doc jsonb;readback jsonb;before_revision text;begin
  readback:=public.read_operations_obligation_reconciliation_v1('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333');before_revision:=readback->>'current_revision';
  begin
    perform public.append_operations_obligation_reconciliation_v1(jsonb_build_object('schema_version','operations-obligation-reconciliation-append.v1','project_id','22222222-2222-4222-8222-222222222222','obligation_id','33333333-3333-4333-8333-333333333333',
     'expected_revision',2,'expected_baseline_event_id','44444444-4444-4444-8444-444444444444','expected_invoice_source_count',2,'expected_credit_source_count',0,'expected_hired_source_count',0,
     'supersessions',jsonb_build_array(jsonb_build_object('prior_source_anchor',repeat('f',64),'current_source_anchor',repeat('b',64))),
     'close_action','none','idempotency_key','reconcile-orphan-prior-9001','reason','reject unknown prior document'));
    raise exception 'unknown prior supersession accepted';
  exception when sqlstate '22023' then null;end;
  begin
    perform public.append_operations_obligation_reconciliation_v1(jsonb_build_object('schema_version','operations-obligation-reconciliation-append.v1','project_id','22222222-2222-4222-8222-222222222222','obligation_id','33333333-3333-4333-8333-333333333333',
     'expected_revision',2,'expected_baseline_event_id','44444444-4444-4444-8444-444444444444','expected_invoice_source_count',2,'expected_credit_source_count',0,'expected_hired_source_count',0,
     'supersessions',jsonb_build_array(jsonb_build_object('prior_source_anchor',repeat('a',64),'current_source_anchor',repeat('e',64))),
     'close_action','none','idempotency_key','reconcile-orphan-current-9002','reason','reject unknown current document'));
    raise exception 'unknown current supersession accepted';
  exception when sqlstate '22023' then null;end;
  readback:=public.read_operations_obligation_reconciliation_v1('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333');
  perform pg_temp.assert_true(readback->>'current_revision'=before_revision,'unknown_supersession_anchors_fail_closed_nonmutating');
  reply:=public.append_operations_obligation_reconciliation_v1(jsonb_build_object('schema_version','operations-obligation-reconciliation-append.v1','project_id','22222222-2222-4222-8222-222222222222','obligation_id','33333333-3333-4333-8333-333333333333',
   'expected_revision',2,'expected_baseline_event_id','44444444-4444-4444-8444-444444444444','expected_invoice_source_count',2,'expected_credit_source_count',0,'expected_hired_source_count',0,
   'supersessions',jsonb_build_array(jsonb_build_object('prior_source_anchor',repeat('a',64),'current_source_anchor',repeat('b',64))),
   'close_action','none','idempotency_key','reconcile-reallocated-0003','reason','supersede prior supplier allocation'));
  readback:=public.read_operations_obligation_reconciliation_v1('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333');doc:=readback->'current';
  perform pg_temp.assert_true(reply->>'current_amount_minor'='2000' and doc->>'active_document_count'='1'
    and doc#>>'{documents,0,active}'='false' and doc#>>'{documents,1,active}'='true','reallocation_supersedes_without_deleting_history');
end$$;
reset role;

-- Current saved credit affects the current amount. Close freezes that exact snapshot.
insert into public.operations_obligation_credit_capacity_heads values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',repeat('c',64),repeat('b',64),1);
insert into public.operations_obligation_credit_capacity_events values('21212121-2121-4121-8121-212121212121','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',repeat('c',64),repeat('b',64),1,500,repeat('8',64));
set role authenticated;
do $$declare reply jsonb;begin
  reply:=public.append_operations_obligation_reconciliation_v1(jsonb_build_object('schema_version','operations-obligation-reconciliation-append.v1','project_id','22222222-2222-4222-8222-222222222222','obligation_id','33333333-3333-4333-8333-333333333333',
   'expected_revision',3,'expected_baseline_event_id','44444444-4444-4444-8444-444444444444','expected_invoice_source_count',2,'expected_credit_source_count',1,'expected_hired_source_count',0,
   'supersessions',jsonb_build_array(jsonb_build_object('prior_source_anchor',repeat('a',64),'current_source_anchor',repeat('b',64))),
   'close_action','close','idempotency_key','reconcile-close-0004','reason','freeze economic close with current credit'));
  perform pg_temp.assert_true(reply->>'current_amount_minor'='1500' and reply->>'economic_closed'='true' and reply->>'frozen_close_snapshot_id'=reply->>'snapshot_id','close_freezes_current_snapshot');
end$$;
reset role;

insert into public.operations_obligation_credit_capacity_events values('22222222-2222-4222-8222-222222222223','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',repeat('c',64),repeat('b',64),2,1000,repeat('9',64));
update public.operations_obligation_credit_capacity_heads set current_revision=2 where source_anchor=repeat('c',64);
set role authenticated;
do $$declare reply jsonb;readback jsonb;begin
  reply:=public.append_operations_obligation_reconciliation_v1(jsonb_build_object('schema_version','operations-obligation-reconciliation-append.v1','project_id','22222222-2222-4222-8222-222222222222','obligation_id','33333333-3333-4333-8333-333333333333',
   'expected_revision',4,'expected_baseline_event_id','44444444-4444-4444-8444-444444444444','expected_invoice_source_count',2,'expected_credit_source_count',1,'expected_hired_source_count',0,
   'supersessions',jsonb_build_array(jsonb_build_object('prior_source_anchor',repeat('a',64),'current_source_anchor',repeat('b',64))),
   'close_action','none','idempotency_key','reconcile-post-close-credit-0005','reason','refresh current after post close credit'));
  readback:=public.read_operations_obligation_reconciliation_v1('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333');
  perform pg_temp.assert_true(reply->>'current_amount_minor'='1000' and readback#>>'{frozen_close,current_amount_minor}'='1500'
    and readback#>>'{current,current_amount_minor}'='1000' and readback->>'economic_closed'='true','post_close_credit_updates_current_not_frozen');
end$$;
reset role;

insert into public.operations_obligation_credit_capacity_events values('23232323-2323-4323-8323-232323232323','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',repeat('c',64),repeat('b',64),3,2500,repeat('a',64));
update public.operations_obligation_credit_capacity_heads set current_revision=3 where source_anchor=repeat('c',64);
set role authenticated;
do $$declare reply jsonb;begin
  reply:=public.append_operations_obligation_reconciliation_v1(jsonb_build_object('schema_version','operations-obligation-reconciliation-append.v1','project_id','22222222-2222-4222-8222-222222222222','obligation_id','33333333-3333-4333-8333-333333333333',
   'expected_revision',5,'expected_baseline_event_id','44444444-4444-4444-8444-444444444444','expected_invoice_source_count',2,'expected_credit_source_count',1,'expected_hired_source_count',0,
   'supersessions',jsonb_build_array(jsonb_build_object('prior_source_anchor',repeat('a',64),'current_source_anchor',repeat('b',64))),
   'close_action','none','idempotency_key','reconcile-overcredit-0006','reason','surface overcredit exception without clamping'));
  perform pg_temp.assert_true(reply->>'current_amount_minor'='-500' and reply->>'coverage'='exception_overcredit' and reply->>'finance_copy_eligible'='false','overcredit_is_visible_and_not_copy_eligible');
end$$;
reset role;

insert into public.operations_obligation_credit_capacity_events values('24242424-2424-4424-8424-242424242424','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',repeat('c',64),repeat('b',64),4,1000,repeat('b',64));
update public.operations_obligation_credit_capacity_heads set current_revision=4 where source_anchor=repeat('c',64);
set role authenticated;
do $$declare reply jsonb;readback jsonb;begin
  reply:=public.append_operations_obligation_reconciliation_v1(jsonb_build_object('schema_version','operations-obligation-reconciliation-append.v1','project_id','22222222-2222-4222-8222-222222222222','obligation_id','33333333-3333-4333-8333-333333333333',
   'expected_revision',6,'expected_baseline_event_id','44444444-4444-4444-8444-444444444444','expected_invoice_source_count',2,'expected_credit_source_count',1,'expected_hired_source_count',0,
   'supersessions',jsonb_build_array(jsonb_build_object('prior_source_anchor',repeat('a',64),'current_source_anchor',repeat('b',64))),
   'close_action','reopen','idempotency_key','reconcile-reopen-0007','reason','reopen current economics while retaining frozen close'));
  readback:=public.read_operations_obligation_reconciliation_v1('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333');
  perform pg_temp.assert_true(reply->>'current_amount_minor'='1000' and reply->>'economic_closed'='false' and readback#>>'{frozen_close,current_amount_minor}'='1500','reopen_retains_frozen_close');
end$$;
reset role;

-- Re-close is another current snapshot, but the first frozen close is immutable.
set role authenticated;
do $$declare reply jsonb;readback jsonb;first_frozen text;begin
  readback:=public.read_operations_obligation_reconciliation_v1('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333');first_frozen:=readback->>'frozen_close_snapshot_id';
  reply:=public.append_operations_obligation_reconciliation_v1(jsonb_build_object('schema_version','operations-obligation-reconciliation-append.v1','project_id','22222222-2222-4222-8222-222222222222','obligation_id','33333333-3333-4333-8333-333333333333',
   'expected_revision',7,'expected_baseline_event_id','44444444-4444-4444-8444-444444444444','expected_invoice_source_count',2,'expected_credit_source_count',1,'expected_hired_source_count',0,
   'supersessions',jsonb_build_array(jsonb_build_object('prior_source_anchor',repeat('a',64),'current_source_anchor',repeat('b',64))),
   'close_action','close','idempotency_key','reconcile-reclose-0008','reason','reclose without replacing first frozen close'));
  perform pg_temp.assert_true(reply->>'revision'='8' and reply->>'economic_closed'='true' and reply->>'frozen_close_snapshot_id'=first_frozen
    and reply->>'snapshot_id'<>first_frozen,'reclose_preserves_first_frozen_close');
  reply:=public.append_operations_obligation_reconciliation_v1(jsonb_build_object('schema_version','operations-obligation-reconciliation-append.v1','project_id','22222222-2222-4222-8222-222222222222','obligation_id','33333333-3333-4333-8333-333333333333',
   'expected_revision',8,'expected_baseline_event_id','44444444-4444-4444-8444-444444444444','expected_invoice_source_count',2,'expected_credit_source_count',1,'expected_hired_source_count',0,
   'supersessions',jsonb_build_array(jsonb_build_object('prior_source_anchor',repeat('a',64),'current_source_anchor',repeat('b',64))),
   'close_action','reopen','idempotency_key','reconcile-reopen-again-0009','reason','reopen while preserving first frozen close'));
  perform pg_temp.assert_true(reply->>'revision'='9' and reply->>'economic_closed'='false' and reply->>'frozen_close_snapshot_id'=first_frozen,'second_reopen_preserves_first_frozen_close');
end$$;
reset role;

-- Hired sources are deduplicated by their authority head and never charged twice.
insert into public.operations_hired_assignment_heads values('11111111-1111-4111-8111-111111111111',repeat('d',64),1);
insert into public.operations_hired_assignment_events values('25252525-2525-4525-8525-252525252525','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',repeat('d',64),1,repeat('c',64));
insert into public.operations_hired_test_sources values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',repeat('d',64),'current_operational_only','missing_rate',null,'25252525-2525-4525-8525-252525252525');
set role authenticated;
do $$declare cmd jsonb;reply jsonb;before_revision text;readback jsonb;begin
  cmd:=jsonb_build_object('schema_version','operations-obligation-reconciliation-append.v1','project_id','22222222-2222-4222-8222-222222222222','obligation_id','33333333-3333-4333-8333-333333333333',
   'expected_revision',9,'expected_baseline_event_id','44444444-4444-4444-8444-444444444444','expected_invoice_source_count',2,'expected_credit_source_count',1,'expected_hired_source_count',1,
   'supersessions',jsonb_build_array(jsonb_build_object('prior_source_anchor',repeat('a',64),'current_source_anchor',repeat('b',64))),
   'close_action','none','idempotency_key','reconcile-hired-missing-0010','reason','preserve missing hired rate as null');
  reply:=public.append_operations_obligation_reconciliation_v1(cmd);
  perform pg_temp.assert_true(reply->'current_amount_minor'='null'::jsonb and reply->'eac_minor'='null'::jsonb and reply->>'finance_copy_eligible'='false','missing_hired_rate_never_zero');
  readback:=public.read_operations_obligation_reconciliation_v1('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333');before_revision:=readback->>'current_revision';
  begin
    perform public.append_operations_obligation_reconciliation_v1(cmd||jsonb_build_object('expected_revision',10,'idempotency_key','reconcile-invalid-cycle-9999','supersessions',jsonb_build_array(
      jsonb_build_object('prior_source_anchor',repeat('a',64),'current_source_anchor',repeat('b',64)),jsonb_build_object('prior_source_anchor',repeat('b',64),'current_source_anchor',repeat('a',64)))));
    raise exception 'cyclic supersession accepted';
  exception when sqlstate '22023' then null;end;
  readback:=public.read_operations_obligation_reconciliation_v1('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333');
  perform pg_temp.assert_true(readback->>'current_revision'=before_revision,'failed_append_rolls_back_without_snapshot');
end$$;
reset role;

update public.operations_hired_test_sources set coverage='complete',amount_minor=80000 where source_identity=repeat('d',64);
set role authenticated;
do $$declare cmd jsonb;reply jsonb;doc jsonb;before_revision text;readback jsonb;begin
  cmd:=jsonb_build_object('schema_version','operations-obligation-reconciliation-append.v1','project_id','22222222-2222-4222-8222-222222222222','obligation_id','33333333-3333-4333-8333-333333333333',
   'expected_revision',10,'expected_baseline_event_id','44444444-4444-4444-8444-444444444444','expected_invoice_source_count',2,'expected_credit_source_count',1,'expected_hired_source_count',1,
   'supersessions',jsonb_build_array(jsonb_build_object('prior_source_anchor',repeat('a',64),'current_source_anchor',repeat('b',64))),
   'close_action','none','idempotency_key','reconcile-hired-complete-0011','reason','retain hired evidence without duplicate charge');
  reply:=public.append_operations_obligation_reconciliation_v1(cmd);
  readback:=public.read_operations_obligation_reconciliation_v1('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333');doc:=readback->'current';
  perform pg_temp.assert_true(reply->>'current_amount_minor'='1000' and doc#>>'{hired,0,charged_minor}'='0' and doc#>>'{hired,0,amount_minor}'='80000','hired_complete_is_evidence_not_second_charge');
  reply:=public.append_operations_obligation_reconciliation_v1(cmd);
  perform pg_temp.assert_true(reply->>'outcome'='replayed' and reply->>'revision'='11','latest_retry_replays');
  before_revision:=readback->>'current_revision';
  reply:=public.append_operations_obligation_reconciliation_v1(cmd||jsonb_build_object('expected_revision',10,'idempotency_key','reconcile-stale-0012'));
  readback:=public.read_operations_obligation_reconciliation_v1('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333');
  perform pg_temp.assert_true(reply->>'outcome'='stale' and reply->>'current_revision'='11'
    and readback->>'current_revision'=before_revision,'stale_cas_is_nonmutating');
end$$;

-- Direct-table mutation is denied even to the authenticated caller.
do $$begin
  begin update public.operations_obligation_reconciliation_snapshots set reason='tamper';raise exception 'snapshot update accepted';exception when insufficient_privilege then null;end;
  begin delete from public.operations_obligation_reconciliation_receipts;raise exception 'receipt delete accepted';exception when insufficient_privilege then null;end;
end$$;
reset role;

-- Tenant and authentication failures are fail-closed and nonmutating.
create temporary table auth_failure_count(n bigint);
insert into auth_failure_count select count(*) from public.operations_obligation_reconciliation_snapshots;
set request.jwt.claim.organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set role authenticated;
do $$begin
  begin perform public.read_operations_obligation_reconciliation_v1('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333');raise exception 'cross tenant read accepted';exception when insufficient_privilege then null;end;
end$$;
reset role;
set request.jwt.claim.organization_id='11111111-1111-4111-8111-111111111111';
set request.jwt.claim.sub='';
set role authenticated;
do $$begin
  begin perform public.read_operations_obligation_reconciliation_v1('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333');raise exception 'anonymous read accepted';exception when insufficient_privilege then null;end;
end$$;
reset role;
set request.jwt.claim.sub='10101010-1010-4010-8010-101010101010';
select pg_temp.assert_true((select count(*) from public.operations_obligation_reconciliation_snapshots)=(select n from auth_failure_count),'auth_failures_nonmutating');

-- The pure helper rejects duplicate hired identities before any economic result exists.
do $$declare base jsonb;h jsonb:=jsonb_build_object('source_identity',repeat('e',64),'current',true,'coverage','complete','amount_minor',100,'disposition','operational_only','assignment_fingerprint',repeat('f',64));begin
  base:=jsonb_build_object('schema_version','operations-obligation-reconciliation-input.v1','organization_id','11111111-1111-4111-8111-111111111111','project_id','22222222-2222-4222-8222-222222222222','obligation_id','33333333-3333-4333-8333-333333333333','currency','SEK','estimate_minor',5000,'committed_minor',5000,'documents','[]'::jsonb,'credits','[]'::jsonb,'hired',jsonb_build_array(h,h));
  begin perform operations_economy_private.obligation_reconciliation_document_v1(base);raise exception 'duplicate hired identity accepted';exception when unique_violation then null;end;
end$$;

do $$declare body text:=pg_get_functiondef('operations_economy_private.append_obligation_reconciliation_v1(jsonb)'::regprocedure);lock_at int;begin
  lock_at:=strpos(body,'pg_advisory_xact_lock(hashtextextended(''obligation-org:''||org,0))');
  perform pg_temp.assert_true(lock_at>0
    and strpos(body,'obligation-reconciliation:')=0
    and lock_at<strpos(body,'select b.* into strict baseline')
    and lock_at<strpos(body,'from public.operations_project_obligation_invoice_bindings')
    and lock_at<strpos(body,'from public.operations_finance_invoice_economic_current_v2')
    and lock_at<strpos(body,'from public.operations_obligation_source_policy_heads')
    and lock_at<strpos(body,'from public.operations_obligation_credit_capacity_heads')
    and lock_at<strpos(body,'from public.operations_hired_assignment_heads'),
    'canonical_lock_precedes_all_authority_reads_without_second_key');
end$$;

select 'PASS operations-obligation-reconciliation-postgres' as result;
