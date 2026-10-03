/** Exact-Node-FD static transport for an already-built Operations dist tree.
 * Source support tests may use ambient Node; native admission may not. */
import fs from 'node:fs';
import net from 'node:net';

export const HOST = '127.0.0.1';
export const PROJECT = '55555555-5555-4555-8555-555555555555';
export const PROJECT_ROUTE = `/project/${PROJECT}/economy`;
const MAX_RUNTIME_MS = 120000;
const MAX_REQUESTS = 768;
const MAX_HEADER_BYTES = 16384;
const MAX_HEADERS = 32;
const MAX_TARGET = 2048;
const MAX_FILE_BYTES = 16777216;
const MAX_DIST_BYTES = 67108864;
const MAX_DIST_ENTRIES = 4096;
const MAX_DEPTH = 16;
const O_DIRECTORY = fs.constants.O_DIRECTORY ?? 0;
const MIME = new Map(Object.entries({
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
}));
const BLOCKED = ['/api', '/auth', '/rest', '/rpc', '/graphql', '/functions', '/supabase', '/provider'];
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const HASHED = /^.+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/;
const SUFFIX = /(?:^|\/)([^/]+)$/;
const fail = () => new Error('compatible_full_app_node_static_server_denied');
const need = value => { if (value !== true) throw fail(); };
const fdPath = fd => `/proc/self/fd/${fd}`;
const mode = value => Number(value.mode & 0o7777n);
const safe = value => { const result = Number(value); need(BigInt(result) === value && Number.isSafeInteger(result)); return result; };
const identity = value => [value.dev, value.ino, value.uid, value.gid, value.nlink, value.mode,
  value.size, value.mtimeNs, value.ctimeNs].map(String).join(':');
const same = (left, right) => identity(left) === identity(right);
const suffix = name => { const leaf = name.match(SUFFIX)?.[1] ?? ''; const at = leaf.lastIndexOf('.'); return at < 0 ? '' : leaf.slice(at).toLowerCase(); };

function owned(value, directory) {
  need(value.uid === BigInt(process.geteuid()) && (value.mode & 0o022n) === 0n);
  need(directory ? value.isDirectory() : value.isFile() && value.nlink === 1n);
}

function childStat(parentFd, name) {
  return fs.lstatSync(`${fdPath(parentFd)}/${name}`, { bigint: true });
}

function openBound(parentFd, name, expected, directory) {
  const flags = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | (directory ? O_DIRECTORY : fs.constants.O_NONBLOCK);
  const fd = fs.openSync(`${fdPath(parentFd)}/${name}`, flags);
  try { need(same(fs.fstatSync(fd, { bigint: true }), expected)); return fd; }
  catch (error) { fs.closeSync(fd); throw error; }
}

export function inventory(rootFd, now = () => Date.now(), end = Date.now() + MAX_RUNTIME_MS) {
  need(Number.isInteger(rootFd) && rootFd >= 3 && now() < end);
  const root = fs.fstatSync(rootFd, { bigint: true }); owned(root, true);
  const records = new Map([['', { stat: root, directory: true }]]);
  let entries = 0; let total = 0;
  const walk = (parentFd, prefix, depth) => {
    need(now() < end && depth <= MAX_DEPTH);
    const parent = fs.fstatSync(parentFd, { bigint: true });
    const names = [];
    for (const row of fs.readdirSync(fdPath(parentFd), { withFileTypes: true })) {
      need(now() < end); entries += 1; need(entries <= MAX_DIST_ENTRIES);
      const name = row.name;
      need(typeof name === 'string' && name.length > 0 && name.length <= 255 && name !== '.' &&
        name !== '..' && !name.startsWith('.') && !name.includes('/') && !name.includes('\\') && !name.includes('\0'));
      names.push(name);
    }
    need(new Set(names).size === names.length);
    for (const name of names.sort()) {
      need(now() < end);
      const relative = prefix ? `${prefix}/${name}` : name; need(relative.length <= 1024 && !records.has(relative));
      const before = childStat(parentFd, name);
      if (before.isDirectory()) {
        owned(before, true); const fd = openBound(parentFd, name, before, true);
        try {
          records.set(relative, { stat: before, directory: true }); walk(fd, relative, depth + 1);
          need(same(fs.fstatSync(fd, { bigint: true }), before) && same(childStat(parentFd, name), before));
        } finally { fs.closeSync(fd); }
      } else {
        owned(before, false); const ext = suffix(name); const bytes = safe(before.size);
        need(MIME.has(ext) && bytes <= MAX_FILE_BYTES); total += bytes; need(total <= MAX_DIST_BYTES);
        const fd = openBound(parentFd, name, before, false);
        try { need(same(fs.fstatSync(fd, { bigint: true }), before) && same(childStat(parentFd, name), before)); }
        finally { fs.closeSync(fd); }
        records.set(relative, { stat: before, directory: false });
      }
    }
    need(same(fs.fstatSync(parentFd, { bigint: true }), parent) && now() < end);
  };
  walk(rootFd, '', 0);
  need(records.get('index.html')?.directory === false && records.get('assets')?.directory === true &&
    entries >= 3 && same(fs.fstatSync(rootFd, { bigint: true }), root) && now() < end);
  return Object.freeze({ root, records, entries, total });
}

