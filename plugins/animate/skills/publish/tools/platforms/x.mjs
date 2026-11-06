// X API v2. See docs/connect-x.md for API references, limits and recovery rules.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import twitterText from 'twitter-text';
import { SECRETS, tokenFile, readJson, writeJson } from '../lib/store.mjs';
import { authorizeLoopback } from '../lib/oauth.mjs';

export const SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'media.write', 'offline.access'];
export const LIMITS = { text: 280, bytes: 512 * 1024 * 1024, seconds: 140, fps: 60 };
export const DEFAULT_REDIRECT = 'http://127.0.0.1:4748/callback';
export const APP = path.join(SECRETS, 'x-app.json');
export const supportsScheduling = false;
const API = 'https://api.x.com/2';
const CHUNK = 5_000_000;
const abortCheck = signal => { if (signal?.aborted) throw new Error('cancelled'); };
const readLocal = file => { try { return readJson(file, null); } catch { throw new Error('X local settings are unreadable. Check the app settings and reconnect.'); } };

export function weightedText(text) {
  const parsed = twitterText.parseTweet(String(text).normalize('NFC'));
  return { length: parsed.weightedLength, valid: parsed.valid };
}

export function validate({ meta, video, publishAt, privacy }) {
  const issues = [];
  const issue = (code, text, field = 'video') => issues.push({ level: 'error', code: `x-${code}`, text, field });
  const text = typeof meta?.x?.text === 'string' ? meta.x.text.normalize('NFC') : '';
  const weight = weightedText(text);
  if (text && !weight.valid) issue('text', `X text must use valid characters and fit ${LIMITS.text} weighted characters (currently ${weight.length}).`, 'text');
  if (publishAt) issue('schedule', 'X API publishing sends immediately. Choose Publish now for X.', 'schedule');
  if (privacy && privacy !== 'public') issue('privacy', 'X uses the visibility of your account. Per-post private test uploads are unavailable.', 'privacy');
  if (!video || !Number.isFinite(video.duration) || video.duration < 0.5 || video.duration > LIMITS.seconds) issue('duration', 'X compatibility target: 0.5–140 seconds.');
  if (!video || !Number.isFinite(video.bytes) || video.bytes < 1 || video.bytes > LIMITS.bytes) issue('size', 'X compatibility target: a video up to 512 MiB.');
  if (video?.codec !== 'h264' || video?.pixelFormat !== 'yuv420p') issue('codec', 'Use H.264 video with yuv420p pixels. Export a compatible MP4 first.');
  if (!video?.format?.split(',').includes('mp4')) issue('container', 'Use an MP4 container.');
  if (!video?.width || !video?.height || Math.min(video.width, video.height) < 32 || Math.max(video.width, video.height) > 1920 || Math.min(video.width, video.height) > 1200 || video.width / video.height < 1 / 3 || video.width / video.height > 3) issue('dimensions', 'Use dimensions from 32×32 through 1920×1200 (or 1200×1920), with aspect ratio between 1:3 and 3:1.');
  if (!(video?.fps > 0 && video.fps <= LIMITS.fps)) issue('fps', 'Use a frame rate above 0 and at most 60 fps.');
  if (video?.sampleAspectRatio && !['1:1', 'N/A'].includes(video.sampleAspectRatio)) issue('pixels', 'Use square pixels (sample aspect ratio 1:1).');
  if (video?.fieldOrder && !['progressive', 'unknown'].includes(video.fieldOrder)) issue('interlaced', 'Use progressive video.');
  if (video?.audio && (video.audioCodec !== 'aac' || video.audioProfile !== 'LC' || video.audioChannels > 2)) issue('audio', 'Use AAC-LC audio with one or two channels.');
  return { errors: issues.map(i => i.text), warnings: [], issues, limits: { ...LIMITS, weightedLength: weight.length }, request: { text, title: text } };
}

export function saveApp({ clientId, clientSecret = '', redirectUri = DEFAULT_REDIRECT }) {
  if (typeof clientId !== 'string' || !/^[\w.~-]{8,256}$/.test(clientId.trim())) throw new Error('X_APP: enter the OAuth 2.0 Client ID from your X app.');
  const redirect = new URL(redirectUri);
  if (redirect.protocol !== 'http:' || redirect.hostname !== '127.0.0.1' || !redirect.port || redirect.username || redirect.password || redirect.search || redirect.hash || Number(redirect.port) < 1024) throw new Error('X_APP: use a registered http://127.0.0.1:<port>/callback URL on a port above 1023.');
  if (typeof clientSecret !== 'string' || clientSecret.length > 512 || /[\r\n]/.test(clientSecret)) throw new Error('X_APP: invalid client secret.');
  writeJson(APP, { client_id: clientId.trim(), client_secret: clientSecret.trim(), redirect_uri: redirect.href }, { secret: true });
}
export const hasApp = () => Boolean(readLocal(APP)?.client_id);

