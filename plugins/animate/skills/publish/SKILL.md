---
name: publish
description: Publish rendered animation videos to YouTube, TikTok or X with reviewed text, explicit confirmation, resumable uploads and statistics. Connect accounts, schedule YouTube posts, inspect readiness, remove supported posts, or open the local publishing Studio. Instagram publishing is planned.
argument-hint: "[piece] [channel] [when]"
---

# Publish

Use the finished render in `pieces/<name>/renders/`. Draft accurate titles, descriptions, captions and X text in `pieces/<name>/publish/meta.json`. Show the destination account, text and timing before publishing. Publishing and removal require an explicit user action, including channels whose older configuration contains `approval: auto`.

## Requirements

Node 22+, FFmpeg and ffprobe on PATH. Run `npm ci` in this skill directory for the official `twitter-text` dependency. For Studio, run `npm ci` and `npm run build` in `studio/`. Claude Code is optional for the writing button; manual editing works independently. The CLI and server run from the user's project directory containing `pieces/` and `publish/channels.json`.

Start from [channels.example.json](channels.example.json). Include the platforms the user wants. Ask the user to set YouTube's legal declarations (`madeForKids` and `syntheticMedia`). Credentials belong in `~/.animate/`, or the directory selected by `ANIMATE_SECRETS`. Keep secrets out of chat, logs, screenshots and version control.

## Workflow

1. Read the piece's script, brief, series context, channel profile and publishing state. `node <skill>/tools/publish.mjs next` lists prepared series episodes. `status [piece]` lists previous sends.
2. Write or review platform text. Use the configured channel language for authored content. The interface and supplied documentation are English.
3. Run `node <skill>/tools/publish.mjs check <piece> --platform x` (or another platform). Requirements produce errors; creative suggestions produce warnings.
4. Show the exact text, account, video and timing. Obtain the user's publishing instruction. Run `post <piece> --platform x --yes` for immediate publication. The Studio Publish now button supplies equivalent confirmation.
5. Report each confirmed result and link. Inspect uncertain outcomes before retrying. A completed upload alone does not establish Post creation.

YouTube accepts `--at next` or an ISO timestamp. X rejects scheduling. Studio batch scheduling includes YouTube only. TikTok sends drafts immediately; the user finishes in the app. Direct TikTok posting requires the per-post choices shown in Studio.

```json
{
  "language": "en-US",
  "youtube": {
    "title": "How the mechanism works",
    "description": "A short explanation. #animation",
    "tags": ["animation"]
  },
  "tiktok": { "caption": "Watch the mechanism turn. #animation" },
  "x": { "text": "One rotation, three moving parts. Here is how it works." }
}
```

X uses the official weighted counter: 280 weighted characters, URLs count as 23, and supported emoji sequences count as 2. Empty text sends the video alone. See [X setup](docs/connect-x.md) for video compatibility limits, permissions, costs, recovery and citations. Separate requirements from performance advice.

## Studio and commands

From the project directory, run `node <skill>/tools/studio.mjs`. The authenticated local URL opens in the browser; `--no-open` prints it. `--dev` serves the API for Vite development. Agent-operated helper servers follow the active environment's process ownership rules.

The Studio shares the CLI's files. API publishing requires the Studio token header and body `{"platforms":["x"],"at":null,"confirm":"<piece-slug>"}`. Mutations accept the token as a header. Media/event reads also accept a query token. Keep it private.

- `auth <channel> <platform>`: connect an account.
- `check <piece> --platform <platform>`: validate locally.
- `post <piece> --platform <platform> --yes`: publish after approval.
- `unpost <piece> --key <channel/platform> --yes`: remove a supported Post and preserve local history. TikTok removal clears the local record; delete the actual draft/post in TikTok.
- `stats [piece]`: refresh metrics. X displays post impressions; unavailable fields remain unavailable.

## Files and recovery

`publish/channels.json` contains profiles; `pieces/<name>/publish/meta.json` contains text; `pieces/<name>/publish/state.json` records uploads, Post IDs and history. Preserve state when resuming.

The default render is `final.mp4`, with `share.mp4` as fallback. Platform copies such as `x.mp4` take priority. The example X configuration selects `share.mp4`. TikTok can create a smaller copy ending on `publish/thumb.png`; the animate skill's `thumb.mjs` and `thumbcheck.mjs` are optional cover-generation helpers.

Read [architecture](docs/architecture.md), [YouTube setup](docs/connect-youtube.md), [TikTok setup](docs/connect-tiktok.md), and [X setup](docs/connect-x.md). Instagram publishing remains planned.