export function readAsset(rootFd, snapshot, relative, now = () => Date.now(), end = Date.now() + MAX_RUNTIME_MS) {
  need(snapshot?.records instanceof Map && typeof relative === 'string' && relative && now() < end);
  const record = snapshot.records.get(relative); need(record && !record.directory && same(fs.fstatSync(rootFd, { bigint: true }), snapshot.root));
  const parts = relative.split('/'); const rootCopy = fs.openSync(fdPath(rootFd), fs.constants.O_RDONLY | O_DIRECTORY);
  need(same(fs.fstatSync(rootCopy, { bigint: true }), snapshot.root)); const opened = [rootCopy];
  try {
    let prefix = '';
    for (const part of parts.slice(0, -1)) {
      prefix = prefix ? `${prefix}/${part}` : part; const expected = snapshot.records.get(prefix);
      need(expected?.directory === true); opened.push(openBound(opened.at(-1), part, expected.stat, true));
    }
    const leaf = openBound(opened.at(-1), parts.at(-1), record.stat, false); opened.push(leaf);
    const expectedBytes = safe(record.stat.size); const body = Buffer.allocUnsafe(expectedBytes); let offset = 0;
    while (offset < expectedBytes) { need(now() < end); const count = fs.readSync(leaf, body, offset, expectedBytes - offset, offset); need(count > 0); offset += count; }
    need(offset === expectedBytes && same(fs.fstatSync(leaf, { bigint: true }), record.stat) &&
      same(childStat(opened.at(-2), parts.at(-1)), record.stat));
    let parentFd = rootFd; prefix = '';
    for (let index = 0; index < parts.length - 1; index += 1) {
      prefix = prefix ? `${prefix}/${parts[index]}` : parts[index]; const expected = snapshot.records.get(prefix).stat;
      need(same(fs.fstatSync(opened[index + 1], { bigint: true }), expected) && same(childStat(parentFd, parts[index]), expected));
      parentFd = opened[index + 1];
    }
    need(same(fs.fstatSync(rootFd, { bigint: true }), snapshot.root) && now() < end); return body;
  } finally { for (const fd of opened.reverse()) fs.closeSync(fd); }
}

export function route(target, records) {
  need(typeof target === 'string' && target.length > 0 && target.length <= MAX_TARGET && target.startsWith('/') &&
    !target.startsWith('//') && !target.includes('#') && !/%(?![0-9A-Fa-f]{2})/.test(target));
  const pieces = target.split('?'); need(pieces.length <= 2 && (pieces[1]?.length ?? 0) <= 1024);
  let decoded; try { decoded = decodeURIComponent(pieces[0]); } catch { throw fail(); }
  need(decoded.startsWith('/') && !decoded.includes('\\') && !decoded.includes('\0') &&
    [...decoded].every(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127));
  const parts = decoded.slice(1).split('/'); need(decoded === '/' || parts.every(part => part && part !== '.' && part !== '..'));
  if (decoded === '/' || decoded === '/index.html' || decoded === PROJECT_ROUTE) return ['index.html', MIME.get('.html'), 'no-store'];
  if (BLOCKED.some(prefix => decoded === prefix || decoded.startsWith(`${prefix}/`))) return null;
  const relative = decoded.slice(1); const record = records.get(relative); if (!record || record.directory) return null;
  const ext = suffix(relative); let contentType = MIME.get(ext); need(typeof contentType === 'string');
  if (relative.split('/').at(-1).startsWith('manifest') && ext === '.json') contentType = 'application/manifest+json; charset=utf-8';
  const cache = ext === '.html' ? 'no-store' : relative.startsWith('assets/') && HASHED.test(relative.split('/').at(-1))
    ? 'public, max-age=31536000, immutable' : 'public, max-age=3600';
  return [relative, contentType, cache];
}

