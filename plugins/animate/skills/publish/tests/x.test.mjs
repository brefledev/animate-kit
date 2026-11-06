import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient, validate, weightedText, SCOPES } from '../tools/platforms/x.mjs';

const video = { duration: 25, bytes: 1024, width: 1080, height: 1920, codec: 'h264', pixelFormat: 'yuv420p', format: 'mov,mp4,m4a,3gp,3g2,mj2', fps: 30, audio: true, audioCodec: 'aac', audioProfile: 'LC', audioChannels: 2, sampleAspectRatio: '1:1', fieldOrder: 'progressive' };
const response = (j, status = 200, headers = {}) => new Response(JSON.stringify(j), { status, headers: { 'content-type': 'application/json', ...headers } });
function harness(responses, overrides = {}) {
  let saved = { access_token: 'fake-access', refresh_token: 'fake-refresh', expires_at: Date.now() + 3600_000, user: { id: '10', title: '@fixture' } };
  const calls = [], sleeps = [];
  const client = createClient({
    readApp: () => ({ client_id: 'fake-client', redirect_uri: 'http://127.0.0.1:4748/callback' }),
    readToken: () => saved, writeToken: (_, t) => { saved = t; },
    fetchImpl: async (url, options) => { calls.push({ url, ...options }); const r = responses.shift(); if (typeof r === 'function') return r(url, options); if (r instanceof Error) throw r; assert.ok(r, `Unexpected network request ${url}`); return r; },
    sleep: async (ms, signal) => { if (signal?.aborted) throw new Error('cancelled'); sleeps.push(ms); },
    ...overrides,
  });
  return { client, calls, sleeps, token: () => saved, expire: () => { saved.expires_at = 0; } };
}

test('official weighted text covers URLs, NFC, CJK and joined emoji', () => {
  assert.equal(weightedText('https://example.com/' + 'a'.repeat(200)).length, 23);
  assert.equal(weightedText('界'.repeat(140)).length, 280);
  assert.equal(weightedText('👨‍👩‍👧‍👦').length, 2);
  assert.equal(weightedText('e\u0301').length, 1);
  assert.equal(weightedText('a'.repeat(280)).valid, true);
  assert.equal(weightedText('a'.repeat(281)).valid, false);
  assert.equal(weightedText('\uFFFE').valid, false);
});
test('video/text requirements reject unsupported media, scheduling and private tests', () => {
  assert.deepEqual(validate({ meta: { x: { text: 'A video' } }, video }).errors, []);
  assert.deepEqual(validate({ meta: { x: { text: '' } }, video }).errors, []);
  for (const patch of [{ duration: 140.1 }, { bytes: 513 * 2 ** 20 }, { codec: 'hevc' }, { pixelFormat: 'yuvj420p' }, { fps: 61 }, { audioCodec: 'mp3' }, { audioProfile: 'HE-AAC' }, { width: 4000 }, { fieldOrder: 'tt' }, { sampleAspectRatio: '2:1' }]) assert.ok(validate({ meta: {}, video: { ...video, ...patch } }).errors.length, JSON.stringify(patch));
  assert.ok(validate({ meta: {}, video, publishAt: new Date() }).errors.length);
  assert.ok(validate({ meta: {}, video, privacy: 'private' }).errors.length);
  assert.ok(validate({ meta: { x: { text: '界'.repeat(141) } }, video }).errors.length);
});
test('OAuth auth passes PKCE helper configuration and persists identity with token', async () => {
  let options;
  const h = harness([response({ access_token: 'new', refresh_token: 'rotation', scope: SCOPES.join(' '), expires_in: 7200 }), response({ data: { id: '10', username: 'fixture', protected: true } })], {
    authorize: async o => { options = o; return { code: 'fake-code', verifier: 'fake-verifier', redirectUri: o.redirectUri }; },
  });
  assert.equal((await h.client.auth('fixture')).title, '@fixture');
  assert.equal(options.redirectUri, 'http://127.0.0.1:4748/callback');
  assert.equal(h.calls[0].body.get('code_verifier'), 'fake-verifier');
  assert.equal(h.token().refresh_token, 'rotation');
  assert.equal(h.token().user.protected, true);
});
test('expired token refresh rotates credentials; simultaneous requests share one refresh', async () => {
  const h = harness([response({ access_token: 'new', refresh_token: 'rotated', expires_in: 7200 }), response({ data: [] }), response({ data: [] })]);
  h.expire();
  await Promise.all([h.client.stats('fixture', ['1']), h.client.stats('fixture', ['2'])]);
  assert.equal(h.calls.filter(c => c.url.endsWith('/oauth2/token')).length, 1);
  assert.equal(h.token().refresh_token, 'rotated');
  assert.equal(h.calls[1].headers.authorization, 'Bearer new');
});
test('401 refreshes once; invalid_grant gives reconnect guidance without echoing provider secrets', async () => {
  const h = harness([response({}, 401), response({ access_token: 'new', expires_in: 7200 }), response({ data: [] })]);
  await h.client.stats('fixture', ['1']);
  assert.equal(h.calls.length, 3);
  const denied = harness([response({ error: 'invalid_grant', error_description: 'TOP_SECRET' }, 400)]);
  denied.expire();
  await assert.rejects(denied.client.stats('fixture', ['1']), e => /NEEDS_X_RECONNECT/.test(e.message) && !/TOP_SECRET/.test(e.message));
});
test('read retries are bounded and honor Retry-After; permission failures remain readable', async () => {
  const h = harness([response({}, 429, { 'retry-after': '2' }), response({}, 503), response({ data: [] })]);
  await h.client.stats('fixture', ['1']);
  assert.deepEqual(h.sleeps, [2000, 1000]);
  const denied = harness([response({ detail: 'fake-access secret' }, 403)]);
  await assert.rejects(denied.client.stats('fixture', ['1']), e => /permissions/.test(e.message) && !/fake-access/.test(e.message));
  assert.equal(denied.calls.length, 1);
});

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'animate-x-tests-'));
const file = path.join(temp, 'fixture.mp4');
fs.writeFileSync(file, Buffer.alloc(100));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));
const uploadResponses = () => [response({ data: { id: '20', expires_after_secs: 86400 } }), response({}), response({ data: { processing_info: { state: 'pending', check_after_secs: 1 } } }), response({ data: { processing_info: { state: 'succeeded' } } }), response({ data: { id: '30' } })];
const options = { account: 'fixture', cfg: { userId: '10' }, file, request: { text: 'A video' } };

