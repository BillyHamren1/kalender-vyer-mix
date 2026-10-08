-- Additive authority only. Existing shared rate intervals, costs, public RPCs,
-- Time identity and source payroll/person records remain untouched.
create or replace function operations_economy_private.authorize_rate_admin_v1(p_worker_id uuid)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_org uuid;
begin
 if v_actor is null or not exists(select 1 from auth.users where id=v_actor) then
 raise exception 'authenticated_system_user_required' using errcode='42501';end if;
 begin select organization_id into strict v_org from public.profiles where user_id=v_actor;
 exception when no_data_found or too_many_rows then raise exception 'unambiguous_system_profile_required' using errcode='42501';end;
 if v_org is null or not exists(select 1 from public.user_roles where user_id=v_actor and organization_id=v_org and role='admin') then
 raise exception 'organization_rate_admin_required' using errcode='42501';end if;
 -- Preserve the original Time enrollment path exactly, without inventing Time IDs.
 if p_worker_id is not null and exists(select 1 from public.operations_personnel_source_bindings where organization_id=v_org and worker_id=p_worker_id) then return v_org;end if;
 -- Native authority is explicitly enrolled and default-off, not derived from
 -- source occupational/payroll roles or a caller-supplied organization.
 perform 1 from public.operations_catering_publish_gates where organization_id=v_org and enabled for share;
 if not found then raise exception 'explicit_organization_worker_binding_required' using errcode='42501';end if;
 perform 1 from public.operations_catering_source_bindings where organization_id=v_org and worker_id=p_worker_id and enabled for share;
 if not found then raise exception 'explicit_organization_worker_binding_required' using errcode='42501';end if;
 -- Native person inactivity/history is enforced by its real protected source
 -- read grant. Rate authority cannot enable that source grant or publish time.
 return v_org;
end;$$;
revoke all on function operations_economy_private.authorize_rate_admin_v1(uuid) from public,anon,authenticated,service_role;