export function parseRequest(raw, port) {
  need(Buffer.isBuffer(raw) && raw.length <= MAX_HEADER_BYTES);
  const marker = raw.indexOf('\r\n\r\n'); need(marker >= 0 && marker + 4 === raw.length);
  const text = raw.subarray(0, marker).toString('ascii'); need(Buffer.from(text, 'ascii').equals(raw.subarray(0, marker)));
  const lines = text.split('\r\n'); need(lines.length >= 1 && lines.length <= MAX_HEADERS + 1);
  const request = lines[0].split(' '); need(request.length === 3 && ['GET', 'HEAD'].includes(request[0]) &&
    request[2] === 'HTTP/1.1' && request[1].length > 0 && request[1].length <= MAX_TARGET);
  const headers = new Map();
  for (const line of lines.slice(1)) {
    need(line && !line.startsWith(' ') && !line.startsWith('\t') && line.includes(':'));
    const at = line.indexOf(':'); const name = line.slice(0, at).toLowerCase(); const value = line.slice(at + 1).trim();
    need(TOKEN.test(name) && [...value].every(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) <= 126));
    const values = headers.get(name) ?? []; values.push(value); headers.set(name, values);
  }
  need(JSON.stringify(headers.get('host')) === JSON.stringify([`${HOST}:${port}`]) && !headers.has('transfer-encoding') &&
    !headers.has('expect') && !headers.has('range') && (headers.get('content-length')?.length ?? 0) <= 1 &&
    (!headers.has('content-length') || headers.get('content-length')[0] === '0'));
  return [request[0], request[1]];
}

function send(socket, status, body, type, cache, head = false) {
  const phrase = new Map([[200, 'OK'], [400, 'Bad Request'], [404, 'Not Found'], [500, 'Internal Server Error']]).get(status);
  need(phrase && Buffer.isBuffer(body) && body.length <= MAX_FILE_BYTES);
  const header = Buffer.from(`HTTP/1.1 ${status} ${phrase}\r\nContent-Length: ${body.length}\r\nContent-Type: ${type}\r\n` +
    `Cache-Control: ${cache}\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n`, 'ascii');
  socket.end(head ? header : Buffer.concat([header, body]));
}

function processIdentity() {
  const raw = fs.readFileSync('/proc/self/stat', 'ascii'); const close = raw.lastIndexOf(')'); need(close > 0);
  const pid = Number(raw.slice(0, raw.indexOf(' '))); const fields = raw.slice(close + 2).split(' ');
  const pgid = Number(fields[2]); const sid = Number(fields[3]); need(pid === process.pid && pid === pgid && pid === sid);
  return [pid, pgid, sid];
}

export function writeReceipt(fd, port, root, owner) {
  need(Number.isInteger(fd) && fd >= 3 && Number.isInteger(port) && port > 0 && port < 65536);
  const before = fs.fstatSync(fd, { bigint: true });
  need(before.isFile() && mode(before) === 0o600 && before.uid === BigInt(process.geteuid()) &&
    before.gid === BigInt(process.getegid()) && before.nlink === 1n && before.size === 0n);
  const packet = Buffer.from(JSON.stringify({ dist_dev: safe(root.dev), dist_ino: safe(root.ino), host: HOST,
    pgid: owner[1], pid: owner[0], port, project_route: PROJECT_ROUTE,
    schema: 'compatible-full-app-static-server.v1', sid: owner[2] }), 'ascii');
  need(packet.length <= 1024); let offset = 0;
  while (offset < packet.length) { const count = fs.writeSync(fd, packet, offset, packet.length - offset); need(count > 0); offset += count; }
  fs.fsyncSync(fd); const after = fs.fstatSync(fd, { bigint: true });
  need(after.dev === before.dev && after.ino === before.ino && after.size === BigInt(packet.length) && mode(after) === 0o600 && after.nlink === 1n);
}

