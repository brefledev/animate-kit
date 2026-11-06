# Deployment pages and callback relay

Supply your own app home page, terms and privacy policy when required by the provider. Describe the actual deployment: Studio runs a local server, stores OAuth credentials locally, and sends selected media/text to connected platforms after a publishing action. Optional Claude Code writing sends episode/channel context through the user's configured Claude service. Account images can load from platform hosts.

The imported studio used Luiz Gustavo's GitHub Pages deployment. Those external resources represent that deployment's terms and behavior. Publish this fork's pages only with its owner's explicit authorization.

## TikTok relay

The inherited flow encodes `<loopback-port>.<random-state>` in OAuth state. Its HTTPS callback forwards code, state and any error to `http://127.0.0.1:<loopback-port>/callback/`. A replacement relay should validate the port, forward expected parameters only, avoid analytics/storage, and set a restrictive referrer policy. The local helper verifies PKCE and state. The relay operator can see callback URLs; choose a trusted operator and protect logs.

Set `redirect` in the local `tiktok-app.json` and register that exact URL in Login Kit. X uses a fixed loopback callback directly. YouTube uses its desktop loopback callback.

The caption QR embeds plain text directly. A phone scanner can copy it into TikTok. Large captions can exceed QR capacity; Studio then provides clipboard-transfer guidance.
