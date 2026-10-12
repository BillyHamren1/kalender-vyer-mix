// Runs against the actual separately fetched owner module, never a reimplementation.
// OWNER_WMS_GATE_MODULE must point to its locally transpiled CommonJS output.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const owner = require(process.env.OWNER_WMS_GATE_MODULE);
const env = {
  EVENTFLOW_WMS_URL: 'https://invalid.example.test',
  EVENTFLOW_WMS_TOKEN: 'synthetic-not-a-secret',
  EVENTFLOW_WMS_CONTRACT_VERSION: 'eventflow-wms-outbound-retur-v1',
  EVENTFLOW_WMS_CONTRACT_ENABLED: 'true',
  NODE_ENV: 'test',
};
test('valid configuration is diagnostic only, actual owner runtime remains closed', () => {
  assert.equal(owner.readWmsContractConfig(env).contractVersion, env.EVENTFLOW_WMS_CONTRACT_VERSION);
  assert.throws(() => owner.readVerifiedWmsRuntimeConfig(env), error => error.kind === 'contract_unverified');
});
test('loopback configuration cannot bypass upstream evidence gate', () => {
  const local = { ...env, EVENTFLOW_WMS_URL: 'http://localhost:9000', EVENTFLOW_WMS_ALLOW_LOOPBACK: 'true' };
  assert.equal(owner.readWmsContractConfig(local).endpoint, local.EVENTFLOW_WMS_URL);
  assert.throws(() => owner.readVerifiedWmsRuntimeConfig(local), error => error.kind === 'contract_unverified');
});
test('missing runtime config does not supply a fallback endpoint', () => {
  assert.throws(() => owner.readVerifiedWmsRuntimeConfig({}), error => error.kind === 'contract_unverified');
});
