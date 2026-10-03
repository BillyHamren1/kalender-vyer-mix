import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = new URL('../../', import.meta.url);
const foundationMigrationPath = new URL('supabase/migrations/20261003235900_project_economy_step8_shadow_read_v1.sql', root);
const migrationPath = new URL('supabase/migrations/20261004002000_project_economy_step8_payload_projector_v1.sql', root);
const foundationMigration = readFileSync(foundationMigrationPath, 'utf8');
const migration = readFileSync(migrationPath, 'utf8');
const migrationSha256 = createHash('sha256').update(migration).digest('hex');
const foundationPaths = [
  '.github/workflows/project-economy-step8-shadow.yml',
  'scripts/project-economy/step8-shadow-runtime.mjs',
  'src/components/project/ProjectEconomyStep8ShadowPanel.rendered.test.tsx',
  'src/components/project/ProjectEconomyStep8ShadowPanel.tsx',
  'src/lib/economy/projectEconomyStep8ShadowAdapter.test.ts',
  'src/lib/economy/projectEconomyStep8ShadowAdapter.ts',
  'supabase/migrations/20261003235900_project_economy_step8_shadow_read_v1.sql',
];
const cumulativePaths = [
  '.github/workflows/project-economy-step8-shadow.yml',
  'scripts/project-economy/step8-shadow-runtime.mjs',
  'src/components/project/ProjectEconomyStep8ShadowPanel.rendered.test.tsx',
  'src/components/project/ProjectEconomyStep8ShadowPanel.tsx',
  'src/lib/economy/projectEconomyStep8ShadowAdapter.test.ts',
  'src/lib/economy/projectEconomyStep8ShadowAdapter.ts',
  'src/pages/project/ProjectEconomyPage.step8-shadow.rendered.test.tsx',
  'src/pages/project/ProjectEconomyPage.tsx',
  'supabase/migrations/20261003235900_project_economy_step8_shadow_read_v1.sql',
  'supabase/migrations/20261004002000_project_economy_step8_payload_projector_v1.sql',
];
const ciRepairPaths = [
  '.github/workflows/project-economy-step8-shadow.yml',
  'scripts/project-economy/step8-shadow-runtime.mjs',
];
const sqlRepairPaths = [
  '.github/workflows/project-economy-step8-shadow.yml',
  'scripts/project-economy/step8-shadow-runtime.mjs',
  'supabase/migrations/20261003235900_project_economy_step8_shadow_read_v1.sql',
];
const mountRepairPaths = [
  '.github/workflows/project-economy-step8-shadow.yml',
  'scripts/project-economy/step8-shadow-runtime.mjs',
  'src/pages/project/ProjectEconomyPage.step8-shadow.rendered.test.tsx',
  'src/pages/project/ProjectEconomyPage.tsx',
];
const refactorPaths = [
  '.github/workflows/project-economy-step8-shadow.yml',
  'scripts/project-economy/step8-shadow-runtime.mjs',
  'supabase/migrations/20261004002000_project_economy_step8_payload_projector_v1.sql',
];

function run(command, args, options = {}) {
  const result = spawnSync(command,args,{ cwd: new URL('.',root), encoding:'utf8', ...options });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '');process.stderr.write(result.stderr ?? '');
    throw new Error(`${command} failed with ${result.status}`);
  }
  return (result.stdout ?? '').trim();
}

const expectedBase = process.env.STEP8_EXPECTED_BASE;
const expectedBaseTree = process.env.STEP8_EXPECTED_BASE_TREE;
const expectedFoundation = process.env.STEP8_EXPECTED_FOUNDATION;
const expectedFoundationTree = process.env.STEP8_EXPECTED_FOUNDATION_TREE;
const expectedCiRepair = process.env.STEP8_EXPECTED_CI_REPAIR;
const expectedCiRepairTree = process.env.STEP8_EXPECTED_CI_REPAIR_TREE;
const expectedSqlRepair = process.env.STEP8_EXPECTED_SQL_REPAIR;
const expectedSqlRepairTree = process.env.STEP8_EXPECTED_SQL_REPAIR_TREE;
const expectedMount = process.env.STEP8_EXPECTED_MOUNT;
const expectedMountTree = process.env.STEP8_EXPECTED_MOUNT_TREE;
if (!expectedBase || !expectedBaseTree || !expectedFoundation || !expectedFoundationTree ||
    !expectedCiRepair || !expectedCiRepairTree || !expectedSqlRepair || !expectedSqlRepairTree ||
    !expectedMount || !expectedMountTree)
  throw new Error('exact Step8 base, foundation, CI repair, SQL repair, and mount provenance are required');
if (run('git',['rev-parse','HEAD^']) !== expectedMount) throw new Error('unexpected Step8 mount parent');
if (run('git',['rev-parse',`${expectedMount}^{tree}`]) !== expectedMountTree)
  throw new Error('unexpected Step8 mount tree');
if (run('git',['rev-parse',`${expectedMount}^`]) !== expectedSqlRepair)
  throw new Error('unexpected Step8 mount SQL repair parent');
if (run('git',['rev-parse',`${expectedSqlRepair}^{tree}`]) !== expectedSqlRepairTree)
  throw new Error('unexpected Step8 SQL repair tree');
if (run('git',['rev-parse',`${expectedSqlRepair}^`]) !== expectedCiRepair)
  throw new Error('unexpected Step8 SQL repair CI parent');
if (run('git',['rev-parse',`${expectedCiRepair}^{tree}`]) !== expectedCiRepairTree)
  throw new Error('unexpected Step8 CI repair tree');
if (run('git',['rev-parse',`${expectedCiRepair}^`]) !== expectedFoundation)
  throw new Error('unexpected Step8 CI repair foundation');
if (run('git',['rev-parse',`${expectedFoundation}^{tree}`]) !== expectedFoundationTree)
  throw new Error('unexpected Step8 foundation tree');
if (run('git',['rev-parse',`${expectedFoundation}^`]) !== expectedBase)
  throw new Error('unexpected Step8 foundation base');
if (run('git',['rev-parse',`${expectedBase}^{tree}`]) !== expectedBaseTree)
  throw new Error('unexpected Step8 base tree');
if (run('git',['rev-list','--count',`${expectedBase}..HEAD`]) !== '5')
  throw new Error('Step8 must be the exact five-commit cumulative chain');
if (run('git',['rev-list','--count',`${expectedBase}..${expectedFoundation}`]) !== '1')
  throw new Error('Step8 foundation must be one exact successor of the base');
if (run('git',['rev-list','--count',`${expectedFoundation}..${expectedCiRepair}`]) !== '1')
  throw new Error('Step8 CI repair must be one exact successor of the foundation');
