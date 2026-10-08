// Run against the coordinated Scanner and WMS review branches, never production.
// SCANNER_REPO_DIR=../datacapture-hub WMS_REPO_DIR=../bundle-builder-base node --experimental-strip-types scripts/scanner-manual-quantity-integration.mjs
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const scannerRoot = process.env.SCANNER_REPO_DIR;
const wmsRoot = process.env.WMS_REPO_DIR;
if (!scannerRoot || !wmsRoot) throw new Error('Set SCANNER_REPO_DIR and WMS_REPO_DIR to the coordinated review checkouts');
const externalModule = (root, file) => import(pathToFileURL(resolve(root, file)).href);
const { scannerMvpCommandInputSchema, parseScannerMvpReceipt } = await externalModule(scannerRoot, 'src/lib/scanner-command.contract.ts');
const { parseScannerMvpCommand, buildBundleScannerCommand } = await import('../supabase/functions/_shared/scannerCommandGateway.ts');
const { parseEventFlowScannerBundleRequest } = await externalModule(wmsRoot, 'supabase/functions/_shared/eventflow-scanner-bundle-contract.ts');
const { executeBundleScannerCommand } = await externalModule(wmsRoot, 'supabase/functions/_shared/bundle-scanner-command-v1/gateway.ts');
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
// Install @electric-sql/pglite in the test runner; no linked Supabase connection.
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite')

const db = new PGlite()
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE reservations(id uuid primary key,organization_id uuid,external_id text);
CREATE TABLE reservation_lines(id uuid primary key,organization_id uuid,reservation_id uuid,line_type text NOT NULL DEFAULT 'catalog',item_type_id uuid,package_id uuid,quantity integer,is_packable boolean,product_packable_default boolean,component_packability_snapshot jsonb,booking_packability_override boolean,warehouse_packability_override boolean);
CREATE TABLE item_types(id uuid primary key,organization_id uuid,is_deleted boolean default false);
CREATE TABLE package_components(id uuid primary key,organization_id uuid,package_id uuid,item_type_id uuid,quantity integer);
CREATE TABLE item_instances(id uuid primary key,organization_id uuid,item_type_id uuid);
CREATE TABLE allocations(id uuid primary key default gen_random_uuid(),organization_id uuid,reservation_line_id uuid,item_instance_id uuid);
CREATE TABLE inventory_movements(id uuid primary key default gen_random_uuid(),organization_id uuid,item_type_id uuid,action_type text,quantity integer,source_module text,source_id text,performed_by uuid,performed_by_label text,note text,metadata jsonb);
CREATE TABLE time_pack_scan_operations(organization_id uuid,operation_id uuid,payload_fingerprint text,response jsonb,primary key(organization_id,operation_id));
CREATE FUNCTION item_types_allocation_compatible(uuid,uuid,uuid) RETURNS boolean LANGUAGE sql AS 'SELECT $2=$3';
`)
await db.exec(readFileSync(resolve(wmsRoot, 'db/pending-migrations/20261007080924_scanner_exact_quantity_receipts.sql'),'utf8'))
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const org=id(1),res=id(2),line=id(3),type=id(4),otherLine=id(5),instance=id(6)
await db.query('insert into reservations values ($1,$2,$3)',[res,org,'B-1'])
await db.query('insert into reservation_lines(id,organization_id,reservation_id,item_type_id,package_id,quantity) values ($1,$2,$3,$4,null,5),($5,$2,$3,$4,null,5)',[line,org,res,type,otherLine])
await db.query('insert into item_types(id,organization_id) values($1,$2)',[type,org])
const send = async (command, quantity, n, reason, row = { line, type }) => {
 const input = scannerMvpCommandInputSchema.parse({operationId:'op-'+id(n),command,quantity,bookingId:id(50),reservationId:res,reservationLineId:row.line,itemTypeId:row.type,deviceId:'tc22',occurredAt:'2026-10-07T08:00:00.000Z',...(reason?{reason}:{})});
 const planning = parseScannerMvpCommand({...input,schema:'eventflow-scanner-command-gateway.v1',scanner_contract_version:'scanner_contract_v1'});
 assert.equal(planning.ok,true);
 const owner = parseEventFlowScannerBundleRequest(buildBundleScannerCommand({command:planning.value,organizationId:org,staffId:id(8),staffName:'Tester',bookingNumber:'B-1'}));
 assert.equal(owner.ok,true);
 const receipt = await executeBundleScannerCommand({mutateQuantityAtomic:async ({request,operationId,payloadFingerprint}) => {
  const r=await db.query('select eventflow_scanner_quantity_atomic_v1($1::jsonb,$2::uuid,$3::text) receipt',[JSON.stringify(request),operationId,payloadFingerprint]);
  return r.rows[0].receipt;
 }},owner.value);
 return parseScannerMvpReceipt(input,200,receipt);
};
assert.deepEqual(await send('PACK_QUANTITY',3,901),{outcome:'APPLIED',operationId:'op-'+id(901),packedQuantity:3,requiredQuantity:5,remainingQuantity:2,itemInstanceId:null});
assert.equal((await send('PACK_QUANTITY',3,901)).packedQuantity,3);
assert.equal((await send('PACK_QUANTITY',4,901)).outcome,'REJECTED');
assert.equal((await send('PACK_QUANTITY',3,902)).outcome,'REJECTED');
assert.equal((await send('UNPACK_QUANTITY',2,903,'Fel antal')).packedQuantity,1);
assert.equal((await db.query('select count(*)::int n from inventory_movements')).rows[0].n,2);
assert.equal((await db.query('select count(*)::int n from item_instances')).rows[0].n,0);
const manualRow = { line: id(20), type: null };
await db.query("insert into reservation_lines(id,organization_id,reservation_id,line_type,item_type_id,package_id,quantity) values ($1,$2,$3,'manual',null,null,5)",[manualRow.line,org,res]);
assert.equal((await send('PACK_QUANTITY',3,910,undefined,manualRow)).packedQuantity,3);
assert.equal((await send('PACK_QUANTITY',3,910,undefined,manualRow)).packedQuantity,3);
assert.equal((await send('PACK_QUANTITY',4,910,undefined,manualRow)).outcome,'REJECTED');
assert.equal((await send('PACK_QUANTITY',3,911,undefined,manualRow)).outcome,'REJECTED');
assert.equal((await send('UNPACK_QUANTITY',2,912,'Fel antal',manualRow)).packedQuantity,1);
assert.equal((await send('UNPACK_QUANTITY',2,913,'Fel antal',manualRow)).outcome,'REJECTED');
// A broken catalog link is never promoted to a manual row by null alone.
assert.equal((await send('PACK_QUANTITY',1,914,undefined,{line:otherLine,type:null})).outcome,'REJECTED');
assert.equal((await db.query('select count(*)::int n from inventory_movements where item_type_id is null')).rows[0].n,2);
assert.equal((await db.query('select count(*)::int n from inventory_movements')).rows[0].n,4);
assert.equal((await db.query('select count(*)::int n from item_instances')).rows[0].n,0);
console.log('PASS cross-repository app schema -> Planning parser -> owner parser + gateway -> real SQL transaction -> app authoritative receipt: catalog and manual null-type pack, replay, conflict, quota rejection, undo and invalid null identity; no instances created');
await db.close();
