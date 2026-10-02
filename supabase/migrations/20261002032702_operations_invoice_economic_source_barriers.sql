-- Compatibility entry barriers. Original v1/v2 private receiver cores unchanged.
-- No source reconstruction, anchor inference, credit eligibility or EAC activation.
create function operations_invoice_private.lock_invoice_economic_sources_v1(p_organization_id uuid,p_sources jsonb)
returns void language plpgsql security invoker set search_path='' as $$declare source jsonb;identity text;begin
 if p_organization_id is null or jsonb_typeof(p_sources) is distinct from 'array' or jsonb_array_length(p_sources) not between 1 and 100 then raise exception 'invoice_economic_lock_selectors_required' using errcode='22023';end if;
 for source in select value from jsonb_array_elements(p_sources) loop
 if jsonb_typeof(source) is distinct from 'object' or (select count(*) from jsonb_object_keys(source))<>2 or not(source ?& array['source_organization_id','invoice_id'])
 or jsonb_typeof(source->'source_organization_id') is distinct from 'string' or source->>'source_organization_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or jsonb_typeof(source->'invoice_id') is distinct from 'string' or source->>'invoice_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid_invoice_economic_lock_identity' using errcode='22023';end if;end loop;
 -- Global canonical order covers original+credit and absent counterpart heads.
 for identity in select key_label from (select distinct 'invoice-economic-source-v1:'||p_organization_id::text||':'||(value->>'source_organization_id')::uuid::text||':'||(value->>'invoice_id')::uuid::text as key_label
 from jsonb_array_elements(p_sources)) ordered_keys order by key_label collate "C" loop
 perform pg_advisory_xact_lock(hashtextextended(identity,0));end loop;end;$$;
revoke all on function operations_invoice_private.lock_invoice_economic_sources_v1(uuid,jsonb) from public,anon,authenticated,service_role;

create function operations_invoice_private.receive_invoice_economic_entry_v1(p_protocol text,p_key_id text,p_timestamp text,p_nonce text,p_raw_body text)
returns jsonb language plpgsql security definer set search_path='' as $$declare p jsonb;org uuid;sources jsonb;begin
 if p_protocol is null or p_protocol not in ('v1','v2') or p_raw_body is null or octet_length(p_raw_body)>262144 then raise exception 'invoice_economic_entry_invalid' using errcode='22023';end if;
 p:=p_raw_body::jsonb;
 if jsonb_typeof(p) is distinct from 'object' then raise exception 'invoice_economic_entry_object_required' using errcode='22023';end if;
 if jsonb_typeof(p->'destination_organization_id') is distinct from 'string' or p->>'destination_organization_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or jsonb_typeof(p->'source_organization_id') is distinct from 'string' or p->>'source_organization_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or jsonb_typeof(p->'invoice_id') is distinct from 'string' or p->>'invoice_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invoice_economic_entry_scope_required' using errcode='22023';end if;
 org:=(p->>'destination_organization_id')::uuid;sources:=jsonb_build_array(jsonb_build_object('source_organization_id',p->>'source_organization_id','invoice_id',p->>'invoice_id'));
 perform operations_invoice_private.lock_invoice_economic_sources_v1(org,sources);
 -- Exact original raw bytes and parameters reach the frozen core unchanged.
 if p_protocol='v1' then return operations_invoice_private.receive_finance_project_invoice_destination_v1(p_key_id,p_timestamp,p_nonce,p_raw_body);end if;
 return operations_invoice_private.receive_finance_project_invoice_destination_v2(p_key_id,p_timestamp,p_nonce,p_raw_body);end;$$;
revoke all on function operations_invoice_private.receive_invoice_economic_entry_v1(text,text,text,text,text) from public,anon,authenticated;
grant execute on function operations_invoice_private.receive_invoice_economic_entry_v1(text,text,text,text,text) to service_role;
create or replace function public.operations_receive_finance_project_invoice_destination_v1(p_key_id text,p_timestamp text,p_nonce text,p_raw_body text)
returns jsonb language sql security invoker set search_path='' as $$select operations_invoice_private.receive_invoice_economic_entry_v1('v1',p_key_id,p_timestamp,p_nonce,p_raw_body);$$;
create or replace function public.operations_receive_finance_project_invoice_destination_v2(p_key_id text,p_timestamp text,p_nonce text,p_raw_body text)
returns jsonb language sql security invoker set search_path='' as $$select operations_invoice_private.receive_invoice_economic_entry_v1('v2',p_key_id,p_timestamp,p_nonce,p_raw_body);$$;
revoke all on function public.operations_receive_finance_project_invoice_destination_v1(text,text,text,text),public.operations_receive_finance_project_invoice_destination_v2(text,text,text,text) from public,anon,authenticated;
grant execute on function public.operations_receive_finance_project_invoice_destination_v1(text,text,text,text),public.operations_receive_finance_project_invoice_destination_v2(text,text,text,text) to service_role;
-- No bypass via direct private calls or service table head/evidence mutation.
-- Frozen definer cores run as their owner and retain all necessary rights.
revoke execute on function operations_invoice_private.receive_finance_project_invoice_destination_v1(text,text,text,text),operations_invoice_private.receive_finance_project_invoice_destination_v2(text,text,text,text) from service_role;
revoke insert,update,delete,truncate on public.operations_finance_invoice_streams,public.operations_finance_credit_v2_streams,
 public.operations_finance_invoice_snapshots,public.operations_finance_invoice_receipts,public.operations_finance_credit_v2_snapshots,public.operations_finance_credit_v2_receipts from service_role;