if (run('git',['rev-list','--count',`${expectedCiRepair}..${expectedSqlRepair}`]) !== '1')
  throw new Error('Step8 SQL repair must be one exact successor of the CI repair');
if (run('git',['rev-list','--count',`${expectedSqlRepair}..${expectedMount}`]) !== '1')
  throw new Error('Step8 mount must be one exact successor of the SQL repair');
const foundationChanged = run('git',['diff','--name-only',expectedBase,expectedFoundation]).split('\n').filter(Boolean).sort();
if (JSON.stringify(foundationChanged) !== JSON.stringify(foundationPaths))
  throw new Error(`unexpected Step8 foundation paths: ${foundationChanged.join(',')}`);
const ciRepairChanged = run('git',['diff','--name-only',expectedFoundation,expectedCiRepair]).split('\n').filter(Boolean).sort();
if (JSON.stringify(ciRepairChanged) !== JSON.stringify(ciRepairPaths))
  throw new Error(`unexpected Step8 CI repair paths: ${ciRepairChanged.join(',')}`);
const sqlRepairChanged = run('git',['diff','--name-only',expectedCiRepair,expectedSqlRepair]).split('\n').filter(Boolean).sort();
if (JSON.stringify(sqlRepairChanged) !== JSON.stringify(sqlRepairPaths))
  throw new Error(`unexpected Step8 SQL repair paths: ${sqlRepairChanged.join(',')}`);
const mountRepairChanged = run('git',['diff','--name-only',expectedSqlRepair,expectedMount]).split('\n').filter(Boolean).sort();
if (JSON.stringify(mountRepairChanged) !== JSON.stringify(mountRepairPaths))
  throw new Error(`unexpected Step8 mount repair paths: ${mountRepairChanged.join(',')}`);
const refactorChanged = run('git',['diff','--name-only',expectedMount,'HEAD']).split('\n').filter(Boolean).sort();
if (JSON.stringify(refactorChanged) !== JSON.stringify(refactorPaths))
  throw new Error(`unexpected Step8 projector refactor paths: ${refactorChanged.join(',')}`);
const cumulativeChanged = run('git',['diff','--name-only',expectedBase,'HEAD']).split('\n').filter(Boolean).sort();
if (JSON.stringify(cumulativeChanged) !== JSON.stringify(cumulativePaths))
  throw new Error(`unexpected cumulative Step8 paths: ${cumulativeChanged.join(',')}`);

for (const forbidden of [
  /\bcreate\s+table\b/i,/\binsert\s+into\b/i,/\bupdate\s+public\b/i,/\bdelete\s+from\b/i,
  /hourly_rate_minor/i,/source_reference/i,/\bsum\s*\([^)]*amountMinor/i,
]) if (forbidden.test(migration)) throw new Error(`migration violates read-only/privacy boundary: ${forbidden}`);
if (!/security definer/i.test(migration) || !/security invoker/i.test(migration))
  throw new Error('paired definer/invoker boundary required');
if (!/create function operations_economy_private\.project_economy_step8_shadow_payload_v1\(\s*p_organization_id uuid,\s*p_project_id uuid\s*\)[\s\S]*?stable\s+security invoker/i.test(migration))
  throw new Error('private stable security-invoker Step8 payload projector required');
if (!/revoke all on function operations_economy_private\.project_economy_step8_shadow_payload_v1\(uuid,uuid\)\s+from public,anon,authenticated,service_role;/i.test(migration))
  throw new Error('payload projector must revoke every Data API role');
if (/grant execute on function operations_economy_private\.project_economy_step8_shadow_payload_v1/i.test(migration))
  throw new Error('payload projector execute privilege must not be granted');
