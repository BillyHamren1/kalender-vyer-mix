-- Isolated serializer parity only: not authenticated allocation/native HTTP proof.
-- Runner supplies actual Operations-generated controls in this transaction-local GUC.
do $$
declare v jsonb; cost_hash text; event_hash text; n integer:=0;
begin
 for v in select value from jsonb_array_elements(current_setting('test.catering_allocation_vectors')::jsonb) loop
  n:=n+1;
  cost_hash:=operations_catering_allocation_private.cost_fingerprint_v2(v->'snapshot');
  event_hash:=encode(sha256(convert_to(operations_catering_private.canonical_source_json_v1((v->'event')-'fingerprint'),'UTF8')),'hex');
  if cost_hash is distinct from v->'event'->>'source_cost_fingerprint' then raise exception 'allocation SQL/Operations cost hash mismatch';end if;
  if event_hash is distinct from v->'event'->>'fingerprint' then raise exception 'allocation SQL/Operations event hash mismatch';end if;
  if v->'event'->>'reason' is distinct from E'Flytta kostnad – kök "A"\nprojekt B' then raise exception 'Unicode/quoted/newline vector missing';end if;
  if v->'event'->>'created_at' is distinct from '2026-10-02T00:00:00.123456+00:00' then raise exception 'historical timestamp bytes changed';end if;
 end loop;
 if n<>2 then raise exception 'complete and nullable vectors required';end if;
end;$$;
