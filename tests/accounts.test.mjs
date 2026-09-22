import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';

const directory = await mkdtemp(join(tmpdir(), 'newsfeed-test-'));
const databasePath = join(directory, 'accounts.sqlite');
const port = 32187;
const base = `http://localhost:${port}`;
let server;
let output = '';
async function start() {
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
    env: { ...process.env, DATABASE_PATH: databasePath }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (data) => { output += data; });
  server.stderr.on('data', (data) => { output += data; });
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(output);
    try { if ((await fetch(`${base}/api/account`)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not start: ${output}`);
}
async function stop() {
  if (!server || server.exitCode !== null) return;
  const exited = new Promise((resolve) => server.once('exit', resolve));
  server.kill('SIGTERM');
  await exited;
}
async function request(path, { cookie, method = 'GET', body, origin } = {}) {
  const response = await fetch(`${base}${path}`, {
    method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(origin ? { Origin: origin } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') };
}

test('accounts persist feeds and viewing history while isolating users', async () => {
  const fixture = createServer((req, res) => {
    if (req.url.startsWith('/sorted-')) {
      const dates = req.url === '/sorted-a'
        ? ['invalid', '2026-09-22T12:00:01Z', '2026-09-22T12:00:59Z']
        : ['2026-09-22T08:00:30-04:00'];
      res.writeHead(200, { 'Content-Type': 'application/rss+xml' });
      res.end(`<rss><channel><title>Sorting</title>${dates.map((date) => `<item><title>${date}</title><guid>${date}</guid><pubDate>${date}</pubDate><description>${'Article content. '.repeat(100)}</description></item>`).join('')}</channel></rss>`);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/rss+xml' });
    res.end(`<rss><channel><title>Test</title><item><guid>stable-guid</guid><title>Story</title><link>https://example.com/story?utm_source=test</link><description>${'Article content. '.repeat(100)}</description></item></channel></rss>`);
  });
  await new Promise((resolve) => fixture.listen(0, '127.0.0.1', resolve));
  try {
    await start();
    for (const path of ['/api/feeds', '/api/articles']) assert.equal((await request(path)).status, 401);
    assert.equal((await request('/api/viewed', { method: 'POST', body: { articleId: 'x' } })).status, 401);
    assert.equal((await request('/api/narration', { method: 'POST', body: { text: 'x' } })).status, 401);
    assert.equal((await request('/api/account', { method: 'POST', body: { action: 'signup', email: 'a@example.com', password: 'short' } })).status, 400);
    const credentials = { email: 'A@example.com', password: 'a long test password' };
    const signup = await request('/api/account', { method: 'POST', body: { action: 'signup', ...credentials } });
    assert.equal(signup.status, 200);
    assert.equal(signup.data.user.email, 'a@example.com');
    assert.match(signup.cookie, /HttpOnly/i);
    assert.match(signup.cookie, /Secure/i);
    assert.match(signup.cookie, /SameSite=lax/i);
    const cookieA = signup.cookie.split(';')[0];
    assert.equal((await request('/api/account', { method: 'POST', body: { action: 'signup', ...credentials } })).status, 409);
    assert.equal((await request('/api/account', { method: 'POST', body: { action: 'login', ...credentials, password: 'wrong password value' } })).status, 401);
    const feeds = [{ kind: 'rss', value: `http://127.0.0.1:${fixture.address().port}/feed` }];
    assert.equal((await request('/api/feeds', { method: 'PUT', cookie: cookieA, body: { feeds }, origin: 'https://evil.example' })).status, 403);
    assert.equal((await request('/api/feeds', { method: 'PUT', cookie: cookieA, body: { feeds } })).status, 200);
    assert.equal((await request('/api/feeds', { method: 'PUT', cookie: cookieA, body: { feeds: [{ kind: 'rss', value: 'file:///etc/passwd' }] } })).status, 400);
    assert.deepEqual((await request('/api/feeds', { cookie: cookieA })).data.feeds, feeds);
    const first = await request('/api/articles', { cookie: cookieA });
    assert.equal(first.data.articles.length, 1);
    assert.equal(first.data.articles[0].id, 'https://example.com/story');
    assert.equal(first.data.articles[0].viewed, false);
    const articleId = first.data.articles[0].id;
    assert.equal((await request('/api/viewed', { cookie: cookieA, method: 'POST', body: { articleId } })).status, 200);
    assert.equal((await request('/api/viewed', { cookie: cookieA, method: 'POST', body: { articleId } })).status, 200);
    assert.equal((await request('/api/articles', { cookie: cookieA })).data.articles[0].viewed, true);
    const signupB = await request('/api/account', { method: 'POST', body: { action: 'signup', email: 'b@example.com', password: credentials.password } });
    const cookieB = signupB.cookie.split(';')[0];
    assert.deepEqual((await request('/api/feeds', { cookie: cookieB })).data.feeds, []);
    await request('/api/feeds', { method: 'PUT', cookie: cookieB, body: { feeds } });
    assert.equal((await request('/api/articles', { cookie: cookieB })).data.articles[0].viewed, false);
    const sortingFeeds = ['sorted-a', 'sorted-b'].map((path) => ({ kind: 'rss', value: `http://127.0.0.1:${fixture.address().port}/${path}` }));
    await request('/api/feeds', { method: 'PUT', cookie: cookieB, body: { feeds: sortingFeeds } });
    const sorted = (await request('/api/articles', { cookie: cookieB })).data.articles;
    assert.deepEqual(sorted.map((article) => article.title), [
      '2026-09-22T12:00:59Z', '2026-09-22T08:00:30-04:00', '2026-09-22T12:00:01Z', 'invalid',
    ]);
    await stop();
    await start();
    assert.deepEqual((await request('/api/feeds', { cookie: cookieA })).data.feeds, feeds);
    assert.equal((await request('/api/articles', { cookie: cookieA })).data.articles[0].viewed, true);
    await request('/api/account', { method: 'DELETE', cookie: cookieA });
    assert.equal((await request('/api/feeds', { cookie: cookieA })).status, 401);
    const login = await request('/api/account', { method: 'POST', body: { action: 'login', ...credentials } });
    assert.equal(login.status, 200);
    const cookieNew = login.cookie.split(';')[0];
    assert.equal((await request('/api/articles', { cookie: cookieNew })).data.articles[0].viewed, true);
    const database = new DatabaseSync(databasePath);
    const stored = database.prepare('SELECT password_hash FROM users WHERE email = ?').get('a@example.com');
    assert.notEqual(stored.password_hash, credentials.password);
    database.prepare('UPDATE sessions SET expires_at = 0').run();
    database.close();
    assert.equal((await request('/api/feeds', { cookie: cookieNew })).status, 401);
  } finally {
    await stop();
    await new Promise((resolve) => fixture.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
