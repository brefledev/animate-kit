# Publishing architecture

This studio was imported from Luiz Gustavo's [luizgustavof/animate](https://github.com/luizgustavof/animate/tree/3cd7792058216238f9b9bb9f29563dbe9ab937f7/plugins/animate/skills/publish) at `3cd7792058216238f9b9bb9f29563dbe9ab937f7`. Preserve the original MIT license, contributor attribution and root credits. Local changes add English UI/docs, X publishing and portability/reliability fixes. The `twitter-text` package retains its Apache-2.0 license; platform marks preserve the original studio's Simple Icons CC0 attribution.

The CLI (`tools/publish.mjs`) and React Studio share `tools/lib/publisher.mjs`. The server handles authenticated local HTTP and server-sent job events. Platform modules implement connection, validation, upload, metrics and supported deletion. The registry is `tools/lib/platforms.mjs`.

| Module | Responsibility |
|---|---|
| `store.mjs` | Paths, atomic JSON saves, piece locks, ffprobe metadata |
| `publisher.mjs` | Readiness, explicit confirmation, upload state, scheduling, history |
| `oauth.mjs` | Loopback callback, random state, S256 PKCE, timeout, cancellation |
| `setup.mjs` | Connection status and Google client discovery |
| `writer.mjs` | Optional Claude Code generation; native/npm Windows launcher discovery |
| `encode.mjs` | TikTok compatibility copy and optional cover frames |
| `jobs.mjs` | Tasks, cancellation and event delivery |
| `platforms/x.mjs` | X v2, rotating tokens, weighted text, upload recovery |

Node 22+ runs the server. Run `npm ci` here, then `npm ci` and `npm run build` in `studio/`. The server binds to loopback, requires a private token, checks Host and Origin, and requires publishing/deletion confirmation payloads. Media URLs can carry a token; document/server responses set a no-referrer policy.

Configuration lives in `<project>/publish/channels.json`, editable text in `pieces/<slug>/publish/meta.json`, and state in `pieces/<slug>/publish/state.json`. Credentials stay under `~/.animate/`, overridable with `ANIMATE_SECRETS`. Windows file protection depends on directory ACLs. Studio pins the account identity after connection.

YouTube supports remote scheduling and is the batch scheduler's sole destination. X rejects scheduling and private-test overrides. TikTok sends a draft immediately or uses explicit direct-post choices. Instagram remains planned. UI routes: `/`, `/channels`, `/performance`, `/ep/:slug`.

## X reliability

Reads and same-index chunks have bounded retries. Token refresh runs once per account at a time. Post creation saves an intent marker before sending; missing/ambiguous responses leave it in place and block automatic reposting. Definitive rejection clears it. Success saves the Post ID before returning to the shared publisher. Media reuse requires a matching file/text/account fingerprint and valid expiry. Cancellation aborts transport and processing waits.

## Verification

Run `npm test` and `npm run build --prefix studio`. The suite stubs provider HTTP, generates a tiny MP4 with FFmpeg, checks S256/state on loopback, and launches Studio with isolated temporary project/secrets directories. Follow the active host's process-ownership instructions when running agent tests. Tests use synthetic credentials and no provider mutations.
