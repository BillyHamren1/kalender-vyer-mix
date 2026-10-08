-- Narrow additive repair for authenticated COMMIT of the deferred completeness trigger.
-- No public/private RPC grants, changed predicates, source export or Finance admission.
begin;
do $$declare p pg_proc%rowtype;expected_owner oid;begin
 select * into p from pg_proc where oid='operations_whole_scope_publication_private.complete_granted_v2()'::regprocedure;
 select nspowner into expected_owner from pg_namespace where nspname='operations_whole_scope_publication_private';
 if p.prosecdef or p.proowner is distinct from expected_owner or p.prokind<>'f' or p.prorettype<>'trigger'::regtype
 or p.proconfig is distinct from array['search_path=""']::text[]
 or encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') is distinct from 'a87e67ffa948ba83d25c0c44069f1ba8370de26a2fe140eaa1240f1d422f642b'
 or (select proowner from pg_proc where oid='operations_whole_scope_publication_private.receipt_granted_v2(uuid)'::regprocedure) is distinct from expected_owner
 or exists(select 1 from pg_class where oid=any(array['operations_whole_scope_publication_private.publications'::regclass,'operations_whole_scope_publication_private.receipts'::regclass,'operations_whole_scope_publication_private.grant_bindings'::regclass]) and relowner is distinct from expected_owner)
 or not exists(select 1 from pg_trigger where tgrelid='operations_whole_scope_publication_private.publications'::regclass and tgname='granted_publication_complete' and tgfoid=p.oid and tgdeferrable and tginitdeferred and tgenabled='O')
 or exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')
 or has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE')
 then raise exception 'exact_private_deferred_completeness_predecessor_required' using errcode='55000';end if;
end;$$;
-- ALTER preserves the exact installed body, OID, trigger and empty search_path.
alter function operations_whole_scope_publication_private.complete_granted_v2() security definer;
revoke all on function operations_whole_scope_publication_private.complete_granted_v2() from public,anon,authenticated,service_role;
do $$declare p pg_proc%rowtype;begin
 select * into p from pg_proc where oid='operations_whole_scope_publication_private.complete_granted_v2()'::regprocedure;
 if not p.prosecdef or p.proconfig is distinct from array['search_path=""']::text[]
 or encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') is distinct from 'a87e67ffa948ba83d25c0c44069f1ba8370de26a2fe140eaa1240f1d422f642b'
 or exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')
 or has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE')
 then raise exception 'private_deferred_completeness_repair_required' using errcode='55000';end if;
end;$$;
commit;
