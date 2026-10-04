// NEW source-unit boundary: real locked SDK + unchanged source service builders.
// No App render, signed actor/provider validation, native SQL or money admission.
import { StableSourceReader, trackServerCreation } from './compatible-eight-reader-full-app-sdk-source.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MANIFEST = 'scripts/project-economy/compatible-eight-reader-full-app-compilemanifest.json';
const MANIFEST_SHA = '4c6005bb374fa13f89aafc52ce4a013feaa1673454dce76bd09aee77c95e6434';
const LOCK_BLOB = '56cbf67ce03fd29258acc38ad723e13fa0ab7d6e';
const PACKAGES = ['supabase-js', 'auth-js', 'functions-js', 'postgrest-js', 'realtime-js', 'storage-js'];
const PROJECT = '55555555-5555-4555-8555-555555555555';
const expectedTables = ['projects', 'project_tasks', 'project_files', 'project_activity_log',
  'project_budget', 'project_purchases', 'project_labor_costs', 'project_staff_time_cost_lines', 'product_cost_overrides'];
const fail = () => { throw new Error('sdk_shape_refused'); };
const digest = (algorithm, bytes) => createHash(algorithm).update(bytes).digest('hex');
const blob = bytes => digest('sha1', Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]));
let activeServer, serverCreation, client, deadlineTimer, timedOut = false, failed = false;
let calls = 0, forwarded = 0;
const capturedTables = [];
const began = performance.now();
const fresh = () => { if (timedOut || performance.now() - began >= 20_000) fail(); };
let rejectDeadline = () => {};
const stopped = new Promise((_, reject) => { rejectDeadline = reject; });
void stopped.catch(() => {});
const bounded = async promise => { fresh(); const value = await Promise.race([promise, stopped]); fresh(); return value; };

async function verifySource() {
  fresh();
  const reader = new StableSourceReader(ROOT, fresh);
  try {
  const bytes = reader.read(MANIFEST, 1_048_576);
  if (digest('sha256', bytes) !== MANIFEST_SHA) fail();
  const manifest = JSON.parse(bytes.toString('utf8'));
  if (manifest.files.length !== 2445 || manifest.source_commit !== '809f64e0fd98322c53d9c4e9697df5b515303812'
      || manifest.source_tree !== '3d96301591652f9d86ccbbdf8ff26efcb7180ce9' || manifest.runtime_admission !== false) fail();
  const seen = new Set(); let total = 0;
  for (const row of manifest.files) {
    fresh();
    if (typeof row.path !== 'string' || row.path.includes('\\') || row.path.includes('\0')
        || row.path.startsWith('/') || row.path.split('/').some(p => !p || p === '.' || p === '..')
        || seen.has(row.path) || row.mode !== '100644' || !Number.isSafeInteger(row.bytes)
        || row.bytes < 0 || row.bytes > 1_048_576 || total + row.bytes > 33_554_432) fail();
    seen.add(row.path); total += row.bytes;
    const body = reader.read(row.path, 1_048_576);
    if (body.length !== row.bytes || blob(body) !== row.git_blob_sha1) fail();
  }
  if (total !== 20_984_073) fail();
  // A newer candidate may add unrelated _shared files. It cannot silently
  // become the exact809f cold App input. Build an isolated exact source slice.
  const scoped = [...seen].filter(p => p.startsWith('src/') || p.startsWith('public/')
    || p.startsWith('supabase/functions/_shared/'));
  const found = reader.inventory(['src', 'public', 'supabase/functions/_shared'], new Set(scoped));
  if (found.size !== scoped.length) fail();
  const lockBytes = reader.read('package-lock.json', 1_048_576);
  if (blob(lockBytes) !== LOCK_BLOB) fail();
  const lock = JSON.parse(lockBytes.toString('utf8'));
  if (lock.lockfileVersion !== 3) fail();
  for (const name of PACKAGES) {
    const key = `node_modules/@supabase/${name}`;
    const declared = lock.packages[key];
    const installed = JSON.parse(reader.read(`${key}/package.json`, 65_536).toString('utf8'));
    if (declared?.version !== '2.116.0' || typeof declared.integrity !== 'string'
        || !declared.integrity.startsWith('sha512-') || installed.name !== `@supabase/${name}`
        || installed.version !== declared.version) fail();
  }
  reader.check();
  } finally { reader.close(); }
}

