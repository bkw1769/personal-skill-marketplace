# Platform rules used by upload.mjs

Checked on 2026-10-20. Most numbers come from secondary guides, not the platforms' own help pages, so check the app when something looks off. Update `LIMITS` in `scripts/upload.mjs` and the tests together.

| | YouTube Shorts | TikTok | Instagram Reels |
|---|---|---|---|
| Max length | 3 min | 10 min (Creator Rewards only counts videos over 1 min) | 3 min |
| Title | 100 characters (about 40 visible in the feed) | none (first caption line is the hook) | none (first ~125 characters visible) |
| Description / caption | 5,000 characters | 4,000 characters (some guides say 2,200) | 2,200 characters |
| Hashtags | first 3 show above the title; over 15 and all are ignored | 3-5 recommended | max 5 per post since Dec 2025 (caption and first comment together) |
| Links in text | not clickable in Shorts descriptions (since 2023-08-31) | not clickable | not clickable |
| AI notice | "altered or synthetic content" only for realistic people, places or events | AI-generated content toggle; C2PA content credentials are read and labelled automatically | "AI info" label in advanced settings; Meta reads C2PA and IPTC metadata and labels automatically |
| Cover | custom Shorts thumbnail only for Partner Program channels (since 2026-07); otherwise pick a frame in the mobile app | upload an image or pick a frame | upload from camera roll or pick a frame; the profile grid shows the middle 3:4 |
| Monetisation note | YPP: 1,000 subscribers + 10M Shorts views in 90 days | Creator Rewards: personal account, 19+ in Korea, 10,000 followers, 100,000 views in 30 days, videos over 1 min | no general Reels payout in Korea |

Why the sheets turn the AI label on for TikTok and Instagram but not for YouTube: the pictures are made with an image model that can embed C2PA content credentials, and those two platforms label such uploads automatically. Turning the label on by hand avoids a mismatch. YouTube asks only about realistic synthetic content, which these illustrated shorts are not.

## Sources

- TikTok character limits: https://www.wordcountertool.net/character-limits/tiktok
- TikTok and C2PA: https://www.maginative.com/article/tiktok-partners-with-c2pa-to-label-ai-generated-content-and-promote-media-literacy/
- TikTok Creator Rewards 2026: https://www.shortsync.app/resources/tiktok-creator-rewards-program-2026
- Instagram 5-hashtag cap: https://later.com/blog/instagram-hashtags/amp
- Instagram AI labels 2026: https://howsociable.com/news/2026/04/instagram-ai-content-labels-required-april-2026
- YouTube Shorts limits 2026: https://shortsync.app/resources/youtube-shorts-upload-requirements-2026
- YouTube Shorts hashtags: https://hashtagtools.io/blog/youtube-shorts-character-limits-title-description-hashtags-2026
