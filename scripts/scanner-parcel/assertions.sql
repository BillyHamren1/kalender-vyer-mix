-- Execute after fixture.sql and the actual reviewed parcel migration.
DO $test$
DECLARE
 org uuid:='10000000-0000-4000-8000-000000000001';
 pack uuid:='20000000-0000-4000-8000-000000000001';
 book text:='30000000-0000-4000-8000-000000000001';
 reservation uuid:='40000000-0000-4000-8000-000000000001';
 item uuid:='50000000-0000-4000-8000-000000000001';
 item_type uuid:='60000000-0000-4000-8000-000000000001';
 operation text:='op-'||gen_random_uuid()::text;
 evidence jsonb;
 receipt jsonb;
 parcel_a uuid;
 parcel_b uuid;
 role_name text;
 function_name text;
BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF has_table_privilege(role_name,'public.scanner_parcel_operations','TRUNCATE') THEN RAISE EXCEPTION 'Browser role % can truncate replay ledger',role_name; END IF;
  BEGIN
   PERFORM set_config('role',role_name,true);
   EXECUTE 'TRUNCATE public.scanner_parcel_operations';
   RAISE EXCEPTION 'Browser ledger truncate unexpectedly executed for %',role_name;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('role','none',true);
  FOREACH function_name IN ARRAY ARRAY[
   'public.scanner_parcel_projection_v1(uuid,uuid,text,uuid)',
   'public.scanner_parcel_command_v1(uuid,text,text,text,uuid,text,uuid,text,text,timestamp with time zone,uuid,uuid,integer,text,jsonb)'
  ] LOOP
   IF has_function_privilege(role_name,function_name,'EXECUTE') THEN RAISE EXCEPTION 'Browser role % can invoke %',role_name,function_name; END IF;
  END LOOP;
  BEGIN
   PERFORM set_config('role',role_name,true);
   PERFORM public.scanner_parcel_projection_v1(org,pack,book,reservation);
   RAISE EXCEPTION 'Browser RPC unexpectedly executed for %',role_name;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('role','none',true);
 END LOOP;
 IF NOT has_function_privilege('service_role','public.scanner_parcel_command_v1(uuid,text,text,text,uuid,text,uuid,text,text,timestamp with time zone,uuid,uuid,integer,text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Service command grant missing'; END IF;
 evidence:=jsonb_build_object('verified',true,'booking_id',book,'reservation_id',reservation,'snapshot_fingerprint',repeat('a',64),'packing_list_item_id',item,'item_type_id',item_type,'wms_line_id','line','quantity_picked',10);
 PERFORM set_config('role','service_role',true);
 receipt:=public.scanner_parcel_command_v1(org,operation,repeat('b',64),'CREATE_PARCEL',pack,book,reservation,'actor','device',now(),NULL,NULL,NULL,NULL,evidence);
 IF receipt->>'outcome' IS DISTINCT FROM 'APPLIED' OR jsonb_array_length(receipt->'projection'->'parcels') IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Create failed: %',receipt; END IF;
 parcel_a:=(receipt->'projection'->'parcels'->0->>'parcelId')::uuid;
 receipt:=public.scanner_parcel_command_v1(org,operation,repeat('b',64),'CREATE_PARCEL',pack,book,reservation,'actor','device',now(),NULL,NULL,NULL,NULL,evidence);
 IF receipt->>'replay' IS DISTINCT FROM 'true' OR jsonb_array_length(receipt->'projection'->'parcels') IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Replay duplicated create: %',receipt; END IF;
 receipt:=public.scanner_parcel_command_v1(org,operation,repeat('c',64),'CREATE_PARCEL',pack,book,reservation,'actor','device',now(),NULL,NULL,NULL,NULL,evidence);
 IF receipt->>'message' IS DISTINCT FROM 'operation_id_conflict' THEN RAISE EXCEPTION 'Changed request reused operation: %',receipt; END IF;
 receipt:=public.scanner_parcel_command_v1(org,'op-'||gen_random_uuid(),repeat('b',64),'SEAL_PARCEL',pack,book,reservation,'actor','device',now(),parcel_a,NULL,NULL,NULL,evidence);
 IF receipt->>'message' IS DISTINCT FROM 'empty_parcel' THEN RAISE EXCEPTION 'Empty seal accepted: %',receipt; END IF;
 receipt:=public.scanner_parcel_command_v1(org,'op-'||gen_random_uuid(),repeat('b',64),'ASSIGN_ITEM',pack,book,reservation,'actor','device',now(),parcel_a,item,1,NULL,evidence-'quantity_picked');
 IF receipt->>'message' IS DISTINCT FROM 'wms_picked_quantity_missing' THEN RAISE EXCEPTION 'Missing WMS picked quantity accepted: %',receipt; END IF;
 receipt:=public.scanner_parcel_command_v1(org,'op-'||gen_random_uuid(),repeat('b',64),'ASSIGN_ITEM',pack,book,reservation,'actor','device',now(),parcel_a,item,7,NULL,evidence);
 IF receipt->>'outcome' IS DISTINCT FROM 'APPLIED' THEN RAISE EXCEPTION 'First assignment failed: %',receipt; END IF;
 receipt:=public.scanner_parcel_command_v1(org,'op-'||gen_random_uuid(),repeat('b',64),'CREATE_PARCEL',pack,book,reservation,'actor','device',now(),NULL,NULL,NULL,NULL,evidence);
 IF receipt->>'outcome' IS DISTINCT FROM 'APPLIED' OR jsonb_array_length(receipt->'projection'->'parcels') IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'Second create failed: %',receipt; END IF;
 parcel_b:=(receipt->'projection'->'parcels'->1->>'parcelId')::uuid;
 receipt:=public.scanner_parcel_command_v1(org,'op-'||gen_random_uuid(),repeat('b',64),'ASSIGN_ITEM',pack,book,reservation,'actor','device',now(),parcel_b,item,4,NULL,evidence);
 IF receipt->>'message' IS DISTINCT FROM 'parcel_allocation_exceeds_wms_picked' THEN RAISE EXCEPTION 'Overallocation accepted: %',receipt; END IF;
 receipt:=public.scanner_parcel_command_v1(org,'op-'||gen_random_uuid(),repeat('b',64),'ASSIGN_ITEM',pack,book,reservation,'actor','device',now(),parcel_b,item,3,NULL,evidence);
 IF receipt->>'outcome' IS DISTINCT FROM 'APPLIED' THEN RAISE EXCEPTION 'Second assignment failed: %',receipt; END IF;
 receipt:=public.scanner_parcel_command_v1(org,'op-'||gen_random_uuid(),repeat('b',64),'SEAL_PARCEL',pack,book,reservation,'actor','device',now(),parcel_a,NULL,NULL,NULL,evidence);
 IF receipt->>'outcome' IS DISTINCT FROM 'APPLIED' THEN RAISE EXCEPTION 'Seal failed: %',receipt; END IF;
 receipt:=public.scanner_parcel_command_v1(org,'op-'||gen_random_uuid(),repeat('b',64),'UNASSIGN_ITEM',pack,book,reservation,'actor','device',now(),parcel_a,item,1,NULL,evidence);
 IF receipt->>'message' IS DISTINCT FROM 'parcel_sealed' THEN RAISE EXCEPTION 'Sealed unassign accepted: %',receipt; END IF;
 receipt:=public.scanner_parcel_command_v1(org,'op-'||gen_random_uuid(),repeat('b',64),'UNASSIGN_ITEM',pack,book,reservation,'actor','device',now(),parcel_b,item,3,NULL,evidence);
 IF receipt->>'outcome' IS DISTINCT FROM 'APPLIED' THEN RAISE EXCEPTION 'Second parcel unassign failed: %',receipt; END IF;
 PERFORM set_config('role','none',true);
 IF (SELECT parcel_id FROM public.packing_list_items WHERE id=item) IS DISTINCT FROM parcel_a THEN RAISE EXCEPTION 'Legacy pointer does not select remaining allocation'; END IF;
 IF (SELECT sum(quantity) FROM public.packing_list_item_allocations WHERE packing_list_item_id=item)<>7 THEN RAISE EXCEPTION 'Remaining allocation quantity changed'; END IF;
 PERFORM set_config('role','service_role',true);
 receipt:=public.scanner_parcel_command_v1(org,'op-'||gen_random_uuid(),repeat('b',64),'REOPEN_PARCEL',pack,book,reservation,'actor','device',now(),parcel_a,NULL,NULL,'fixture reason',evidence);
 IF receipt->>'outcome' IS DISTINCT FROM 'APPLIED' THEN RAISE EXCEPTION 'Reopen failed: %',receipt; END IF;
 receipt:=public.scanner_parcel_command_v1(org,'op-'||gen_random_uuid(),repeat('b',64),'UNASSIGN_ITEM',pack,book,reservation,'actor','device',now(),parcel_a,item,7,NULL,evidence);
 IF receipt->>'outcome' IS DISTINCT FROM 'APPLIED' THEN RAISE EXCEPTION 'Final unassign failed: %',receipt; END IF;
 PERFORM set_config('role','none',true);
 IF (SELECT parcel_id FROM public.packing_list_items WHERE id=item) IS NOT NULL THEN RAISE EXCEPTION 'Empty item retains legacy parcel pointer'; END IF;
 IF EXISTS(SELECT 1 FROM public.packing_list_item_allocations WHERE packing_list_item_id=item) THEN RAISE EXCEPTION 'Final allocation survived unassign'; END IF;
END $test$;
ROLLBACK;
