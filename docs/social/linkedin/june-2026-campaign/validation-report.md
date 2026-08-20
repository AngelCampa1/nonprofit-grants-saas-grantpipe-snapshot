# June 2026 LinkedIn Campaign Validation

Checked at: 2026-05-19T22:39:44.943Z

## Result

Issue count: 0

## Counts

- Total posts: 210
- Unique post bodies: 210
- Max body characters: 1115
- Humanizer statuses: {"passed":210}
- Review statuses: {"passed":210}
- Postiz JSONL rows: 210
- Postiz CSV records including header: 211

## Date Counts

- 2026-06-01: 15
- 2026-06-02: 15
- 2026-06-03: 15
- 2026-06-04: 15
- 2026-06-05: 15
- 2026-06-06: 15
- 2026-06-07: 15
- 2026-06-08: 15
- 2026-06-09: 15
- 2026-06-10: 15
- 2026-06-11: 15
- 2026-06-12: 15
- 2026-06-13: 15
- 2026-06-14: 15

## CTA Counts

- 2026-06-01: 2
- 2026-06-02: 3
- 2026-06-03: 3
- 2026-06-04: 2
- 2026-06-05: 3
- 2026-06-06: 2
- 2026-06-07: 2
- 2026-06-08: 2
- 2026-06-09: 2
- 2026-06-10: 3
- 2026-06-11: 2
- 2026-06-12: 2
- 2026-06-13: 2
- 2026-06-14: 3

## Output Files

- README.md
- postiz-import.csv
- postiz-socialpost-payload.json
- postiz-socialpost-payload.jsonl

## Issues

- None

## Final Release Review: 2026-05-19

Reviewed the full June campaign artifact against the strategy, writer brief,
product-marketing context, batch review notes, final Postiz files, and the
original objective.

Issues found and fixed:

- Removed fake-proof wording from `2026-06-07_16-30_sun-13` and
  `2026-06-10_16-30_wed-13`.
- Softened broad or aggregate-risk wording in seven posts:
  `2026-06-02_15-30_tue-12`, `2026-06-04_09-45_thu-05`,
  `2026-06-04_11-15_thu-07`, `2026-06-04_12-45_thu-09`,
  `2026-06-08_07-30_mon-02`, `2026-06-10_08-15_wed-03`, and
  `2026-06-13_13-30_sat-10`.
- Normalized `scheduled_at_et` metadata in the June 4-7 and June 11-14 batch
  JSONL files from ISO-like local timestamps to `YYYY-MM-DD HH:mm`, matching
  the June 1-3, June 8-10, and Postiz CSV formats.
- Regenerated the Postiz JSON, JSONL, and CSV scheduling artifacts after copy
  edits so file bodies, batch JSONL, and Postiz bodies stay in parity.

Fresh verification result:

- 210 owned `.txt` post files.
- 210 batch JSONL rows.
- 210 unique post bodies.
- 210 Postiz JSON `socialPost` rows.
- 210 Postiz JSONL rows.
- 211 Postiz CSV records including header.
- 15 posts per day for each date from 2026-06-01 through 2026-06-14.
- Daily CTA counts are 2 or 3, never above the campaign cap.
- Max post body length is 1115 characters, under the 3000-character Postiz
  limit.
- All `humanizer_status` values are `passed`.
- All `review_status` values are `passed`.
- JSON parse, JSONL parse, body/file parity, date/time slot counts, em/en dash
  scan, banned-term scan, fake-proof scan, and Postiz artifact validation all
  passed with zero remaining issues.
