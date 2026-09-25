import { createServer } from 'node:http';
import { open, readFile, mkdir, lstat, realpath, rename, unlink } from 'node:fs/promises';
import { resolve, extname, dirname } from 'node:path';
import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';

const root = await realpath(process.cwd());
const dataDir = resolve(root, 'data');
const dbFile = resolve(dataDir, 'stickers.json');
const port = Number(process.env.PORT || 3000);
const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminPassword || Buffer.byteLength(adminPassword) > 512) {
  console.error('Set a nonempty ADMIN_PASSWORD (at most 512 bytes) before starting the server.');
  process.exit(1);
}
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT');

// Do not follow a symlink into a different data directory or database file.
await mkdir(dataDir, { recursive: true });
async function checkDataPath() {
  if (!(await lstat(dataDir)).isDirectory() || await realpath(dataDir) !== dataDir) throw new Error('Unsafe data directory');
  try {
    if (!(await lstat(dbFile)).isFile() || await realpath(dbFile) !== dbFile) throw new Error('Unsafe database file');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
await checkDataPath();
try {
  const file = await open(dbFile, 'wx', 0o600);
  try { await file.writeFile('[]'); await file.sync(); } finally { await file.close(); }
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
}
await checkDataPath();

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};
// Only the files required by the site are public; no directory is browseable.
const publicFiles = new Set(['/index.html', '/styles.css', '/script.js']);
const send = (res, status, payload, headers = {}) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  res.end(JSON.stringify(payload));
};
const readItems = async () => {
  await checkDataPath();
  const items = JSON.parse(await readFile(dbFile, 'utf8'));
  if (!Array.isArray(items)) throw new Error('Invalid database');
  return items;
};
async function writeItems(items) {
  await checkDataPath();
  const temporary = resolve(dataDir, `.stickers-${randomUUID()}.tmp`);
  const file = await open(temporary, 'wx', 0o600);
  try {
    try { await file.writeFile(JSON.stringify(items, null, 2)); await file.sync(); }
    finally { await file.close(); }
    await checkDataPath();
    await rename(temporary, dbFile);
    // Directory sync is supported on POSIX; Windows does not allow opening directories.
    if (process.platform !== 'win32') {
      const dir = await open(dataDir, 'r');
      try { await dir.sync(); } finally { await dir.close(); }
    }
  } finally {
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}
// Serialize each read-modify-write, including failed writes, without poisoning the queue.
let writeQueue = Promise.resolve();
function mutate(change) {
  const operation = writeQueue.then(async () => {
    const items = await readItems();
    const result = change(items);
    if (result !== false) await writeItems(items);
    return result;
  });
  writeQueue = operation.then(() => {}, () => {});
  return operation;
}
const expectedHash = createHash('sha256').update(adminPassword).digest();
function authorized(req) {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ') || Buffer.byteLength(header) > 519) return false;
  return timingSafeEqual(createHash('sha256').update(header.slice(7)).digest(), expectedHash);
}
function body(req) {
  return new Promise((resolveBody, reject) => {
    let bytes = 0;
    const chunks = [];
    const cleanup = () => {
      req.off('data', onData); req.off('end', onEnd);
      req.off('error', onError); req.off('aborted', onAborted);
    };
    const fail = error => { cleanup(); req.pause(); reject(error); };
    const onError = () => fail(new Error('invalid-json'));
    const onAborted = () => fail(new Error('invalid-json'));
    const onData = chunk => {
      bytes += chunk.length;
      if (bytes > 5000) return fail(new Error('too-large'));
      chunks.push(chunk);
    };
    const onEnd = () => {
      cleanup();
      try { resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('invalid-json')); }
    };
    req.on('data', onData); req.on('end', onEnd);
    req.on('error', onError); req.on('aborted', onAborted);
  });
}
const submissions = new Map();
const loginAttempts = new Map();
function rateLimited(map, ip, limit, windowMs) {
  const now = Date.now();
  // Prune expired keys so random IPs cannot grow memory indefinitely.
  for (const [key, times] of map) {
    const recent = times.filter(time => now - time < windowMs);
    if (recent.length) map.set(key, recent); else map.delete(key);
  }
  if (!map.has(ip) && map.size >= 10000) return true;
  const recent = map.get(ip) || [];
  if (recent.length >= limit) return true;
  recent.push(now);
  map.set(ip, recent);
  return false;
}

