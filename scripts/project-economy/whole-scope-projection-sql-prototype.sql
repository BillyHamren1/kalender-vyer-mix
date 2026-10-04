-- TEST ONLY. Load into an explicitly disposable session; functions are pg_temp.
-- No production schema, table, RPC, grant, persisted money or source authority.
-- Leaf/scope inputs must already satisfy the unchanged TS evidence validators.
create function pg_temp.prototype_money(v jsonb, nonnegative boolean default false) returns numeric
language plpgsql as $$declare n numeric;begin
 if v='null'::jsonb then return null;end if;
 if v is null or jsonb_typeof(v)<>'number' then raise exception 'Invalid obligation money';end if;
 n:=v::text::numeric;
 if n<>trunc(n) or abs(n)>9007199254740991 or (nonnegative and n<0) then raise exception 'Invalid obligation money';end if;return n;
end;$$;
create function pg_temp.prototype_minor(n numeric) returns numeric language plpgsql as $$begin
 if n<>trunc(n) or abs(n)>9007199254740991 then raise exception 'Unsafe obligation aggregation';end if;return n;
end;$$;
create function pg_temp.prototype_obligation(p jsonb) returns jsonb language plpgsql as $$declare
 k text;s jsonb;o jsonb;ids text[]:='{}';issues text[]:='{}';originals jsonb:='{}';credits jsonb:='{}';
 estimate numeric;commitment numeric;amount numeric;replacement numeric;consumption numeric;total numeric;
 confirmed numeric:=0;preliminary numeric:=0;replaced numeric:=0;consumed numeric:=0;
 er numeric;cr numeric;remaining numeric;known numeric;complete boolean;
