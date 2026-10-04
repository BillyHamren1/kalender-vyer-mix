import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  receiptBrowserBinding,
  createReceiptAppBrowserNetwork,
} from './compatible-eight-reader-full-app-browser-receipt-network.mjs';

const ROUTE = '/project/55555555-5555-4555-8555-555555555555/economy';
const EPOCH = 'a'.repeat(64);
function evidence(port = 43123, changes = {}) {
  const value = {
    dist_dev: 1048577,
    dist_ino: 987654,
    host: '127.0.0.1',
    pgid: 24680,
    pid: 24680,
    port,
    project_route: ROUTE,
    schema: 'compatible-full-app-static-server.v1',
    sid: 24680,
    ...(changes.receipt ?? {}),
  };
  const raw = changes.raw ?? Buffer.from(JSON.stringify(value), 'ascii');
  const owner = {
    pgid: 24680,
    pid: 24680,
    schema: 'auth-chain-command-owner.v1',
    sid: 24680,
    starttime: 777,
    ...(changes.owner ?? {}),
  };
  return { raw, owner, epoch: changes.epoch ?? EPOCH };
}
function binding(port = 43123) {
  const item = evidence(port);
  return receiptBrowserBinding(item.raw, item.owner, item.epoch);
}

// Browser protocol controls only. No Chrome, built App, provider or native
// owned-process boundary is created by these doubles.
function protocol() {
  let handler, websocketListener, creationOptions, closed = 0;
  const contextEvents = new Map(), pageEvents = new Map(), commands = [];
  const frame = Object.freeze({ page: () => page });
  const page = Object.freeze({
    on(name, callback) { pageEvents.set(name, callback); },
    mainFrame() { return frame; },
  });
  const cdp = {
    async send(name, body) { commands.push([name, body]); },
    on(name, listener) {
      assert.equal(name, 'Network.webSocketCreated'); websocketListener = listener;
    },
  };
  const context = {
    on(name, callback) { contextEvents.set(name, callback); },
    async route(pattern, callback) { assert.equal(pattern, '**/*'); handler = callback; },
    async newPage() { contextEvents.get('page')(page); return page; },
    async newCDPSession(actual) { assert.equal(actual, page); return cdp; },
    async close() { ++closed; },
  };
  const browser = { async newContext(options) { creationOptions = options; return context; } };
  return {
    browser,
    async dispatch(url, method = 'GET', body = null, headers = {}) {
      let result;
      await handler({
        request: () => ({
          url: () => url,
          method: () => method,
          frame: () => frame,
          allHeaders: async () => headers,
          postDataBuffer: () => body,
        }),
        async abort(reason) { result = { abort: reason }; },
        async continue() { result = { continued: true }; },
        async fulfill(reply) { result = reply; },
      });
      return result;
    },
    socket(url) { websocketListener({ url }); },
    options: () => creationOptions,
    commands,
    closed: () => closed,
  };
}
const noAdapter = () => { throw Error('SENSITIVE_FAILURE_MUST_NOT_ESCAPE'); };
const sameEpoch = async () => EPOCH;

test('canonical held receipt bytes derive the only App origin and bind b901 owner identity', () => {
  const item = evidence(43123);
  const actual = receiptBrowserBinding(item.raw, item.owner, item.epoch);
  assert.equal(actual.origin, 'http://127.0.0.1:43123');
  assert.equal(actual.projectUrl, 'http://127.0.0.1:43123' + ROUTE);
  assert.equal(actual.receiptSha256, createHash('sha256').update(item.raw).digest('hex'));
  assert.deepEqual(actual.owner, item.owner);
  assert(Object.isFrozen(actual)); assert(Object.isFrozen(actual.owner));
});

test('noncanonical, widened or mismatched receipt/owner/epoch evidence is refused', () => {
  const good = evidence();
  const unknown = Buffer.from(good.raw.toString().replace(/}$/, ',"extra":1}'));
  const duplicate = Buffer.from(good.raw.toString().replace('"pid":24680', '"pid":24680,"pid":24680'));
  const cases = [
    [Buffer.concat([good.raw, Buffer.from('\n')]), good.owner, EPOCH],
    [unknown, good.owner, EPOCH],
    [duplicate, good.owner, EPOCH],
    [evidence(43123, { receipt: { host: '0.0.0.0' } }).raw, good.owner, EPOCH],
    [good.raw, { ...good.owner, starttime: 0 }, EPOCH],
    [good.raw, { ...good.owner, pid: 24681 }, EPOCH],
    [good.raw, good.owner, EPOCH.toUpperCase()],
    [good.raw.toString(), good.owner, EPOCH],
  ];
  for (const args of cases) assert.throws(() => receiptBrowserBinding(...args), /RECEIPT_NETWORK_REFUSED/);
});

