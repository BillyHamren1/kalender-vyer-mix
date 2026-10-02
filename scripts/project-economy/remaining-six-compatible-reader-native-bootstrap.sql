-- NEW disposable constraint fidelity only; no production migration.
begin;
do $$begin
 if current_database()<>'operations_remaining_six_read_runtime'
 or current_setting('test.remaining_six_isolated',true) is distinct from 'synthetic-disposable'
 or current_user<>'postgres' or (select count(*) from auth.users)<>4
 or (select count(*) from public.profiles)<>4 or (select count(*) from public.user_roles)<>3
 or exists(select 1 from public.operations_project_obligation_heads)
 then raise exception 'remaining_six_fresh_bootstrap_required' using errcode='55000';end if;
end$$;
-- Genuine role FK/uniqueness consumed by current compatible actor helper.
alter table public.user_roles add constraint user_roles_user_id_fkey foreign key(user_id) references auth.users(id) on delete cascade;
create unique index user_roles_user_role_org_key on public.user_roles(user_id,role,organization_id);
commit;
