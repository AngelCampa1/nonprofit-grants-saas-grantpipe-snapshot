# LinkedIn Content Engine — Handoff Report

**Date:** 2026-04-27 (updated 2026-04-28)
**Status:** ✅ Pipeline complete and verified · ✅ Full 35-day backlog generated (2026-04-27 through 2026-05-31)
**Plan file:** kept in the local agent plan directory, outside this repository

---

## Original Goal

Transform the markdown content files under `packages/shared/src/knowledge/marketing/content/` into:

- **10 LinkedIn posts/day** (2 with soft GrantPipe CTA, 8 educational)
- **1 LinkedIn article/day** (1,200–2,000 words)
- Voice: GrantPipe brand, third person
- Output: daily markdown files + master CSV for Buffer/Taplio import
- Sub-agent driven (no external API calls — generated in-session by Claude Code agents)

---

## Runway

|                  | Capacity       | Days                       |
| ---------------- | -------------- | -------------------------- |
| Posts (10/day)   | 694 angles     | **~69 days**               |
| Articles (1/day) | 160 candidates | **~160 days**              |
| **Bottleneck**   | Posts          | **~69 days (~2.3 months)** |

Note: The 29 previously-conflicted source files had no remaining conflict markers when the queue was rebuilt on 2026-04-27. The rebuilt queue still produced 694 posts + 160 articles — same as before. The bottleneck was `question_post` (9 entries total), which depleted after 8 days. The `how_to` (144) and `list_post` (27) post types are unused in the canonical pattern and form a natural extended runway.

---

## ✅ Completed

### Infrastructure

- `scripts/linkedin/build-queue.ts` — scans 474 content files, parses frontmatter with gray-matter, extracts 11 post-type angles, writes `queue.json`
- `scripts/linkedin/generate-day.ts` — daily orchestrator (supports `--date`, `--bulk --days=N`, `--dry-run`); was originally written for Anthropic API but pivoted to sub-agent driven per user direction
- `scripts/linkedin/queue.json` — 694 posts + 160 articles, gitignored
- `scripts/linkedin/prompts/system-post.md` — anti-slop voice rules + format contract for posts
- `scripts/linkedin/prompts/system-article.md` — anti-slop voice rules + format contract for articles
- `scripts/linkedin/README.md` — setup, commands, scheduling instructions
- `package.json` — added `linkedin:build-queue`, `linkedin:generate`, `linkedin:bulk` pnpm scripts
- `.gitignore` — excludes `linkedin-output/` and `scripts/linkedin/queue.json`

### Verification

- ✅ Queue builder runs clean (skips 29 conflict files gracefully)
- ✅ Dry-run for 2026-04-27 produced 10 posts (one of each type) + 1 article placeholder
- ✅ 3-day dry-run depleted queue sequentially with no source repeats
- ✅ CSV format validated with proper escaping
- ✅ CTA assignment logic correct (post 10 always; post 1 or 8 alternating)

### Day 1 Real Generation (2026-04-27)

- ✅ Generated via Agent (general-purpose sub-agent)
- ✅ All 10 posts + 1,373-word article written to `linkedin-output/2026-04-27/`
- ✅ Master CSV initialized and populated
- ✅ Queue.json updated (11 entries marked consumed: 684 posts + 159 articles remaining)
- ✅ Banned-phrase grep returns zero matches
- ✅ Quality verified: real regulation cites (2 CFR 200.308(e)(4), 2 CFR 200.334, $1M single audit threshold, Davis-Bacon, ETA-9130, PIRL, OMB Compliance Supplement), real tool pricing (Salesforce $60–$165/user, Blackbaud $5K–$15K+/yr, AmpliFund $15K–$50K), specific tactical advice throughout

**Article topic:** "Grant Closeout Record Retention: When the Clock Starts and What to Keep"

---

## ✅ Backlog Generation Complete

### What was generated (Days 1–35)

| Days      | Dates                         | Posts   | Articles |
| --------- | ----------------------------- | ------- | -------- |
| 1–8       | 2026-04-27 through 2026-05-04 | 80      | 8        |
| 9–35      | 2026-05-05 through 2026-05-31 | 270     | 27       |
| **Total** | **35 days**                   | **350** | **35**   |

**Total output:** 350 LinkedIn posts · 35 articles · 350 rows in `master.csv` (351 lines including header)

**Quality verified:** Banned-phrase grep returns zero on spot-checked days (9, 19, 31). All articles 1,200–2,000 words. master.csv 351 lines (1 header + 350 rows), 10 per day, all clean.

### Substitution pattern used (days 9–35)

The canonical 10-type-per-day pattern required adaptation as pools depleted:

- `question_post` (0 remaining) → `list_post` substituted from day 9 onward
- `product_insight` (depleted after day 5 of the second run) → `how_to` from day 14 onward
- `vertical_hook` (depleted after day 15 of the second run) → `how_to` from day 24 onward
- `comparison_insight` (depleted after day 22 of the second run) → `how_to` from day 31 onward

### Queue state (as of 2026-05-31)

