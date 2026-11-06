# TikTok review notes

The TikTok implementation comes from Luiz Gustavo's animate fork at revision `3cd7792058216238f9b9bb9f29563dbe9ab937f7`. Upstream approval and testing history apply to the upstream app. This fork needs its own configuration, review and account validation.

A review demonstration should show the connected identity, draft upload, direct-post choices, explicit final publishing action, progress and returned status. Current creator information supplies privacy options and disabled interactions. Commercial-content and AI-generated disclosures are explicit controls.

Confirm current requirements with [Content Sharing Guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines/) and [Content Posting API](https://developers.tiktok.com/doc/content-posting-api-get-started/). Eligibility, sandbox behavior, visibility and quotas depend on TikTok's decisions. A local build or mocked test does not establish app approval.