try {
  if (process.env.CI !== 'true' || Number(process.versions.node.split('.')[0]) !== 22) fail();
  deadlineTimer = setTimeout(() => { timedOut = true; rejectDeadline(new Error('sdk_shape_refused')); }, 20_000);
  await bounded(verifySource());
  // Prevent imported services or SDK diagnostics from reflecting credentials or
  // request values. No response is claimed as successful App/native evidence.
  console.error = () => {}; console.warn = () => {}; console.info = () => {};
  let adapterFactory;
  globalThis.fetch = async (input, init) => {
    fresh(); if (++calls > expectedTables.length || typeof input !== 'string') fail();
    const request = new Request(input, init);
    const url = new URL(request.url);
    const table = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname)?.[1];
    if (table !== expectedTables[capturedTables.length] || !adapterFactory || request.method !== 'GET') fail();
    capturedTables.push(table);
    const authorization = request.headers.get('authorization');
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) fail();
    // The anonymous real client token is used ONLY to bind this shape-unit call;
    // its role is never treated as the native authenticated fixture actor.
    const adapter = adapterFactory(authorization.slice(7), async () => {
      fresh(); ++forwarded;
      return new Response('{"code":"42501","details":null,"hint":null,"message":"sdk_shape_unit_refusal"}',
        { status: 403, headers: { 'content-type': 'application/json' } });
    });
    const result = await bounded(adapter(request));
    if (result.table !== table || result.response.status !== 403) fail();
    return result.response;
  };
  const { createServer } = await bounded(import('vite'));
  serverCreation = trackServerCreation(createServer({ root: ROOT, configFile: path.join(ROOT, 'vite.config.ts'),
    mode: 'production', logLevel: 'silent', server: { middlewareMode: true, hmr: false } }),
    () => timedOut || failed || performance.now() - began >= 20_000);
  activeServer = await bounded(serverCreation.ready);
  const load = filename => bounded(activeServer.ssrLoadModule(filename));
  ({ createAppGetAdapter: adapterFactory } = await load('/scripts/project-economy/compatible-eight-reader-full-app-get-adapter.ts'));
  if (typeof adapterFactory !== 'function') fail();
  const project = await load('/src/services/projectService.ts');
  const activity = await load('/src/services/projectActivityService.ts');
  const economy = await load('/src/services/localProjectEconomyService.ts');
  const staff = await load('/src/services/projectStaffService.ts');
  const cost = await load('/src/services/projectStaffTimeCostLinesService.ts');
  const overrides = await load('/src/services/productCostOverrideService.ts');
  ({ supabase: client } = await load('/src/integrations/supabase/client.ts'));
  if (calls !== 0) fail();
  const services = [() => project.fetchProject(PROJECT), () => project.fetchProjectTasks(PROJECT),
    () => project.fetchProjectFiles(PROJECT), () => activity.fetchProjectActivities(PROJECT),
    () => economy.fetchLocalProjectBudget(PROJECT), () => economy.fetchLocalProjectPurchases(PROJECT),
    () => staff.fetchLaborCosts(PROJECT),
    () => cost.fetchApprovedProjectStaffTimeCostSummary({ booking_id: null, project_id: PROJECT }),
    () => overrides.fetchProductCostOverrides(PROJECT)];
  for (let index = 0; index < services.length; index++) {
    await bounded(Promise.allSettled([services[index]()]));
    if (calls !== index + 1 || forwarded !== index + 1) fail();
  }
  if (capturedTables.length !== 9) fail();
} catch {
  failed = true;
} finally {
  // This is a dedicated owned child, not a reusable in-process test. Keep the
  // network refusal and diagnostic suppression installed through teardown and
  // exit; a late SDK callback must never regain the real hosted fetch function.
  try {
    // Closing is bounded separately; an uncertain close suppresses PASS.
    const close = async () => {
      if (client) { await client.auth.stopAutoRefresh(); await client.removeAllChannels(); }
      if (serverCreation) await serverCreation.close();
    };
    let closeTimer;
    try { await Promise.race([close(), new Promise((_, reject) => {
      closeTimer = setTimeout(() => reject(new Error('sdk_shape_refused')), 3_000);
    })]); } finally { clearTimeout(closeTimer); }
    if (!failed) await bounded(verifySource());
  } catch { failed = true; }
  clearTimeout(deadlineTimer);
}
if (failed) {
  console.log('compatible-full-app-sdk-shape FAIL fixed_refusal'); process.exitCode = 1;
} else {
  console.log('compatible-full-app-sdk-shape PASS sdk=2.116.0 source_files=2445 services=9 forwarded=9 auth=false native=false app=false');
}
