import {calculateOperationalEAC,serializeOperationalEACInput,type OperationalEACInput} from '../../supabase/functions/_shared/project-operational-eac.ts';
const f=JSON.parse(await Deno.readTextFile(Deno.args[0])),personnel=f.snapshot;
const category_coverage=['personnel','supplier','catering','other'].map(category=>({category:category as any,coverage:'complete' as const,source_reference:'synthetic-explicit-category-inventory'}));
const input:OperationalEACInput={schema_version:'operations-project-cost-forecast-input-v1',organization_id:personnel.organization_id,project_id:personnel.lines[0].source_project_id,
 currency:'SEK',source_revision:1,scope_coverage:'complete',scope_reference:'synthetic-isolated-project-inventory',category_coverage,
 booking_budgets:[{organization_id:personnel.organization_id,project_id:personnel.lines[0].source_project_id,source_booking_id:personnel.lines[0].source_booking_id,
  source_revision:1,source_hash:'a'.repeat(64),mapping_version:null,currency:'SEK',coverage:'unavailable',amount_minor:null,raw_payload:{budgeted_hours:40,hourly_rate:350,fractionalLegacyEvidence:1e-7}}],
 obligations:[{category:'personnel',baseline_revision:1,baseline_fingerprint:'b'.repeat(64),input:{organization_id:personnel.organization_id,project_id:personnel.lines[0].source_project_id,
  obligation_id:'88888888-8888-4888-8888-888888888888',currency:'SEK',cost_basis:'time',estimate_minor:5000,committed_minor:5000,relation_coverage:'complete',sources:[{
   source_id:'time:synthetic-line-a',organization_id:personnel.organization_id,project_id:personnel.lines[0].source_project_id,obligation_id:'88888888-8888-4888-8888-888888888888',currency:'SEK',
   kind:'time',status:personnel.lines[0].status,amount_minor:personnel.lines[0].amount_minor,replaces_estimate_minor:5000,consumes_commitment_minor:5000,credited_source_id:null,relation_coverage:'complete'}]},
  source_evidence:[{source_id:'time:synthetic-line-a',source_system:'time',source_stream_id:personnel.source_time_stream_id,source_revision:1,source_fingerprint:personnel.source_snapshot_hash}]}]};
const initial=await calculateOperationalEAC(input),confirmedInput=structuredClone(input);confirmedInput.source_revision=2;confirmedInput.obligations[0].input.sources[0].status='confirmed';
confirmedInput.obligations[0].source_evidence[0].source_revision=2;const confirmed=await calculateOperationalEAC(confirmedInput);
const missingInput=structuredClone(confirmedInput);missingInput.source_revision=3;missingInput.obligations[0].input.estimate_minor=null;missingInput.obligations[0].baseline_revision=2;
const missing=await calculateOperationalEAC(missingInput);
const staleInput=structuredClone(input);staleInput.source_revision=5;const stale=await calculateOperationalEAC(staleInput);
console.log(JSON.stringify({input,initial,rawInput:serializeOperationalEACInput(input),confirmedInput,confirmed,confirmedRawInput:serializeOperationalEACInput(confirmedInput),
 missingInput,missing,missingRawInput:serializeOperationalEACInput(missingInput),staleInput,stale,staleRawInput:serializeOperationalEACInput(staleInput)}));
