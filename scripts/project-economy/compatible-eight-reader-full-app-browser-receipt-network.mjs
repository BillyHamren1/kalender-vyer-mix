/** NEW additive receipt-origin successor for the reviewed browser network helper.
 * It consumes canonical bytes from the held static-server receipt and never an
 * arbitrary App origin. Native/browser/runtime acceptance remains external. */
import { createHash } from 'node:crypto';
import {
  createAppBrowserNetwork,
  appBrowserUrl,
} from './compatible-eight-reader-full-app-browser-network.mjs';

const LEGACY_APP = 'http://127.0.0.1:55784';
const HOST = '127.0.0.1';
const PROJECT_ROUTE = '/project/55555555-5555-4555-8555-555555555555/economy';
const RECEIPT_KEYS = Object.freeze([
  'dist_dev', 'dist_ino', 'host', 'pgid', 'pid', 'port', 'project_route', 'schema', 'sid',
]);
const OWNER_KEYS = Object.freeze(['pgid', 'pid', 'schema', 'sid', 'starttime']);
const RECEIPT_BINDINGS = new WeakSet();
const refused = () => new Error('FULL_APP_BROWSER_RECEIPT_NETWORK_REFUSED');
function insist(value) { if (!value) throw refused(); }
function exactKeys(value, keys) {
  insist(value && typeof value === 'object' && !Array.isArray(value));
  const actual = Object.keys(value).sort();
  insist(actual.length === keys.length && actual.every((key, index) => key === keys[index]));
}
function positive(value) { return Number.isSafeInteger(value) && value > 0; }
function canonicalReceipt(value) {
  return JSON.stringify({
    dist_dev: value.dist_dev,
    dist_ino: value.dist_ino,
    host: value.host,
    pgid: value.pgid,
    pid: value.pid,
    port: value.port,
    project_route: value.project_route,
    schema: value.schema,
    sid: value.sid,
  });
}
async function bounded(promise) {
  const began = performance.now(); let timer, timedOut = false;
  const stopped = new Promise((_, reject) => { timer = setTimeout(() => {
    timedOut = true; reject(refused());
  }, 20000); });
  try {
    const result = await Promise.race([promise, stopped]);
    insist(!timedOut && performance.now() - began < 20000);
    return result;
  } catch { throw refused(); } finally { clearTimeout(timer); }
}

/** Parse exact bytes emitted by compatible-eight-reader-full-app-static-server.py.
 * Whitespace, duplicate/unknown members and caller-selected origins cannot pass
 * because accepted bytes must equal the server's sorted compact serialization. */
export function receiptBrowserBinding(receiptBytes, owner, daemonEpochWitness) {
  insist(Buffer.isBuffer(receiptBytes) && receiptBytes.length > 0 && receiptBytes.length <= 1024);
  let raw, receipt;
  try {
    raw = new TextDecoder('utf-8', { fatal: true }).decode(receiptBytes);
    insist(/^[\x20-\x7e]+$/.test(raw));
    receipt = JSON.parse(raw);
  } catch { throw refused(); }
  exactKeys(receipt, RECEIPT_KEYS);
  insist(receipt.schema === 'compatible-full-app-static-server.v1' && receipt.host === HOST &&
    receipt.project_route === PROJECT_ROUTE && positive(receipt.port) && receipt.port <= 65535 &&
    positive(receipt.pid) && positive(receipt.pgid) && positive(receipt.sid) &&
    positive(receipt.dist_dev) && positive(receipt.dist_ino) && canonicalReceipt(receipt) === raw);
  exactKeys(owner, OWNER_KEYS);
  insist(owner.schema === 'auth-chain-command-owner.v1' && positive(owner.pid) &&
    positive(owner.starttime) && positive(owner.pgid) && positive(owner.sid) &&
    owner.pid === owner.pgid && owner.pid === owner.sid &&
    receipt.pid === owner.pid && receipt.pgid === owner.pgid && receipt.sid === owner.sid);
  insist(typeof daemonEpochWitness === 'string' && /^[0-9a-f]{64}$/.test(daemonEpochWitness));
  const origin = `http://${HOST}:${receipt.port}`;
  insist(new URL(origin).origin === origin);
  const binding = Object.freeze({
    origin,
    projectUrl: origin + PROJECT_ROUTE,
    receiptSha256: createHash('sha256').update(receiptBytes).digest('hex'),
    owner: Object.freeze({ ...owner }),
    daemonEpochWitness,
  });
  RECEIPT_BINDINGS.add(binding);
  return binding;
}

