# Connect YouTube

Create or select a Google Cloud project, enable YouTube Data API v3, and configure its OAuth consent screen. Create a Desktop app OAuth client. The account owner downloads its JSON directly to Downloads. Studio's Connect button or `publish.mjs setup` imports it to `~/.animate/google-oauth-client.json` and opens sign-in. Select the intended account and channel, then approve access. Studio saves the channel ID as the destination pin.

Set the channel's `account`, `privacy`, `madeForKids`, `syntheticMedia`, `categoryId` and optional tags in `publish/channels.json`. The account owner supplies legal declarations. Each brand channel uses its own local account key and connection.

YouTube can schedule publication remotely: uploads stay private until `publishAt`. Choose the next configured slot or a date/time. Uploads are resumable. Deletion needs management permission; an older connection may need another sign-in before removal.

Testing-mode credentials, unverified applications and audit restrictions can constrain access or visibility. Quotas and upload costs are controlled by Google. Inspect the developer console and the tool's returned warning for the actual account. References: [installed-app OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert), [quota costs](https://developers.google.com/youtube/v3/determine_quota_cost).

Upstream account approvals and testing history apply to Luiz Gustavo's deployment. Establish this fork's own configuration and live behavior through an explicitly authorized account test.
