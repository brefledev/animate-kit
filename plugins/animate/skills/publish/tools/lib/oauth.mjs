// OAuth sign-in for a desktop tool: a one-shot server on 127.0.0.1 receives the code (loopback redirect, PKCE, state check).
// The user signs in once per account in their own browser; nothing here ever sees a password.
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const b64url = b => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

export function openBrowser(url) {
  if (process.env.ANIMATE_NO_BROWSER) return;   // tests
  const [cmd, args] = process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { const child = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true }); child.on('error', () => {}); child.unref(); } catch {}
}

// options for providers that differ from RFC 8252 defaults (TikTok: client_key, comma scopes, a hex challenge, a /callback/ path)
export async function authorizeLoopback({
  authEndpoint, clientId, scopes, extra = {}, timeoutMs = 5 * 60e3,
  clientParam = 'client_id', scopeSep = ' ', challengeEncoding = 'base64url', callbackPath = '',
  signal, onUrl, relay, redirectUri: registeredRedirect,
}) {
  if (signal?.aborted) throw new Error('cancelled');
  const verifier = b64url(crypto.randomBytes(48));
  const digest = crypto.createHash('sha256').update(verifier).digest();
  const challenge = challengeEncoding === 'hex' ? digest.toString('hex') : b64url(digest);
  const server = http.createServer();
  const registered = registeredRedirect ? new URL(registeredRedirect) : null;
  if (registered && (registered.protocol !== 'http:' || registered.hostname !== '127.0.0.1' || !registered.port || registered.search || registered.hash)) throw new Error('Use a fixed http://127.0.0.1:<port>/callback URL');
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(registered ? Number(registered.port) : 0, '127.0.0.1', resolve); });
  const port = server.address().port;
  // relay: a provider that only takes https redirects sends the browser to a static page (docs/legal-page.md) that reads the
  // port from the front of `state` and forwards code + state to this loopback server. The token exchange uses the relay URL.
  const state = relay ? `${port}.${b64url(crypto.randomBytes(16))}` : b64url(crypto.randomBytes(16));
  const local = registered?.href || `http://127.0.0.1:${port}${callbackPath}`;
  const redirectUri = relay || local;

  const url = new URL(authEndpoint);
  const params = {
    [clientParam]: clientId, redirect_uri: redirectUri, response_type: 'code', scope: scopes.join(scopeSep),
    state, code_challenge: challenge, code_challenge_method: 'S256', ...extra,
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let timer, abort;
  try {
    const code = await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('SIGNIN_TIMEOUT: sign-in timed out')), timeoutMs);
      abort = () => reject(new Error('cancelled'));
      signal?.addEventListener('abort', abort, { once: true });
      server.on('request', (req, res) => {
        const callback = new URL(req.url, local);
        if (req.method !== 'GET' || callback.pathname !== new URL(local).pathname) { res.writeHead(404).end(); return; }
        const q = callback.searchParams;
        if (!q.has('code') && !q.has('error')) { res.writeHead(404).end(); return; }   // the favicon, a stray request
        if (q.get('state') !== state) { res.writeHead(400).end('Invalid sign-in state. Return to the original sign-in page.'); return; }
        const ok = q.get('state') === state && q.get('code');
        const why = q.get('error') || 'state mismatch';
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' })
          .end(ok ? '<h2>Sign-in received. Return to Studio to check the connection.</h2>'
            : `<h2>Sign-in failed: ${esc(why)}</h2><p>Return to Studio and try again.</p>`);
        clearTimeout(timer);
        if (ok) resolve(q.get('code')); else reject(new Error(`sign-in failed: ${why === 'access_denied' ? 'access_denied' : 'authorization rejected'}`));
      });
      if (signal?.aborted) return abort();
      onUrl?.(url.href);
      openBrowser(url.href);
    });
    return { code, redirectUri, verifier };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    server.closeAllConnections();
    server.close();
  }
}
