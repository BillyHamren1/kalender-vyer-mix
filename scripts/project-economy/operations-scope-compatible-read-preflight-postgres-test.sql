-- Before applying the product migration, run its EXACT bytes through negative
-- installed-catalog cases. Caller supplies the migration variable from the pinned file.
-- All test wrappers/security alterations and all candidate definitions roll back.
begin;
do $$begin
 if current_database()<>'eventflow_scope_publication_runtime'
 or current_setting('eventflow.scope_compatible_read_isolated',true) is distinct from 'synthetic-disposable'
 or current_setting('eventflow.scope_publication_isolated',true) is distinct from 'synthetic-disposable'
 or current_setting('eventflow.scope_publication_try_isolated',true) is distinct from 'synthetic-disposable'
 or session_user<>'postgres' or current_user<>'postgres' or not(select rolsuper from pg_roles where rolname=current_user)
 or to_regprocedure('operations_economy_private.read_scope_invoice_kernel_compatible_v1(jsonb)') is not null
 or to_regprocedure('pg_temp.publish_scope_native(jsonb)') is not null
 or to_regprocedure('pg_temp.publish_scope_native_try_v1(jsonb)') is not null
 or to_regclass('operations_scope_reader_permission_native.fixture') is null
 or (select count(*) from auth.users)<>4 or (select count(*) from public.profiles)<>4
 or (select count(*) from public.user_roles)<>3
 or exists(select 1 from operations_scope_publication_native.publications)
 or exists(select 1 from operations_scope_publication_native.receipts)
 or exists(select 1 from operations_scope_publication_native.heads)
 then raise exception 'fresh_disposable_compatible_preflight_required' using errcode='22023';end if;
end;$$;
create function pg_temp.compatible_preflight_negative(p_migration text) returns void
language plpgsql as $$declare old_kernel text:='operations_economy_private.read_scope_invoice_'||'kernel_v1(jsonb)';old_admin text:='operations_economy_private.read_scope_invoice_capture_'||'admin_v1(jsonb)';begin
 if p_migration is null or octet_length(p_migration) not between 10000 and 65536
 or position('installed_scope_reader_static_caller_closure_required' in p_migration)=0
 then raise exception 'exact_pinned_migration_required' using errcode='22023';end if;
 execute 'create function public.compatible_native_unexpected_caller(p jsonb) returns jsonb language sql security definer set search_path='''' as $call$select operations_economy_private.read_scope_invoice_'||'kernel_v1(p);$call$';
 begin execute p_migration;raise exception 'unexpected_static_caller_accepted' using errcode='22023';
 exception when sqlstate '55000' then if sqlerrm<>'installed_scope_reader_static_caller_closure_required' then raise;end if;end;
 execute 'drop function public.compatible_native_unexpected_caller(jsonb)';
 execute 'alter function public.read_operations_scope_invoice_kernel_evidence_v1(jsonb) security definer';
 begin execute p_migration;raise exception 'wrong_public_security_accepted' using errcode='22023';
 exception when sqlstate '55000' then if sqlerrm<>'installed_scope_reader_owner_security_required' then raise;end if;end;
 execute 'alter function public.read_operations_scope_invoice_kernel_evidence_v1(jsonb) security invoker';
 execute 'alter function '||old_kernel||' set search_path=public';
 begin execute p_migration;raise exception 'wrong_private_search_path_accepted' using errcode='22023';
 exception when sqlstate '55000' then if sqlerrm<>'installed_scope_reader_owner_security_required' then raise;end if;end;
 execute 'alter function '||old_kernel||' set search_path=''''';
 if to_regprocedure('operations_economy_private.read_scope_invoice_kernel_compatible_v1(jsonb)') is not null
 or not has_function_privilege('service_role',old_kernel,'execute')
 or not has_function_privilege('authenticated',old_admin,'execute')
 then raise exception 'failed_preflight_changed_candidate_state' using errcode='22023';end if;
end;$$;
select pg_temp.compatible_preflight_negative(:'migration');
rollback;
select 'operations-scope-compatible-read-preflight PASS unexpected_caller_security_search_path_exact_migration_rollback' as proof;