| Post type              | Remaining        |
| ---------------------- | ---------------- |
| how_to                 | 105              |
| myth_buster            | 120              |
| stat_bomb              | 44               |
| tool_teardown          | 31               |
| workflow_step          | 31               |
| term_explained         | 13               |
| **list_post**          | **0 — DEPLETED** |
| **free_resource**      | **0 — DEPLETED** |
| **comparison_insight** | **0 — DEPLETED** |
| **vertical_hook**      | **0 — DEPLETED** |
| **product_insight**    | **0 — DEPLETED** |
| **question_post**      | **0 — DEPLETED** |
| Articles remaining     | 125              |

### build-queue.ts improvement

`build-queue.ts` now preserves consumed flags when rebuilding — it reads the existing `queue.json`, indexes consumed IDs, and re-applies them after rebuild. Safe to run `pnpm linkedin:build-queue` at any time without losing generation history.

### Outstanding setup tasks (user actions required)

1. **Import to Buffer/Taplio:** `linkedin-output/master.csv` has 350 rows ready for import.
2. **To extend beyond 2026-05-31:** All common slot types are depleted. A further run would draw from `how_to` (105 remaining), `myth_buster` (120), `stat_bomb` (44), `tool_teardown` (31), and `workflow_step` (31). Say "generate next N days of LinkedIn content" — Claude Code will adapt the slot pattern from the remaining pools.
3. **Scheduling cadence:** See `scripts/linkedin/README.md` for Windows Task Scheduler setup.

### Things that were built but pivoted away from

- The Anthropic SDK integration in `generate-day.ts` (used `claude-haiku-4-5-20251001` for posts, `claude-sonnet-4-6` for articles) is functional but not the active path. The `--dry-run` flag and `loadDotEnv()` helper remain useful.

---

## File Map

| Path                                                | Purpose                          | State                                               |
| --------------------------------------------------- | -------------------------------- | --------------------------------------------------- |
| `scripts/linkedin/build-queue.ts`                   | Queue builder                    | ✅ Working                                          |
| `scripts/linkedin/generate-day.ts`                  | API-mode generator + dry-run     | ✅ Working (API path unused)                        |
| `scripts/linkedin/queue.json`                       | State (consumed flags)           | ✅ 385 consumed, 344 posts + 125 articles remaining |
| `scripts/linkedin/prompts/system-post.md`           | Post voice rules                 | ✅ Locked                                           |
| `scripts/linkedin/prompts/system-article.md`        | Article voice rules              | ✅ Locked                                           |
| `scripts/linkedin/README.md`                        | User documentation               | ✅ Complete                                         |
| `linkedin-output/master.csv`                        | All posts (Buffer/Taplio import) | ✅ 350 rows (35 days × 10), 351 lines incl. header  |
| `linkedin-output/2026-04-27/` through `2026-05-31/` | 35 daily folders                 | ✅ posts.md + article.md each                       |

---

## How to Continue (handoff steps)

### To generate the next day via sub-agent (current preferred path):

Spawn a `general-purpose` Agent with this prompt structure:

```
Read scripts/linkedin/prompts/system-post.md
and scripts/linkedin/prompts/system-article.md.

Read scripts/linkedin/queue.json.

Pick the FIRST UNCONSUMED entry of each post type in this order:
stat_bomb, myth_buster, workflow_step, term_explained, tool_teardown,
vertical_hook, free_resource, comparison_insight, question_post, product_insight.
Pick the FIRST UNCONSUMED article entry.

For each entry, read its sourceFile to ground the post in real content (real
regulation cites, real numbers, real tool names — never invent).

Generate 10 posts following system-post.md format. Posts 1 and 10 get soft
GrantPipe CTAs; the other 8 are educational only.

Generate the article following system-article.md (1,200–2,000 words).

Write to:
- linkedin-output/{DATE}/posts.md
- linkedin-output/{DATE}/article.md
- Append 10 rows to linkedin-output/master.csv

Mark all 11 picked entries as consumed:true in queue.json.
```

### To bulk-generate via parallel agents:

1. Pre-slice the queue into per-day batches (read queue.json, partition the next N×11 unconsumed entries)
2. Spawn N parallel agents, each with its specific entry IDs pre-assigned (avoids race conditions on queue.json)
3. After all complete, do one consolidating pass to merge consumed flags + CSV rows

### To regenerate the queue from scratch:

```bash
pnpm linkedin:build-queue
```

### To verify any day's output:

```bash
# Banned phrase check (must return nothing)
grep -iE "delve|tapestry|navigate|landscape|robust|seamlessly|leverage" linkedin-output/{DATE}/posts.md linkedin-output/{DATE}/article.md

# Word count check
wc -w linkedin-output/{DATE}/article.md   # must be 1200-2000
```

---

## Quality Bar (locked, do not loosen)

Every post must contain at least one specific: regulation cite, dollar amount, percentage, named tool, or process step. Zero generic platitudes. Hook line must be concrete (number, regulation name, scenario). Banned-word list in `prompts/system-post.md` is non-negotiable.

Day 1 hit this bar across all 10 posts and the article. Subsequent days should be spot-checked against the same standard before publishing.
