import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { authorizeLoopback } from '../tools/lib/oauth.mjs';
import { claudeCommand } from '../tools/lib/writer.mjs';
import { PLATFORMS } from '../tools/lib/platforms.mjs';
import { publish, nextSlot } from '../tools/lib/publisher.mjs';
import { probe, resolvePiece, readJson, stateFile, writeJson } from '../tools/lib/store.mjs';

process.env.ANIMATE_NO_BROWSER = '1';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'animate-studio-tests-'));
const pieceDir = path.join(temp, 'pieces', 'fixture');
const secretDir = path.join(temp, 'secrets');
fs.mkdirSync(path.join(pieceDir, 'renders'), { recursive: true });
writeJson(path.join(temp, 'publish', 'channels.json'), { channels: { fixture: { name: 'Fixture', series: 'series/fixture', platforms: { x: { account: 'fixture' } }, schedule: ['12:00'] } } });
writeJson(path.join(pieceDir, 'piece.json'), { title: 'Fixture video', series: 'series/fixture' });
writeJson(path.join(pieceDir, 'publish', 'meta.json'), { x: { text: 'Fixture video' } });
const videoFile = path.join(pieceDir, 'renders', 'final.mp4');
const encoded = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=64x64:r=24:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', '-y', videoFile], { encoding: 'utf8', windowsHide: true });
assert.equal(encoded.status, 0, encoded.stderr || encoded.error?.message);
const piece = resolvePiece(pieceDir, temp);
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

