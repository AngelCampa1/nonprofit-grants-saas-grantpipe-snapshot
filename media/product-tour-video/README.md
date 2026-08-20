# GrantPipe Product Tour Video

Professional product walkthroughs for GrantPipe:

- 5-minute landscape product tour for YouTube.
- Sub-3-minute portrait cut for YouTube Shorts.

This project is separate from `media/explainer-video` and `media/launch-video`.
It uses real local in-app footage from the seeded demo account, AI narration,
and restrained product-tour pacing.

## Local Prerequisites

- Web app: `http://localhost:3050`
- API: `http://localhost:5050`
- Postgres: `localhost:55439`
- Capture account: set with `GRANTPIPE_CAPTURE_EMAIL`

Do not record credentials in final footage. The capture script reads login
credentials from environment variables and logs in before recorded scene
contexts are created.

## Commands

```bash
npm run capture
npm run voice
npm run voice:shorts
npm run check
npm run check:shorts
npm run render:draft
npm run render:final
npm run render:shorts:draft
npm run render:shorts:final
```

`npm run render:final` renders the 1920x1080 master and then normalizes the
audio to the public delivery target. Use `npm run render` only when you
intentionally want the unnormalized intermediate MP4.

`npm run render:shorts:final` renders the 1080x1920 Shorts cut and normalizes
the audio to the same public delivery target. The Shorts script is intentionally
tighter and faster than the 5-minute landscape narration.

## Output

- Draft: `renders/grantpipe-product-tour-landscape-draft.mp4`
- Final: `renders/grantpipe-product-tour-landscape.mp4`
- Shorts draft: `renders/grantpipe-product-tour-shorts-portrait-draft.mp4`
- Shorts final: `renders/grantpipe-product-tour-shorts-portrait.mp4`

Captured clips, generated SFX, generated voice audio, and renders are local
build artifacts. They are ignored so the repository keeps the project source
without committing large binary media; regenerate them with the commands above.

## Production Standard

Use recursive review. A draft is not final until product-accuracy,
taste/professionalism, and workflow-clarity review passes have no blocking
findings.
