import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ArchiveFailure, main, verifyArchiveFd } from './compatible-eight-reader-full-app-playwright-browser-archive-provenance.mjs';

function zip(name = 'chrome-linux/chrome', external = 0o100600 << 16) {
  const raw = Buffer.from(name); const data = Buffer.from('browser');
  const local = Buffer.alloc(30 + raw.length); local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt16LE(0, 8);
  local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(raw.length, 26); raw.copy(local, 30);
  const central = Buffer.alloc(46 + raw.length); central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(0x314, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8);
  central.writeUInt16LE(0, 10); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(raw.length, 28); central.writeUInt32LE(external >>> 0, 38); raw.copy(central, 46);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(central.length, 12); eocd.writeUInt32LE(local.length + data.length, 16);
  return Buffer.concat([local, data, central, eocd]);
}
function fixture(bytes) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-archive-')); const file = path.join(root, 'archive.zip');
  fs.writeFileSync(file, bytes, { mode: 0o600 }); fs.chmodSync(file, 0o600);
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  const evidence = { archive_path: 'builds/chromium/1187/chromium-linux.zip', bytes: bytes.length,
    content_encoding: 'identity', http_status: 200, origin: 'https://cdn.playwright.dev', redirects: 0,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  return { root, file, fd, evidence };
}
function close(value) { fs.closeSync(value.fd); fs.rmSync(value.root, { recursive: true }); }

test('held archive FD yields narrow non-importing header receipt', () => {
  const value = fixture(zip()); try {
    const receipt = verifyArchiveFd(value.fd, value.evidence, 2);
    assert.equal(receipt.entries, 1); assert.equal(receipt.expanded_bytes, 7);
    assert.equal(receipt.archive_hash_matches_evidence, true);
    assert.equal(receipt.bounded_header_directory_consistency_verified, true);
    assert.equal(receipt.entry_payload_crc_verified, false);
    assert.equal(receipt.compression_streams_verified, false);
    assert.equal(receipt.data_descriptors_verified, false);
    assert.equal(receipt.transport_provenance_verified, false); assert.equal(receipt.imported, false);
  } finally { close(value); }
});

test('wrong hash, origin, redirect, encoding, or status refuses', () => {
  const value = fixture(zip()); try {
    for (const patch of [{ sha256: '0'.repeat(64) }, { origin: 'https://example.invalid' }, { redirects: 1 },
      { content_encoding: 'gzip' }, { http_status: 206 }]) {
      assert.throws(() => verifyArchiveFd(value.fd, { ...value.evidence, ...patch }, 2), ArchiveFailure);
    }
  } finally { close(value); }
});

test('traversal, noncanonical names, links, special files and duplicate central names refuse', () => {
  for (const bytes of [zip('../escape'), zip('chrome//double'), zip('chrome-link', 0o120777 << 16),
    zip('chrome-device', 0o020600 << 16)]) {
    const value = fixture(bytes); try { assert.throws(() => verifyArchiveFd(value.fd, value.evidence, 2), ArchiveFailure); }
    finally { close(value); }
  }
  const bytes = zip(); const central = bytes.subarray(bytes.length - 22 - (46 + Buffer.byteLength('chrome-linux/chrome')), bytes.length - 22);
  const eocd = Buffer.from(bytes.subarray(bytes.length - 22)); eocd.writeUInt16LE(2, 8); eocd.writeUInt16LE(2, 10);
  eocd.writeUInt32LE(central.length * 2, 12); eocd.writeUInt32LE(bytes.length - 22 - central.length, 16);
  const doubled = Buffer.concat([bytes.subarray(0, bytes.length - 22), central, eocd]);
  const value = fixture(doubled); try { assert.throws(() => verifyArchiveFd(value.fd, value.evidence, 2), ArchiveFailure); }
  finally { close(value); }
});

test('mode, size and mutation identity refuse', () => {
  const value = fixture(zip()); try {
    fs.chmodSync(value.file, 0o644); assert.throws(() => verifyArchiveFd(value.fd, value.evidence, 2), ArchiveFailure);
  } finally { close(value); }
  const changed = fixture(zip()); try {
    assert.throws(() => verifyArchiveFd(changed.fd, { ...changed.evidence, bytes: changed.evidence.bytes - 1 }, 2), ArchiveFailure);
  } finally { close(changed); }
});

test('main is fixed HOLD and source has no network, process or extraction primitive', () => {
  let output = ''; const original = process.stdout.write; process.stdout.write = (part) => { output += part; return true; };
  try { assert.equal(main(), 78); } finally { process.stdout.write = original; }
  assert.equal(output, 'FULL_APP_PLAYWRIGHT_ARCHIVE HOLD exact_archive_evidence_and_import_required\n');
  const source = fs.readFileSync(new URL('./compatible-eight-reader-full-app-playwright-browser-archive-provenance.mjs', import.meta.url), 'utf8');
  for (const forbidden of ['node:http', 'node:https', 'fetch(', 'child_process', 'spawn(', 'exec(', 'extract(', 'createWriteStream'])
    assert.equal(source.includes(forbidden), false, forbidden);
});