function receiptRequest(route, origin) {
  return Object.freeze({
    request() {
      const request = route.request();
      const transformed = () => {
        const actual = appBrowserUrl(request.url());
        if (actual.origin === origin) return LEGACY_APP + actual.pathname + actual.search;
        // The retired literal must not accidentally remain an admitted origin.
        if (origin !== LEGACY_APP && actual.origin === LEGACY_APP) {
          return 'http://127.0.0.1:1' + actual.pathname + actual.search;
        }
        return actual.href;
      };
      return Object.freeze({
        url: transformed,
        method: () => request.method(),
        frame: () => request.frame(),
        allHeaders: () => request.allHeaders(),
        postDataBuffer: () => request.postDataBuffer(),
      });
    },
    abort: (...args) => route.abort(...args),
    continue: (...args) => route.continue(...args),
    fulfill: (...args) => route.fulfill(...args),
  });
}

function receiptBrowser(browser, origin) {
  insist(browser && typeof browser.newContext === 'function');
  return Object.freeze({
    async newContext(options) {
      const context = await browser.newContext(options);
      insist(context && typeof context.on === 'function' && typeof context.route === 'function' &&
        typeof context.newPage === 'function' && typeof context.newCDPSession === 'function' &&
        typeof context.close === 'function');
      return Object.freeze({
        on: (...args) => context.on(...args),
        route: (pattern, handler) => context.route(pattern,
          route => handler(receiptRequest(route, origin))),
        newPage: (...args) => context.newPage(...args),
        newCDPSession: (...args) => context.newCDPSession(...args),
        close: (...args) => context.close(...args),
      });
    },
  });
}

/** Bind the unchanged reviewed request policy to the server receipt's origin.
 * readDaemonEpochWitness is the independently reviewed, read-only facade and
 * must revalidate the real persisted daemon/socket epoch on every invocation. */
export async function createReceiptAppBrowserNetwork(
  browser, getAdapter, readAdapter, staticPaths, binding, readDaemonEpochWitness,
) {
  insist(binding && RECEIPT_BINDINGS.has(binding) && Object.isFrozen(binding) &&
    typeof binding.origin === 'string' &&
    typeof binding.projectUrl === 'string' && /^[0-9a-f]{64}$/.test(binding.receiptSha256) &&
    /^[0-9a-f]{64}$/.test(binding.daemonEpochWitness) &&
    binding.projectUrl === binding.origin + PROJECT_ROUTE &&
    typeof readDaemonEpochWitness === 'function');
  const sameEpoch = async () => {
    const value = await bounded(Promise.resolve().then(() => readDaemonEpochWitness()));
    insist(value === binding.daemonEpochWitness);
  };
  await sameEpoch();
  let core;
  try {
    core = await createAppBrowserNetwork(
      receiptBrowser(browser, binding.origin), getAdapter, readAdapter, staticPaths,
    );
  } catch { throw refused(); }
  let failed = false, coreClosed = false;
  const closeCore = async () => {
    if (coreClosed) return;
    coreClosed = true;
    await core.close();
  };
  const guardedEpoch = async () => {
    insist(!failed);
    try { await sameEpoch(); } catch {
      failed = true;
      try { await closeCore(); } catch { /* retain the normalized refusal */ }
      throw refused();
    }
  };
  return Object.freeze({
    origin: binding.origin,
    projectUrl: binding.projectUrl,
    receiptSha256: binding.receiptSha256,
    async preparePage() {
      await guardedEpoch();
      try { return await core.preparePage(); } catch { failed = true; throw refused(); }
    },
    async settledReplies() {
      await guardedEpoch();
      try {
        const result = await core.settledReplies();
        await guardedEpoch();
        return result;
      } catch { failed = true; throw refused(); }
    },
    async checkDaemonEpoch() { await guardedEpoch(); },
    assertClean() {
      insist(!failed);
      try { core.assertClean(); } catch { failed = true; throw refused(); }
    },
    counts() {
      insist(!failed);
      try { return core.counts(); } catch { failed = true; throw refused(); }
    },
    async close() {
      let bad = failed;
      try { await closeCore(); } catch { bad = true; }
      try { await sameEpoch(); } catch { bad = true; }
      failed = bad;
      if (bad) throw refused();
    },
  });
}
