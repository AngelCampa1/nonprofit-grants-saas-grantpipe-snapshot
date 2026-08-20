# LinkedIn Content Engine

Automated generation of 10 LinkedIn posts + 1 LinkedIn article per day, sourced from the markdown files under `packages/shared/src/knowledge/marketing/content/`.

## Runway

- **627 post angles** extracted across 11 post types → **62 days at 10 posts/day**
- **150 article candidates** from guides + workflows → **150 days at 1 article/day**
- 29 source files were skipped (git merge conflicts) — resolving these and rebuilding the queue would add capacity.

## Setup

1. Get an Anthropic API key from <https://console.anthropic.com/>
2. Either export it: `export ANTHROPIC_API_KEY=sk-ant-...`
3. Or create `.env.linkedin` at the repo root:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

## Commands

```bash
# Step 1 (one-time): build the queue from all content files
pnpm linkedin:build-queue

# Step 2: generate one day's content (defaults to today)
pnpm linkedin:generate
pnpm linkedin:generate --date=2026-04-28

# Step 3 (optional): bulk-generate the entire backlog upfront
pnpm linkedin:bulk                       # 60 days
pnpm tsx scripts/linkedin/generate-day.ts --bulk --days=62 --date=2026-04-27

# Test pipeline structure without burning API credits:
pnpm linkedin:generate --dry-run
```

## Output

```
linkedin-output/
  master.csv            # all posts ever generated, importable to Buffer/Taplio
  2026-04-27/
    posts.md            # 10 numbered posts, copy-paste ready
    article.md          # 1 LinkedIn article draft (1,200-2,000 words)
  2026-04-28/
    posts.md
    article.md
  ...
```

`master.csv` columns: `date, slot, type, post_text, hashtags, source_file, has_cta`

## Post type rotation

Each day rotates through 10 types, one per slot:

1. **stat_bomb** — shocking numbers from `pricingStats` frontmatter (CTA on even days)
2. **myth_buster** — common misconceptions corrected via FAQs
3. **workflow_step** — one step from a multi-step workflow
4. **term_explained** — glossary term made human
5. **tool_teardown** — frank cost/limitation breakdown of competing tools
6. **vertical_hook** — addressed to a specific nonprofit vertical
7. **free_resource** — announces a lead-magnet download
8. **comparison_insight** — head-to-head decision framework (CTA on odd days)
9. **question_post** — engagement prompt by persona
10. **product_insight** — soft GrantPipe CTA (always CTA)

## Anti-slop rules

The system prompts enforce:

- Banned words: `delve`, `tapestry`, `navigate`, `landscape`, `robust`, `seamlessly`, `leverage`, `journey`, `unlock`, `empower`, etc.
- Banned phrases: "mission-driven organizations", "making a difference", "in today's", etc.
- Every post must contain a specific: regulation cite, dollar amount, percentage, named tool, or process step
- Max 280 words per post; 1,200–2,000 words per article
- No exclamation marks

## Scheduling

To run daily at 7am via Windows Task Scheduler:

```powershell
$action = New-ScheduledTaskAction -Execute 'pnpm' -Argument 'tsx scripts/linkedin/generate-day.ts' -WorkingDirectory '<path-to-repo-checkout>'
$trigger = New-ScheduledTaskTrigger -Daily -At 7am
Register-ScheduledTask -TaskName 'GrantPipe-LinkedIn-Daily' -Action $action -Trigger $trigger
```

(Ensure `ANTHROPIC_API_KEY` is set in the user environment before scheduling.)

## Files

| File                        | Role                                                                |
| --------------------------- | ------------------------------------------------------------------- |
| `build-queue.ts`            | One-time queue builder — scans all content, extracts post angles    |
| `generate-day.ts`           | Daily entry point — consumes queue, calls Claude API, writes output |
| `queue.json`                | State: `{ posts: [...], articles: [...] }` with `consumed` flags    |
| `prompts/system-post.md`    | Post generation rules + anti-slop                                   |
| `prompts/system-article.md` | Article generation rules + anti-slop                                |
