# Postiz Scheduling Source: GrantPipe LinkedIn June 1-14, 2026

This folder contains the reviewed scheduling source for 210 GrantPipe LinkedIn company-page posts.

## Files

- `postiz-socialpost-payload.json`: MCP/API-style payload with a top-level `socialPost` array.
- `postiz-socialpost-payload.jsonl`: one Postiz-ready payload per line for a local scheduler loop.
- `postiz-import.csv`: CSV fallback for inspection, transformations, or shell-driven scheduling.

## Before Scheduling

1. Fill `integrationId` with the GrantPipe LinkedIn Page integration id.
2. Keep `settings` as `{"__type":"linkedin-page","post_as_images_carousel":false}`.
3. Use `date` for UTC scheduling time and `scheduledAtLocal` for human review.
4. Schedule with a resumable runner and reconcile queued posts before reruns.
5. Do not run a fast fire-and-forget loop. Prior Postiz runs hit throttling when pacing was too aggressive.

## Counts

- Date range: 2026-06-01 through 2026-06-14.
- Cadence: 15 posts per day.
- Total posts: 210.
- Humanizer status: passed on every row.
- Independent review status: passed on every row.
