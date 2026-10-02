-- TEST ONLY fixed rollback cases. Collector uses only this source-controlled case map.
-- No helper below is invoked; all newly installed helpers remain private/client-inexecutable.
-- BEGIN CASE owner_drift
create role operations_compatible_catalog_owner nologin;
alter function operations_economy_private.read_scope_invoice_kernel_compatible_v1(jsonb) owner to operations_compatible_catalog_owner;
-- END CASE owner_drift

-- BEGIN CASE search_path_drift
alter function operations_economy_private.read_scope_invoice_kernel_compatible_v1(jsonb) set search_path=public;
-- END CASE search_path_drift

-- BEGIN CASE public_definer_drift
alter function public.read_operations_scope_invoice_capture_admin_v1(jsonb) security definer;
-- END CASE public_definer_drift

-- BEGIN CASE direct_core_execute
 grant execute on function operations_economy_private.read_scope_invoice_kernel_v1(jsonb) to service_role;
-- END CASE direct_core_execute

-- BEGIN CASE inherited_core_execute
create role operations_compatible_catalog_inherit nologin;
grant execute on function operations_economy_private.read_scope_invoice_kernel_v1(jsonb) to operations_compatible_catalog_inherit;
grant operations_compatible_catalog_inherit to service_role;
-- END CASE inherited_core_execute

-- BEGIN CASE schema_usage_drift
grant usage on schema operations_economy_private to anon;
-- END CASE schema_usage_drift

-- BEGIN CASE unknown_static_caller
create function operations_compatible_catalog_native.unreviewed_static(p jsonb) returns jsonb
language sql security invoker set search_path='' as $$select operations_economy_private.read_scope_invoice_kernel_v1(p);$$;
revoke all on function operations_compatible_catalog_native.unreviewed_static(jsonb) from public,anon,authenticated,service_role;
-- END CASE unknown_static_caller

-- BEGIN CASE unknown_constructed_dispatcher
create function operations_compatible_catalog_native.unreviewed_constructed(p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$declare target text;v jsonb;begin
 target:='operations_economy_private.read_scope_'||'invoice_kernel_v1';
 execute format('select %s($1)',target) into v using p;return v;
end;$$;
revoke all on function operations_compatible_catalog_native.unreviewed_constructed(jsonb) from public,anon,authenticated,service_role;
-- END CASE unknown_constructed_dispatcher

-- BEGIN CASE extension_provenance
create function operations_compatible_catalog_native.unreviewed_extension() returns text
language sql security invoker set search_path='' as $$select 'synthetic_not_invoked'::text;$$;
revoke all on function operations_compatible_catalog_native.unreviewed_extension() from public,anon,authenticated,service_role;
alter extension plpgsql add function operations_compatible_catalog_native.unreviewed_extension();
-- END CASE extension_provenance

-- BEGIN CASE known_body_drift
create or replace function operations_economy_private.read_scope_invoice_kernel_compatible_v1(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$begin
 raise exception 'synthetic_body_never_invoked' using errcode='22023';
end;$$;
-- END CASE known_body_drift

-- BEGIN CASE arbitrary_selector_dispatcher
create function operations_compatible_catalog_native.unreviewed_selector(p_sql text) returns void
language plpgsql security invoker set search_path='' as $$begin execute p_sql;end;$$;
revoke all on function operations_compatible_catalog_native.unreviewed_selector(text) from public,anon,authenticated,service_role;
-- END CASE arbitrary_selector_dispatcher