const wrapperStart = migration.indexOf('create or replace function operations_economy_private.read_project_economy_step8_shadow_v1');
if (wrapperStart < 0) throw new Error('existing actor wrapper must be replaced');
const wrapperSource = migration.slice(wrapperStart);
const wrapperStages = [
  "jsonb_typeof(p_request)",
  "v_org := (p_request->>'organizationId')::uuid",
  'authorize_project_v1(v_project,false)',
  'v_org is distinct from v_authorized_org',
  'project_economy_step8_shadow_payload_v1(',
];
let priorWrapperStage = -1;
for (const stage of wrapperStages) {
  const nextWrapperStage = wrapperSource.indexOf(stage);
  if (nextWrapperStage <= priorWrapperStage) throw new Error(`actor wrapper stage missing or reordered: ${stage}`);
  priorWrapperStage = nextWrapperStage;
}
for (const forbiddenTable of [
  'operations_personnel_cost_streams',
  'operations_personnel_cost_publications',
  'operations_finance_invoice_economic_current_v2',
]) if (wrapperSource.includes(forbiddenTable)) throw new Error(`actor wrapper projects table data directly: ${forbiddenTable}`);
if (!/financeRecalculated',false/.test(migration) || !/authoritativeTotals',false/.test(migration) || !/replacesLegacyTotals',false/.test(migration))
  throw new Error('shadow/non-calculator markers required');
const requiredIdentityExpressions = [
  "(value->>'sourceTimeStreamKey')||':'||(value->>'lineId')",
  "(value->>'invoiceId')||':'||(value->>'allocationId')",
];
const ambiguousIdentityExpressions = [
  "value->>'sourceTimeStreamKey'||':'||value->>'lineId'",
  "value->>'invoiceId'||':'||value->>'allocationId'",
];
function assertUnambiguousExceptionIdentities(sqlSource) {
  for (const expression of requiredIdentityExpressions)
    if (!sqlSource.includes(expression)) throw new Error(`missing parenthesized Step8 exception identity: ${expression}`);
  for (const expression of ambiguousIdentityExpressions)
    if (sqlSource.includes(expression)) throw new Error(`ambiguous Step8 exception identity: ${expression}`);
}
assertUnambiguousExceptionIdentities(migration);
let adversarialIdentityDenied = false;
try {
  assertUnambiguousExceptionIdentities(migration.replace(requiredIdentityExpressions[0],ambiguousIdentityExpressions[0]));
} catch {
  adversarialIdentityDenied = true;
}
if (!adversarialIdentityDenied) throw new Error('ambiguous Step8 exception identity adversarial was accepted');

if (process.env.STEP8_STATIC_ONLY === '1') {
  console.log(JSON.stringify({
    status:'PASS',mode:'static-only',migrationSha256,
    sourceBase:expectedBase,sourceBaseTree:expectedBaseTree,
    sourceFoundation:expectedFoundation,sourceFoundationTree:expectedFoundationTree,
    sourceCiRepair:expectedCiRepair,sourceCiRepairTree:expectedCiRepairTree,
    sourceSqlRepair:expectedSqlRepair,sourceSqlRepairTree:expectedSqlRepairTree,
    sourceMount:expectedMount,sourceMountTree:expectedMountTree,
    changedPaths:cumulativePaths,identityPrecedenceAdversarialDenied:true,
  },null,2));
  process.exit(0);
}

const databaseUrl = process.env.STEP8_DATABASE_URL;
if (!databaseUrl) throw new Error('STEP8_DATABASE_URL is required');
const orgA='10000000-0000-4000-8000-000000000001',orgB='10000000-0000-4000-8000-000000000002';
const projectA='20000000-0000-4000-8000-000000000001',projectB='20000000-0000-4000-8000-000000000002';
const projectWithoutGrant='20000000-0000-4000-8000-000000000003';
const admin='30000000-0000-4000-8000-000000000001',granted='30000000-0000-4000-8000-000000000002';
const revoked='30000000-0000-4000-8000-000000000003',cross='30000000-0000-4000-8000-000000000004';
const sourceOrg='60000000-0000-4000-8000-000000000001';
const invoiceOne='70000000-0000-4000-8000-000000000001',allocationOne='72000000-0000-4000-8000-000000000001';
const invoiceTwo='70000000-0000-4000-8000-000000000002',allocationTwo='72000000-0000-4000-8000-000000000002';
const allocationAnchor=(invoiceId,allocationId,documentFingerprint) => createHash('sha256').update([
  'finance-invoice-allocation-source-anchor-v1',sourceOrg,invoiceId,allocationId,documentFingerprint,'SEK',
].join('\n')).digest('hex');
const originalSourceAnchor=allocationAnchor(invoiceOne,allocationOne,'b'.repeat(64));
const creditSourceAnchor=allocationAnchor(invoiceTwo,allocationTwo,'d'.repeat(64));
const request = JSON.stringify({schemaVersion:'operations-project-economy-step8-shadow-read.v1',organizationId:orgA,projectId:projectA});
const sql = String.raw`
\set ON_ERROR_STOP on
create extension if not exists pgcrypto;
create role anon noinherit;
create role authenticated noinherit;
create role service_role noinherit;
create schema auth;
create schema operations_economy_private;
revoke all on schema operations_economy_private from public,anon,authenticated,service_role;
grant usage on schema operations_economy_private to authenticated;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable set search_path='' as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create table public.profiles(user_id uuid not null,organization_id uuid not null);
create table public.projects(id uuid primary key,organization_id uuid not null,deleted_at timestamptz);
create table public.user_roles(user_id uuid not null,organization_id uuid not null,role text not null);
create table public.operations_project_personnel_review_grants(
  organization_id uuid not null,project_id uuid not null,system_user_id uuid not null,
  grant_sequence bigint not null,decision text not null
);
create function operations_economy_private.authorize_project_v1(p_project_id uuid,p_admin_only boolean default false)
returns uuid language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_org uuid;v_admin boolean;v_grant text;
begin
 if v_actor is null or not exists(select 1 from auth.users where id=v_actor) then raise exception 'authenticated_system_user_required' using errcode='42501';end if;
 begin select organization_id into strict v_org from public.profiles where user_id=v_actor;
 exception when no_data_found or too_many_rows then raise exception 'unambiguous_system_profile_required' using errcode='42501';end;
 if v_org is null or not exists(select 1 from public.projects where id=p_project_id and organization_id=v_org and deleted_at is null)
 then raise exception 'organization_project_access_denied' using errcode='42501';end if;
 select exists(select 1 from public.user_roles where user_id=v_actor and organization_id=v_org and role='admin') into v_admin;
 if v_admin then return v_org;end if;
 if p_admin_only or not exists(select 1 from public.user_roles where user_id=v_actor and organization_id=v_org)
 then raise exception 'project_review_admin_required' using errcode='42501';end if;
 select decision into v_grant from public.operations_project_personnel_review_grants
 where organization_id=v_org and project_id=p_project_id and system_user_id=v_actor order by grant_sequence desc limit 1;
 if v_grant is distinct from 'granted' then raise exception 'explicit_project_review_grant_required' using errcode='42501';end if;
 return v_org;
end;$$;
revoke all on function operations_economy_private.authorize_project_v1(uuid,boolean) from public,anon,authenticated,service_role;

create table public.operations_personnel_cost_streams(
 organization_id uuid not null,source_time_stream_id text not null,current_revision bigint not null,
 primary key(organization_id,source_time_stream_id)
);
create table public.operations_personnel_cost_publications(
 organization_id uuid not null,source_time_stream_id text not null,source_revision bigint not null,
 source_time_report_id uuid not null,time_snapshot_version bigint not null,cost_snapshot jsonb not null,
 primary key(organization_id,source_time_stream_id,source_revision)
);
create table public.operations_finance_invoice_streams(
 organization_id uuid not null,source_organization_id uuid not null,invoice_id uuid not null,current_revision bigint not null,
 primary key(organization_id,source_organization_id,invoice_id)
);
create table public.operations_finance_invoice_snapshots(
 organization_id uuid not null,source_organization_id uuid not null,invoice_id uuid not null,source_revision bigint not null,
 source_publication_fingerprint text not null,envelope jsonb not null,
 primary key(organization_id,source_organization_id,invoice_id,source_revision)
);
create table public.operations_finance_credit_v2_streams(
 organization_id uuid not null,source_organization_id uuid not null,invoice_id uuid not null,current_revision bigint not null,
 primary key(organization_id,source_organization_id,invoice_id)
);
create table public.operations_finance_credit_v2_snapshots(
 organization_id uuid not null,source_organization_id uuid not null,invoice_id uuid not null,source_revision bigint not null,
 source_publication_fingerprint text not null,source_economic_revision bigint not null,
 source_economic_publication_fingerprint text not null,envelope jsonb not null,
 primary key(organization_id,source_organization_id,invoice_id,source_revision)
);
create view public.operations_finance_invoice_economic_current_v2 as
with v1 as (
 select snapshot.* from public.operations_finance_invoice_streams head
 join public.operations_finance_invoice_snapshots snapshot using(organization_id,source_organization_id,invoice_id)
 where snapshot.source_revision=head.current_revision
),v2 as (
 select snapshot.* from public.operations_finance_credit_v2_streams head
 join public.operations_finance_credit_v2_snapshots snapshot using(organization_id,source_organization_id,invoice_id)
 where snapshot.source_revision=head.current_revision
),joined as (
 select coalesce(a.organization_id,b.organization_id) organization_id,
  coalesce(a.source_organization_id,b.source_organization_id) source_organization_id,
  coalesce(a.invoice_id,b.invoice_id) invoice_id,a.source_revision v1_revision,b.source_economic_revision v2_revision,
  a.source_publication_fingerprint v1_fp,b.source_economic_publication_fingerprint v2_fp,
  a.envelope v1_envelope,b.envelope v2_envelope,
  coalesce(a.source_revision=b.source_economic_revision and a.source_publication_fingerprint<>b.source_economic_publication_fingerprint,false) conflict
 from v1 a full join v2 b using(organization_id,source_organization_id,invoice_id)
)
select organization_id,source_organization_id,invoice_id,
 case when conflict then 'conflict' when v2_envelope is not null and (v1_envelope is null or v2_revision>=v1_revision) then 'v2' else 'v1' end source_protocol,
 greatest(v1_revision,v2_revision) source_economic_revision,
 case when conflict then null when v2_envelope is not null and (v1_envelope is null or v2_revision>=v1_revision) then v2_fp else v1_fp end source_economic_fingerprint,
 case when conflict then null when v2_envelope is not null and (v1_envelope is null or v2_revision>=v1_revision) then v2_envelope else v1_envelope end envelope
from joined;
alter table public.operations_personnel_cost_streams enable row level security;
alter table public.operations_personnel_cost_publications enable row level security;
alter table public.operations_finance_invoice_streams enable row level security;
alter table public.operations_finance_invoice_snapshots enable row level security;
alter table public.operations_finance_credit_v2_streams enable row level security;
alter table public.operations_finance_credit_v2_snapshots enable row level security;
revoke all on public.operations_personnel_cost_streams,public.operations_personnel_cost_publications,
 public.operations_finance_invoice_streams,public.operations_finance_invoice_snapshots,
 public.operations_finance_credit_v2_streams,public.operations_finance_credit_v2_snapshots,
 public.operations_finance_invoice_economic_current_v2 from public,anon,authenticated,service_role;

${foundationMigration}
${migration}

insert into auth.users values ('${admin}'),('${granted}'),('${revoked}'),('${cross}');
insert into public.profiles values ('${admin}','${orgA}'),('${granted}','${orgA}'),('${revoked}','${orgA}'),('${cross}','${orgB}');
insert into public.projects values
 ('${projectA}','${orgA}',null),('${projectB}','${orgB}',null),('${projectWithoutGrant}','${orgA}',null);
insert into public.user_roles values ('${admin}','${orgA}','admin'),('${granted}','${orgA}','manager'),('${revoked}','${orgA}','manager'),('${cross}','${orgB}','admin');
insert into public.operations_project_personnel_review_grants values
 ('${orgA}','${projectA}','${granted}',1,'granted'),
 ('${orgA}','${projectA}','${revoked}',1,'granted'),('${orgA}','${projectA}','${revoked}',2,'revoked');

insert into public.operations_personnel_cost_streams values
 ('${orgA}','private-stream-alpha',1),('${orgA}','private-stream-beta',1);
insert into public.operations_personnel_cost_publications values
 ('${orgA}','private-stream-alpha',1,'40000000-0000-4000-8000-000000000001',2,
  jsonb_build_object('work_date','2026-10-03','lines',jsonb_build_array(jsonb_build_object(
   'source_time_line_id','line-a','source_project_id','${projectA}','source_booking_id','50000000-0000-4000-8000-000000000001',
   'minutes',120,'amount_minor',60000,'currency','SEK','status','preliminary','coverage','complete')))),
 ('${orgA}','private-stream-beta',1,'40000000-0000-4000-8000-000000000002',1,
  jsonb_build_object('work_date','2026-10-03','lines',jsonb_build_array(jsonb_build_object(
   'source_time_line_id','line-b','source_project_id','${projectA}','source_booking_id','50000000-0000-4000-8000-000000000002',
   'minutes',90,'amount_minor',null,'currency','SEK','status','preliminary','coverage','missing_rate'))));

insert into public.operations_finance_invoice_streams values
 ('${orgA}','${sourceOrg}','${invoiceOne}',1),
 ('${orgA}','${sourceOrg}','${invoiceTwo}',1),
 ('${orgA}','${sourceOrg}','70000000-0000-4000-8000-000000000003',1),
 ('${orgA}','${sourceOrg}','70000000-0000-4000-8000-000000000004',1);
insert into public.operations_finance_invoice_snapshots values
 ('${orgA}','${sourceOrg}','${invoiceOne}',1,repeat('a',64),
  jsonb_build_object('schema_version','finance-project-invoice-destination-v1','source_organization_id','${sourceOrg}',
   'destination_organization_id','${orgA}','invoice_id','${invoiceOne}','source_revision',1,
   'source_publication_fingerprint',repeat('a',64),'source_observation_id','71000000-0000-4000-8000-000000000001','document_fingerprint',repeat('b',64),
   'provider_document_number','INV-STEP8-1','invoice_kind','invoice','recipient_net_minor',540000,'currency','SEK',
   'invoice_status','received','provider_source_changed',false,
   'accounting_state','draft','settlement_state','unpaid','provider_approval_state','pending','credit_relation_coverage','not_applicable',
   'allocations',jsonb_build_array(jsonb_build_object('allocation_id','${allocationOne}',
    'project_id','73000000-0000-4000-8000-000000000001','cost_line_id','74000000-0000-4000-8000-000000000001',
    'destination_organization_id','${orgA}','destination_project_id','${projectA}',
    'amount_minor',540000,'consumes_commitment',true,'status','preliminary')))),
 ('${orgA}','${sourceOrg}','${invoiceTwo}',1,repeat('c',64),
  jsonb_build_object('schema_version','finance-project-invoice-destination-v1','source_organization_id','${sourceOrg}',
   'destination_organization_id','${orgA}','invoice_id','${invoiceTwo}','source_revision',1,
   'source_publication_fingerprint',repeat('c',64),'source_observation_id','71000000-0000-4000-8000-000000000002','document_fingerprint',repeat('d',64),
   'provider_document_number','CR-STEP8-2','invoice_kind','credit','recipient_net_minor',-10000,'currency','SEK',
   'invoice_status','received','provider_source_changed',true,
   'accounting_state','draft','settlement_state','unpaid','provider_approval_state','pending','credit_relation_coverage','unresolved',
   'allocations',jsonb_build_array(jsonb_build_object('allocation_id','${allocationTwo}',
    'project_id','73000000-0000-4000-8000-000000000002','cost_line_id','74000000-0000-4000-8000-000000000002',
    'destination_organization_id','${orgA}','destination_project_id','${projectA}',
    'amount_minor',-10000,'consumes_commitment',true,'status','preliminary')))),
 ('${orgA}','${sourceOrg}','70000000-0000-4000-8000-000000000003',1,repeat('e',64),
  jsonb_build_object('schema_version','finance-project-invoice-destination-v1','source_organization_id','${sourceOrg}',
   'destination_organization_id','${orgA}','invoice_id','70000000-0000-4000-8000-000000000003','source_revision',1,
   'source_publication_fingerprint',repeat('e',64),'source_observation_id','71000000-0000-4000-8000-000000000003','document_fingerprint',repeat('f',64),
   'provider_document_number','INV-STEP8-3','invoice_kind','invoice','recipient_net_minor',15000,'currency','SEK',
   'invoice_status','received','provider_source_changed',false,
   'accounting_state','draft','settlement_state','unpaid','provider_approval_state','pending','credit_relation_coverage','not_applicable',
   'allocations',jsonb_build_array(jsonb_build_object('allocation_id','72000000-0000-4000-8000-000000000003',
    'project_id','73000000-0000-4000-8000-000000000003','cost_line_id','74000000-0000-4000-8000-000000000003',
    'destination_organization_id','${orgA}','destination_project_id','${projectA}',
    'amount_minor',10000,'consumes_commitment',true,'status','preliminary')))),
 ('${orgA}','${sourceOrg}','70000000-0000-4000-8000-000000000004',1,repeat('7',64),
  jsonb_build_object('schema_version','finance-project-invoice-destination-v1','source_organization_id','${sourceOrg}',
   'destination_organization_id','${orgA}','invoice_id','70000000-0000-4000-8000-000000000004','source_revision',1,
   'source_publication_fingerprint',repeat('7',64),'source_observation_id','71000000-0000-4000-8000-000000000004','document_fingerprint',repeat('4',64),
   'provider_document_number','CR-STEP8-4','invoice_kind','credit','recipient_net_minor',-5000,'currency','SEK',
   'invoice_status','received','provider_source_changed',false,
   'accounting_state','draft','settlement_state','unpaid','provider_approval_state','pending','credit_relation_coverage','unresolved',
   'allocations',jsonb_build_array(jsonb_build_object('allocation_id','72000000-0000-4000-8000-000000000004',
    'project_id','73000000-0000-4000-8000-000000000004','cost_line_id','74000000-0000-4000-8000-000000000004',
    'destination_organization_id','${orgA}','destination_project_id','${projectA}',
    'amount_minor',-5000,'consumes_commitment',true,'status','preliminary'))));

insert into public.operations_finance_credit_v2_streams values
 ('${orgA}','${sourceOrg}','${invoiceOne}',1),('${orgA}','${sourceOrg}','${invoiceTwo}',2);
insert into public.operations_finance_credit_v2_snapshots values
 ('${orgA}','${sourceOrg}','${invoiceOne}',1,repeat('9',64),1,repeat('a',64),
  jsonb_build_object('schema_version','finance-project-invoice-destination-v2','source_organization_id','${sourceOrg}',
   'destination_organization_id','${orgA}','invoice_id','${invoiceOne}','source_revision',1,
   'source_publication_fingerprint',repeat('9',64),'source_economic_revision',1,
   'source_economic_publication_fingerprint',repeat('a',64),'credit_relationship_fingerprint',null,
   'source_observation_id','71000000-0000-4000-8000-000000000001','document_fingerprint',repeat('b',64),
   'provider_document_number','INV-STEP8-1','invoice_kind','invoice','recipient_net_minor',540000,'currency','SEK',
   'invoice_status','received','provider_source_changed',false,
   'accounting_state','draft','settlement_state','unpaid','provider_approval_state','pending','credit_relation_coverage','not_applicable',
   'allocations',jsonb_build_array(jsonb_build_object('allocation_id','${allocationOne}',
    'project_id','73000000-0000-4000-8000-000000000001','cost_line_id','74000000-0000-4000-8000-000000000001',
    'destination_organization_id','${orgA}','destination_project_id','${projectA}',
    'amount_minor',540000,'consumes_commitment',true,'status','preliminary',
    'source_anchor','${originalSourceAnchor}','credited_source_anchor',null)))),
 ('${orgA}','${sourceOrg}','${invoiceTwo}',2,repeat('8',64),1,repeat('c',64),
  jsonb_build_object('schema_version','finance-project-invoice-destination-v2','source_organization_id','${sourceOrg}',
   'destination_organization_id','${orgA}','invoice_id','${invoiceTwo}','source_revision',2,
   'source_publication_fingerprint',repeat('8',64),'source_economic_revision',1,
   'source_economic_publication_fingerprint',repeat('c',64),'credit_relationship_fingerprint',repeat('6',64),
   'source_observation_id','71000000-0000-4000-8000-000000000002','document_fingerprint',repeat('d',64),
   'provider_document_number','CR-STEP8-2','invoice_kind','credit','recipient_net_minor',-10000,'currency','SEK',
   'invoice_status','received','provider_source_changed',true,
   'accounting_state','draft','settlement_state','unpaid','provider_approval_state','pending','credit_relation_coverage','linked',
   'allocations',jsonb_build_array(jsonb_build_object('allocation_id','${allocationTwo}',
    'project_id','73000000-0000-4000-8000-000000000002','cost_line_id','74000000-0000-4000-8000-000000000002',
    'destination_organization_id','${orgA}','destination_project_id','${projectA}',
    'amount_minor',-10000,'consumes_commitment',true,'status','preliminary',
    'source_anchor','${creditSourceAnchor}','credited_source_anchor','${originalSourceAnchor}'))));

do $$declare p record;projector_definition text;wrapper_definition text;begin
 select proc.*,pg_get_userbyid(proc.proowner) owner_name
 into strict p
 from pg_proc proc
 join pg_namespace namespace on namespace.oid=proc.pronamespace
 where namespace.nspname='operations_economy_private'
   and proc.proname='project_economy_step8_shadow_payload_v1'
   and proc.pronargs=2;
 if (select count(*) from pg_proc proc join pg_namespace namespace on namespace.oid=proc.pronamespace
     where namespace.nspname='operations_economy_private'
       and proc.proname='project_economy_step8_shadow_payload_v1')<>1
   or p.provolatile<>'s' or p.prosecdef or p.owner_name<>current_user
   or array_to_string(p.proconfig,',') not in ('search_path=', 'search_path=""')
 then raise exception 'step8_projector_catalog_contract_failed';end if;
 if exists(
   select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
   where acl.privilege_type='EXECUTE'
     and acl.grantee in (0,(select oid from pg_roles where rolname='anon'),
       (select oid from pg_roles where rolname='authenticated'),
       (select oid from pg_roles where rolname='service_role'))
 ) then raise exception 'step8_projector_acl_failed';end if;
 projector_definition:=pg_get_functiondef(p.oid);
 wrapper_definition:=pg_get_functiondef(
   'operations_economy_private.read_project_economy_step8_shadow_v1(jsonb)'::regprocedure
 );
 if projector_definition !~* 'stable'
   or wrapper_definition ~* 'operations_personnel_cost_streams|operations_personnel_cost_publications|operations_finance_invoice_economic_current_v2'
   or strpos(wrapper_definition,'jsonb_typeof(p_request)')=0
   or strpos(wrapper_definition,'v_org := (p_request->>''organizationId'')::uuid')<=strpos(wrapper_definition,'jsonb_typeof(p_request)')
   or strpos(wrapper_definition,'authorize_project_v1(v_project,false)')<=strpos(wrapper_definition,'v_org := (p_request->>''organizationId'')::uuid')
   or strpos(wrapper_definition,'v_org is distinct from v_authorized_org')<=strpos(wrapper_definition,'authorize_project_v1(v_project,false)')
   or strpos(wrapper_definition,'project_economy_step8_shadow_payload_v1')<=strpos(wrapper_definition,'v_org is distinct from v_authorized_org')
 then raise exception 'step8_wrapper_source_contract_failed';end if;
end$$;

do $$begin
 perform operations_economy_private.project_economy_step8_shadow_payload_v1(null,'${projectA}');
 raise exception 'null_projector_binding_was_allowed';
exception when sqlstate '22023' then null;end$$;
do $$begin
 perform operations_economy_private.project_economy_step8_shadow_payload_v1('${orgB}','${projectA}');
 raise exception 'mismatched_projector_binding_was_allowed';
exception when sqlstate '42501' then null;end$$;

create temporary table step8_projector_parity(label text primary key,payload jsonb);
grant select,insert on step8_projector_parity to authenticated;
begin;
insert into step8_projector_parity values (
 'owner',operations_economy_private.project_economy_step8_shadow_payload_v1('${orgA}','${projectA}')
);
set local role authenticated;
set local request.jwt.claim.sub='${admin}';
insert into step8_projector_parity values (
 'admin-wrapper',public.read_operations_project_economy_step8_shadow_v1('${request}'::jsonb)
);
set local request.jwt.claim.sub='${granted}';
insert into step8_projector_parity values (
 'granted-wrapper',public.read_operations_project_economy_step8_shadow_v1('${request}'::jsonb)
);
reset role;
do $$declare owner_payload jsonb;admin_payload jsonb;granted_payload jsonb;begin
 select payload into strict owner_payload from step8_projector_parity where label='owner';
 select payload into strict admin_payload from step8_projector_parity where label='admin-wrapper';
 select payload into strict granted_payload from step8_projector_parity where label='granted-wrapper';
 if owner_payload is distinct from admin_payload or owner_payload is distinct from granted_payload
   or digest(convert_to(owner_payload::text,'UTF8'),'sha256') is distinct from digest(convert_to(admin_payload::text,'UTF8'),'sha256')
   or digest(convert_to(owner_payload::text,'UTF8'),'sha256') is distinct from digest(convert_to(granted_payload::text,'UTF8'),'sha256')
 then raise exception 'step8_projector_wrapper_parity_failed';end if;
end$$;
rollback;

set role anon;
do $$begin perform operations_economy_private.project_economy_step8_shadow_payload_v1('${orgA}','${projectA}');
 raise exception 'anon_projector_was_allowed';exception when sqlstate '42501' then null;end$$;
reset role;
set role authenticated;
do $$begin perform operations_economy_private.project_economy_step8_shadow_payload_v1('${orgA}','${projectA}');
 raise exception 'authenticated_projector_was_allowed';exception when sqlstate '42501' then null;end$$;
reset role;
set role service_role;
do $$begin perform operations_economy_private.project_economy_step8_shadow_payload_v1('${orgA}','${projectA}');
 raise exception 'service_projector_was_allowed';exception when sqlstate '42501' then null;end$$;
reset role;

set role authenticated;
set request.jwt.claim.sub='${admin}';
do $$begin perform public.read_operations_project_economy_step8_shadow_v1('{}'::jsonb);
 raise exception 'malformed_request_was_allowed';exception when sqlstate '22023' then null;end$$;
set request.jwt.claim.sub='';
do $$begin perform public.read_operations_project_economy_step8_shadow_v1('${request}'::jsonb);
 raise exception 'anonymous_actor_was_allowed';exception when sqlstate '42501' then null;end$$;
set request.jwt.claim.sub='${admin}';
create temporary table step8_results(label text primary key,payload jsonb);
insert into step8_results values ('preliminary',public.read_operations_project_economy_step8_shadow_v1('${request}'::jsonb));
do $$declare p jsonb:=(select payload from step8_results where label='preliminary');begin
 if p->>'schema'<>'operations-project-economy-step8-shadow.v1'
 or p->>'organizationId'<>'${orgA}' or p->>'projectId'<>'${projectA}'
 or p->'financeRecalculated'<>'false'::jsonb or p->'authoritativeTotals'<>'false'::jsonb
 or p->'replacesLegacyTotals'<>'false'::jsonb or p->'shadowOnly'<>'true'::jsonb
 or jsonb_array_length(p->'personnel')<>2 or jsonb_array_length(p->'invoices')<>4
 or (p#>>'{personnel,0,sourceTimeStreamKey}') !~ '^[0-9a-f]{64}$'
 or p::text like '%private-stream-%'
 or (select count(distinct value->>'sourceBookingId') from jsonb_array_elements(p->'personnel'))<>2
 or not exists(select 1 from jsonb_array_elements(p->'personnel') where value->>'coverage'='missing_rate' and value->'amountMinor'='null'::jsonb)
 or not exists(select 1 from jsonb_array_elements(p->'invoices') where value->>'invoiceId'='70000000-0000-4000-8000-000000000001'
   and value->>'allocationId'='72000000-0000-4000-8000-000000000001' and value->>'status'='preliminary'
   and value->>'amountMinor'='540000' and value->>'sourceProtocol'='v2'
   and value->>'sourceAnchor'='${originalSourceAnchor}')
 or not exists(select 1 from jsonb_array_elements(p->'invoices') credit where credit->>'invoiceId'='${invoiceTwo}'
   and credit->>'creditRelationCoverage'='linked' and credit->>'sourceProtocol'='v2'
   and credit->>'sourceEconomicRevision'='1' and credit->>'sourceEconomicFingerprint'=repeat('c',64)
   and credit->>'creditRelationshipFingerprint'=repeat('6',64)
   and credit->>'sourceAnchor'='${creditSourceAnchor}' and credit->>'creditedSourceAnchor'='${originalSourceAnchor}'
   and credit->>'creditedSourceAnchor'=(select original->>'sourceAnchor' from jsonb_array_elements(p->'invoices') original
    where original->>'invoiceId'='${invoiceOne}'))
 or not exists(select 1 from jsonb_array_elements(p->'exceptions') where value->>'code'='source_changed_after_import')
 or not exists(select 1 from jsonb_array_elements(p->'exceptions') where value->>'code'='credit_relation_unresolved')
 or not exists(select 1 from jsonb_array_elements(p->'exceptions') where value->>'code'='unallocated_amount' and value->>'amountMinor'='5000')
 then raise exception 'step8_preliminary_semantics_failed';end if;
end$$;
set request.jwt.claim.sub='${granted}';
select public.read_operations_project_economy_step8_shadow_v1('${request}'::jsonb);
set request.jwt.claim.sub='${revoked}';
do $$begin perform public.read_operations_project_economy_step8_shadow_v1('${request}'::jsonb);raise exception 'revoked_actor_was_allowed';
exception when sqlstate '42501' then null;end$$;
set request.jwt.claim.sub='${granted}';
do $$begin perform public.read_operations_project_economy_step8_shadow_v1(jsonb_build_object(
 'schemaVersion','operations-project-economy-step8-shadow-read.v1','organizationId','${orgA}','projectId','${projectWithoutGrant}'));
 raise exception 'ungranted_project_was_allowed';exception when sqlstate '42501' then null;end$$;
set request.jwt.claim.sub='${cross}';
do $$begin perform public.read_operations_project_economy_step8_shadow_v1('${request}'::jsonb);raise exception 'cross_tenant_actor_was_allowed';
exception when sqlstate '42501' then null;end$$;
set request.jwt.claim.sub='${admin}';
do $$begin perform public.read_operations_project_economy_step8_shadow_v1(jsonb_build_object(
 'schemaVersion','operations-project-economy-step8-shadow-read.v1','organizationId','${orgB}','projectId','${projectA}'));
 raise exception 'cross_organization_request_was_allowed';exception when sqlstate '42501' then null;end$$;
do $$begin perform * from public.operations_personnel_cost_publications;raise exception 'private_personnel_rows_were_visible';
exception when sqlstate '42501' then null;end$$;
reset role;
do $$begin
 if has_function_privilege('anon','public.read_operations_project_economy_step8_shadow_v1(jsonb)','execute')
 or has_function_privilege('service_role','public.read_operations_project_economy_step8_shadow_v1(jsonb)','execute')
 or not has_function_privilege('authenticated','public.read_operations_project_economy_step8_shadow_v1(jsonb)','execute')
 then raise exception 'step8_execute_privileges_failed';end if;
end$$;

insert into public.operations_finance_invoice_snapshots values
 ('${orgA}','${sourceOrg}','${invoiceOne}',2,repeat('1',64),
  jsonb_build_object('schema_version','finance-project-invoice-destination-v1','source_organization_id','${sourceOrg}',
   'destination_organization_id','${orgA}','invoice_id','${invoiceOne}','source_revision',2,
   'source_publication_fingerprint',repeat('1',64),'source_observation_id','71000000-0000-4000-8000-000000000001','document_fingerprint',repeat('2',64),
   'provider_document_number','INV-STEP8-1','invoice_kind','invoice','recipient_net_minor',540000,'currency','SEK',
   'invoice_status','approved','provider_source_changed',false,
   'accounting_state','booked','settlement_state','unpaid','provider_approval_state','not_pending','credit_relation_coverage','not_applicable',
   'allocations',jsonb_build_array(jsonb_build_object('allocation_id','${allocationOne}',
    'project_id','73000000-0000-4000-8000-000000000001','cost_line_id','74000000-0000-4000-8000-000000000001',
    'destination_organization_id','${orgA}','destination_project_id','${projectA}',
    'amount_minor',540000,'consumes_commitment',true,'status','confirmed'))));
update public.operations_finance_invoice_streams set current_revision=2
where organization_id='${orgA}' and invoice_id='70000000-0000-4000-8000-000000000001';
set role authenticated;
set request.jwt.claim.sub='${admin}';
insert into step8_results values ('confirmed',public.read_operations_project_economy_step8_shadow_v1('${request}'::jsonb));
do $$declare a jsonb;b jsonb;begin
 select value into strict a from jsonb_array_elements((select payload->'invoices' from step8_results where label='preliminary'))
  where value->>'invoiceId'='70000000-0000-4000-8000-000000000001';
 select value into strict b from jsonb_array_elements((select payload->'invoices' from step8_results where label='confirmed'))
  where value->>'invoiceId'='70000000-0000-4000-8000-000000000001';
 if a->>'allocationId'<>b->>'allocationId' or a->>'amountMinor'<>b->>'amountMinor'
 or a->>'status'<>'preliminary' or b->>'status'<>'confirmed' or b->>'revision'<>'2'
 then raise exception 'step8_preliminary_confirmation_identity_failed';end if;
end$$;
begin transaction read only;
select public.read_operations_project_economy_step8_shadow_v1('${request}'::jsonb);
rollback;
reset role;

begin;
insert into public.operations_personnel_cost_streams values ('${orgA}','limit-bulk',1);
insert into public.operations_personnel_cost_publications
select '${orgA}','limit-bulk',1,'40000000-0000-4000-8000-000000000010',1,
 jsonb_build_object(
   'work_date','2026-10-03',
   'lines',jsonb_agg(jsonb_build_object(
     'source_time_line_id','bulk-'||lpad(g::text,3,'0'),
     'source_project_id','${projectA}',
     'source_booking_id',null,
     'minutes',1,
     'amount_minor',1,
     'currency','SEK',
     'status','preliminary',
     'coverage','complete'
   ) order by g)
 )
from generate_series(1,498) g;
do $$declare payload jsonb;begin
 payload:=operations_economy_private.project_economy_step8_shadow_payload_v1('${orgA}','${projectA}');
 if jsonb_array_length(payload->'personnel')<>500 then
   raise exception 'step8_projector_exact_500_failed';
 end if;
end$$;
insert into public.operations_personnel_cost_streams values ('${orgA}','limit-overflow',1);
insert into public.operations_personnel_cost_publications values
 ('${orgA}','limit-overflow',1,'40000000-0000-4000-8000-000000000011',1,
  jsonb_build_object('work_date','2026-10-03','lines',jsonb_build_array(jsonb_build_object(
   'source_time_line_id','overflow','source_project_id','${projectA}','source_booking_id',null,
   'minutes',1,'amount_minor',1,'currency','SEK','status','preliminary','coverage','complete'))));
do $$begin
 perform operations_economy_private.project_economy_step8_shadow_payload_v1('${orgA}','${projectA}');
 raise exception 'step8_projector_501_was_allowed';
exception when sqlstate '54000' then null;end$$;
rollback;

begin;
insert into public.operations_personnel_cost_streams values ('${orgA}','size-overflow',1);
insert into public.operations_personnel_cost_publications values
 ('${orgA}','size-overflow',1,'40000000-0000-4000-8000-000000000012',1,
  jsonb_build_object('work_date','2026-10-03','lines',jsonb_build_array(jsonb_build_object(
   'source_time_line_id','size-overflow','source_project_id','${projectA}','source_booking_id',null,
   'minutes',1,'amount_minor',1,'currency',repeat('X',270000),'status','preliminary','coverage','complete'))));
do $$begin
 perform operations_economy_private.project_economy_step8_shadow_payload_v1('${orgA}','${projectA}');
 raise exception 'step8_projector_size_limit_was_allowed';
exception when sqlstate '54000' then null;end$$;
rollback;

insert into public.operations_finance_invoice_streams values
 ('${orgA}','${sourceOrg}','70000000-0000-4000-8000-000000000005',1);
insert into public.operations_finance_invoice_snapshots values
 ('${orgA}','${sourceOrg}','70000000-0000-4000-8000-000000000005',1,repeat('a',64),
  jsonb_build_object('schema_version','finance-project-invoice-destination-v1','source_organization_id','${sourceOrg}',
   'destination_organization_id','${orgA}','invoice_id','70000000-0000-4000-8000-000000000005','source_revision',1,
   'source_publication_fingerprint',repeat('a',64),'source_observation_id','71000000-0000-4000-8000-000000000005',
   'document_fingerprint',repeat('a',64),'provider_document_number','INV-STEP8-CONFLICT',
   'invoice_kind','invoice','recipient_net_minor',1000,'currency','SEK','invoice_status','received',
   'provider_source_changed',false,'accounting_state','draft','settlement_state','unpaid',
   'provider_approval_state','pending','credit_relation_coverage','not_applicable',
   'allocations',jsonb_build_array(jsonb_build_object('allocation_id','72000000-0000-4000-8000-000000000005',
    'project_id','73000000-0000-4000-8000-000000000005','cost_line_id','74000000-0000-4000-8000-000000000005',
    'destination_organization_id','${orgA}','destination_project_id','${projectA}',
    'amount_minor',1000,'consumes_commitment',true,'status','preliminary'))));
insert into public.operations_finance_credit_v2_streams values
 ('${orgA}','${sourceOrg}','70000000-0000-4000-8000-000000000005',2);
insert into public.operations_finance_credit_v2_snapshots values
 ('${orgA}','${sourceOrg}','70000000-0000-4000-8000-000000000005',2,repeat('d',64),1,repeat('b',64),
  jsonb_build_object('schema_version','finance-project-invoice-destination-v2','source_organization_id','${sourceOrg}',
   'destination_organization_id','${orgA}','invoice_id','70000000-0000-4000-8000-000000000005','source_revision',2,
   'source_publication_fingerprint',repeat('d',64),'source_economic_revision',1,
   'source_economic_publication_fingerprint',repeat('b',64),'credit_relationship_fingerprint',null,
   'source_observation_id','71000000-0000-4000-8000-000000000005','document_fingerprint',repeat('a',64),
   'provider_document_number','INV-STEP8-CONFLICT','invoice_kind','invoice','recipient_net_minor',1000,'currency','SEK',
   'invoice_status','received','provider_source_changed',false,
   'accounting_state','draft','settlement_state','unpaid','provider_approval_state','pending','credit_relation_coverage','not_applicable',
   'allocations',jsonb_build_array(jsonb_build_object('allocation_id','72000000-0000-4000-8000-000000000005',
    'project_id','73000000-0000-4000-8000-000000000005','cost_line_id','74000000-0000-4000-8000-000000000005',
    'destination_organization_id','${orgA}','destination_project_id','${projectA}',
    'amount_minor',1000,'consumes_commitment',true,'status','preliminary',
    'source_anchor',repeat('5',64),'credited_source_anchor',null))));
set role authenticated;
set request.jwt.claim.sub='${admin}';
do $$begin perform public.read_operations_project_economy_step8_shadow_v1('${request}'::jsonb);
 raise exception 'invoice_source_conflict_was_allowed';exception when sqlstate '22023' then null;end$$;
reset role;
select 'STEP8_RUNTIME_PASS personnel=2 invoices=4 missing_null=1 booking_ids=2 linked_credit_binding=1 unresolved_credit=1 source_conflict=deny preliminary_confirmed_same_identity=1 projector_wrapper_payload_hash_parity=admin+granted projector_direct_anon=deny projector_direct_authenticated=deny projector_direct_service_role=deny projector_exact_500=pass projector_501=54000 projector_size=54000 malformed=22023 auth_admin=allow auth_granted=allow auth_revoked=deny auth_project=deny auth_cross_tenant=deny auth_anon=deny private_rows=deny writes=0' as receipt;
`;

const output = run('psql',[databaseUrl,'-X','--no-password','-v','ON_ERROR_STOP=1'],{
  input: sql,
  env: { ...process.env, PGOPTIONS: '-c statement_timeout=30000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=30000' },
  maxBuffer: 16 * 1024 * 1024,
});
if (!output.includes('STEP8_RUNTIME_PASS')) throw new Error('Step8 runtime receipt missing');
console.log(JSON.stringify({
  status:'PASS',schema:'operations-project-economy-step8-shadow.v1',migrationSha256,
  postgresRuntime:true,sourceBase:expectedBase,sourceBaseTree:expectedBaseTree,
  sourceFoundation:expectedFoundation,sourceFoundationTree:expectedFoundationTree,
  sourceCiRepair:expectedCiRepair,sourceCiRepairTree:expectedCiRepairTree,
  sourceSqlRepair:expectedSqlRepair,sourceSqlRepairTree:expectedSqlRepairTree,
  sourceMount:expectedMount,sourceMountTree:expectedMountTree,
  assertions:{twoBookings:true,missingRateNull:true,linkedCreditBinding:true,unresolvedCredit:true,
    sourceConflictDenied:true,preliminaryConfirmedSameIdentity:true,exceptions:true,
    identityPrecedenceAdversarialDenied:true,
    projectorWrapperPayloadHashParity:true,projectorCatalogContract:true,
    projectorAnonDenied:true,projectorAuthenticatedDenied:true,projectorServiceRoleDenied:true,
    projectorExact500:true,projector501Denied:true,responseSizeDenied:true,malformedDenied:true,
    adminAllowed:true,grantedAllowed:true,revokedDenied:true,projectDenied:true,crossTenantDenied:true,
    anonDenied:true,privateRowsDenied:true,writes:0},
},null,2));
