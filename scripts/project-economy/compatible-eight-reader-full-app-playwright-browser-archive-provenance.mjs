/** Held-FD Chromium ZIP provenance verifier. It never downloads or extracts. */
import fs from 'node:fs';
import crypto from 'node:crypto';

const ARCHIVE_PATH = 'builds/chromium/1187/chromium-linux.zip';
const ORIGINS = new Set([
  'https://cdn.playwright.dev/dbazure/download/playwright',
  'https://playwright.download.prss.microsoft.com/dbazure/download/playwright',
  'https://cdn.playwright.dev',
]);
const MAX_ARCHIVE = 536_870_912;
const MAX_ENTRIES = 8192;
const MAX_CENTRAL = 67_108_864;
const MAX_EXPANDED = 2_147_483_648;

export class ArchiveFailure extends Error {
  constructor() { super('compatible_full_app_playwright_archive_refused'); }
}

function need(value) { if (value !== true) throw new ArchiveFailure(); }
function same(a, b) {
  return ['dev', 'ino', 'uid', 'gid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs']
    .every((key) => a[key] === b[key]);
}
function readAt(fd, length, position) {
  const result = Buffer.alloc(length); let done = 0;
  while (done < length) {
    const count = fs.readSync(fd, result, done, length - done, position + done);
    need(count > 0); done += count;
  }
  return result;
}
function cleanName(raw, utf8) {
  need(raw.length > 0 && raw.length <= 4096 && !raw.includes(0));
  if (!utf8) need([...raw].every((value) => value >= 0x20 && value <= 0x7e));
  const name = raw.toString('utf8');
  need(Buffer.from(name, 'utf8').equals(raw) && !name.startsWith('/') && !name.includes('\\'));
  const parts = name.split('/').filter((value) => value !== '');
  need(parts.length > 0 && parts.every((value) => value !== '.' && value !== '..'));
  need(parts.join('/') + (name.endsWith('/') ? '/' : '') === name);
  return name;
}
function canonicalEvidence(value) {
  need(value !== null && typeof value === 'object' && !Array.isArray(value));
  need(Object.keys(value).sort().join(',') ===
    'archive_path,bytes,content_encoding,http_status,origin,redirects,sha256');
  need(value.archive_path === ARCHIVE_PATH && ORIGINS.has(value.origin));
  need(Number.isSafeInteger(value.bytes) && value.bytes > 0 && value.bytes <= MAX_ARCHIVE);
  need(value.content_encoding === 'identity' && value.http_status === 200 && value.redirects === 0);
  need(typeof value.sha256 === 'string' && /^[0-9a-f]{64}$/.test(value.sha256));
  return value;
}

