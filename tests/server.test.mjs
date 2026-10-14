import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const entry = resolve('server.mjs');
const password = 'test-admin-secret';

async function startServer() {
  const root = await mkdtemp(join(tmpdir(), 'garden-test-'));
  await writeFile(join(root, 'index.html'), '<h1 data-edit="hero.title">ok</h1><script type="application/json" id="site-content">{}</script>');
  await writeFile(join(root, '.env'), 'private');
  await writeFile(join(root, 'server.mjs'), 'private');
  const child = spawn(process.execPath, [entry], { cwd: root, env: { ...process.env, PORT: '0', ADMIN_PASSWORD: password }, stdio: ['ignore', 'pipe', 'pipe'] });
  const port = await Promise.race([
    new Promise((ok, fail) => {
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/localhost:(\d+)/);
        if (match) ok(Number(match[1]));
      });
      child.on('exit', code => fail(new Error(`server exited: ${code}`)));
    }),
    new Promise((_, fail) => setTimeout(() => fail(new Error('server startup timeout')), 5000))
  ]);
  const request = (path, options = {}) => fetch(`http://127.0.0.1:${port}${path}`, options);
  const stop = async () => {
    child.kill();
    await once(child, 'exit').catch(() => {});
    await rm(root, { recursive: true, force: true });
  };
  return { root, request, stop };
}
const json = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('static isolation, removed guest notes and security headers', async () => {
  const { root, request, stop } = await startServer();
  try {
    const home = await request('/');
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(home.headers.get('x-frame-options'), 'DENY');
    for (const path of ['/data/content.json', '/data/music.json', '/.env', '/.git/config', '/.pi/plan', '/server.mjs', '/%2eenv', '/%2e%2e/data/content.json', '/data%2fcontent.json']) {
      assert.equal((await request(path)).status, 404, path);
    }
    try {
      await symlink(join(root, '.env'), join(root, 'styles.css'));
      assert.equal((await request('/styles.css')).status, 404);
    } catch (error) { if (!['EPERM', 'EACCES'].includes(error.code)) throw error; }
    // Visitors can no longer write anything: the guest-note API is gone.
    assert.equal((await request('/api/stickers')).status, 404);
    assert.equal((await request('/api/stickers', json({ text: 'hi' }))).status, 404);
    assert.equal((await request('/api/admin/stickers')).status, 404);
  } finally { await stop(); }
});

test('login issues a session token; content is validated, saved and embedded', async () => {
  const { root, request, stop } = await startServer();
  try {
    assert.equal((await request('/api/admin/login', json({ password: 'wrong' }))).status, 401);
    assert.equal((await request('/api/admin/login', { method: 'POST', body: 'x' })).status, 415);
    const login = await request('/api/admin/login', json({ password }));
    assert.equal(login.status, 200);
    const { token } = await login.json();
    assert.ok(token.length >= 40);
    const auth = { Authorization: `Bearer ${token}` };
    // The password itself is not a bearer credential.
    assert.equal((await request('/api/admin/session', { headers: { Authorization: `Bearer ${password}` } })).status, 401);
    assert.equal((await request('/api/admin/session', { headers: auth })).status, 200);

    assert.deepEqual(await (await request('/api/content')).json(), { texts: {}, links: {}, images: {}, updatedAt: null });
    const put = body => request('/api/admin/content', { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await request('/api/admin/content', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
    assert.equal((await put({ texts: { 'bad key!': 'x' } })).status, 400);
    assert.equal((await put({ texts: { 'hero.title': 5 } })).status, 400);
    assert.equal((await put({ links: { steam: 'javascript:alert(1)' } })).status, 400);
    assert.equal((await put({ images: { 'about.photo': { src: 'http://insecure.example/a.jpg' } } })).status, 400);
    assert.equal((await put({ texts: { 'hero.title': 'x'.repeat(4001) } })).status, 400);

    const saved = await put({ texts: { 'hero.title': 'Новый </script><b>сад</b>' }, links: { steam: 'https://example.com/me' }, images: { 'about.photo': { src: 'https://example.com/p.jpg', alt: 'фото' } } });
    assert.equal(saved.status, 200);
    const body = await saved.json();
    assert.equal(body.texts['hero.title'], 'Новый </script><b>сад</b>');
    assert.ok(body.updatedAt);
    assert.equal((await (await request('/api/content')).json()).links.steam, 'https://example.com/me');
    const stored = JSON.parse(await readFile(join(root, 'data', 'content.json'), 'utf8'));
    assert.equal(stored.images['about.photo'].alt, 'фото');

    // Saved text is embedded as inert JSON: no raw "<" can close the script tag.
    const html = await (await request('/')).text();
    const embedded = html.match(/<script type="application\/json" id="site-content">(.*?)<\/script>/s)[1];
    assert.ok(!embedded.includes('<'));
    assert.equal(JSON.parse(embedded).texts['hero.title'], 'Новый </script><b>сад</b>');

    assert.equal((await request('/api/admin/logout', { method: 'POST', headers: auth })).status, 200);
    assert.equal((await request('/api/admin/session', { headers: auth })).status, 401);
  } finally { await stop(); }
});

test('music library requires a session for changes', async () => {
  const { request, stop } = await startServer();
  try {
    const { token } = await (await request('/api/admin/login', json({ password }))).json();
    const auth = { Authorization: `Bearer ${token}` };
    const audio = Buffer.concat([Buffer.from('ID3'), Buffer.from('shared audio')]);
    const upload = headers => request('/api/admin/music', { method: 'POST', headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': audio.length, 'X-Track-Name': encodeURIComponent('общий трек.mp3'), ...headers }, body: audio });
    assert.equal((await upload({})).status, 401);
    assert.equal((await upload({ Authorization: `Bearer ${password}` })).status, 401);
    assert.deepEqual(await (await request('/api/music')).json(), []);
    const uploaded = await upload(auth);
    assert.equal(uploaded.status, 201);
    const track = await uploaded.json();
    assert.equal(track.name, 'общий трек.mp3');
    const file = await request(`/api/music/${track.id}`);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type'), 'audio/mpeg');
    assert.equal((await request(`/api/music/${track.id}`, { method: 'DELETE' })).status, 401);
    assert.deepEqual(await (await request('/api/music')).json(), [{ id: track.id, name: track.name, size: audio.length }]);
    assert.equal((await request(`/api/music/${track.id}`, { method: 'DELETE', headers: auth })).status, 200);
    assert.deepEqual(await (await request('/api/music')).json(), []);
    const notMp3 = await request('/api/admin/music', { method: 'POST', headers: { ...auth, 'Content-Type': 'audio/mpeg' }, body: Buffer.from('hello world') });
    assert.equal(notMp3.status, 400);
  } finally { await stop(); }
});

test('repeated wrong passwords are rate limited', async () => {
  const { request, stop } = await startServer();
  try {
    for (let attempt = 0; attempt < 8; attempt += 1) assert.equal((await request('/api/admin/login', json({ password: `nope-${attempt}` }))).status, 401);
    assert.equal((await request('/api/admin/login', json({ password }))).status, 429);
  } finally { await stop(); }
});
