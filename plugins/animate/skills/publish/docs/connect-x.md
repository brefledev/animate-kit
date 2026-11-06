# Connect and publish to X

## Account setup

Open Studio → Channels → X → App settings. Create or select an app in the [X developer console](https://developer.x.com/), enable OAuth 2.0, and select Read and write access. Native Apps use a public Client ID and PKCE. Confidential apps also use a Client secret. Enter settings directly into Studio; the secret field is write-only.

Register exactly `http://127.0.0.1:4748/callback`, or your chosen fixed loopback port, as the callback URL. Keep the same URL in Studio. The listener binds to `127.0.0.1`, validates the callback path and random state, and uses S256 PKCE. Choose Connect and approve `tweet.read`, `tweet.write`, `users.read`, `media.write`, and `offline.access`. Review the account shown afterward. Studio pins that user ID to the channel.

Settings are stored in `~/.animate/x-app.json`; tokens and account identity are in `~/.animate/tokens/<account>.x.json`. `ANIMATE_SECRETS` can select another local directory. POSIX systems receive restrictive file modes. On Windows, choose a directory protected by your user's ACLs; POSIX mode flags do not establish Windows ACLs. Credentials are excluded from API responses and provider error output. Access tokens normally last two hours; rotating refresh tokens are saved immediately. [OAuth 2.0 reference](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code)

Your developer account needs endpoint access and sufficient usage credits. Pricing, quotas and account eligibility can change. Check the current console before sending. Studio reports authorization, billing and rate-limit failures while preserving upload state. [X pricing](https://docs.x.com/x-api/getting-started/pricing), [rate limits](https://docs.x.com/x-api/fundamentals/rate-limits)

## Requirements enforced here

| Item | Studio compatibility target |
|---|---|
| Text | At most 280 weighted characters; optional for video-only posts |
| Video | MP4, H.264, yuv420p, progressive, square pixels |
| Audio | Optional; AAC-LC, one or two channels when present |
| Duration and size | 0.5–140 seconds; at most 512 MiB |
| Frame rate | Greater than 0 and at most 60 fps |
| Dimensions | At least 32×32; long side at most 1920, short side at most 1200; ratio 1:3 through 3:1 |
| Timing | Immediate publication; scheduling requests are rejected |
| Visibility | Connected account visibility; per-post private tests are unavailable |

These are conservative compatibility limits. The API guide describes larger entitlements, including 20 minutes/8 GB for default video and 125 minutes/16 GB for Premium or verified users. Consumer help describes 140 seconds/512 MB for standard use. Upload acceptance and Post attachment eligibility can differ. This implementation keeps the conservative target; larger entitlements need a separately tested change. [API media best practices](https://docs.x.com/x-api/media/quickstart/best-practices), [consumer video help](https://help.x.com/en/using-x/x-videos)

The official Apache-2.0 `twitter-text` 3.1.0 library counts NFC-normalized text, URLs and emoji sequences. URLs contribute 23 weighted characters; many CJK characters and emoji contribute 2. The live editor displays the backend's count. The API makes the final acceptance decision. [Counting characters](https://docs.x.com/fundamentals/counting-characters), [twitter-text source and license](https://github.com/twitter/twitter-text)

## Publishing and recovery

Edit the X text, review the account, select X, and press Publish now. The CLI equivalent, from the project directory, is `node <publish-skill>/tools/publish.mjs post <piece> --platform x --yes`, after the user approves the concrete post. Saving metadata, opening a screen and connecting an account never publish a video.

The upload initializes `tweet_video`, sends multipart chunks of at most 5,000,000 bytes, finalizes, and polls processing before creating the Post. Each completed chunk and final Post ID are saved. Read requests and same-index chunks have bounded retries. Post creation has no automatic retry after a network/server failure. [Chunked upload endpoints](https://docs.x.com/x-api/media/quickstart/media-upload-chunked), [create Post](https://docs.x.com/x-api/posts/create-post)

Cancel stops future steps and aborts the current request. X may already have received an interrupted request. A lost create response leaves `publishing: true` in the local record; later attempts stop with `X_OUTCOME_UNKNOWN`. Inspect the account profile before proceeding. If a post exists, preserve that record and remote link for manual reconciliation. If you establish that the Post was never created, explicitly clear the interrupted local record, then publish again. Clearing an uncertain record forfeits duplicate protection. Automatic reconciliation of an unknown create response is outside this implementation.

Uploads resume while their media session remains valid. Changed files, text or account identity start a new upload. A saved successful Post ID prevents a repeated create request, including recovery after a local save failure. Cancellation during processing preserves the session. A definitive request rejection permits a reviewed retry; a possibly accepted create stays blocked.

Cancellation before FINALIZE is sent leaves the completed chunks ready for finalization on retry. An interrupted FINALIZE that may have reached X is checked through STATUS. If that status cannot establish the upload's state, the error remains visible for review. A recovered Post ID appears with its remote link and remains protected against duplicate publication. Deleting that recovered post requires confirmed remote deletion before its local record moves to history.

Performance → Refresh metrics retrieves public Post metrics. X's displayed number is **post impressions**, which differs from playback views. Unavailable fields display an em dash. Delete removes a Post owned by the connected user after explicit confirmation; the local record moves to removal history. [Post lookup](https://docs.x.com/x-api/posts/get-posts-by-ids), [delete Post](https://docs.x.com/x-api/posts/delete-post)

## Presentation advice

Keep the opening legible on a phone, make early movement purposeful, and use captions for silent viewing. Captions burned into the render are supported. X has a separate subtitle API; this Studio currently does not upload SRT/VTT tracks. [Subtitle API](https://docs.x.com/x-api/media/create-media-subtitles)

Short runtimes, early branding and captions appear in X's **paid advertising** guidance. Treat them as creative test ideas for organic posts. Technical validity establishes upload compatibility; engagement improvement requires measurement. [Advertising creative guidance](https://business.x.com/en/advertising/creative-best-practices)

For organic performance context, Buffer's October 14, 2025 analysis covered 18.8 million posts from 71,000 accounts. Its August 2025 figures put video engagement around 0.25% for regular accounts and 0.85% for Premium, compared with 0.40% and 0.90% for text. Link posts performed poorly in that dataset. These are observational comparisons affected by account and content differences; they establish no causal advantage for a format, subscription or link placement. [Buffer's analysis and methodology link](https://buffer.com/resources/links-on-x/)

A practical experiment is to compare a 25-second native video with a 10–15-second edit across several posts. Keep the topic and caption approach similar, record reach and interactions separately, and inspect retention where your account provides it. Studio currently retrieves post impressions and public interactions. Video completion and profile visits require separate analytics access. Treat captions, aspect ratio and link placement as test variables; the compatibility table above supplies the technical rules.

## Verification

`npm test` in the publish skill runs offline protocol tests, OAuth loopback tests, generated MP4 range/probe tests, publisher confirmation/recovery tests, statistics races and local HTTP smoke checks. `npm run test:ui` builds the UI and runs real Chromium against intercepted requests. Browser regressions cover tab navigation, overlapping autosaves, failed-save retry, private-test scheduling, job reconnects and recovered-post controls. Install the development dependencies and Playwright Chromium first (`npm ci`, `npm ci --prefix studio`, `npx playwright install chromium`). Tests use synthetic credentials and mocked provider responses. Live X connection, entitlement, posting and deletion require a later user-authorized account test.
