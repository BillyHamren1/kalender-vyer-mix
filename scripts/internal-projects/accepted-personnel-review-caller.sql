-- DORMANT DRAFT after accepted-personnel-caller.sql; no grants or activation.
-- Operations project review only. Never financial approval, payroll or repricing.
create function public.get_operations_accepted_project_reviews_v1(p_project uuid,p_after_stream text default null,p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid; s record; rows jsonb:='[]'; lines jsonb; event jsonb; mode jsonb; seq bigint; more boolean:=false; cursor text; available boolean;
begin
 org:=operations_economy_private.authorize_project_v1(p_project,false);
 if p_limit is null or p_limit not between 1 and 50 or (p_after_stream is not null and (length(p_after_stream) not between 1 and 256 or btrim(p_after_stream)<>p_after_stream)) then raise exception 'invalid_review_page' using errcode='22023';end if;
 for s in select h.*,p.cost_snapshot,(select o.source_evidence->>'submission_state' from public.operations_personnel_cost_outbox o where o.organization_id=h.organization_id and o.source_time_stream_id=h.source_time_stream_id and o.source_revision=h.current_revision) submission_state from public.operations_personnel_cost_streams h
  join public.operations_personnel_cost_publications p on p.organization_id=h.organization_id and p.source_time_stream_id=h.source_time_stream_id and p.source_revision=h.current_revision
  where h.organization_id=org and (p_after_stream is null or h.source_time_stream_id collate "C">p_after_stream collate "C")
   and exists(select 1 from public.operations_personnel_cost_publications historic where historic.organization_id=org and historic.source_time_stream_id=h.source_time_stream_id and exists(select 1 from jsonb_array_elements(historic.cost_snapshot->'lines') l where l->>'source_project_id'=p_project::text))
  order by h.source_time_stream_id collate "C" limit p_limit+1
 loop
  if jsonb_array_length(rows)=p_limit then more:=true;exit;end if;
  select coalesce(jsonb_agg(jsonb_build_object('line_id',l->>'source_time_line_id','minutes',l->'minutes','amount_minor',l->'amount_minor','currency',l->>'currency','coverage',l->>'coverage','status',l->>'status') order by l->>'source_time_line_id'),'[]') into lines from jsonb_array_elements(s.cost_snapshot->'lines') l where l->>'source_project_id'=p_project::text;
  select coalesce(max(review_sequence),0) into seq from public.operations_project_personnel_reviews where organization_id=org and source_time_stream_id=s.source_time_stream_id and project_id=p_project;
  event:=operations_economy_private.read_review_v1(s.source_time_stream_id,p_project);
  mode:=public.get_operations_personnel_publish_mode_v1(org,s.worker_id,s.source_time_stream_id);
  available:=mode->>'mode'='accepted' and jsonb_array_length(lines)>0 and exists(select 1 from operations_economy_private.personnel_issuer_streams_v1 f where f.issuer_id=(mode->>'issuer_id')::uuid and f.enrollment_epoch=(mode->>'enrollment_epoch')::uuid and f.source_stream_id=s.source_time_stream_id and f.revision_floor<s.current_revision) and exists(select 1 from public.operations_personnel_transport_routes route where route.organization_id=org and route.destination_organization_id=(mode->>'destination_organization_id')::uuid) and exists(select 1 from public.operations_personnel_cost_outbox o join operations_economy_private.personnel_accepted_issuances_v1 m on m.outbox_id=o.id where o.organization_id=org and o.source_time_stream_id=s.source_time_stream_id and o.source_revision=s.current_revision and m.issuer_id=(mode->>'issuer_id')::uuid and m.enrollment_epoch=(mode->>'enrollment_epoch')::uuid);
  rows:=rows||jsonb_build_array(jsonb_build_object('stream',s.source_time_stream_id,'source_revision',s.current_revision,'review_sequence',seq,'decision',event#>>'{review,decision}','work_date',s.work_date,'lines',lines,'can_review',coalesce(available,false),'can_approve',coalesce(available and s.submission_state not in ('voided','correction_requested'),false),'state',case when jsonb_array_length(lines)=0 then 'withdrawn' when available then 'ready' else 'unavailable' end));
  cursor:=s.source_time_stream_id;
 end loop;
 return jsonb_build_object('rows',rows,'next_cursor',case when more then cursor else null end);
end;$$;
revoke all on function public.get_operations_accepted_project_reviews_v1(uuid,text,integer) from public,anon,authenticated,service_role;

create function public.review_and_publish_operations_project_personnel_v1(p_project uuid,p_stream text,p_expected_source bigint,p_expected_review bigint,p_decision text,p_reason text,p_command uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();org uuid;worker uuid;mode jsonb;r jsonb;issued jsonb;prior bigint;existing public.operations_project_personnel_reviews%rowtype;
 event_key text:='accepted-review:event:'||p_command::text;publish_key text:='accepted-review:publish:'||p_command::text;
begin
 perform operations_economy_private.personnel_ownership_read_lock_v1();
 -- Same authority lock order as existing accepted descendant, before stream locks.
 perform 1 from auth.users where id=actor for share;
 perform 1 from public.profiles where user_id=actor order by id for share;
 perform 1 from public.user_roles where user_id=actor order by id for share;
 perform 1 from public.projects where id=p_project for share;
 org:=operations_economy_private.authorize_project_v1(p_project,false);
 perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','project-review-grant',org,p_project,actor),0));
 org:=operations_economy_private.authorize_project_v1(p_project,false);
 if p_command is null or p_stream is null or p_stream<>btrim(p_stream) or length(p_stream) not between 1 and 256
  or p_expected_source is null or p_expected_source not between 1 and 9007199254740990
  or p_expected_review is null or p_expected_review not between 0 and 9007199254740991
  or p_decision is null or p_decision not in ('approved','reopened','rejected')
  or (p_reason is not null and (p_reason<>btrim(p_reason) or length(p_reason) not between 3 and 1000)) or (p_decision<>'approved' and p_reason is null)
 then raise exception 'invalid_review_command' using errcode='22023';end if;
 select h.worker_id into worker from public.operations_personnel_cost_streams h where h.organization_id=org and h.source_time_stream_id=p_stream;
 if not found then raise exception 'review_source_unavailable' using errcode='42501';end if;
 mode:=public.get_operations_personnel_publish_mode_v1(org,worker,p_stream);
 if mode->>'mode' is distinct from 'accepted' then raise exception 'accepted_review_unavailable' using errcode='42501';end if;
 -- Source project membership is proven from the exact expected immutable revision,
 -- never from a browser claim or another project's whole-stream authority.
 if not exists(select 1 from public.operations_personnel_cost_publications p where p.organization_id=org and p.source_time_stream_id=p_stream and p.source_revision=p_expected_source and exists(select 1 from jsonb_array_elements(p.cost_snapshot->'lines') l where l->>'source_project_id'=p_project::text)) then raise exception 'review_project_not_in_source' using errcode='42501';end if;
 -- Pin mode/issuer/binding before the event writer takes the canonical head lock.
 perform 1 from operations_economy_private.personnel_issuers_v1 where issuer_id=(mode->>'issuer_id')::uuid and enrollment_epoch=(mode->>'enrollment_epoch')::uuid for share;
 perform 1 from operations_economy_private.personnel_issuer_streams_v1 where issuer_id=(mode->>'issuer_id')::uuid and enrollment_epoch=(mode->>'enrollment_epoch')::uuid and source_stream_id=p_stream for share;
 perform 1 from public.operations_personnel_source_bindings where organization_id=org and worker_id=worker for share;
 perform 1 from public.operations_personnel_transport_routes where organization_id=org for share;
 -- Serialize same command key across projects too; conflicting bodies cannot race.
 perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','accepted-review-command',org,p_command),0));
 select * into existing from public.operations_project_personnel_reviews where organization_id=org and idempotency_key=event_key;
 if found then
  select coalesce(max(review_sequence),0) into prior from public.operations_project_personnel_reviews where organization_id=org and source_time_stream_id=existing.source_time_stream_id and project_id=existing.project_id and review_sequence<existing.review_sequence;
  if existing.actor_system_user_id is distinct from actor or existing.project_id is distinct from p_project or existing.source_time_stream_id is distinct from p_stream or existing.source_revision is distinct from p_expected_source or existing.decision is distinct from p_decision or existing.reason is distinct from p_reason or prior is distinct from p_expected_review then raise exception 'review_command_conflict' using errcode='23505';end if;
 end if;
 begin
  r:=operations_economy_private.review_v1(p_stream,p_project,p_expected_source,p_expected_review,p_decision,p_reason,event_key);
  if r->>'status' not in ('accepted','duplicate') then return jsonb_build_object('status',r->>'status');end if;
  issued:=operations_economy_private.issue_personnel_project_review_v1((mode->>'issuer_id')::uuid,(mode->>'enrollment_epoch')::uuid,p_stream,p_project,p_expected_source,(r->>'review_sequence')::bigint,publish_key);
  if issued->>'status' not in ('accepted','duplicate') then raise exception 'review_publication_conflict' using errcode='P0R01';end if;
 exception when sqlstate 'P0R01' then
  -- Subtransaction rollback removes the newly appended review event.
  return jsonb_build_object('status',issued->>'status');
 end;
 return jsonb_build_object('status',issued->>'status','decision',p_decision,'event_id',r->>'event_id','review_sequence',r->'review_sequence','source_revision',issued->'source_revision','outbox_id',issued->>'outbox_id','financially_applied',false,'command',p_command,'project',p_project,'stream',p_stream,'actor',auth.uid());
end;$$;
revoke all on function public.review_and_publish_operations_project_personnel_v1(uuid,text,bigint,bigint,text,text,uuid) from public,anon,authenticated,service_role;
