// Real Chromium against the production bundle. Every HTTP request is intercepted; providers never receive traffic.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const dist = fileURLToPath(new URL('../studio/dist/', import.meta.url));
let browser;
test.before(async () => { browser = await chromium.launch(); });
test.after(async () => { await browser?.close(); });
const until = async condition => {
  for (let i = 0; i < 250; i++) { if (condition()) return; await new Promise(r => setTimeout(r, 20)); }
  assert.ok(condition(), 'Timed out waiting for test condition');
};
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const job = (id, status, startedAt, kind = 'publish') => ({ id, kind, target: 'fixture', status, startedAt, endedAt: status === 'running' ? null : startedAt + 1, error: status === 'failed' ? 'First attempt failed' : null, result: null, last: null });

async function fixture(t, platform = 'youtube') {
  const context = await browser.newContext();
  t.after(() => context.close());
  await context.addInitScript(() => {
    window.EventSource = class extends EventTarget {
      constructor() { super(); window.__events = this; }
      close() {}
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'browser runtime errors'));
  const channel = { id: 'fixture', name: 'Fixture channel', series: 'series/test', language: 'en', audience: '', voice: '', hashtags: { always: [], pool: [] }, schedule: ['12:00'], approval: 'ask', color: null, openedAt: null, platforms: { [platform]: { label: platform === 'youtube' ? 'YouTube' : 'X', state: 'ready', connected: { id: '10', title: '@fixture' }, needs: [], privacy: 'public', madeForKids: false, syntheticMedia: false } } };
  const detail = { slug: 'fixture', title: 'Fixture episode', series: 'series/test', channel: 'fixture', meta: { youtube: { title: 'Old title', description: 'Description' }, x: { text: 'Old X text' } }, render: { file: 'final.mp4', duration: 10, width: 1080, height: 1920, bytes: 100 }, todo: [platform], posts: {}, lines: [], checks: { channel: 'fixture', platforms: { [platform]: { state: 'ready', errors: [], warnings: [], issues: [] } } }, jobs: [] };
  const f = { page, detail, jobs: [], saves: [], posts: [], pieceReads: 0, saveHook: async () => 200 };
  const row = () => ({ ...detail, meta: true });
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname;
    if (url.origin !== 'http://studio.test') return route.abort();
    const json = (value, status = 200) => route.fulfill({ status, json: value });
    if (p === '/api/state') return json({ channels: [channel], pieces: [row()], jobs: f.jobs, googleKey: true, tiktokApp: false, xApp: true });
    if (p === '/api/pieces/fixture') { f.pieceReads++; return json(detail); }
    if (p.endsWith('/check')) return json(detail.checks);
    if (p.endsWith('/meta')) {
      const meta = req.postDataJSON().meta;
      f.saves.push(meta);
      const status = await f.saveHook(meta, f.saves.length);
      if (status !== 200) return json({ error: 'Synthetic save failure' }, status);
      detail.meta = structuredClone(meta);
      return json({ meta: detail.meta, checks: detail.checks });
    }
    if (p.endsWith('/publish')) { f.posts.push({ request: req.postDataJSON(), meta: structuredClone(detail.meta) }); return json(job('sent', 'done', 100)); }
    if (p.endsWith('/next-slot')) return json({ youtube: new Date(Date.now() + 86400000).toISOString() });
    if (p.endsWith('/refresh')) return json({ changed: 0 });
    if (p === '/api/batch' || p === '/api/stats') return json([]);
    if (p.startsWith('/api/')) return json({ error: `Unexpected fixture endpoint ${p}` }, 500);
    if (p.startsWith('/media/')) return route.fulfill({ status: 204 });
    const file = p.startsWith('/assets/') ? path.join(dist, p) : path.join(dist, 'index.html');
    return route.fulfill({ path: file, contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : undefined });
  });
  f.emit = (type, data) => page.evaluate(({ type, data }) => window.__events.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) })), { type, data });
  await page.goto('http://studio.test/ep/fixture');
  await page.getByLabel('YouTube title', { exact: true }).waitFor();
  return f;
}

