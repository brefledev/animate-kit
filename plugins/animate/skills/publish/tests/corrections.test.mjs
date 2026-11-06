import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { validate } from '../tools/platforms/youtube.mjs';
import { ensureLight } from '../tools/lib/encode.mjs';
import { PLATFORMS } from '../tools/lib/platforms.mjs';
import { publish, unpublish, refreshStats, overview } from '../tools/lib/publisher.mjs';
import { loadState, saveState, resolvePiece, writeJson, probe } from '../tools/lib/store.mjs';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'animate-corrections-'));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));
writeJson(path.join(temp, 'publish/channels.json'), { channels: { fixture: { name: 'Fixture', series: 'series/test', platforms: { x: { account: 'fixture' } } } } });
const dir = path.join(temp, 'pieces/fixture');
writeJson(path.join(dir, 'piece.json'), { title: 'Fixture', series: 'series/test' });
writeJson(path.join(dir, 'publish/meta.json'), { x: { text: 'Fixture' } });
const piece = resolvePiece(dir, temp);
const entry = () => ({ platform: 'x', account: 'fixture', channel: 'fixture', id: '30', status: 'public', postedAt: '2026-01-01T00:00:00Z' });
const writePost = e => saveState(piece, { posts: { 'fixture/x': e } });

test('TikTok missing-scope errors give English reconnect instructions without provider traffic', () => {
  const secrets = path.join(temp, 'synthetic-secrets');
  writeJson(path.join(secrets, 'tokens/fixture.tiktok.json'), { scope: 'user.info.basic' });
  const script = `
    import assert from 'node:assert/strict';
    import { creatorInfo, stats } from ${JSON.stringify(new URL('../tools/platforms/tiktok.mjs', import.meta.url).href)};
    globalThis.fetch = () => { throw new Error('Forbidden provider traffic'); };
    for (const request of [() => creatorInfo('fixture'), () => stats('fixture', ['30'])]) {
      await assert.rejects(request(), e => /Reconnect/.test(e.message) && !/Reconectar/.test(e.message));
    }
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, ANIMATE_SECRETS: secrets }, windowsHide: true, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('YouTube private and unlisted uploads cannot retain a public release schedule', () => {
  const args = { meta: { youtube: { title: 'Fixture', description: '', tags: [] } }, cfg: { madeForKids: false }, channel: {}, video: { width: 64, height: 64, duration: 10, audio: true, bytes: 100 }, publishAt: new Date(Date.now() + 86400000) };
  for (const privacy of ['private', 'unlisted']) {
    for (const source of ['explicit', 'config']) {
      const result = validate({ ...args, ...(source === 'explicit' ? { privacy } : { cfg: { ...args.cfg, privacy } }) });
      assert.match(result.errors.join(' '), /become public/);
      assert.equal(result.request.status.publishAt, undefined);
      assert.equal(result.request.status.privacyStatus, privacy);
    }
  }
  const publicSchedule = validate({ ...args, privacy: 'public' });
  assert.deepEqual(publicSchedule.errors, []);
  assert.equal(publicSchedule.request.status.publishAt, args.publishAt.toISOString());
  const privateNow = validate({ ...args, privacy: 'private', publishAt: null });
  assert.deepEqual(privateNow.errors, []);
  assert.equal(privateNow.request.status.publishAt, undefined);
});

test('a recovered nested X post is visible, blocks duplicates and must be deleted remotely', async () => {
  const real = PLATFORMS.x;
  let removed = 0, posted = 0;
  PLATFORMS.x = { ...real, connected: () => ({ id: '10' }), post: async () => { posted++; throw new Error('duplicate'); }, remove: async (account, id) => { assert.equal(account, 'fixture'); assert.equal(id, '30'); removed++; throw new Error('deletion denied'); } };
  try {
    writePost({ platform: 'x', account: 'fixture', channel: 'fixture', status: 'uploading', x: { postId: '30' } });
    const recovered = overview(temp)[0];
    assert.equal(recovered.posts['fixture/x'].id, '30');
    assert.equal(recovered.posts['fixture/x'].status, 'posted');
    assert.equal(recovered.posts['fixture/x'].url, 'https://x.com/i/status/30');
    assert.deepEqual(recovered.todo, []);
    assert.equal((await publish(piece, { confirmed: true, platform: 'x' })).results[0].status, 'already');
    assert.equal(posted, 0);
    await assert.rejects(unpublish(piece, { key: 'fixture/x' }), /deletion denied/);
    assert.equal(loadState(piece).posts['fixture/x'].id, '30');
    PLATFORMS.x.remove = async (_, id) => { assert.equal(id, '30'); removed++; return { deleted: true }; };
    await unpublish(piece, { key: 'fixture/x' });
    assert.equal(removed, 2);
    assert.deepEqual(loadState(piece).posts, {});
    assert.equal(loadState(piece).removed[0].id, '30');
  } finally { PLATFORMS.x = real; }
});

test('statistics skip posts deleted or replaced while a provider response is pending', async () => {
  const real = PLATFORMS.x;
  try {
    for (const change of ['delete', 'id', 'account', 'platform', 'generation', 'unchanged']) {
      writePost(entry());
      let release;
      const waiting = new Promise(resolve => { release = resolve; });
      PLATFORMS.x = { ...real, stats: async () => { await waiting; return { '30': { views: 123 } }; }, remove: async () => ({ deleted: true }) };
      const refresh = refreshStats([piece]);
      if (change === 'delete') await unpublish(piece, { key: 'fixture/x' });
      else if (change !== 'unchanged') writePost({ ...entry(), ...(change === 'generation' ? { postedAt: '2026-02-01T00:00:00Z' } : { [change]: change === 'id' ? '31' : 'other' }) });
      release();
      const rows = await refresh;
      assert.equal(rows.length, change === 'unchanged' ? 1 : 0, change);
      assert.equal(loadState(piece).posts['fixture/x']?.stats?.views, change === 'unchanged' ? 123 : undefined, change);
    }
  } finally { PLATFORMS.x = real; }
});

const ffmpeg = args => {
  const result = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { windowsHide: true, maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr?.toString() || result.error?.message);
  return result.stdout;
};
test('TikTok encoding preserves limited-range levels and converts full-range exactly once; old caches rebuild', async () => {
  for (const range of ['tv', 'pc']) {
    const d = path.join(temp, range);
    fs.mkdirSync(path.join(d, 'renders'), { recursive: true });
    const raw = Buffer.alloc(64 * 64 * 3 / 2, 128);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) raw[y * 64 + x] = x < 32 ? (range === 'tv' ? 16 : 0) : (range === 'tv' ? 235 : 255);
    fs.writeFileSync(path.join(d, 'source.yuv'), raw);
    const master = path.join(d, 'renders/final.mp4');
    ffmpeg(['-f', 'rawvideo', '-pixel_format', 'yuv420p', '-video_size', '64x64', '-framerate', '24', '-i', path.join(d, 'source.yuv'), '-c:v', 'libx264', '-qp', '0', '-color_range', range, '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', master]);
    assert.equal(probe(master).colorRange, range);
    const old = path.join(d, 'renders/tiktok.mp4');
    fs.copyFileSync(master, old);
    writeJson(path.join(d, 'renders/tiktok.encode.json'), { version: 1 });
    let encodes = 0;
    const out = await ensureLight({ dir: d }, 'tiktok', { log: () => encodes++ });
    const decoded = ffmpeg(['-i', out, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'yuv420p', 'pipe:1']);
    assert.ok(Math.abs(decoded[16 * 64 + 16] - 16) <= 1, `${range} black ${decoded[16 * 64 + 16]}`);
    assert.ok(Math.abs(decoded[16 * 64 + 48] - 235) <= 1, `${range} white ${decoded[16 * 64 + 48]}`);
    assert.equal(probe(out).colorRange, 'tv');
    await ensureLight({ dir: d }, 'tiktok', { log: () => encodes++ });
    assert.equal(encodes, 1);
  }
});
