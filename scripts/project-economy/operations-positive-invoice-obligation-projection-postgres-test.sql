-- Disposable PostgreSQL fixture. Load canonical Operations migrations through
-- 20261003123000 first. This transaction always rolls back.
\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(v boolean,label text) returns void language plpgsql as $$
begin if v is distinct from true then raise exception 'step7 assertion failed: %',label;end if;end$$;

do $$declare
  org uuid:='11111111-1111-4111-8111-111111111111';project uuid:='22222222-2222-4222-8222-222222222222';obligation uuid:='33333333-3333-4333-8333-333333333333';
  a text:=repeat('a',64);b text:=repeat('b',64);base jsonb;preliminary jsonb;confirmed jsonb;partial jsonb;rejected jsonb;split jsonb;missing jsonb;
begin
  base:=jsonb_build_object('schema_version','operations-positive-invoice-obligation-input.v1','organization_id',org,'project_id',project,
    'obligation_id',obligation,'currency','SEK','estimate_minor',5000,'committed_minor',5000,'sources','[]'::jsonb);
  preliminary:=operations_economy_private.positive_invoice_obligation_projection_v1(base||jsonb_build_object('sources',jsonb_build_array(
    jsonb_build_object('source_key',a,'status','preliminary','amount_minor',5400,'replaces_estimate_minor',5000,'consumes_commitment_minor',5000,'binding_state','resolved','policy_state','current'))));
  confirmed:=operations_economy_private.positive_invoice_obligation_projection_v1(base||jsonb_build_object('sources',jsonb_build_array(
    jsonb_build_object('source_key',a,'status','confirmed','amount_minor',5400,'replaces_estimate_minor',5000,'consumes_commitment_minor',5000,'binding_state','resolved','policy_state','current'))));
  perform pg_temp.assert_true(preliminary->>'eacMinor'='5400' and preliminary->>'preliminaryMinor'='5400' and preliminary->>'confirmedMinor'='0'
    and preliminary->>'sourceCount'='1' and preliminary->'sourceKeys'=jsonb_build_array(a),'estimate5000_invoice5400_not10400_preliminary');
  perform pg_temp.assert_true(confirmed->>'eacMinor'='5400' and confirmed->>'preliminaryMinor'='0' and confirmed->>'confirmedMinor'='5400'
    and confirmed->'sourceKeys'=preliminary->'sourceKeys' and confirmed->>'sourceCount'='1','same_allocation_identity_preliminary_to_confirmed');

  partial:=operations_economy_private.positive_invoice_obligation_projection_v1(base||jsonb_build_object('sources',jsonb_build_array(
    jsonb_build_object('source_key',a,'status','preliminary','amount_minor',2000,'replaces_estimate_minor',2000,'consumes_commitment_minor',2000,'binding_state','resolved','policy_state','current'))));
  perform pg_temp.assert_true(partial->>'knownInvoiceMinor'='2000' and partial->>'remainingMinor'='3000' and partial->>'eacMinor'='5000','partial_invoice_plus_remaining_commitment');

  rejected:=operations_economy_private.positive_invoice_obligation_projection_v1(base||jsonb_build_object('sources',jsonb_build_array(
    jsonb_build_object('source_key',a,'status','rejected','amount_minor',5400,'replaces_estimate_minor',5000,'consumes_commitment_minor',5000,'binding_state','resolved','policy_state','current'))));
  perform pg_temp.assert_true(rejected->>'knownInvoiceMinor'='0' and rejected->>'remainingMinor'='5000' and rejected->>'eacMinor'='5000'
    and rejected->>'rejectedSourceCount'='1','rejected_document_does_not_consume_real_commitment');

  split:=operations_economy_private.positive_invoice_obligation_projection_v1(base||jsonb_build_object('sources',jsonb_build_array(
    jsonb_build_object('source_key',b,'status','confirmed','amount_minor',2700,'replaces_estimate_minor',2500,'consumes_commitment_minor',2500,'binding_state','resolved','policy_state','current'),
    jsonb_build_object('source_key',a,'status','confirmed','amount_minor',2700,'replaces_estimate_minor',2500,'consumes_commitment_minor',2500,'binding_state','resolved','policy_state','current'))));
  perform pg_temp.assert_true(split->>'sourceCount'='2' and split->'sourceKeys'=jsonb_build_array(a,b) and split->>'knownInvoiceMinor'='5400'
    and split->>'remainingMinor'='0' and split->>'eacMinor'='5400','split_exact_two_identity_set');

  missing:=operations_economy_private.positive_invoice_obligation_projection_v1(jsonb_set(base,'{estimate_minor}','null'::jsonb)||jsonb_build_object('sources',jsonb_build_array(
    jsonb_build_object('source_key',a,'status','preliminary','amount_minor',2000,'replaces_estimate_minor',null,'consumes_commitment_minor',2000,'binding_state','resolved','policy_state','missing'))));
  perform pg_temp.assert_true(missing->>'coverage'='unavailable' and missing->'remainingMinor'='null'::jsonb and missing->'eacMinor'='null'::jsonb
    and missing->'preliminaryMinor'='null'::jsonb and missing->'confirmedMinor'='null'::jsonb
    and missing->'knownInvoiceMinor'='null'::jsonb,'missing_never_fabricated_zero_total');
  perform pg_temp.assert_true(preliminary->>'financeRecalculated'='false' and preliminary->>'totalProjectCoverage'='unavailable'
    and preliminary->>'creditCoverage'='unavailable' and preliminary->>'hiredCoverage'='unavailable','bounded_operations_only_nonclaims');
end$$;
rollback;
select 'PASS operations-positive-invoice-obligation-projection-postgres' as result;