begin
 if p is null or jsonb_typeof(p)<>'object' or p->>'cost_basis' is null or p->>'cost_basis' not in ('time','invoice','other')
 or p->>'relation_coverage' is null or p->>'relation_coverage' not in ('complete','unresolved') then raise exception 'Explicit obligation authority required';end if;
 foreach k in array array['organization_id','project_id','obligation_id'] loop
 if jsonb_typeof(p->k) is distinct from 'string' or p->>k !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Exact obligation scope required';end if;end loop;
 if p->>'currency' is null or p->>'currency' !~ '^[A-Z]{3}$' or jsonb_typeof(p->'sources') is distinct from 'array' then raise exception 'Invalid obligation envelope';end if;
 if jsonb_array_length(p->'sources')>10000 then raise exception 'Invalid obligation envelope';end if;
 estimate:=pg_temp.prototype_money(p->'estimate_minor',true);commitment:=pg_temp.prototype_money(p->'committed_minor',true);
 if p->>'relation_coverage'<>'complete' then issues:=array_append(issues,'unresolved_obligation_relation');end if;
 if estimate is null then issues:=array_append(issues,'missing_estimate');end if;
 if commitment is null then issues:=array_append(issues,'missing_commitment');end if;
 for s in select value from jsonb_array_elements(p->'sources') loop
 if s is null or jsonb_typeof(s->'source_id') is distinct from 'string' or btrim(s->>'source_id', E' \t\n\v\f\r'||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279))=''  or s->>'source_id'=any(ids) then raise exception 'Duplicate/missing obligation source identity';end if;
 ids:=array_append(ids,s->>'source_id');
 foreach k in array array['organization_id','project_id','obligation_id','currency'] loop if s->k is distinct from p->k then raise exception 'Cross-scope obligation relation';end if;end loop;
 if s->>'kind' is null or s->>'kind' not in ('time','invoice','credit','other') or s->>'status' is null or s->>'status' not in ('preliminary','confirmed','rejected') or s->>'relation_coverage' is null or s->>'relation_coverage' not in ('complete','unresolved') then raise exception 'Invalid obligation source status';end if;
 perform pg_temp.prototype_money(s->'amount_minor');perform pg_temp.prototype_money(s->'replaces_estimate_minor',true);perform pg_temp.prototype_money(s->'consumes_commitment_minor',true);
 if s->>'kind'<>'credit' and s->'credited_source_id' is distinct from 'null'::jsonb then raise exception 'Credit relationship on noncredit source';end if;
 if s->>'kind'='invoice' then originals:=originals||jsonb_build_object(s->>'source_id',s);end if;
 end loop;
 for s in select value from jsonb_array_elements(p->'sources') loop
 if s->>'status'='rejected' then continue;end if;
 if s->>'relation_coverage'<>'complete' then issues:=array_append(issues,'unresolved_source_relation:'||(s->>'source_id'));continue;end if;
 replacement:=pg_temp.prototype_money(s->'replaces_estimate_minor',true);consumption:=pg_temp.prototype_money(s->'consumes_commitment_minor',true);
 if p->>'cost_basis'='invoice' and s->>'kind'='time' then
 if replacement is distinct from 0 or consumption is distinct from 0 then raise exception 'Noncharging hired time cannot consume obligation';end if;continue;end if;
 if (p->>'cost_basis'='time' and s->>'kind'<>'time') or (p->>'cost_basis'='invoice' and s->>'kind' not in ('invoice','credit')) or (p->>'cost_basis'='other' and s->>'kind'<>'other') then raise exception 'Competing obligation cost authorities';end if;
 amount:=pg_temp.prototype_money(s->'amount_minor');
 if amount is null then issues:=array_append(issues,'missing_source_amount:'||(s->>'source_id'));continue;end if;
 if replacement is null or consumption is null then issues:=array_append(issues,'missing_source_replacement:'||(s->>'source_id'));end if;
 if s->>'kind'='credit' then
 if amount>=0 or replacement is distinct from 0 or consumption is distinct from 0 then raise exception 'Credit cannot restore or consume estimated obligation';end if;
 o:=case when jsonb_typeof(s->'credited_source_id')='string' then originals->(s->>'credited_source_id') else null end;
 if o is null or o->>'status'='rejected' or o->'amount_minor'='null'::jsonb or (o->>'amount_minor')::numeric<=0 or o->>'relation_coverage'<>'complete' then issues:=array_append(issues,'unresolved_credit_original:'||(s->>'source_id'));continue;end if;
 total:=coalesce((credits->>(o->>'source_id'))::numeric,0)-amount;
 if total>(o->>'amount_minor')::numeric then raise exception 'Credit exceeds its exact original allocation';end if;
 credits:=credits||jsonb_build_object(o->>'source_id',total);
 elsif amount<0 then raise exception 'Negative noncredit source';end if;
 replaced:=replaced+coalesce(replacement,0);consumed:=consumed+coalesce(consumption,0);
 if s->>'status'='confirmed' then confirmed:=confirmed+amount;else preliminary:=preliminary+amount;end if;
 end loop;
 if estimate is not null and replaced>estimate then raise exception 'Estimate replacement exceeds obligation';end if;
 if commitment is not null and consumed>commitment then raise exception 'Commitment consumption exceeds obligation';end if;
 complete:=cardinality(issues)=0;
 if complete and estimate is not null then er:=pg_temp.prototype_minor(estimate-replaced);end if;
 if complete and commitment is not null then cr:=pg_temp.prototype_minor(commitment-consumed);end if;
 if er is not null and cr is not null then remaining:=greatest(er,cr);end if;
 known:=pg_temp.prototype_minor(confirmed+preliminary);
 return jsonb_build_object('schema_version','operations-cost-obligation-v1','calculation_version','operations-obligation-replacement-v1',
 'organization_id',p->'organization_id','project_id',p->'project_id','obligation_id',p->'obligation_id','currency',p->'currency','cost_basis',p->'cost_basis',
 'coverage',case when complete then 'complete' else 'unavailable' end,'issues',to_jsonb(issues),'source_ids',to_jsonb(ids),
 'confirmed_minor',pg_temp.prototype_minor(confirmed),'preliminary_minor',pg_temp.prototype_minor(preliminary),'known_cost_minor',known,
 'estimate_remaining_minor',er,'commitment_remaining_minor',cr,'remaining_minor',remaining,'eac_minor',case when remaining is null then null else pg_temp.prototype_minor(confirmed+preliminary+remaining) end);
end;$$;
create function pg_temp.prototype_leaf(e jsonb) returns jsonb language plpgsql as $$declare
 s jsonb;input jsonb;result jsonb;b jsonb:=e->'baseline';sources jsonb:='[]';excluded jsonb:='[]';diagnostics jsonb:=e->'diagnostics';resolved int:=0;