test('chunked video upload uses multipart, polls processing, then creates one post', async () => {
  const h = harness(uploadResponses());
  let state;
  const result = await h.client.post({ ...options, onSession: s => { state = s; } });
  assert.equal(result.url, 'https://x.com/i/status/30');
  assert.ok(h.calls[1].body instanceof FormData);
  assert.equal(h.calls[1].body.get('segment_index'), '0');
  assert.equal(h.calls[1].body.get('media').size, 100);
  assert.ok(h.calls[3].url.includes('?command=STATUS&media_id=20'));
  assert.deepEqual(JSON.parse(h.calls[4].body), { text: 'A video', media: { media_ids: ['20'] } });
  assert.equal(state.x.postId, '30');
  const recovered = await h.client.post({ ...options, resume: state });
  assert.equal(recovered.id, '30');
  assert.equal(h.calls.length, 5, 'saved successful outcome must not publish again');
});
test('append retries use the same segment; failed processing prevents publication', async () => {
  const h = harness([response({ data: { id: '20' } }), response({}, 503), response({}), response({ data: { processing_info: { state: 'failed' } } })]);
  await assert.rejects(h.client.post(options), /processing/);
  assert.equal(h.calls[1].body.get('segment_index'), h.calls[2].body.get('segment_index'));
  assert.equal(h.calls.filter(c => c.url.endsWith('/tweets')).length, 0);
});
test('cancellation during processing saves resumable upload and never creates a post', async () => {
  const controller = new AbortController();
  const h = harness(uploadResponses(), { sleep: async () => { controller.abort(); throw new Error('cancelled'); } });
  let state;
  await assert.rejects(h.client.post({ ...options, signal: controller.signal, onSession: s => { state = s; } }), /cancelled/);
  assert.equal(state.x.phase, 'processing');
  assert.equal(h.calls.length, 3);
  await assert.rejects(h.client.post({ ...options, signal: controller.signal }), /cancelled/);
  assert.equal(h.calls.length, 3);
});
test('uncertain create outcome persists across retries and never automatically posts twice', async () => {
  const responses = uploadResponses(); responses[4] = new Error('connection reset');
  const h = harness(responses);
  let state;
  await assert.rejects(h.client.post({ ...options, onSession: s => { state = s; } }), /outcome may be unknown/);
  assert.equal(state.x.publishing, true);
  await assert.rejects(h.client.post({ ...options, resume: state }), /X_OUTCOME_UNKNOWN/);
  assert.equal(h.calls.filter(c => c.url.endsWith('/tweets')).length, 1);
});
test('definite create rejection remains retryable without uploading again', async () => {
  const responses = uploadResponses(); responses[4] = response({}, 403); responses.push(response({ data: { id: '31' } }));
  const h = harness(responses);
  let state;
  await assert.rejects(h.client.post({ ...options, onSession: s => { state = s; } }), /403/);
  assert.equal(state.x.publishing, false);
  const result = await h.client.post({ ...options, resume: state });
  assert.equal(result.id, '31');
  assert.equal(h.calls.length, 6);
});
test('account pin mismatch blocks all requests', async () => {
  const h = harness([]);
  await assert.rejects(h.client.post({ ...options, cfg: { userId: '999' } }), /account differs/);
  assert.equal(h.calls.length, 0);
});
test('statistics label post impressions and preserve missing metrics; deletion handles missing post', async () => {
  const h = harness([response({ data: [{ id: '30', public_metrics: { like_count: 4, reply_count: 2 } }] }), response({ data: { deleted: true } }), response({}, 404)]);
  const stats = await h.client.stats('fixture', ['30']);
  assert.equal(stats['30'].views, null);
  assert.equal(stats['30'].metric, 'post impressions');
  assert.equal(stats['30'].likes, 4);
  assert.deepEqual(await h.client.remove('fixture', '30'), { deleted: true });
  assert.deepEqual(await h.client.remove('fixture', '31'), { already: true });
});

