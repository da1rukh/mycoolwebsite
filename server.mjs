import { createServer } from 'node:http';
import { open, readFile, mkdir, lstat, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { resolve, extname, dirname } from 'node:path';
import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'node:crypto';

const root = await realpath(process.cwd());
const dataDir = resolve(root, 'data');
const musicDir = resolve(dataDir, 'music');
const musicDb = resolve(dataDir, 'music.json');
const contentDb = resolve(dataDir, 'content.json');
const port = Number(process.env.PORT || 3000);
const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminPassword || Buffer.byteLength(adminPassword) > 512) {
  console.error('Set a nonempty ADMIN_PASSWORD (at most 512 bytes) before starting the server.');
  process.exit(1);
}
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT');

// Do not follow a symlink into a different data directory or data file.
async function checkPath(path, kind) {
  try {
    const stat = await lstat(path);
    if (!(kind === 'dir' ? stat.isDirectory() : stat.isFile()) || await realpath(path) !== path) throw new Error(`Unsafe data path: ${path}`);
  } catch (error) {
    if (error.code !== 'ENOENT' || kind === 'dir') throw error;
  }
}
async function checkDataPaths() {
  await checkPath(dataDir, 'dir');
  await checkPath(musicDir, 'dir');
  await checkPath(musicDb, 'file');
  await checkPath(contentDb, 'file');
}
await mkdir(dataDir, { recursive: true });
await checkPath(dataDir, 'dir');
await mkdir(musicDir, { recursive: true });
await checkDataPaths();
for (const [file, initial] of [[musicDb, '[]'], [contentDb, '{"texts":{},"links":{},"images":{}}']]) {
  try { await writeFile(file, initial, { flag: 'wx', mode: 0o600 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
}
await checkDataPaths();

async function readJson(file) {
  await checkDataPaths();
  return JSON.parse(await readFile(file, 'utf8'));
}
async function writeJson(file, value) {
  await checkDataPaths();
  const temporary = resolve(dataDir, `.write-${randomUUID()}.tmp`);
  const handle = await open(temporary, 'wx', 0o600);
  try {
    try { await handle.writeFile(JSON.stringify(value, null, 2)); await handle.sync(); }
    finally { await handle.close(); }
    await checkDataPaths();
    await rename(temporary, file);
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
function serialized(task) {
  const operation = writeQueue.then(task);
  writeQueue = operation.then(() => {}, () => {});
  return operation;
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml'
};
// Only the files required by the site are public; no directory is browseable.
const publicFiles = new Set(['/index.html', '/styles.css', '/script.js', '/admin.js', '/admin.css', '/favicon.svg']);
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' https: data:",
    "media-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join('; ')
};
const send = (res, status, payload, headers = {}) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...securityHeaders,
    ...headers
  });
  res.end(JSON.stringify(payload));
};

// Password is exchanged once for a random session token; the password itself never travels again.
const expectedHash = createHash('sha256').update(adminPassword).digest();
const sessions = new Map();
const SESSION_TTL = 12 * 60 * 60_000;
function passwordMatches(candidate) {
  if (typeof candidate !== 'string' || Buffer.byteLength(candidate) > 512) return false;
  return timingSafeEqual(createHash('sha256').update(candidate).digest(), expectedHash);
}
function bearer(req) {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ') || header.length > 200) return '';
  return header.slice(7);
}
function authorized(req) {
  const token = bearer(req);
  const expires = token && sessions.get(token);
  if (!expires) return false;
  if (expires < Date.now()) { sessions.delete(token); return false; }
  return true;
}

function body(req, limit) {
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
      if (bytes > limit) return fail(new Error('too-large'));
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
const isJson = req => req.headers['content-type']?.split(';')[0].trim().toLowerCase() === 'application/json';

const loginFailures = new Map();
function rateLimited(map, ip, limit, windowMs, record) {
  const now = Date.now();
  // Prune expired keys so random IPs cannot grow memory indefinitely.
  for (const [key, times] of map) {
    const recent = times.filter(time => now - time < windowMs);
    if (recent.length) map.set(key, recent); else map.delete(key);
  }
  const recent = map.get(ip) || [];
  if (recent.length >= limit || (!map.has(ip) && map.size >= 10000)) return true;
  if (record) { recent.push(now); map.set(ip, recent); }
  return false;
}

// Site text is plain text rendered with textContent; links and images only accept safe URL schemes.
const KEY = /^[a-z0-9][\w.-]{0,79}$/i;
const MAX_TEXT = 4000;
function safeUrl(value, kinds) {
  if (typeof value !== 'string' || value.length > 2000) return null;
  const trimmed = value.trim();
  if (trimmed === '') return '';
  if (kinds.includes('anchor') && /^#[\w-]{1,80}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol === 'https:' || (kinds.includes('http') && url.protocol === 'http:') || (kinds.includes('mailto') && url.protocol === 'mailto:')) return url.href;
  } catch {}
  return null;
}
function validateContent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Неверный формат содержимого.');
  const result = { texts: {}, links: {}, images: {} };
  const entries = (value, name) => {
    if (value === undefined) return [];
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Раздел «${name}» должен быть объектом.`);
    const list = Object.entries(value);
    if (list.length > 600) throw new Error('Слишком много полей.');
    for (const [key] of list) if (!KEY.test(key)) throw new Error(`Недопустимый ключ: ${key.slice(0, 40)}`);
    return list;
  };
  for (const [key, value] of entries(input.texts, 'texts')) {
    if (typeof value !== 'string' || value.length > MAX_TEXT) throw new Error(`Текст «${key}» слишком длинный или не строка.`);
    result.texts[key] = value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
  }
  for (const [key, value] of entries(input.links, 'links')) {
    const url = safeUrl(value, ['http', 'mailto', 'anchor']);
    if (url === null) throw new Error(`Ссылка «${key}» должна начинаться с https://, http://, mailto: или #.`);
    result.links[key] = url;
  }
  for (const [key, value] of entries(input.images, 'images')) {
    if (!value || typeof value !== 'object') throw new Error(`Картинка «${key}» задана неверно.`);
    const src = safeUrl(value.src ?? '', []);
    if (src === null) throw new Error(`Адрес картинки «${key}» должен начинаться с https://.`);
    if (value.alt !== undefined && (typeof value.alt !== 'string' || value.alt.length > 300)) throw new Error(`Описание картинки «${key}» слишком длинное.`);
    result.images[key] = { src, alt: (value.alt ?? '').replace(/[\u0000-\u001f\u007f]/g, '') };
  }
  return result;
}
async function readContent() {
  const stored = await readJson(contentDb);
  return { texts: stored.texts || {}, links: stored.links || {}, images: stored.images || {}, updatedAt: stored.updatedAt || null };
}
// Embed saved content into the page so the first paint already shows the owner's text.
async function renderIndex() {
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  let content = { texts: {}, links: {}, images: {} };
  try { content = await readContent(); } catch (error) { console.error('Could not read content:', error.message); }
  const json = JSON.stringify(content).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return html.replace('<script type="application/json" id="site-content">{}</script>', () => `<script type="application/json" id="site-content">${json}</script>`);
}

const server = createServer(async (req, res) => {
  try {
    // WHATWG URL normalizes dot segments; an exact static allowlist below prevents traversal.
    const url = new URL(req.url, 'http://localhost');
    const ip = req.socket.remoteAddress || 'unknown'; // Never trust client-supplied X-Forwarded-For.
    const path = url.pathname;

    if (path === '/api/admin/login' && req.method === 'POST') {
      if (rateLimited(loginFailures, ip, 8, 15 * 60_000, false)) return send(res, 429, { error: 'Слишком много попыток. Подожди 15 минут.' });
      if (!isJson(req)) return send(res, 415, { error: 'Ожидается JSON.' });
      const data = await body(req, 2000);
      if (!passwordMatches(data?.password)) {
        rateLimited(loginFailures, ip, 8, 15 * 60_000, true);
        return send(res, 401, { error: 'Неверный пароль.' });
      }
      const now = Date.now();
      for (const [token, expires] of sessions) if (expires < now) sessions.delete(token);
      if (sessions.size > 50) sessions.delete(sessions.keys().next().value);
      const token = randomBytes(32).toString('base64url');
      sessions.set(token, now + SESSION_TTL);
      return send(res, 200, { token, expiresAt: new Date(now + SESSION_TTL).toISOString() });
    }
    if (path === '/api/admin/logout' && req.method === 'POST') {
      sessions.delete(bearer(req));
      return send(res, 200, { ok: true });
    }
    if (path === '/api/admin/session' && req.method === 'GET') {
      return authorized(req) ? send(res, 200, { ok: true }) : send(res, 401, { error: 'Сессия истекла.' }, { 'WWW-Authenticate': 'Bearer' });
    }

    if (path === '/api/content' && req.method === 'GET') return send(res, 200, await readContent());
    if (path === '/api/admin/content' && req.method === 'PUT') {
      if (!authorized(req)) return send(res, 401, { error: 'Сессия истекла. Войди заново.' }, { 'WWW-Authenticate': 'Bearer' });
      if (!isJson(req)) return send(res, 415, { error: 'Ожидается JSON.' });
      if (Number(req.headers['content-length']) > 400_000) return send(res, 413, { error: 'Слишком большой объём текста.' }, { Connection: 'close' });
      const data = await body(req, 400_000);
      let content;
      try { content = validateContent(data); } catch (error) { return send(res, 400, { error: error.message }); }
      content.updatedAt = new Date().toISOString();
      await serialized(() => writeJson(contentDb, content));
      return send(res, 200, content);
    }

    if (path === '/api/music' && req.method === 'GET') return send(res, 200, (await readJson(musicDb)).map(({ id, name, size }) => ({ id, name, size })));
    const musicFile = path.match(/^\/api\/music\/([\w-]+)$/);
    if (musicFile && req.method === 'GET') {
      const track = (await readJson(musicDb)).find(item => item.id === musicFile[1]);
      if (!track) return send(res, 404, { error: 'Трек не найден.' });
      const bytes = await readFile(resolve(musicDir, `${track.id}.mp3`));
      res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': bytes.length, 'Cache-Control': 'public, max-age=3600', 'Accept-Ranges': 'none', ...securityHeaders });
      return res.end(bytes);
    }
    if ((path === '/api/admin/music' && req.method === 'POST') || (musicFile && req.method === 'DELETE')) {
      if (!authorized(req)) return send(res, 401, { error: 'Сессия истекла. Войди заново.' }, { 'WWW-Authenticate': 'Bearer' });
      if (path === '/api/admin/music') {
        const max = 15 * 1024 * 1024, size = Number(req.headers['content-length']);
        if (!Number.isInteger(size) || size < 1 || size > max) return send(res, 413, { error: 'MP3 должен быть не больше 15 МБ.' }, { Connection: 'close' });
        if (req.headers['content-type'] !== 'audio/mpeg') return send(res, 415, { error: 'Ожидается MP3.' });
        const chunks = []; let total = 0;
        for await (const chunk of req) { total += chunk.length; if (total > max) return send(res, 413, { error: 'Файл больше 15 МБ.' }, { Connection: 'close' }); chunks.push(chunk); }
        const bytes = Buffer.concat(chunks);
        if (!(bytes.subarray(0, 3).toString() === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0))) return send(res, 400, { error: 'Файл не похож на MP3.' });
        let name = 'Трек.mp3';
        try { name = decodeURIComponent(req.headers['x-track-name'] || name); } catch {}
        name = name.replace(/[\\/\x00-\x1f\x7f]/g, '').slice(0, 120) || 'Трек.mp3';
        const id = randomUUID();
        await writeFile(resolve(musicDir, `${id}.mp3`), bytes, { flag: 'wx', mode: 0o600 });
        await serialized(async () => { const tracks = await readJson(musicDb); tracks.push({ id, name, size: bytes.length }); await writeJson(musicDb, tracks); });
        return send(res, 201, { id, name, size: bytes.length });
      }
      const removed = await serialized(async () => {
        const tracks = await readJson(musicDb), index = tracks.findIndex(item => item.id === musicFile[1]);
        if (index < 0) return false;
        tracks.splice(index, 1);
        await writeJson(musicDb, tracks);
        return true;
      });
      if (!removed) return send(res, 404, { error: 'Трек не найден.' });
      await unlink(resolve(musicDir, `${musicFile[1]}.mp3`)).catch(error => { if (error.code !== 'ENOENT') throw error; });
      return send(res, 200, { ok: true });
    }

    if (path.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' });
    const requested = path === '/' ? '/index.html' : path;
    if (!publicFiles.has(requested)) return send(res, 404, { error: 'Not found' });
    const file = resolve(root, `.${requested}`);
    try {
      if (!(await lstat(file)).isFile() || dirname(await realpath(file)) !== root) return send(res, 404, { error: 'Not found' });
      const bytes = requested === '/index.html' ? Buffer.from(await renderIndex()) : await readFile(file);
      res.writeHead(200, { 'Content-Type': mime[extname(file)], 'Cache-Control': requested === '/index.html' ? 'no-cache' : 'public, max-age=300', ...securityHeaders });
      return res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch { return send(res, 404, { error: 'Not found' }); }
  } catch (error) {
    const status = error.message === 'too-large' ? 413 : error.message === 'invalid-json' ? 400 : 500;
    if (status === 500) console.error(error);
    return send(res, status, { error: status === 500 ? 'Ошибка сервера.' : 'Некорректный запрос.' },
      status === 413 ? { Connection: 'close' } : {});
  }
});
server.requestTimeout = 60_000;
server.headersTimeout = 10_000;
server.listen(port, () => console.log(`flowertalker listening on http://localhost:${server.address().port}`));
