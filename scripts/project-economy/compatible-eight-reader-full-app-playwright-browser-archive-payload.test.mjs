import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { crc32, deflateRawSync } from 'node:zlib';
import { PayloadFailure, main, validateArchivePayloads } from './compatible-eight-reader-full-app-playwright-browser-archive-payload.mjs';

function zip({ data = Buffer.from('browser'), method = 0, descriptor = false, crc = crc32(data) } = {}) {
  const name = Buffer.from('chrome-linux/chrome'); const compressed = method === 8 ? deflateRawSync(data) : data;
  const flags = 0x800 | (descriptor ? 8 : 0); const local = Buffer.alloc(30 + name.length);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6); local.writeUInt16LE(method, 8);
  if (!descriptor) { local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(data.length, 22); }
  local.writeUInt16LE(name.length, 26); name.copy(local, 30);
  const record = descriptor ? Buffer.alloc(16) : Buffer.alloc(0);
  if (descriptor) { record.writeUInt32LE(0x08074b50, 0); record.writeUInt32LE(crc, 4); record.writeUInt32LE(compressed.length, 8); record.writeUInt32LE(data.length, 12); }
  const central = Buffer.alloc(46 + name.length); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(0x314, 4);
  central.writeUInt16LE(20, 6); central.writeUInt16LE(flags, 8); central.writeUInt16LE(method, 10); central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE((0o100600 << 16) >>> 0, 38); name.copy(central, 46);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12); eocd.writeUInt32LE(local.length + compressed.length + record.length, 16);
  return Buffer.concat([local, compressed, record, central, eocd]);
}
function fixture(bytes) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-payload-')); const file = path.join(root, 'archive.zip');
  fs.writeFileSync(file, bytes, { mode: 0o600 }); fs.chmodSync(file, 0o600);
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  return { root, fd, evidence: { archive_path: 'builds/chromium/1187/chromium-linux.zip', bytes: bytes.length,
    content_encoding: 'identity', http_status: 200, origin: 'https://cdn.playwright.dev', redirects: 0,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex') }};
}
function close(value) { fs.closeSync(value.fd); fs.rmSync(value.root, { recursive: true }); }

test('stored payload CRC is streamed and verified', async () => {
  const value = fixture(zip()); try {
    const receipt = await validateArchivePayloads(value.fd, value.evidence, 2);
    assert.equal(receipt.entry_payload_crc_verified, true); assert.equal(receipt.compression_streams_verified, true);
    assert.equal(receipt.data_descriptors_verified, true); assert.equal(receipt.transport_provenance_verified, false);
    assert.equal(receipt.imported, false);
  } finally { close(value); }
});

test('deflated signed data descriptor is parsed and verified', async () => {
  const value = fixture(zip({ method: 8, descriptor: true, data: Buffer.from('browser'.repeat(2000)) }));
  try { const receipt = await validateArchivePayloads(value.fd, value.evidence, 2); assert.equal(receipt.expanded_bytes, 14000); }
  finally { close(value); }
});

test('caller evidence mutation during DEFLATE cannot alter the verified receipt', async () => {
  const value = fixture(zip({ method: 8, descriptor: true, data: Buffer.from('browser'.repeat(20000)) }));
  const originalSha256 = value.evidence.sha256; const originalBytes = value.evidence.bytes;
  try {
    const pending = validateArchivePayloads(value.fd, value.evidence, 2);
    queueMicrotask(() => { value.evidence.sha256 = '0'.repeat(64); value.evidence.bytes = 1; });
    const receipt = await pending;
    assert.equal(receipt.archive_sha256, originalSha256);
    assert.equal(receipt.archive_bytes, originalBytes);
    assert.notEqual(receipt.archive_sha256, value.evidence.sha256);
    assert.notEqual(receipt.archive_bytes, value.evidence.bytes);
  } finally { close(value); }
});

test('wrong payload CRC and malformed descriptor refuse', async () => {
  for (const bytes of [zip({ crc: 0 }), (() => { const b = zip({ method: 8, descriptor: true }); b[b.length - 22 - (46 + 19) - 16 + 4] ^= 1; return b; })()]) {
    const value = fixture(bytes); try { await assert.rejects(validateArchivePayloads(value.fd, value.evidence, 2), PayloadFailure); }
    finally { close(value); }
  }
});

test('corrupt deflate stream and unsupported flags refuse', async () => {
  const broken = zip({ method: 8 }); broken[30 + 19] ^= 0xff;
  const flagged = zip(); flagged.writeUInt16LE(0x820, 6); flagged.writeUInt16LE(0x820, flagged.length - 22 - (46 + 19) + 8);
  for (const bytes of [broken, flagged]) {
    const value = fixture(bytes); try { await assert.rejects(validateArchivePayloads(value.fd, value.evidence, 2)); }
    finally { close(value); }
  }
});

test('main remains fixed HOLD with no download, import or process primitive', () => {
  let output = ''; const original = process.stdout.write; process.stdout.write = (part) => { output += part; return true; };
  try { assert.equal(main(), 78); } finally { process.stdout.write = original; }
  assert.equal(output, 'FULL_APP_PLAYWRIGHT_ARCHIVE_PAYLOAD HOLD exact_archive_transport_and_import_required\n');
  const source = fs.readFileSync(new URL('./compatible-eight-reader-full-app-playwright-browser-archive-payload.mjs', import.meta.url), 'utf8');
  for (const forbidden of ['node:http', 'node:https', 'fetch(', 'child_process', 'spawn(', 'exec(', 'extract(', 'createWriteStream'])
    assert.equal(source.includes(forbidden), false, forbidden);
});