const server = createServer(async (req, res) => {
  try {
    // WHATWG URL normalizes dot segments; an exact static allowlist below prevents traversal.
    const url = new URL(req.url, 'http://localhost');
    const ip = req.socket.remoteAddress || 'unknown'; // Never trust client-supplied X-Forwarded-For.
    const path = url.pathname;
    if (path === '/api/stickers' && req.method === 'GET') {
      const items = await readItems();
      return send(res, 200, items.filter(item => item.status === 'approved')
        .map(({ id, text, createdAt, position }) => ({ id, text, createdAt, position })));
    }
    if (path === '/api/stickers' && req.method === 'POST') {
      if (rateLimited(submissions, ip, 4, 60_000)) return send(res, 429, { error: 'Попробуй отправить записку позже.' });
      if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') return send(res, 415, { error: 'Ожидается JSON.' });
      if (Number(req.headers['content-length']) > 5000) return send(res, 413, { error: 'Некорректный запрос.' }, { Connection: 'close' });
      const data = await body(req);
      const text = typeof data?.text === 'string' ? data.text.trim().slice(0, 180) : '';
      if (!text) return send(res, 400, { error: 'Напиши текст стикера.' });
      await mutate(items => items.push({ id: randomUUID(), text, status: 'pending', createdAt: new Date().toISOString() }));
      return send(res, 201, { message: 'Записка отправлена на модерацию.' });
    }
    const move = path.match(/^\/api\/admin\/stickers\/([\w-]+)\/position$/);
    if (move && req.method === 'PATCH') {
      if (!authorized(req)) return send(res, 401, { error: 'Unauthorized' }, { 'WWW-Authenticate': 'Bearer' });
      if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') return send(res, 415, { error: 'Ожидается JSON.' });
      const data = await body(req);
      if (!Number.isFinite(data?.x) || !Number.isFinite(data?.y) || data.x < 0 || data.x > 1 || data.y < 0 || data.y > 1) return send(res, 400, { error: 'Некорректная позиция.' });
      const found = await mutate(items => {
        const item = items.find(candidate => candidate.id === move[1] && candidate.status === 'approved');
        if (!item) return false;
        item.position = { x: data.x, y: data.y };
        return true;
      });
      return found ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Стикер не найден.' });
    }
    const action = path.match(/^\/api\/admin\/stickers\/([\w-]+)\/(approve|reject)$/);
    if ((path === '/api/admin/stickers' && req.method === 'GET') || (action && req.method === 'POST')) {
      if (rateLimited(loginAttempts, ip, 10, 15 * 60_000)) return send(res, 429, { error: 'Too many requests' });
      if (!authorized(req)) return send(res, 401, { error: 'Unauthorized' }, { 'WWW-Authenticate': 'Bearer' });
      if (!action) return send(res, 200, (await readItems()).filter(item => item.status === 'pending'));
      const found = await mutate(items => {
        const item = items.find(candidate => candidate.id === action[1] && candidate.status === 'pending');
        if (!item) return false;
        item.status = action[2] === 'approve' ? 'approved' : 'rejected';
        item.moderatedAt = new Date().toISOString();
        return true;
      });
      return found ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Записка не найдена.' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' });
    const requested = path === '/' ? '/index.html' : path;
    if (!publicFiles.has(requested)) return send(res, 404, { error: 'Not found' });
    const file = resolve(root, `.${requested}`);
    try {
      if (!(await lstat(file)).isFile() || dirname(await realpath(file)) !== root) return send(res, 404, { error: 'Not found' });
      const bytes = await readFile(file);
      res.writeHead(200, { 'Content-Type': mime[extname(file)], 'X-Content-Type-Options': 'nosniff' });
      return res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch { return send(res, 404, { error: 'Not found' }); }
  } catch (error) {
    const status = error.message === 'too-large' ? 413 : error.message === 'invalid-json' ? 400 : 500;
    return send(res, status, { error: status === 500 ? 'Ошибка сервера.' : 'Некорректный запрос.' },
      status === 413 ? { Connection: 'close' } : {});
  }
});
server.requestTimeout = 10_000;
server.headersTimeout = 10_000;
server.listen(port, () => console.log(`flowertalker listening on http://localhost:${server.address().port}`));