for (const platform of ['youtube', 'x']) test(`top Publish tab flushes fresh ${platform} text before allowing an explicit publish`, async t => {
  const f = await fixture(t, platform);
  await f.page.getByLabel(platform === 'youtube' ? 'YouTube title' : 'X post text', { exact: true }).fill('Just typed');
  await f.page.getByRole('tab', { name: 'Publish', exact: true }).click();
  await f.page.getByRole('button', { name: 'Publish now', exact: true }).click();
  await until(() => f.posts.length === 1);
  assert.equal(platform === 'youtube' ? f.posts[0].meta.youtube.title : f.posts[0].meta.x.text, 'Just typed');
  assert.equal(f.saves.length, 1);
});

for (const recovery of ['hello', 'state']) test(`Channels recovers a missed connect completion through ${recovery} snapshots`, async t => {
  const f = await fixture(t, 'x');
  const connecting = { ...job('connect', 'running', 100, 'connect'), target: 'fixture/x' };
  f.jobs = [connecting];
  await f.page.goto('http://studio.test/channels');
  await f.page.getByText('Complete sign-in in your browser.', { exact: true }).waitFor();
  assert.equal(await f.page.getByRole('button', { name: 'Reconnect', exact: true }).isDisabled(), true);
  f.jobs = [{ ...connecting, status: 'done', endedAt: 101 }];
  if (recovery === 'hello') await f.emit('hello', { jobs: f.jobs });
  else await f.emit('job', { job: 'stats', kind: 'stats', target: 'all', type: 'finished', at: 110, status: 'done' });
  await f.page.getByText('Complete sign-in in your browser.', { exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await f.page.getByRole('button', { name: 'Reconnect', exact: true }).isEnabled(), true);
});

test('an in-flight autosave cannot mark newer edits saved or allow the tab to publish stale text', async t => {
  const f = await fixture(t), held = deferred();
  f.saveHook = async (_, n) => { if (n === 1) await held.promise; return 200; };
  await f.page.getByLabel('YouTube title', { exact: true }).fill('First revision');
  await until(() => f.saves.length === 1);
  await f.page.getByLabel('YouTube title', { exact: true }).fill('Newest revision');
  await f.page.getByRole('tab', { name: 'Publish', exact: true }).click();
  assert.equal(await f.page.getByRole('tab', { name: 'Text', exact: true }).getAttribute('aria-selected'), 'true');
  assert.equal(await f.page.getByRole('tab', { name: 'Publish', exact: true }).isDisabled(), true);
  held.resolve();
  await f.page.getByRole('button', { name: 'Publish now', exact: true }).click();
  await until(() => f.posts.length === 1);
  assert.deepEqual(f.saves.map(s => s.youtube.title), ['First revision', 'Newest revision']);
  assert.equal(f.posts[0].meta.youtube.title, 'Newest revision');
});

test('failed flush keeps the editor and typed text; Continue retries the same draft', async t => {
  const f = await fixture(t);
  f.saveHook = async (_, n) => n === 1 ? 500 : 200;
  await f.page.getByLabel('YouTube title', { exact: true }).fill('Preserve this draft');
  await f.page.getByRole('tab', { name: 'Publish', exact: true }).click();
  await f.page.getByText('Could not save', { exact: true }).waitFor();
  assert.equal(await f.page.getByLabel('YouTube title', { exact: true }).inputValue(), 'Preserve this draft');
  assert.equal(await f.page.getByRole('tab', { name: 'Text', exact: true }).getAttribute('aria-selected'), 'true');
  assert.equal(f.posts.length, 0);
  await f.page.getByRole('button', { name: 'Continue to publishing' }).click();
  await f.page.getByRole('button', { name: 'Publish now', exact: true }).waitFor();
  assert.equal(f.saves.length, 2);
});

test('private test selection clears a chosen time and disables scheduling controls', async t => {
  const f = await fixture(t);
  await f.page.getByRole('tab', { name: 'Publish', exact: true }).click();
  await f.page.getByText('Choose', { exact: true }).click();
  await f.page.getByLabel('Publication date and time').fill('2030-01-01T12:00');
  await f.page.getByLabel('Send as private for a test').check();
  assert.equal(await f.page.getByRole('radio', { name: 'Choose', exact: false }).isDisabled(), true);
  assert.equal(await f.page.getByRole('radio', { name: 'Next slot', exact: false }).isDisabled(), true);
  assert.equal(await f.page.getByRole('radio', { name: 'Now', exact: false }).isChecked(), true);
  await f.page.getByRole('button', { name: 'Publish now', exact: true }).click();
  await until(() => f.posts.length === 1);
  assert.equal(f.posts[0].request.at, null);
  assert.equal(f.posts[0].request.privacy, 'private');
});

test('SSE reconnect reconciles completed jobs, invalidates the piece and clears an earlier failure', async t => {
  const f = await fixture(t, 'x');
  await f.page.getByRole('tab', { name: 'Publish', exact: true }).click();
  const event = (id, type, at, extra = {}) => ({ job: id, kind: 'publish', target: 'fixture', type, at, ...extra });
  await f.emit('job', event('old', 'started', 1));
  await f.emit('job', event('old', 'finished', 2, { status: 'failed', error: 'First attempt failed' }));
  await f.page.getByRole('alert').filter({ hasText: 'First attempt failed' }).waitFor();
  await f.emit('job', event('new', 'started', 10));
  await f.page.getByRole('button', { name: 'Stop upload' }).waitFor();
  assert.match(await f.page.locator('#panel-publish').innerText(), /1 destination/);
  await f.emit('error', {});
  const reads = f.pieceReads;
  f.jobs = [job('old', 'failed', 1), job('new', 'done', 10)];
  await f.emit('hello', { jobs: f.jobs });
  await f.page.getByRole('button', { name: 'Publish now', exact: true }).waitFor();
  await until(() => f.pieceReads > reads);
  assert.equal(await f.page.getByRole('alert').count(), 0);
  // A stale snapshot cannot bring the finished upload back to life.
  await f.emit('hello', { jobs: [job('new', 'running', 10)] });
  assert.equal(await f.page.getByRole('button', { name: 'Publish now', exact: true }).isEnabled(), true);
  f.detail.posts = { 'fixture/x': { platform: 'x', channel: 'fixture', status: 'public', id: '30', url: 'https://x.com/i/status/30', postedAt: new Date().toISOString(), title: 'Fixture', warning: null, stats: null } };
  f.detail.todo = [];
  await f.page.goto('http://studio.test/');
  await f.page.getByText('Fixture episode', { exact: true }).waitFor();
  assert.doesNotMatch(await f.page.locator('main').innerText(), /Failed/);
});

test('recovered X posts expose an English remote-deletion confirmation', async t => {
  const f = await fixture(t, 'x');
  f.detail.posts = { 'fixture/x': { platform: 'x', channel: 'fixture', status: 'posted', id: '30', url: 'https://x.com/i/status/30', postedAt: new Date().toISOString(), warning: 'Recovered X post. Open it to verify account visibility.' } };
  f.detail.todo = [];
  await f.page.reload();
  await f.page.getByRole('tab', { name: 'Publish', exact: true }).click();
  await f.page.getByRole('button', { name: 'Delete', exact: true }).click();
  await f.page.getByRole('alertdialog', { name: 'Delete from X', exact: true }).waitFor();
  assert.match(await f.page.locator('#panel-publish').innerText(), /Delete from X/);
  assert.doesNotMatch(await f.page.locator('#panel-publish').innerText(), /Delete do|destino|upload interrupted/);
  assert.equal(await f.page.getByRole('link', { name: 'Open', exact: true }).getAttribute('href'), 'https://x.com/i/status/30');
});
