# Writer Brief: June 1-14 GrantPipe LinkedIn Campaign

Use this brief for batch writing. Do not create posts from a template script. Use LLM assistance as a drafting partner, then manually edit every post.

Evidence files to keep open:

- `docs/social/linkedin/june-2026-campaign/evidence/linkedin-export-summary.json`
- `docs/social/linkedin/june-2026-campaign/evidence/linkedin-post-engagement.csv`
- `docs/social/linkedin/june-2026-campaign/evidence/linkedin-daily-metrics.csv`
- `.agents/product-marketing.md`
- `.agents/product-marketing-context.md`
- `docs/social/linkedin/WRITER-BRIEF.md`
- `docs/social/linkedin/2026-05-10-strategy.md`
- `content/social/linkedin/SCHEDULE.md`

## Non-Negotiables

- No em dashes or en dashes.
- No fake proof. No testimonials, user counts, logo claims, "trusted by", or invented customer stories.
- No unsupported aggregate claims. Avoid "most nonprofits", "most teams", and "common pattern" unless a named source supports the sentence.
- No claim that Angel has nonprofit operator experience. Write from the builder perspective.
- No proprietary private grant database claims. Safe wording: Grants.gov federal opportunity search is included; non-federal opportunities can be manually tracked or imported.
- One CTA max per post.
- Zero emojis.
- Usually zero hashtags. If a hashtag is necessary, use no more than 3 and keep them generic.
- Every illustrative scene must be clearly hypothetical.
- Every post gets a humanizer pass and a review pass.

## What The Export Says To Write

The best organic reach came from specific compliance and operating artifacts:

- Audit binder checklist on 2026-05-12: 1,663 organic impressions.
- SF-425 cash drawn vs general ledger quick check on 2026-05-15: 1,631 organic impressions.
- Donor CRM to general ledger reconciliation on 2026-05-12: 1,061 organic impressions.
- "Three places a grant can live simultaneously" on 2026-05-15: 666 organic impressions.
- Federal program officer request list on 2026-05-14: 604 organic impressions.

The best comments came from sharper, sourced posts:

- Matching funds under 2 CFR 200.306 on 2026-05-05: 4 comments, 2 reactions, 2 clicks.
- "Our CRM handles grants" myth on 2026-05-10: 3 comments, 1 reaction.
- Access controls and nonprofit data security on 2026-05-04: 2 comments, 2 reactions.
- Questioned costs definition on 2026-05-01: 2 comments, 1 reaction.
- Executive Director board prep question on 2026-04-28: 2 comments, 1 reaction.

The 2026-05-12 product overview post reached 8,042 total impressions only because the export also shows 8,006 sponsored impressions for the same activity link. Its organic row had 36 impressions. Do not copy that pattern as an organic strategy.

## Pillars

Use the pillar plan from `strategy.md`:

- P1 Compliance and audit: SF-425, SEFA, evidence trail, audit binder, 2 CFR 200, questioned costs, match, closeout.
- P2 Restricted funds: FASB ASC 958, releases, restricted balances, net asset class schedule, donor restrictions.
- P3 Donor plus grant unification: CRM, GL, spreadsheet, shared drive, Development to Finance handoff, board packet mismatch.
- P4 Federal grants: Grants.gov, UEI, pass-through awards, ALN, FFATA, indirect cost, period of performance.
- P5 ICP work life: board prep, audit week, year-end close, donor stewardship, development calendar. Usually no product mention.
- P6 Build-in-public: public pricing, no setup fee, grants and funds as separate entities, no fabricated proof.
- P7 Lead-magnet teaser: one named resource, what it contains, why it helps.

## Banned Repeats

Do not repeat these hooks more than once per day:

- "Picture this:"
- "Quick check:"
- "Three places..."
- "The quiet cost..."
- "If the answer is..."
- "This is not a software problem first."
- "Single source of truth is not a slogan."
- "That is where audit findings live."
- "The binder is not the audit."
- "No Salesforce admin required."

Do not use these words or phrases in post copy:

- solution
- leverage
- synergy
- empower
- transform
- revolutionize
- orchestrate
- intelligent automation
- AI-powered as a fluff phrase
- changemakers
- impact warriors
- unlock
- supercharge
- game-changer
- holistic
- world-class
- best-in-class
- robust
- seamless
- cutting-edge

## Writing Rules

- First line must stand alone in the feed.
- Prefer one idea per post.
- Use exact nouns: SF-425, SEFA, ALN, UEI, restricted fund, release from restriction, general ledger, board packet.
- If using a number, know its source and include the source in metadata.
- If using a regulation, name the regulation and section.
- If using a product claim, verify it against `.agents/product-marketing.md` and `.agents/product-marketing-context.md`.
- If writing a scene, use "Picture this:" or second-person framing. Never imply the event happened.
- If writing about competitors, use public and named source evidence. Do not overstate gaps.
- If writing a CTA, choose exactly one: trial, pricing, or one lead magnet.

## Humanizer Checklist

Run this after drafting and before review:

- Remove em dashes and en dashes.
- Replace throat-clearing with the actual point.
- Cut inflated phrasing such as "key", "crucial", "vital", "landscape", "underscores", "showcases", and "testament".
- Break same-length paragraphs.
- Remove generic social filler.
- Check for forced groups of three. Keep three only when the three items are genuinely the right set.
- Replace vague claims with named artifacts or named sources.
- Read the post aloud. If it sounds like a press release, rewrite it.
- Confirm the first 180 characters make sense without the rest of the post.

## Review Checklist

Every post must pass this before it is scheduled:

- Claim safety: every factual claim is source-backed or framed as product logic.
- Brand safety: no fake proof, no sector-tenure claims, no invented customer voice.
- Product safety: Grants.gov and non-federal opportunity claims follow the approved boundary.
- CTA safety: one CTA max, and no more than 3 CTA posts on the same day.
- Evidence fit: the post uses a pattern supported by the export or is marked as a deliberate experiment.
- Repetition: no repeated hook pattern within 24 hours.
- Length: short under 400 characters, medium 400 to 900, long 900 to 1,400.
- Formatting: no emojis, no hashtag block, no metadata inside the final post body.
- Final grep: no em dash or en dash characters.

## Required Metadata For Postiz-Ready Posts

When the batch writer creates the posts later, each scheduled item must carry these fields in the planning table or Postiz import source. The final LinkedIn body should not include this metadata.

| Field              | Requirement                                                     |
| ------------------ | --------------------------------------------------------------- |
| `post_id`          | Stable file-style id, for example `2026-06-01_06-45_mon-01`.    |
| `scheduled_at_et`  | Exact date and time in ET.                                      |
| `timezone`         | `America/New_York`.                                             |
| `platform`         | `linkedin`.                                                     |
| `account`          | `GrantPipe company page`.                                       |
| `pillar`           | One of P1 through P7.                                           |
| `hook_code`        | Q, N, S, L, D, C, K, B, or F.                                   |
| `length_code`      | `s`, `m`, or `l`.                                               |
| `cta_type`         | `none`, `trial`, `pricing`, or `lead_magnet`.                   |
| `cta_url`          | Empty unless a CTA is used.                                     |
| `claim_sources`    | Evidence file, regulation, public source, or `product-context`. |
| `export_pattern`   | The May export pattern being reused, or `experiment`.           |
| `humanizer_status` | `pending`, `passed`, or `failed`.                               |
| `review_status`    | `pending`, `passed`, or `failed`.                               |
| `review_notes`     | Short note for any claim or style concern.                      |
| `post_body`        | Final paste-ready LinkedIn copy.                                |

## Batch Workflow

1. Pick the date allocation from `strategy.md`.
2. Draft 15 distinct posts for that date. Do not use a script to expand templates.
3. Attach metadata to every post.
4. Run the humanizer checklist.
5. Run the review checklist.
6. Fix every issue.
7. Only then move the post into the Postiz-ready source.

The June campaign succeeds only if the posts feel individually written. High volume is the test condition, not an excuse for repeated language.
