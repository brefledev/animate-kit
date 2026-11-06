# Publishing Studio product notes

Studio is a local interface for reviewing and publishing rendered episodes, imported from Luiz Gustavo's animate fork at revision `3cd7792058216238f9b9bb9f29563dbe9ab937f7`. Its interface and supplied help are English.

Publishing lists readiness, scheduled sends and existing posts. Episodes provide a video preview, spoken script, editable text, live validation, destination/time selection, progress and cancellation. Channels shows account identities and setup. Performance retrieves available metrics on request. X reports post impressions; other platform view counts have different definitions.

YouTube supports remote scheduling. TikTok supports drafts and direct posting subject to permissions. X supports immediate video posts, weighted text, resumable media processing, metrics and owned-Post removal. Instagram publishing remains planned. Channel creation/configuration currently uses `publish/channels.json`.

Publication requires a deliberate action showing account, content and timing. Removal requires explicit confirmation and preserves local history. Uncertain X create outcomes stay blocked pending account inspection. Optional Claude Code writing creates a draft; manual editing is available.

Empty states reflect available data. Live account connection and publishing are separate acceptance checks from mocked tests and a successful frontend build.
