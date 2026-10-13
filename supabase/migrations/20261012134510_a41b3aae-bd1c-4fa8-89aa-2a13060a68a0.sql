-- Keep the existing tenant policy, AND require participation for browser access.
-- Service-role mobile-app-api performs its own actor/org checks and is unaffected.
begin;
create or replace function public.is_direct_message_actor(_id text, _org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and _org = public.get_user_organization_id(auth.uid())
    and (_id = auth.uid()::text or exists (
      select 1 from public.staff_members s
      where s.id = _id and s.user_id = auth.uid()
        and s.organization_id = _org and s.is_active = true
        and (select count(*) from public.staff_members other
             where other.user_id = auth.uid() and other.organization_id = _org) = 1
    ));
$$;
revoke all on function public.is_direct_message_actor(text, uuid) from public;
grant execute on function public.is_direct_message_actor(text, uuid) to authenticated;

create policy direct_messages_participants_only on public.direct_messages
as restrictive for all to authenticated
using (public.is_direct_message_actor(sender_id, organization_id) or public.is_direct_message_actor(recipient_id, organization_id))
with check (public.is_direct_message_actor(sender_id, organization_id) or public.is_direct_message_actor(recipient_id, organization_id));
create policy direct_messages_sender_only on public.direct_messages
as restrictive for insert to authenticated
with check (public.is_direct_message_actor(sender_id, organization_id));
-- Anonymous clients use the authenticated edge gateway, never direct table access.
create policy direct_messages_no_anonymous on public.direct_messages
as restrictive for all to anon using (false) with check (false);

-- A participant may mark/archive a message but cannot rewrite its authorship or body.
create or replace function public.guard_direct_message_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.role() = 'authenticated' then
    if row(new.id,new.organization_id,new.sender_id,new.recipient_id,new.sender_name,new.recipient_name,new.sender_type,new.content,new.file_url,new.file_name,new.file_type,new.booking_id,new.created_at)
       is distinct from row(old.id,old.organization_id,old.sender_id,old.recipient_id,old.sender_name,old.recipient_name,old.sender_type,old.content,old.file_url,old.file_name,old.file_type,old.booking_id,old.created_at) then
      raise exception 'Direct message identity and content are immutable' using errcode = '42501';
    end if;
    if row(new.is_read,new.read_at) is distinct from row(old.is_read,old.read_at)
       and not public.is_direct_message_actor(old.recipient_id,old.organization_id) then
      raise exception 'Only the recipient may mark a message read' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger guard_direct_message_update before update on public.direct_messages
for each row execute function public.guard_direct_message_update();
commit;