function wait(ms, signal) {
  abortCheck(signal);
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new Error('cancelled')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

// Dependencies are injectable for offline regression tests. Production always uses the fixed X API origin.
export function createClient({ fetchImpl = (...args) => fetch(...args), sleep = wait, now = Date.now,
  readApp = () => readLocal(APP), readToken = a => readLocal(tokenFile(a, 'x')),
  writeToken = (a, t) => writeJson(tokenFile(a, 'x'), t, { secret: true }), authorize = authorizeLoopback } = {}) {
  const refreshing = new Map();
  const app = () => { const a = readApp(); if (!a?.client_id) throw new Error('NEEDS_X_APP: configure your X app in Channels.'); return a; };
  const token = a => { const t = readToken(a); if (!t?.access_token) throw new Error('NEEDS_X_RECONNECT: connect X in Channels.'); return t; };
  const connected = a => { const t = readToken(a); return t?.access_token && t?.user?.id ? t.user : null; };

  async function exchange(form, signal) {
    abortCheck(signal);
    const a = app();
    const headers = { 'content-type': 'application/x-www-form-urlencoded' };
    if (a.client_secret) headers.authorization = `Basic ${Buffer.from(`${encodeURIComponent(a.client_id)}:${encodeURIComponent(a.client_secret)}`).toString('base64')}`;
    let r;
    try { r = await fetchImpl(`${API}/oauth2/token`, { method: 'POST', headers, body: new URLSearchParams({ ...form, client_id: a.client_id }), signal: requestSignal(signal) }); }
    catch { abortCheck(signal); throw new Error('X token request failed. Reconnect if the refresh token rotated.'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error(j.error === 'invalid_grant' ? 'NEEDS_X_RECONNECT: X sign-in expired or was revoked. Connect again.' : `X token request failed (HTTP ${r.status}). Check app settings and reconnect.`);
    return { ...j, expires_at: now() + Number(j.expires_in || 7200) * 1000 };
  }
  async function refresh(account, signal) {
    if (!refreshing.has(account)) {
      refreshing.set(account, (async () => {
        const old = token(account);
        if (!old.refresh_token) throw new Error('NEEDS_X_RECONNECT: reconnect X with offline.access permission.');
        const next = await exchange({ grant_type: 'refresh_token', refresh_token: old.refresh_token }, signal);
        // Persist token rotation immediately, even if cancellation arrived after the response.
        const merged = { ...old, ...next, refresh_token: next.refresh_token || old.refresh_token };
        writeToken(account, merged);
        return merged;
      })().finally(() => refreshing.delete(account)));
    }
    return refreshing.get(account);
  }
  async function request(account, method, endpoint, body, { signal, retry = method === 'GET', rawToken, onDispatch = () => {} } = {}) {
    let t = rawToken || token(account);
    if (!rawToken && (!t.expires_at || t.expires_at < now() + 60_000)) t = await refresh(account, signal);
    let renewed = false;
    for (let attempt = 0; ; attempt++) {
      abortCheck(signal);
      let r;
      try { onDispatch(); r = await fetchImpl(`${API}${endpoint}`, { method, headers: { authorization: `Bearer ${t.access_token}`, ...(body && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}) }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined, signal: requestSignal(signal) }); }
      catch { abortCheck(signal); if (retry && attempt < 2) { await sleep(500 * 2 ** attempt, signal); continue; } throw Object.assign(new Error('X connection failed. The request outcome may be unknown.'), { uncertain: true }); }
      if (r.status === 401 && !rawToken && !renewed) {
        renewed = true;
        try { t = await refresh(account, signal); abortCheck(signal); }
        catch (error) { throw Object.assign(error, { status: 401, uncertain: false }); }
        continue;
      }
      if (retry && (r.status === 429 || r.status >= 500) && attempt < 2) {
        const reset = Number(r.headers.get('x-rate-limit-reset')) * 1000 - now();
        const after = Number(r.headers.get('retry-after')) * 1000;
        const delay = Math.max(after || reset || 0, 500 * 2 ** attempt);
        if (delay <= 30_000) { await r.body?.cancel(); await sleep(delay, signal); continue; }
      }
      const j = r.status === 204 ? {} : await r.json().catch(() => ({}));
      if (!r.ok || (j.errors?.length && !j.data)) {
        const hint = r.status === 401 ? 'Reconnect X.' : r.status === 403 ? 'Check app permissions, account eligibility and API access.' : r.status === 402 ? 'Check your X API credit balance and billing.' : r.status === 429 ? 'Rate limit reached; wait before retrying.' : 'Check the request and your X developer console.';
        // Provider error bodies may echo secrets or submitted text. Return only status and a local explanation.
        throw Object.assign(new Error(`X API HTTP ${r.status}. ${hint}`), { status: r.status, uncertain: r.status >= 500 });
      }
      return j;
    }
  }
  const user = d => ({ id: d.id, title: d.username ? `@${d.username}` : d.name || 'X', avatar: d.profile_image_url || null, protected: Boolean(d.protected) });
  async function auth(account, { signal, onUrl } = {}) {
    const a = app();
    const { code, verifier, redirectUri } = await authorize({ authEndpoint: 'https://x.com/i/oauth2/authorize', clientId: a.client_id, scopes: SCOPES, redirectUri: a.redirect_uri || DEFAULT_REDIRECT, signal, onUrl });
    const t = await exchange({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri }, signal);
    const granted = String(t.scope || '').split(' ');
    if (SCOPES.some(s => !granted.includes(s))) throw new Error('NEEDS_X_RECONNECT: allow tweet.read, tweet.write, users.read, media.write and offline.access.');
    const me = await request(account, 'GET', '/users/me?user.fields=profile_image_url,protected', null, { signal, rawToken: t });
    if (!me.data?.id) throw new Error('X returned no account identity. Connect again.');
    const who = user(me.data);
    abortCheck(signal);
    writeToken(account, { ...t, user: who });
    return who;
  }
  async function profile(account) {
    try { const r = await request(account, 'GET', '/users/me?user.fields=profile_image_url,protected'); const who = user(r.data); writeToken(account, { ...token(account), user: who }); return who; } catch { return connected(account); }
  }
  async function post({ account, cfg = {}, request: content, file, resume, signal, log = () => {}, onProgress = () => {}, onSession = () => {} }) {
    abortCheck(signal);
    const who = connected(account);
    if (!who) throw new Error('NEEDS_X_RECONNECT: connect X in Channels.');
    if (cfg.userId && cfg.userId !== who.id) throw new Error('X account differs from this channel. Reconnect the intended account in Channels.');
    const st = fs.statSync(file);
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify([path.resolve(file), st.size, st.mtimeMs, content.text, who.id])).digest('hex');
    let session = resume?.x || {};
    if (session.publishing) throw new Error('X_OUTCOME_UNKNOWN: a previous post request may have succeeded. Inspect your X profile and reconcile the saved post before another attempt.');
    if (session.postId) return { id: session.postId, url: `https://x.com/i/status/${session.postId}`, privacy: who.protected ? 'private' : 'public', channelTitle: who.title };
    if (session.fingerprint !== fingerprint || session.expiresAt <= now()) session = {};
    const save = patch => { session = { ...session, ...patch }; onSession({ x: session, size: st.size }); };
    if (!session.mediaId) {
      const r = await request(account, 'POST', '/media/upload/initialize', { media_type: 'video/mp4', media_category: 'tweet_video', total_bytes: st.size }, { signal });
      if (!r.data?.id || typeof r.data.id !== 'string') throw new Error('X returned an invalid media ID.');
      save({ mediaId: r.data.id, fingerprint, nextSegment: 0, expiresAt: now() + (r.data.expires_after_secs || 86400) * 1000, phase: 'upload' });
    }
    if (session.phase === 'upload') {
      const handle = await fs.promises.open(file, 'r');
      const started = now();
      try {
        for (let index = session.nextSegment || 0; index * CHUNK < st.size; index++) {
          abortCheck(signal);
          const buf = Buffer.alloc(Math.min(CHUNK, st.size - index * CHUNK));
          const { bytesRead } = await handle.read(buf, 0, buf.length, index * CHUNK);
          if (bytesRead !== buf.length) throw new Error('Video changed during upload. Render it again before posting.');
          const form = new FormData();
          form.set('segment_index', String(index));
          form.set('media', new Blob([buf], { type: 'video/mp4' }), 'chunk.mp4');
          await request(account, 'POST', `/media/upload/${session.mediaId}/append`, form, { signal, retry: true });
          save({ nextSegment: index + 1 });
          const sent = Math.min(st.size, (index + 1) * CHUNK);
          onProgress({ sent, total: st.size, mbps: sent / 2 ** 20 / Math.max(0.001, (now() - started) / 1000) });
        }
      } finally { await handle.close(); }
      save({ phase: 'ready-to-finalize' });
    }
    if (session.phase === 'ready-to-finalize') {
      let dispatched = false;
      save({ phase: 'finalizing' });
      try {
        const r = await request(account, 'POST', `/media/upload/${session.mediaId}/finalize`, null,
          { signal, onDispatch: () => { dispatched = true; } });
        save({ phase: 'processing', processing: r.data?.processing_info || { state: 'succeeded' } });
      } catch (e) {
        // Cancellation before dispatch and definite rejections are safe to retry. An uncertain request uses STATUS.
        if (!dispatched || (e.status && !e.uncertain)) save({ phase: 'ready-to-finalize' });
        throw e;
      }
    }
    if (session.phase === 'finalizing') {
      const r = await request(account, 'GET', `/media/upload?command=STATUS&media_id=${session.mediaId}`, null, { signal });
      save({ phase: 'processing', processing: r.data?.processing_info || { state: 'succeeded' } });
    }
    log('X is processing the video.');
    const deadline = now() + 10 * 60_000;
    while (session.processing?.state !== 'succeeded') {
      abortCheck(signal);
      if (session.processing?.state === 'failed') throw new Error('X rejected the video during processing. Check format, duration and codecs.');
      if (now() > deadline) throw new Error('X is still processing. Retry later to check this upload.');
      await sleep(Math.min(30, Math.max(1, session.processing?.check_after_secs || 1)) * 1000, signal);
      const r = await request(account, 'GET', `/media/upload?command=STATUS&media_id=${session.mediaId}`, null, { signal });
      if (!r.data?.processing_info) throw new Error('X returned no processing status. Retry later.');
      save({ processing: r.data.processing_info });
    }
    abortCheck(signal);
    save({ publishing: true });
    let r;
    try { r = await request(account, 'POST', '/tweets', { ...(content.text ? { text: content.text } : {}), media: { media_ids: [session.mediaId] } }, { signal }); }
    catch (e) { if (e.status && !e.uncertain) save({ publishing: false }); throw e; }
    if (!r.data?.id || typeof r.data.id !== 'string') throw new Error('X_OUTCOME_UNKNOWN: X returned no post ID. Inspect your profile before retrying.');
    save({ postId: r.data.id, publishing: false, privacy: who.protected ? 'private' : 'public', postedAt: new Date(now()).toISOString() });
    return { id: r.data.id, url: `https://x.com/i/status/${r.data.id}`, privacy: who.protected ? 'private' : 'public', channelTitle: who.title };
  }
  async function stats(account, ids) {
    const out = {};
    for (let i = 0; i < ids.length; i += 100) {
      const r = await request(account, 'GET', `/tweets?ids=${ids.slice(i, i + 100).map(encodeURIComponent).join(',')}&tweet.fields=public_metrics`);
      for (const d of r.data || []) { const m = d.public_metrics || {}; out[d.id] = { views: m.impression_count ?? null, likes: m.like_count ?? null, comments: m.reply_count ?? null, reposts: m.retweet_count ?? null, quotes: m.quote_count ?? null, metric: 'post impressions' }; }
    }
    return out;
  }
  async function remove(account, id) {
    if (!/^\d{1,19}$/.test(id)) throw new Error('Invalid X post ID.');
    try { const r = await request(account, 'DELETE', `/tweets/${id}`); if (!r.data?.deleted) throw new Error('X did not confirm deletion. Refresh the post in X.'); return { deleted: true }; }
    catch (e) { if (e.status === 404) return { already: true }; throw e; }
  }
  return { connected, auth, profile, post, stats, remove, request };
}

function requestSignal(signal) { return signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000); }
const client = createClient();
export const { connected, auth, profile, post, stats, remove } = client;
