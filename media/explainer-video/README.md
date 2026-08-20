# GrantPipe Explainer Video

Voice-led HyperFrames explainer video for GrantPipe, built in two aspect ratios from one project:

- Landscape: `renders/grantpipe-explainer-landscape.mp4` (`1920x1080`, 65s, 30fps)
- Portrait: `renders/grantpipe-explainer-portrait.mp4` (`1080x1920`, 65s, 30fps)

## Commands

```bash
npm run check
npm run render
npm run render:landscape
npm run render:portrait
npm run render:draft
```

## Notes

- The narration script is in `script.txt`.
- For TTS generation, keep the visual CTA as `GrantPipe.com`, but cue the voice
  as `GrantPipe, dot com` so the domain is pronounced naturally.
- Voice A Energized is the selected narration used in the final renders. It is
  based on HyperFrames Kokoro `af_nova`, with a modest speed and pitch lift for
  more showcase energy.
- Voice A is retained as the calmer alternate generated with HyperFrames Kokoro
  `af_nova`.
- Voice B was generated with HyperFrames Kokoro `af_heart` and
  tempo-adjusted to fit inside the 65-second composition.
- Sound design reuses the soft launch-video SFX, ducked under narration.
- Product visuals reuse existing GrantPipe screenshots copied into `assets/`.
- Brand frames use the real GrantPipe SVG logo, not a recreated placeholder mark.
