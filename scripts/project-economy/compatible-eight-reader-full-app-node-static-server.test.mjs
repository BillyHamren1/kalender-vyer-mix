import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inventory, readAsset, route, parseRequest, writeReceipt, PROJECT_ROUTE } from './compatible-eight-reader-full-app-node-static-server.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cer-node-static-')); fs.chmodSync(root, 0o700);
  fs.mkdirSync(path.join(root, 'assets'), { mode: 0o700 });
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html>INDEX', { mode: 0o600 });
  fs.writeFileSync(path.join(root, 'secondary.html'), 'SECONDARY', { mode: 0o600 });
  fs.writeFileSync(path.join(root, 'assets', 'main-abcdefgh.js'), 'globalThis.ok=true;', { mode: 0o600 });
  return root;
}

test('inventory and route bind fixed SPA, HTML and immutable asset policy', () => {
  const root = fixture(); const fd = fs.openSync(root, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
  try {
    const snap = inventory(fd); assert.equal(snap.entries, 4); assert.equal(snap.records.size, 5);
    assert.deepEqual(route(PROJECT_ROUTE, snap.records), ['index.html', 'text/html; charset=utf-8', 'no-store']);
    assert.deepEqual(route('/secondary.html', snap.records), ['secondary.html', 'text/html; charset=utf-8', 'no-store']);
    assert.equal(route('/api/private', snap.records), null);
    assert.equal(route('/assets/main-abcdefgh.js', snap.records)[2], 'public, max-age=31536000, immutable');
    assert.equal(readAsset(fd, snap, 'index.html').toString(), '<!doctype html>INDEX');
  } finally { fs.closeSync(fd); fs.rmSync(root, { recursive: true }); }
});

test('held-FD inventory rejects symlink and selected-file mutation', () => {
  let root = fixture(); let fd = fs.openSync(root, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
  try {
    const snap = inventory(fd); fs.writeFileSync(path.join(root, 'index.html'), 'MUTATED');
    assert.throws(() => readAsset(fd, snap, 'index.html'));
  } finally { fs.closeSync(fd); fs.rmSync(root, { recursive: true }); }
  root = fixture(); fs.symlinkSync('index.html', path.join(root, 'linked.html')); fd = fs.openSync(root, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
  try { assert.throws(() => inventory(fd)); }
  finally { fs.closeSync(fd); fs.rmSync(root, { recursive: true }); }
});

test('request grammar rejects Range and held receipt bytes are canonical', () => {
  const port = 43210;
  assert.deepEqual(parseRequest(Buffer.from(`GET ${PROJECT_ROUTE} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`), port), ['GET', PROJECT_ROUTE]);
  assert.throws(() => parseRequest(Buffer.from(`GET /index.html HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nRange: bytes=0-1\r\n\r\n`), port));
  assert.throws(() => parseRequest(Buffer.from(`POST /index.html HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`), port));
  const root = fixture(); const rootFd = fs.openSync(root, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'cer-node-receipt-')); fs.chmodSync(parent, 0o700);
  const receipt = path.join(parent, 'receipt.json'); const receiptFd = fs.openSync(receipt, fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
  try {
    const rootStat = fs.fstatSync(rootFd, { bigint: true }); writeReceipt(receiptFd, port, rootStat, [123, 123, 123]);
    const value = fs.readFileSync(receipt, 'ascii'); const parsed = JSON.parse(value);
    assert.equal(value, JSON.stringify(parsed)); assert.deepEqual(Object.keys(parsed), ['dist_dev', 'dist_ino', 'host', 'pgid', 'pid', 'port', 'project_route', 'schema', 'sid']);
    assert.equal(parsed.host, '127.0.0.1'); assert.equal(parsed.project_route, PROJECT_ROUTE); assert.equal(parsed.port, port);
  } finally { fs.closeSync(receiptFd); fs.closeSync(rootFd); fs.rmSync(root, { recursive: true }); fs.rmSync(parent, { recursive: true }); }
});