test('random receipt origin admits exact static inventory and route; retired literal is denied', async () => {
  const p = protocol();
  const bridge = await createReceiptAppBrowserNetwork(
    p.browser, noAdapter, noAdapter, ['/index.html', '/assets/app.js'], binding(), sameEpoch,
  );
  assert.equal(bridge.projectUrl, 'http://127.0.0.1:43123' + ROUTE);
  await bridge.preparePage();
  assert.deepEqual(await p.dispatch('http://127.0.0.1:43123/assets/app.js'), { continued: true });
  assert.deepEqual(await p.dispatch('http://127.0.0.1:43123' + ROUTE), { continued: true });
  bridge.assertClean(); await bridge.close();

  const retired = protocol();
  const denied = await createReceiptAppBrowserNetwork(
    retired.browser, noAdapter, noAdapter, ['/index.html'], binding(), sameEpoch,
  );
  await denied.preparePage();
  assert.deepEqual(await retired.dispatch('http://127.0.0.1:55784/index.html'),
    { abort: 'blockedbyclient' });
  assert.throws(() => denied.assertClean(), /RECEIPT_NETWORK_REFUSED/);
  await assert.rejects(denied.close(), /RECEIPT_NETWORK_REFUSED/);
});

test('provider login and mutation remain refused before either native adapter', async () => {
  for (const [url, method] of [
    ['https://pihrhltinhewhoxefjxv.supabase.co/auth/v1/user', 'GET'],
    ['https://pihrhltinhewhoxefjxv.supabase.co/rest/v1/rpc/publish_operations_scope_v1', 'POST'],
  ]) {
    const p = protocol(); let calls = 0;
    const bridge = await createReceiptAppBrowserNetwork(
      p.browser, () => { ++calls; }, () => { ++calls; }, ['/index.html'], binding(), sameEpoch,
    );
    await bridge.preparePage();
    assert.deepEqual(await p.dispatch(url, method, method === 'POST' ? Buffer.from('{}') : null),
      { abort: 'blockedbyclient' });
    assert.equal(calls, 0);
    if (method === 'GET') { bridge.assertClean(); await bridge.close(); }
    else {
      assert.throws(() => bridge.assertClean(), /RECEIPT_NETWORK_REFUSED/);
      await assert.rejects(bridge.close(), /RECEIPT_NETWORK_REFUSED/);
    }
  }
});

test('three native read replies retain bytes while epoch witness brackets browser use', async () => {
  const p = protocol(); let epochs = 0;
  const epoch = async () => { ++epochs; return EPOCH; };
  const read = async request => {
    const api = new URL(request.url).pathname.split('/').at(-1);
    return { api, response: new Response(JSON.stringify({ api }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }) };
  };
  const bridge = await createReceiptAppBrowserNetwork(
    p.browser, noAdapter, read, ['/index.html'], binding(), epoch,
  );
  await bridge.preparePage();
  const apis = [
    'read_operations_scope_obligation_evidence_v1',
    'read_operations_scope_obligation_drilldown_v1',
    'read_operations_scope_invoice_capture_admin_v1',
  ];
  for (const api of apis) {
    const reply = await p.dispatch(
      'https://pihrhltinhewhoxefjxv.supabase.co/rest/v1/rpc/' + api,
      'POST', Buffer.from('{}'), { 'content-type': 'application/json' },
    );
    assert.equal(reply.status, 200);
    assert.deepEqual(JSON.parse(reply.body.toString()), { api });
  }
  const settled = await bridge.settledReplies();
  assert.equal(settled.parent.api, apis[0]);
  assert.equal(settled.drilldown.api, apis[1]);
  assert.equal(settled.whole.api, apis[2]);
  bridge.assertClean(); await bridge.close();
  assert.equal(epochs, 5);
});

test('daemon epoch drift closes the owned context before page creation and is retained', async () => {
  const p = protocol(); let calls = 0;
  const epoch = async () => (++calls === 1 ? EPOCH : 'b'.repeat(64));
  const bridge = await createReceiptAppBrowserNetwork(
    p.browser, noAdapter, noAdapter, ['/index.html'], binding(), epoch,
  );
  await assert.rejects(bridge.preparePage(), /RECEIPT_NETWORK_REFUSED/);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(p.closed(), 1);
  assert.throws(() => bridge.assertClean(), /RECEIPT_NETWORK_REFUSED/);
  await assert.rejects(bridge.close(), /RECEIPT_NETWORK_REFUSED/);
});

test('a caller-fabricated frozen binding cannot bypass canonical receipt parsing', async () => {
  const p = protocol();
  const forged = Object.freeze({
    origin: 'http://127.0.0.1:43123', projectUrl: 'http://127.0.0.1:43123' + ROUTE,
    receiptSha256: 'c'.repeat(64), daemonEpochWitness: EPOCH,
  });
  await assert.rejects(createReceiptAppBrowserNetwork(
    p.browser, noAdapter, noAdapter, ['/index.html'], forged, sameEpoch,
  ), /RECEIPT_NETWORK_REFUSED/);
  assert.equal(p.options(), undefined);
});

test('browser failures remain normalized and no native acceptance is implied', async () => {
  const browser = { newContext() { throw Error('PRIVATE_BROWSER_FAILURE'); } };
  await assert.rejects(createReceiptAppBrowserNetwork(
    browser, noAdapter, noAdapter, ['/index.html'], binding(), sameEpoch,
  ), error => error.message === 'FULL_APP_BROWSER_RECEIPT_NETWORK_REFUSED' &&
      !error.message.includes('PRIVATE'));
});