test('cancellation before FINALIZE dispatch resumes finalization without reuploading', async () => {
  const controller = new AbortController();
  const h = harness(uploadResponses());
  let state;
  await assert.rejects(h.client.post({ ...options, signal: controller.signal, onSession: s => {
    state = s;
    if (s.x.phase === 'finalizing') controller.abort();
  } }), /cancelled/);
  assert.equal(state.x.phase, 'ready-to-finalize');
  assert.equal(h.calls.length, 2);
  assert.equal((await h.client.post({ ...options, resume: state })).id, '30');
  assert.equal(h.calls.filter(c => c.url.endsWith('/append')).length, 1);
  assert.equal(h.calls.filter(c => c.url.endsWith('/finalize')).length, 1);
});

test('definite FINALIZE rejection remains retryable; uncertain FINALIZE reconciles through STATUS', async () => {
  for (const uncertain of [false, true]) {
    const responses = [response({ data: { id: '20' } }), response({}), uncertain ? new Error('connection reset') : response({}, 403), response({ data: { processing_info: { state: 'succeeded' } } }), response({ data: { id: '30' } })];
    const h = harness(responses);
    let state;
    await assert.rejects(h.client.post({ ...options, onSession: s => { state = s; } }), uncertain ? /unknown/ : /403/);
    assert.equal(state.x.phase, uncertain ? 'finalizing' : 'ready-to-finalize');
    assert.equal((await h.client.post({ ...options, resume: state })).id, '30');
    assert.ok(uncertain ? h.calls[3].url.includes('command=STATUS') : h.calls[3].url.endsWith('/finalize'));
    assert.equal(h.calls.filter(c => c.url.endsWith('/append')).length, 1);
  }
});

test('cancellation after FINALIZE dispatch keeps the uncertain marker for STATUS recovery', async () => {
  const controller = new AbortController();
  const h = harness([response({ data: { id: '20' } }), response({}), () => { controller.abort(); throw new Error('aborted in flight'); }, response({ data: { processing_info: { state: 'succeeded' } } }), response({ data: { id: '30' } })]);
  let state;
  await assert.rejects(h.client.post({ ...options, signal: controller.signal, onSession: s => { state = s; } }), /cancelled/);
  assert.equal(state.x.phase, 'finalizing');
  assert.equal((await h.client.post({ ...options, resume: state })).id, '30');
  assert.ok(h.calls[3].url.includes('command=STATUS'));
  assert.equal(h.calls.filter(c => c.url.endsWith('/finalize')).length, 1);
});

test('FINALIZE rejected with 401 stays retryable when token refresh requires reconnection', async () => {
  const h = harness([response({ data: { id: '20' } }), response({}), response({}, 401), response({ error: 'invalid_grant' }, 400), response({ data: { processing_info: { state: 'succeeded' } } }), response({ data: { id: '30' } })]);
  let state;
  await assert.rejects(h.client.post({ ...options, onSession: s => { state = s; } }), /NEEDS_X_RECONNECT/);
  assert.equal(state.x.phase, 'ready-to-finalize');
  assert.equal((await h.client.post({ ...options, resume: state })).id, '30');
  assert.ok(h.calls[4].url.endsWith('/finalize'));
  assert.equal(h.calls.filter(c => c.url.endsWith('/append')).length, 1);
});

test('cancellation after successful 401 token refresh preserves rejected FINALIZE recovery', async () => {
  const controller = new AbortController();
  const h = harness([
    response({ data: { id: '20' } }), response({}), response({}, 401),
    () => { controller.abort(); return response({ access_token: 'rotated', refresh_token: 'rotation', expires_in: 7200 }); },
    response({ data: { processing_info: { state: 'succeeded' } } }), response({ data: { id: '30' } }),
  ]);
  let state;
  await assert.rejects(h.client.post({ ...options, signal: controller.signal, onSession: s => { state = s; } }), /cancelled/);
  assert.equal(h.token().access_token, 'rotated', 'Persist successful token rotation despite cancellation');
  assert.equal(state.x.phase, 'ready-to-finalize');
  assert.equal((await h.client.post({ ...options, resume: state })).id, '30');
  assert.ok(h.calls[4].url.endsWith('/finalize'));
  assert.equal(h.calls.filter(c => c.url.endsWith('/append')).length, 1);
  assert.equal(h.calls.filter(c => c.url.includes('command=STATUS')).length, 0);
});
