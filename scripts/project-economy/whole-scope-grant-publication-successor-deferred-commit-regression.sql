-- TEST ONLY. Requires the genuine fresh native setup; commits synthetic metadata only.
-- Unlike the original rollback fixture, LOCAL authenticated remains active at COMMIT.
begin isolation level repeatable read;
do $$begin
 if current_database()<>'eventflow_scope_product_publication_runtime' or current_user<>'postgres'
 or current_setting('test.whole_scope_granted_publication_isolated',true) is distinct from 'synthetic-disposable'
 or (select count(*) from operations_whole_scope_publication_private.publications)<>1
 or (select count(*) from operations_whole_scope_publication_private.receipts)<>1
 or exists(select 1 from operations_whole_scope_publication_private.grant_bindings)
 or (select count(*) from operations_whole_scope_export_grant_private.events)<>1
 or not exists(select 1 from pg_proc where oid='operations_whole_scope_publication_private.complete_granted_v2()'::regprocedure and prosecdef and proconfig=array['search_path=""']::text[])
 then raise exception 'fresh_deferred_commit_regression_required' using errcode='22023';end if;
end;$$;
create temp table deferred_commit_command(command jsonb) on commit preserve rows;
create temp table deferred_commit_result(receipt jsonb) on commit preserve rows;
insert into deferred_commit_command
 select jsonb_build_object('schema_version','operations-whole-scope-granted-product-publication-command.v2','economic_scope_id',s.economic_scope_id,'expected_scope_revision',s.current_revision,'expected_membership_fingerprint',m.membership_fingerprint,'expected_composition_revision',c.current_revision,'expected_composition_fingerprint',cs.fingerprint,'expected_publication_revision',p.publication_revision,'expected_grant_revision',g.revision,'idempotency_key','successor-native-actual-authenticated-commit','reason','Real isolated authenticated deferred COMMIT regression')
 from public.operations_project_scope_heads s
 join public.operations_project_scope_snapshots m on m.organization_id=s.organization_id and m.economic_scope_id=s.economic_scope_id and m.scope_revision=s.current_revision
 join public.operations_scope_obligation_composition_heads c on c.organization_id=s.organization_id and c.economic_scope_id=s.economic_scope_id
 join public.operations_scope_obligation_compositions cs on cs.organization_id=c.organization_id and cs.economic_scope_id=c.economic_scope_id and cs.composition_revision=c.current_revision
 join operations_whole_scope_publication_private.heads p on p.organization_id=s.organization_id and p.economic_scope_id=s.economic_scope_id
 join operations_whole_scope_export_grant_private.heads g on g.organization_id=s.organization_id and g.economic_scope_id=s.economic_scope_id
 where s.organization_id='11111111-1111-4111-8111-111111111111' and s.economic_scope_id='90909090-9090-4909-8909-909090909090';
grant select on deferred_commit_command to authenticated;
grant insert on deferred_commit_result to authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
set local role authenticated;
insert into deferred_commit_result select public.publish_operations_whole_scope_granted_product_v2(command) from deferred_commit_command;
-- NO RESET ROLE before this COMMIT: deferred trigger must run in actual auth context.
commit;
do $$declare r jsonb;begin
 select receipt into strict r from deferred_commit_result;
 if r->>'outcome'<>'accepted' or r->'publication_revision'<>'2'::jsonb
 or (select count(*) from operations_whole_scope_publication_private.publications)<>2
 or (select count(*) from operations_whole_scope_publication_private.receipts)<>2
 or (select count(*) from operations_whole_scope_publication_private.grant_bindings)<>1
 or not exists(select 1 from operations_whole_scope_publication_private.heads where publication_revision=2 and publication_id=(r->>'publication_id')::uuid)
 or not exists(select 1 from operations_whole_scope_publication_private.receipts where publication_id=(r->>'publication_id')::uuid and document=r)
 or exists(select 1 from operations_whole_scope_publication_private.publications where destination_raw_body is not null)
 then raise exception 'actual_authenticated_commit_integrity_required' using errcode='22023';end if;
 if has_function_privilege('authenticated','operations_whole_scope_publication_private.receipt_granted_v2(uuid)','EXECUTE')
 or has_function_privilege('authenticated','operations_whole_scope_publication_private.complete_granted_v2()','EXECUTE')
 or has_function_privilege('service_role','operations_whole_scope_publication_private.complete_granted_v2()','EXECUTE')
 or has_table_privilege('authenticated','operations_whole_scope_publication_private.receipts','INSERT')
 then raise exception 'private_deferred_commit_acl_required' using errcode='22023';end if;
end;$$;
begin;
set local role authenticated;
do $$begin
 begin perform operations_whole_scope_publication_private.receipt_granted_v2('00000000-0000-4000-8000-000000000000');raise exception 'direct_receipt_helper_allowed' using errcode='22023';exception when insufficient_privilege then null;end;
 begin insert into operations_whole_scope_publication_private.grant_bindings values('00000000-0000-4000-8000-000000000000','11111111-1111-4111-8111-111111111111','90909090-9090-4909-8909-909090909090','00000000-0000-4000-8000-000000000000');raise exception 'direct_binding_write_allowed' using errcode='22023';exception when insufficient_privilege then null;end;
end;$$;
commit;
select 'scope-successor-deferred-commit PASS authenticated_commit_private_acl_unchanged';
