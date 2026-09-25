import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const entry = resolve('server.mjs');
test('stickers API, persistence, authorization, limits and static isolation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sticker-test-'));
  await writeFile(join(root, 'index.html'), '<h1>ok</h1>');
  await writeFile(join(root, '.env'), 'private');
  await writeFile(join(root, 'server.mjs'), 'private');
  const password = 'test-admin-secret';
  const child = spawn(process.execPath, [entry], { cwd: root, env: { ...process.env, PORT: '0', ADMIN_PASSWORD: password }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
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
    const auth = { Authorization: `Bearer ${password}` };
    const post = text => request('/api/stickers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    assert.equal((await request('/')).status, 200);
    for (const path of ['/data/stickers.json', '/.env', '/.git/config', '/.pi/plan', '/server.mjs', '/%2eenv', '/%2e%2e/data/stickers.json', '/data%2fstickers.json']) {
      assert.equal((await request(path)).status, 404, path);
    }
    try {
      await symlink(join(root, '.env'), join(root, 'styles.css'));
      assert.equal((await request('/styles.css')).status, 404);
    } catch (error) { if (!['EPERM', 'EACCES'].includes(error.code)) throw error; }
    assert.equal((await request('/api/admin/stickers')).status, 401);
    assert.equal((await request('/api/admin/stickers', { headers: { Authorization: 'Bearer wrong' } })).status, 401);
    assert.equal((await post('First')).status, 201);
    assert.deepEqual(await (await request('/api/stickers')).json(), []);
    const queued = await (await request('/api/admin/stickers', { headers: auth })).json();
    assert.equal(queued.length, 1);
    assert.equal(queued[0].status, 'pending');
    assert.equal((await request(`/api/admin/stickers/${queued[0].id}/approve`, { method: 'POST' })).status, 401);
    assert.equal((await request(`/api/admin/stickers/${queued[0].id}/approve`, { method: 'POST', headers: auth })).status, 200);
    const approved = (await (await request('/api/stickers')).json())[0];
    assert.equal((await request(`/api/admin/stickers/${approved.id}/position`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x: 0.4, y: 0.7 }) })).status, 401);
    const moved = await request(`/api/admin/stickers/${approved.id}/position`, { method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ x: 0.4, y: 0.7 }) });
    assert.equal(moved.status, 200);
    assert.deepEqual((await (await request('/api/stickers')).json())[0].position, { x: 0.4, y: 0.7 });
    assert.equal((await request(`/api/admin/stickers/${approved.id}/position`, { method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ x: 2, y: -1 }) })).status, 400);
    assert.equal((await post('Second')).status, 201);
    const second = (await (await request('/api/admin/stickers', { headers: auth })).json())[0];
    assert.equal((await request(`/api/admin/stickers/${second.id}/reject`, { method: 'POST', headers: auth })).status, 200);
    assert.equal((await (await request('/api/stickers')).json()).length, 1);
    assert.equal((await post('Third')).status, 201);
    assert.equal((await post('Fourth')).status, 201);
    assert.equal((await post('Fifth')).status, 429);
    const saved = JSON.parse(await readFile(join(root, 'data', 'stickers.json'), 'utf8'));
    assert.equal(saved.length, 4);
    assert.deepEqual(saved.map(item => item.status), ['approved', 'rejected', 'pending', 'pending']);
  } finally {
    child.kill();
    await once(child, 'exit').catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});