begin
 for s in select value from jsonb_array_elements(e->'sources') loop
 if s->'resolved'='true'::jsonb then
 resolved:=resolved+1;
 sources:=sources||jsonb_build_array(jsonb_build_object('source_id','invoice:'||(s->>'source_anchor'),'organization_id',e->'organization_id','project_id',e->'project_id','obligation_id',e->'obligation_id','currency',b->'currency','kind','invoice','status',s->'status','amount_minor',s->'amount_minor','replaces_estimate_minor',s->'replaces_estimate_minor','consumes_commitment_minor',s->'consumes_commitment_minor','credited_source_id',null,'relation_coverage','complete'));
 else excluded:=excluded||jsonb_build_array(s->'source_anchor');diagnostics:=diagnostics||jsonb_build_array('excluded_source:'||(s->>'source_anchor')||':'||(s->>'reason'));end if;
 end loop;
 for s in select value from jsonb_array_elements(e->'sources') loop if s->'resolved'='true'::jsonb and s->>'policy_state'<>'current' then diagnostics:=diagnostics||jsonb_build_array('unavailable_source_policy:'||(s->>'source_anchor'));end if;end loop;
 if e->>'state'<>'unsupported_basis' then
 input:=jsonb_build_object('organization_id',e->'organization_id','project_id',e->'project_id','obligation_id',e->'obligation_id','currency',b->'currency','cost_basis','invoice','estimate_minor',b->'estimate_minor','committed_minor',b->'committed_minor','relation_coverage','unresolved','sources',sources);
 result:=pg_temp.prototype_obligation(input);end if;
 return jsonb_build_object('schema_version','operations-local-invoice-kernel-projection.v1','authority_scope','local_project_only','source_currentness','saved_receiver_heads_only','kernel_input',input,'kernel_result',result,'known_captured_cost_minor',case when resolved=0 then null else result->'known_cost_minor' end,'resolved_source_count',resolved,'excluded_source_anchors',excluded,'diagnostics',diagnostics,'category_coverage','unavailable','source_coverage','unavailable','remaining_minor',null,'eac_minor',null,'credit_eligible',false,'shadow_only',true);
end;$$;
create function pg_temp.prototype_scope(e jsonb) returns jsonb language plpgsql as $$declare
 m jsonb;s jsonb;child jsonb;reply jsonb;diagnostics jsonb:=e->'diagnostics';excluded jsonb:='[]';confirmed numeric:=0;preliminary numeric:=0;count int:=0;k text;
begin
 for m in select value from jsonb_array_elements(e->'members') loop
 child:=pg_temp.prototype_leaf(m->'kernel_evidence');diagnostics:=diagnostics||(child->'diagnostics');
 if (child->>'resolved_source_count')::int>0 then count:=count+(child->>'resolved_source_count')::int;confirmed:=confirmed+(child->'kernel_result'->>'confirmed_minor')::numeric;preliminary:=preliminary+(child->'kernel_result'->>'preliminary_minor')::numeric;end if;end loop;
 for s in select value from jsonb_array_elements(e->'source_inventory') loop if s->>'mapping_state'<>'charging' then excluded:=excluded||jsonb_build_array(s->'source_anchor');diagnostics:=diagnostics||jsonb_build_array('excluded_scope_source:'||(s->>'source_anchor')||':'||(s->>'reason'));end if;end loop;
 if count>0 and (abs(confirmed)>9007199254740991 or abs(preliminary)>9007199254740991 or abs(confirmed+preliminary)>9007199254740991) then raise exception 'unsafe_scope_invoice_subtotal';end if;
 reply:=jsonb_build_object('schema_version','operations-scope-invoice-kernel-projection.v1','authority_scope','canonical_scope_invoice_capture',
 'known_captured_invoice_cost_minor',case when count=0 then null else confirmed+preliminary end,'confirmed_captured_invoice_cost_minor',case when count=0 then null else confirmed end,'preliminary_captured_invoice_cost_minor',case when count=0 then null else preliminary end,
 'resolved_source_count',count,'excluded_source_anchors',excluded,'member_count',jsonb_array_length(e->'members'),'diagnostics',diagnostics,'source_coverage','unavailable','credit_eligible',false,'remaining_minor',null,'eac_minor',null,'budget_minor',null,'margin_minor',null,'shadow_only',true);
 foreach k in array array['organization_id','economic_scope_id','currency','scope_snapshot_id','scope_revision','membership_fingerprint','composition_snapshot_id','composition_revision','composition_fingerprint','root_kind','root_id','membership_currentness','source_currentness','as_of','captured_inventory_fingerprint','captured_inventory_matches_current','category_coverage'] loop reply:=reply||jsonb_build_object(k,e->k);end loop;
 return reply;
end;$$;