export async function serve(rootFd, receiptFd) {
  const began = Date.now(); const end = began + MAX_RUNTIME_MS; const snapshot = inventory(rootFd, Date.now, end);
  const owner = processIdentity(); let requests = 0; let stopping = false; let fatal = false; const sockets = new Set();
  const server = net.createServer(socket => {
    requests += 1; sockets.add(socket); socket.once('close', () => sockets.delete(socket));
    if (requests > MAX_REQUESTS || stopping || Date.now() >= end) { fatal = true; socket.destroy(); server.close(); return; }
    socket.setTimeout(2000); let raw = Buffer.alloc(0); let answered = false;
    const reject = () => { if (!answered) { answered = true; try { send(socket, 400, Buffer.from('bad request\n'), 'text/plain; charset=utf-8', 'no-store'); } catch { socket.destroy(); } } };
    socket.on('timeout', reject);
    socket.on('data', chunk => {
      if (answered) { socket.destroy(); return; }
      raw = Buffer.concat([raw, chunk], raw.length + chunk.length); if (raw.length > MAX_HEADER_BYTES) { reject(); return; }
      if (!raw.includes('\r\n\r\n')) return;
      try {
        const address = server.address(); need(address && typeof address === 'object'); const [method, target] = parseRequest(raw, address.port);
        const selected = route(target, snapshot.records);
        const body = selected ? readAsset(rootFd, snapshot, selected[0], Date.now, end) : Buffer.from('not found\n');
        answered = true;
        if (!selected) send(socket, 404, body, 'text/plain; charset=utf-8', 'no-store', method === 'HEAD');
        else send(socket, 200, body, selected[1], selected[2], method === 'HEAD');
      } catch { reject(); }
    });
    socket.on('error', () => { socket.destroy(); });
  });
  server.on('error', () => { fatal = true; for (const socket of sockets) socket.destroy(); });
  const close = () => { if (stopping) return; stopping = true; for (const socket of sockets) socket.destroy(); server.close(); };
  process.once('SIGTERM', close); process.once('SIGINT', close);
  const timer = setTimeout(() => { fatal = true; close(); }, MAX_RUNTIME_MS); timer.unref();
  try {
    await new Promise((resolve, reject) => {
      const refused = error => reject(error); server.once('error', refused);
      server.listen({ host: HOST, port: 0, backlog: 16, exclusive: true }, () => { server.removeListener('error', refused); resolve(); });
    });
    const address = server.address(); need(address && typeof address === 'object' && address.address === HOST && address.port > 0);
    writeReceipt(receiptFd, address.port, snapshot.root, owner);
    await new Promise(resolve => server.once('close', resolve));
    need(!fatal && same(fs.fstatSync(rootFd, { bigint: true }), snapshot.root)); return requests;
  } finally { clearTimeout(timer); process.removeListener('SIGTERM', close); process.removeListener('SIGINT', close); for (const socket of sockets) socket.destroy(); if (server.listening) server.close(); }
}

async function main() {
  try {
    need(process.env.CI === 'true' && process.env.COMPATIBLE_FULL_APP_NODE_STATIC_SERVER === '1' &&
      process.argv.length === 4 && /^[0-9]+$/.test(process.argv[2]) && /^[0-9]+$/.test(process.argv[3]));
    const count = await serve(Number(process.argv[2]), Number(process.argv[3]));
    console.log(`compatible-full-app-node-static-server CLOSED requests=${count} native_browser=false`); return 0;
  } catch { console.log('compatible-full-app-node-static-server FAIL fixed_refusal'); return 1; }
}

if (process.env.COMPATIBLE_FULL_APP_NODE_STATIC_SERVER === '1') process.exitCode = await main();
