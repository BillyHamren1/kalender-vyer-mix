-- NEW additive negative proof after native batch capture; isolated transaction.
-- Current source columns and publisher only. No hosted/live source or app writes.
begin;
insert into public.projects(id,organization_id,deleted_at) values('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000099',null),('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001',now());
set local role service_role;
insert into public.operations_catering_publish_gates values('00000000-0000-4000-8000-000000000001',true);
insert into public.operations_catering_source_bindings values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004','https://catering.example/api/project-economy-read','catering-key-1',true);
insert into public.operations_personnel_rate_history(organization_id,worker_id,rate_revision,category,currency,hourly_rate_minor,effective_from,effective_to,source_reference)
values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','rate-september','work','SEK',30001,'2026-09-01','2026-10-01','isolated-project-negative');
do $test$
declare e jsonb:=$entry${"id":"00000000-0000-4000-8000-000000000051","organization_id":"00000000-0000-4000-8000-000000000003","person_id":"00000000-0000-4000-8000-000000000004","workplace_id":"00000000-0000-4000-8000-000000000006","started_at":"2026-09-30T08:00:00Z","ended_at":"2026-09-30T10:00:00Z","break_minutes":15,"status":"pending","approved_by":null,"approved_at":null,"version":1,"source":"manual"}$entry$;p jsonb:=$snapshot${"schema_version":"operations-catering-personnel-v1","calculation_version":"operations-personnel-cost.v1.half-up","organization_id":"00000000-0000-4000-8000-000000000001","worker_id":"00000000-0000-4000-8000-000000000002","project_id":"00000000-0000-4000-8000-000000000011","obligation_id":"00000000-0000-4000-8000-000000000008","currency":"SEK","work_date":"2026-09-30","time_zone":"Europe/Stockholm","mapping_revision":"map-negative-1","source_organization_id":"00000000-0000-4000-8000-000000000003","source_person_id":"00000000-0000-4000-8000-000000000004","source_time_entry_id":"00000000-0000-4000-8000-000000000051","source_time_entry_version":1,"source_fingerprint":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","source_review_id":null,"source_review_fingerprint":null,"source_status":"pending","publication_revision":1,"project_review_status":"preliminary","minutes":105,"rate_revision":"rate-september","hourly_rate_minor":30001,"amount_minor":52502,"coverage":"complete"}$snapshot$;
i integer;project uuid;entry_id uuid;mapping uuid;caught boolean;
begin
 for i in 1..3 loop
 project:=('00000000-0000-4000-8000-'||lpad((10+i)::text,12,'0'))::uuid;
 entry_id:=('00000000-0000-4000-8000-'||lpad((50+i)::text,12,'0'))::uuid;
 mapping:=('00000000-0000-4000-8000-'||lpad((90+i)::text,12,'0'))::uuid;
 insert into public.operations_catering_project_mappings(id,organization_id,worker_id,catering_organization_id,catering_person_id,time_entry_id,workplace_id,work_date,time_zone,project_id,obligation_id,currency,mapping_revision,enabled)
 values(mapping,'00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004',entry_id,'00000000-0000-4000-8000-000000000006','2026-09-30','Europe/Stockholm',project,'00000000-0000-4000-8000-000000000008','SEK','map-negative-1',true);
 e:=e||jsonb_build_object('id',entry_id);
 p:=p||jsonb_build_object('project_id',project,'source_time_entry_id',entry_id,'source_fingerprint',encode(sha256(convert_to(operations_catering_private.canonical_source_json_v1(e),'UTF8')),'hex'));
 caught:=false;begin perform public.publish_operations_catering_cost_v1(p,e::text,null,mapping,repeat('a',64),0,'isolated-project-negative-'||i);
 exception when insufficient_privilege then caught:=true;end;
 if not caught then raise exception 'foreign/deleted/missing real project accepted: %',i;end if;
 end loop;
 if (select count(*) from public.operations_catering_cost_streams)<>0 or (select count(*) from public.operations_catering_source_observations)<>0
 or (select count(*) from public.operations_catering_cost_publications)<>0 or (select count(*) from public.operations_catering_cost_outbox)<>0 then raise exception 'project denial left partial publication';end if;
end;$test$;
reset role;
select 'native Catering foreign/deleted/missing project proof passed' as result;
rollback;
