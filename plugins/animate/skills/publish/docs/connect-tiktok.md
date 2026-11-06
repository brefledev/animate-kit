# Connect TikTok

Studio supports drafts sent to the creator's inbox and direct posting with explicit privacy, interaction and disclosure choices. Finish a draft in TikTok: open its inbox notification, paste the reviewed caption, choose a cover, and post. Copy caption and plain-text QR transfer help move text to a phone.

Create your app at [TikTok for Developers](https://developers.tiktok.com/apps/). Configure Login Kit, Content Posting API and Display API; add the intended account as a sandbox target user where applicable. Request `user.info.basic`, `video.upload`, `video.publish` and `video.list`. Use your actual sandbox or production credential pair. Paste the Client key and Client secret directly into Channels → TikTok → App settings. Secrets stay in `~/.animate/tiktok-app.json`.

TikTok's Web callback needs HTTPS. The inherited default relay is `https://luizgustavof.github.io/animate/tiktok/callback/`, an upstream-operated dependency. For your deployment, supply your own static relay and set `redirect` in the local app file to its exact registered HTTPS URL. Credential saves preserve this value. [Relay and legal pages](legal-page.md)

Choose Connect, sign in as the creator and authorize access. Studio pins their `openId`. Reconnect when scopes change or consent expires or is revoked. Each account keeps its own token file.

Direct posting queries current creator capabilities, shows actual privacy options, requires a selection, leaves interactions opt-in, and exposes commercial-content and AI-generated disclosures. Account eligibility and app audit restrictions can constrain visibility and posting. See [Content Posting API](https://developers.tiktok.com/doc/content-posting-api-get-started/) and [sharing guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines/).

Studio batch scheduling includes YouTube only. TikTok sends immediately. Delete a draft or Post in TikTok itself; Studio's removal action clears its local entry and preserves local history. Metrics require `video.list`.

`renders/tiktok.mp4` is an optional compatibility copy. When `publish/thumb.png` exists, its final four frames display the cover for selection in the app. The master render stays intact.
