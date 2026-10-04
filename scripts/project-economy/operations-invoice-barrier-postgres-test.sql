-- Run after v1+v2+new barrier migration on an isolated native database.
\set ON_ERROR_STOP on
begin;
do $$begin
 if has_function_privilege('service_role','operations_invoice_private.receive_finance_project_invoice_destination_v1(text,text,text,text)','EXECUTE')
 or has_function_privilege('service_role','operations_invoice_private.receive_finance_project_invoice_destination_v2(text,text,text,text)','EXECUTE')
 or has_function_privilege('authenticated','operations_invoice_private.receive_invoice_economic_entry_v1(text,text,text,text,text)','EXECUTE')
 or has_function_privilege('service_role','operations_invoice_private.lock_invoice_economic_sources_v1(uuid,jsonb)','EXECUTE') then raise exception 'private barrier/core bypass allowed';end if;
 if not has_function_privilege('service_role','public.operations_receive_finance_project_invoice_destination_v1(text,text,text,text)','EXECUTE')
 or not has_function_privilege('service_role','public.operations_receive_finance_project_invoice_destination_v2(text,text,text,text)','EXECUTE') then raise exception 'public service compatibility path unavailable';end if;
 if has_table_privilege('service_role','public.operations_finance_invoice_streams','INSERT,UPDATE')
 or has_table_privilege('service_role','public.operations_finance_credit_v2_streams','INSERT,UPDATE')
 or has_table_privilege('service_role','public.operations_finance_invoice_snapshots','INSERT') then raise exception 'direct service economic source mutation allowed';end if;
 if not has_table_privilege('service_role','public.operations_finance_invoice_streams','SELECT') then raise exception 'service source read lost';end if;
 begin perform operations_invoice_private.lock_invoice_economic_sources_v1(null,'[]');raise exception 'invalid lock scope accepted';exception when sqlstate '22023' then null;end;
 begin perform operations_invoice_private.lock_invoice_economic_sources_v1('11111111-1111-4111-8111-111111111111','[{"source_organization_id":["99999999-9999-4999-8999-999999999999"],"invoice_id":"23232323-2323-4232-8232-232323232323"}]');raise exception 'coerced lock identity accepted';exception when sqlstate '22023' then null;end;
end;$$;
rollback;
select 'operations-invoice-economic-barrier-grants-postgres PASS' as result;