export function verifyArchiveFd(fd, evidence, seconds = 60) {
  canonicalEvidence(evidence);
  need(Number.isInteger(fd) && fd >= 0 && typeof seconds === 'number' && seconds > 0 && seconds <= 60);
  const end = performance.now() + seconds * 1000;
  const before = fs.fstatSync(fd, { bigint: true });
  need(before.isFile() && before.uid === BigInt(process.geteuid()) && before.nlink === 1n);
  need((before.mode & 0o777n) === 0o600n && before.size === BigInt(evidence.bytes));
  const digest = crypto.createHash('sha256'); const buffer = Buffer.alloc(1_048_576);
  let position = 0;
  while (position < evidence.bytes) {
    need(performance.now() < end);
    const amount = Math.min(buffer.length, evidence.bytes - position);
    const count = fs.readSync(fd, buffer, 0, amount, position);
    need(count > 0); digest.update(buffer.subarray(0, count)); position += count;
  }
  need(position === evidence.bytes && digest.digest('hex') === evidence.sha256);
  const tailLength = Math.min(evidence.bytes, 65_557);
  const tail = readAt(fd, tailLength, evidence.bytes - tailLength);
  let eocd = -1;
  for (let index = tail.length - 22; index >= 0; index -= 1) {
    if (tail.readUInt32LE(index) === 0x06054b50) { eocd = index; break; }
  }
  need(eocd >= 0 && eocd + 22 === tail.length);
  need(tail.readUInt16LE(eocd + 4) === 0 && tail.readUInt16LE(eocd + 6) === 0);
  const diskEntries = tail.readUInt16LE(eocd + 8); const entries = tail.readUInt16LE(eocd + 10);
  const centralSize = tail.readUInt32LE(eocd + 12); const centralOffset = tail.readUInt32LE(eocd + 16);
  const comment = tail.readUInt16LE(eocd + 20);
  need(entries === diskEntries && entries > 0 && entries <= MAX_ENTRIES && comment === 0);
  need(centralSize > 0 && centralSize <= MAX_CENTRAL && centralOffset + centralSize === evidence.bytes - tailLength + eocd);
  const central = readAt(fd, centralSize, centralOffset); const names = new Set(); const ranges = [];
  let cursor = 0; let expanded = 0;
  for (let serial = 0; serial < entries; serial += 1) {
    need(performance.now() < end && cursor + 46 <= central.length && central.readUInt32LE(cursor) === 0x02014b50);
    const flags = central.readUInt16LE(cursor + 8); const method = central.readUInt16LE(cursor + 10);
    const crc = central.readUInt32LE(cursor + 16);
    const compressed = central.readUInt32LE(cursor + 20); const size = central.readUInt32LE(cursor + 24);
    const nameLength = central.readUInt16LE(cursor + 28); const extraLength = central.readUInt16LE(cursor + 30);
    const commentLength = central.readUInt16LE(cursor + 32); const external = central.readUInt32LE(cursor + 38);
    const localOffset = central.readUInt32LE(cursor + 42);
    need((flags & 1) === 0 && (method === 0 || method === 8));
    need(compressed <= MAX_ARCHIVE && size <= MAX_ARCHIVE && localOffset < centralOffset);
    const endRow = cursor + 46 + nameLength + extraLength + commentLength;
    need(nameLength > 0 && endRow <= central.length);
    const rawName = central.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = cleanName(rawName, (flags & 0x800) !== 0);
    need(!names.has(name)); names.add(name);
    const kind = (external >>> 16) & 0o170000;
    need(name.endsWith('/') ? (kind === 0 || kind === 0o040000) : (kind === 0 || kind === 0o100000));
    if (name.endsWith('/')) need(compressed === 0 && size === 0);
    const local = readAt(fd, 30 + nameLength, localOffset);
    need(local.readUInt32LE(0) === 0x04034b50 && local.readUInt16LE(6) === flags && local.readUInt16LE(8) === method);
    const localNameLength = local.readUInt16LE(26); const localExtraLength = local.readUInt16LE(28);
    need(localNameLength === nameLength && local.subarray(30).equals(rawName));
    if ((flags & 8) === 0) need(local.readUInt32LE(14) === crc && local.readUInt32LE(18) === compressed
      && local.readUInt32LE(22) === size);
    const dataEnd = localOffset + 30 + localNameLength + localExtraLength + compressed;
    need(dataEnd <= centralOffset); ranges.push([localOffset, dataEnd]);
    expanded += size; need(expanded <= MAX_EXPANDED); cursor = endRow;
  }
  ranges.sort((a, b) => a[0] - b[0]);
  need(ranges.every((value, index) => index === 0 || ranges[index - 1][1] <= value[0]));
  need(cursor === central.length && names.size === entries && performance.now() < end);
  need(same(before, fs.fstatSync(fd, { bigint: true })));
  return Object.freeze({
    schema: 'compatible-full-app-playwright-browser-archive-provenance.v1',
    archive_path: ARCHIVE_PATH,
    sha256: evidence.sha256,
    bytes: evidence.bytes,
    entries,
    expanded_bytes: expanded,
    central_directory_sha256: crypto.createHash('sha256').update(central).digest('hex'),
    archive_hash_matches_evidence: true,
    bounded_header_directory_consistency_verified: true,
    entry_payload_crc_verified: false,
    compression_streams_verified: false,
    data_descriptors_verified: false,
    transport_provenance_verified: false,
    imported: false,
  });
}

export function main() {
  process.stdout.write('FULL_APP_PLAYWRIGHT_ARCHIVE HOLD exact_archive_evidence_and_import_required\n');
  return 78;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = main();