async function freePort() {
  const server = net.createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
test('OAuth callback verifies path and state, uses S256 and closes its listener', async () => {
  const port = await freePort();
  let called;
  const ready = new Promise(resolve => { called = resolve; });
  const pending = authorizeLoopback({ authEndpoint: 'https://x.com/i/oauth2/authorize', clientId: 'fixture', scopes: ['tweet.write'], redirectUri: `http://127.0.0.1:${port}/callback`, onUrl: called });
  const url = new URL(await ready);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  const redirect = url.searchParams.get('redirect_uri');
  assert.equal((await fetch(`${redirect}?code=fake&state=wrong`)).status, 400);
  assert.equal((await fetch(`http://127.0.0.1:${port}/wrong?code=fake&state=${url.searchParams.get('state')}`)).status, 404);
  const callback = fetch(`${redirect}?code=fake&state=${url.searchParams.get('state')}`);
  const result = await pending;
  await callback;
  assert.equal(crypto.createHash('sha256').update(result.verifier).digest('base64url'), url.searchParams.get('code_challenge'));
  assert.equal(result.code, 'fake');
  await assert.rejects(fetch(redirect));
});
test('OAuth cancellation and timeout release the port', async () => {
  for (const mode of ['cancel', 'timeout']) {
    const port = await freePort(), controller = new AbortController();
    const pending = authorizeLoopback({ authEndpoint: 'https://x.com/i/oauth2/authorize', clientId: 'fixture', scopes: [], redirectUri: `http://127.0.0.1:${port}/callback`, signal: controller.signal, timeoutMs: 30, onUrl: () => { if (mode === 'cancel') controller.abort(); } });
    await assert.rejects(pending, mode === 'cancel' ? /cancelled/ : /SIGNIN_TIMEOUT/);
    const listener = net.createServer(); listener.listen(port, '127.0.0.1'); await once(listener, 'listening'); await new Promise(resolve => listener.close(resolve));
  }
});
test('Windows Claude discovery resolves npm JavaScript entry without shell execution', () => {
  const dir = path.join(temp, 'npm');
  const cli = path.join(dir, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
  fs.mkdirSync(path.dirname(cli), { recursive: true }); fs.writeFileSync(cli, '');
  assert.deepEqual(claudeCommand({ platform: 'win32', env: { PATH: dir } }), [process.execPath, [cli]]);
});
test('probe reads the actual generated MP4 codecs, frame rate and container on Windows', () => {
  const info = probe(videoFile);
  assert.equal(info.codec, 'h264'); assert.equal(info.pixelFormat, 'yuv420p'); assert.equal(info.fps, 24); assert.match(info.format, /mp4/);
  assert.equal(PLATFORMS.x.validate({ meta: { x: { text: 'fixture' } }, video: info }).errors.length, 0);
});
test('publisher requires explicit action and persists successful idempotency', async () => {
  let sent = 0;
  const real = PLATFORMS.x;
  PLATFORMS.x = { ...real, connected: () => ({ id: '10', title: '@fixture' }), post: async () => { sent++; return { id: '30', url: 'https://x.com/i/status/30', privacy: 'public' }; } };
  try {
    await assert.rejects(publish(piece, { platform: 'x' }), /Explicit confirmation/);
    assert.equal(sent, 0);
    const check = await publish(piece, { platform: 'x', dryRun: true }); assert.equal(check.ok, true); assert.equal(sent, 0);
    const first = await publish(piece, { platform: 'x', confirmed: true }); assert.equal(first.ok, true);
    const second = await publish(piece, { platform: 'x', confirmed: true }); assert.equal(second.results[0].status, 'already');
    assert.equal(sent, 1); assert.equal(readJson(stateFile(piece)).posts['fixture/x'].id, '30');
    assert.equal(fs.existsSync(path.join(pieceDir, 'publish', '.lock')), false);
    assert.throws(() => nextSlot(temp, 'fixture', { schedule: ['12:00'] }, 'x'), /immediate/);
  } finally { PLATFORMS.x = real; }
});
test('local Studio HTTP smoke: authenticated state, video ranges, checks and confirmation gates', async () => {
  const port = await freePort();
  const studio = fileURLToPath(new URL('../tools/studio.mjs', import.meta.url));
  const child = spawn(process.execPath, [studio, '--no-open', '--port', String(port)], { cwd: temp, env: { ...process.env, ANIMATE_SECRETS: secretDir, STUDIO_TOKEN: 'fixture-token-for-offline-tests' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', d => { output += d; }); child.stderr.on('data', d => { output += d; });
  const base = `http://127.0.0.1:${port}`;
  const headers = { 'x-studio-token': 'fixture-token-for-offline-tests', 'content-type': 'application/json' };
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base)).ok) { ready = true; break; } } catch {}
      if (child.exitCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(ready, output);
    assert.equal((await fetch(`${base}/api/state`)).status, 403);
    const state = await (await fetch(`${base}/api/state`, { headers })).json();
    assert.equal(state.channels[0].platforms.x.label, 'X'); assert.equal(state.xApp, false);
    assert.equal(JSON.stringify(state).includes('access_token'), false);
    const check = await (await fetch(`${base}/api/pieces/fixture/check`, { method: 'POST', headers, body: JSON.stringify({ meta: { x: { text: '👨‍👩‍👧‍👦 https://example.com' } } }) })).json();
    assert.equal(check.platforms.x.limits.weightedLength, 26);
    assert.equal((await fetch(`${base}/api/pieces/fixture/publish`, { method: 'POST', headers, body: JSON.stringify({ platforms: ['x'] }) })).status, 400);
    assert.equal((await fetch(`${base}/api/batch`, { method: 'POST', headers, body: '{}' })).status, 400);
    assert.deepEqual(await (await fetch(`${base}/api/batch`, { headers })).json(), []);
    assert.equal((await fetch(`${base}/api/pieces/fixture/publish?t=fixture-token-for-offline-tests`, { method: 'POST', body: '{}' })).status, 403);
    assert.equal((await fetch(`${base}/api/state`, { headers: { ...headers, origin: 'https://example.com' } })).status, 403);
    assert.equal((await fetch(`${base}/media/fixture/video`, { headers: { ...headers, range: 'bytes=0-15' } })).status, 206);
    assert.equal((await fetch(`${base}/media/fixture/video`, { headers: { ...headers, range: 'bytes=20-10' } })).status, 416);
    assert.equal((await fetch(`${base}/%ZZ`)).status, 400);
  } finally {
    child.kill(); await once(child, 'exit'); assert.notEqual(child.exitCode, undefined);
  }
});
