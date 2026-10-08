/** Streaming ZIP payload validator layered on the reviewed narrow FD boundary. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createInflateRaw, crc32 } from 'node:zlib';
import { verifyArchiveFd } from './compatible-eight-reader-full-app-playwright-browser-archive-provenance.mjs';

const MAX_ARCHIVE = 536_870_912;
const MAX_ENTRIES = 8192;
const MAX_EXPANDED = 2_147_483_648;

export class PayloadFailure extends Error {
  constructor() { super('compatible_full_app_playwright_archive_payload_refused'); }
}
function need(value) { if (value !== true) throw new PayloadFailure(); }
function readAt(fd, length, position) {
  const result = Buffer.alloc(length); let done = 0;
  while (done < length) {
    const count = fs.readSync(fd, result, done, length - done, position + done);
    need(count > 0); done += count;
  }
  return result;
}
function identity(value) {
  return ['dev', 'ino', 'uid', 'gid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'].map((key) => value[key]);
}
function same(a, b) { return identity(a).every((value, index) => value === identity(b)[index]); }
async function validatePayload(fd, start, compressed, method, expectedSize, expectedCrc, end) {
  let crc = 0; let expanded = 0;
  const accept = (chunk) => {
    need(performance.now() < end); expanded += chunk.length;
    need(expanded <= expectedSize && expanded <= MAX_ARCHIVE); crc = crc32(chunk, crc);
  };
  if (method === 0) {
    need(compressed === expectedSize); const buffer = Buffer.alloc(1_048_576); let done = 0;
    while (done < compressed) {
      need(performance.now() < end); const amount = Math.min(buffer.length, compressed - done);
      const count = fs.readSync(fd, buffer, 0, amount, start + done); need(count > 0);
      accept(buffer.subarray(0, count)); done += count;
    }
  } else {
    need(method === 8);
    async function* chunks() {
      const buffer = Buffer.alloc(1_048_576); let done = 0;
      while (done < compressed) {
        need(performance.now() < end); const amount = Math.min(buffer.length, compressed - done);
        const count = fs.readSync(fd, buffer, 0, amount, start + done); need(count > 0);
        done += count; yield Buffer.from(buffer.subarray(0, count));
      }
    }
    const sink = new Writable({ write(chunk, _encoding, callback) {
      try { accept(chunk); callback(); } catch (error) { callback(error); }
    }});
    try { await pipeline(Readable.from(chunks()), createInflateRaw(), sink); }
    catch { throw new PayloadFailure(); }
  }
  need(expanded === expectedSize && crc === expectedCrc);
  return expanded;
}

export async function validateArchivePayloads(fd, evidence, seconds = 60) {
  need(Number.isInteger(fd) && fd >= 0 && typeof seconds === 'number' && seconds > 0 && seconds <= 60);
  const end = performance.now() + seconds * 1000; const before = fs.fstatSync(fd, { bigint: true });
  const narrow = verifyArchiveFd(fd, evidence, seconds); need(narrow.imported === false);
  need(Object.isFrozen(narrow) && typeof narrow.sha256 === 'string' && /^[0-9a-f]{64}$/.test(narrow.sha256)
    && Number.isSafeInteger(narrow.bytes) && narrow.bytes > 0 && narrow.bytes <= MAX_ARCHIVE);
  const archiveSha256 = narrow.sha256; const archiveBytes = narrow.bytes;
  const tailLength = Math.min(archiveBytes, 65_557); const tail = readAt(fd, tailLength, archiveBytes - tailLength);
  let eocd = -1;
  for (let index = tail.length - 22; index >= 0; index -= 1)
    if (tail.readUInt32LE(index) === 0x06054b50) { eocd = index; break; }
  need(eocd >= 0 && eocd + 22 === tail.length);
  const entries = tail.readUInt16LE(eocd + 10); const centralSize = tail.readUInt32LE(eocd + 12);
  const centralOffset = tail.readUInt32LE(eocd + 16);
  need(entries > 0 && entries <= MAX_ENTRIES && centralOffset + centralSize === archiveBytes - tailLength + eocd);
  const central = readAt(fd, centralSize, centralOffset); const ranges = [];
  let cursor = 0; let expandedTotal = 0;
  for (let serial = 0; serial < entries; serial += 1) {
    need(performance.now() < end && cursor + 46 <= central.length && central.readUInt32LE(cursor) === 0x02014b50);
    const flags = central.readUInt16LE(cursor + 8); const method = central.readUInt16LE(cursor + 10);
    const expectedCrc = central.readUInt32LE(cursor + 16); const compressed = central.readUInt32LE(cursor + 20);
    const expectedSize = central.readUInt32LE(cursor + 24); const nameLength = central.readUInt16LE(cursor + 28);
    const extraLength = central.readUInt16LE(cursor + 30); const commentLength = central.readUInt16LE(cursor + 32);
    const localOffset = central.readUInt32LE(cursor + 42); const endRow = cursor + 46 + nameLength + extraLength + commentLength;
    need((flags & ~(0x800 | 8)) === 0 && (method === 0 || method === 8));
    need(nameLength > 0 && endRow <= central.length && compressed <= MAX_ARCHIVE && expectedSize <= MAX_ARCHIVE);
    const local = readAt(fd, 30 + nameLength, localOffset);
    need(local.readUInt32LE(0) === 0x04034b50 && local.readUInt16LE(6) === flags && local.readUInt16LE(8) === method);
    const localNameLength = local.readUInt16LE(26); const localExtraLength = local.readUInt16LE(28);
    need(localNameLength === nameLength && local.subarray(30).equals(central.subarray(cursor + 46, cursor + 46 + nameLength)));
    if ((flags & 8) === 0) need(local.readUInt32LE(14) === expectedCrc && local.readUInt32LE(18) === compressed
      && local.readUInt32LE(22) === expectedSize);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength; const dataEnd = dataStart + compressed;
    need(dataEnd <= centralOffset); let rangeEnd = dataEnd;
    if ((flags & 8) !== 0) {
      need(dataEnd + 12 <= centralOffset); const available = Math.min(16, centralOffset - dataEnd);
      const descriptor = readAt(fd, available, dataEnd); let offset = 0;
      if (descriptor.length >= 16 && descriptor.readUInt32LE(0) === 0x08074b50) offset = 4;
      need(descriptor.length >= offset + 12 && descriptor.readUInt32LE(offset) === expectedCrc
        && descriptor.readUInt32LE(offset + 4) === compressed && descriptor.readUInt32LE(offset + 8) === expectedSize);
      rangeEnd += offset + 12;
    }
    expandedTotal += await validatePayload(fd, dataStart, compressed, method, expectedSize, expectedCrc, end);
    need(expandedTotal <= MAX_EXPANDED); ranges.push([localOffset, rangeEnd]); cursor = endRow;
  }
  ranges.sort((a, b) => a[0] - b[0]);
  need(ranges.every((value, index) => index === 0 || (ranges[index - 1][1] <= value[0] && ranges[index - 1][0] < value[0])));
  need(cursor === central.length && performance.now() < end && same(before, fs.fstatSync(fd, { bigint: true })));
  return Object.freeze({
    schema: 'compatible-full-app-playwright-browser-archive-payload.v1',
    archive_sha256: archiveSha256,
    archive_bytes: archiveBytes,
    entries,
    expanded_bytes: expandedTotal,
    archive_hash_matches_evidence: true,
    bounded_header_directory_consistency_verified: true,
    entry_payload_crc_verified: true,
    compression_streams_verified: true,
    data_descriptors_verified: true,
    transport_provenance_verified: false,
    imported: false,
    central_directory_sha256: crypto.createHash('sha256').update(central).digest('hex'),
  });
}

export function main() {
  process.stdout.write('FULL_APP_PLAYWRIGHT_ARCHIVE_PAYLOAD HOLD exact_archive_transport_and_import_required\n');
  return 78;
}
if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = main();
