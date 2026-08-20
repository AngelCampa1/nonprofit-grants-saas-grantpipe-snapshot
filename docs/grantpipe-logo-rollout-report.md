# GrantPipe Logo Rollout Report

Date: 2026-04-27

## Current State

The approved no-piping GrantPipe logo rollout has been implemented, reviewed, committed, and merged into `master`.

- Feature branch: `codex/logo-rollout`
- Feature commit: `d204993 feat(brand): roll out approved GrantPipe logo`
- Merge commit on `master`: `7743745 Merge branch 'codex/logo-rollout'`
- Current main checkout: the repository root on `master`
- Temporary worktree registration: removed from Git worktree list
- Temporary physical worktree directory: removed after stopping stale preview
  processes rooted in `.worktrees\logo-rollout`

There are unrelated local changes still present in the main checkout:

- `.gitignore`
- `package.json`
- `pnpm-lock.yaml`
- `.claude/launch.json`
- `docs/seo/grantpipe seo.md`
- `new-urls.txt`
- `scripts/linkedin/`

Those were not part of the logo rollout.

## Original Plan

Roll out the approved no-piping GrantPipe logo everywhere the brand appears:

- Create isolated worktree branch `codex/logo-rollout`.
- Recreate the approved generated logo as durable vector-first assets.
- Replace marketing site logos, favicons, touch icons, and OG imagery.
- Replace web app chrome/auth/mobile branding.
- Add branded HTML email headers while keeping plain-text emails clean.
- Avoid pipe, routing, arrow, or flow imagery in asset names, alt text, copy, and fallback descriptions.
- Add/update tests first, then implement.
- Run affected test/build/typecheck checks.
- Use sub-agents for exploration, implementation support, and review.
- Merge to `master`, remove the worktree, and deploy affected apps with Wrangler scripts.

## Implemented Changes

### Brand Assets

Created a clean logo asset suite based on the approved reference image:

- `apps/site/public/logo-light.svg`
- `apps/site/public/logo-light.svg`
- `apps/site/public/favicon.svg`
- `apps/site/public/apple-touch-icon.png`
- `apps/site/public/logo-email.png`
- `apps/site/src/assets/logo-light.svg`
- `apps/site/src/assets/logo-light.svg`
- `apps/site/src/assets/logo-icon.svg`
- `apps/site/src/assets/logo-wordmark.svg`
- `apps/web/public/favicon.svg`
- `apps/web/public/apple-touch-icon.png`
- `apps/web/public/brand/grantpipe-logo-mark.svg`
- `apps/web/public/brand/grantpipe-logo-light.svg`
- `apps/web/public/brand/grantpipe-logo-light.svg`

The horizontal SVG wordmarks were changed from live SVG text to vector paths after review so they do not depend on a client font being available.

### Marketing Site

Updated the marketing site brand assets and regression tests:

- Replaced public logo and favicon assets in `apps/site/public/`.
- Replaced OG/social preview PNG assets:
  - `apps/site/public/og-default.png`
  - `apps/site/public/og-alternatives.png`
  - `apps/site/public/og-guides.png`
  - `apps/site/public/og-pricing.png`
  - `apps/site/public/og-solutions.png`
  - `apps/site/public/og-state-pages.png`
- Updated `apps/site/src/site-template-regressions.test.ts` to assert the new ledger/cube logo contract and reject retired logo characteristics.

### Web App

Updated authenticated app branding:

- Added web app favicon and touch icon assets.
- Added static brand assets under `apps/web/public/brand/`.
- Updated `apps/web/index.html` with favicon and apple-touch icon links.
- Updated app sidebar branding in `apps/web/src/components/shell/app-sidebar.tsx`.
- Updated auth layout desktop and mobile branding in `apps/web/src/components/shell/auth-layout.tsx`.
- Preserved accessible home labels with `aria-label="GrantPipe home"`.
- Made decorative logo images use empty alt text inside already-labeled links to avoid redundant screen reader output.

### Emails

Added a shared branded email header helper:

- `apps/api/src/lib/email-brand.ts`
- `apps/api/src/lib/email-brand.test.ts`

Updated HTML emails to include a non-critical branded header image:

- Password reset emails in `apps/api/src/lib/password-reset-email.ts`
- Trial ending emails in `apps/api/src/domains/billing/emails.ts`
- Feedback emails in `apps/api/src/domains/feedback/service.ts`
- Lead nurture emails in `apps/api/src/domains/leads/nurture-copy.ts`

Plain-text email bodies remain logo-free and readable if images are blocked.

The email logo URL now respects `MARKETING_URL` where available and safely falls back to:

```text
https://grantpipe.com/logo-email.png
```

## Tests And Verification Completed

### TDD / Focused Tests

The initial focused web tests were written and run before implementation and failed as expected because the new logo assets/branding did not exist yet.

After implementation, these focused checks passed:

```bash
pnpm --filter @grantpipe/web exec vitest run src/components/shell/app-sidebar.test.tsx src/components/shell/auth-layout.test.tsx src/components/shell/brand-assets.test.ts --reporter=verbose --maxWorkers=1 --pool=forks
```

Result: 3 files, 50 tests passed.

```bash
pnpm --filter @grantpipe/site exec vitest run src/site-template-regressions.test.ts src/content-body-link-contract.test.ts src/lib/og-image.test.ts --reporter=verbose --maxWorkers=1 --pool=forks
```

Result: 28 tests passed.

```bash
pnpm --filter @grantpipe/api exec vitest run src/lib/email-brand.test.ts src/lib/password-reset-email.test.ts src/domains/billing/emails.test.ts src/domains/billing/webhooks.test.ts src/domains/feedback/service.test.ts src/domains/leads/emails.test.ts src/domains/leads/nurture-copy.test.ts --reporter=verbose --maxWorkers=1 --pool=forks
```

Result: 7 files, 863 tests passed.

### Broader Checks

Passed:

- `pnpm --filter @grantpipe/api test`
- `pnpm --filter @grantpipe/api typecheck`
- `pnpm --filter @grantpipe/site test`
- `pnpm --filter @grantpipe/web build`
- `pnpm --filter @grantpipe/site build`

Known pre-existing or unrelated check issues:

- `pnpm --filter @grantpipe/web test` timed out during broad discovery/run.
- `pnpm --filter @grantpipe/web typecheck` failed on an unrelated duplicate JSX attribute in `src/routes/_authenticated/grants/index.test.tsx`.
- `pnpm --filter @grantpipe/site typecheck` failed on unrelated existing Astro content typing issues.
- Targeted coverage showed changed files were covered, but global coverage commands failed because untouched files counted below threshold. `apps/api/src/domains/leads/nurture-copy.ts` also remains below per-file threshold because it is a large existing copy matrix module and only the email header integration changed.

### Visual Verification

Local previews were checked before merge:

- Web auth screen at `http://localhost:4174/app/login` showed the new logo in the dark auth aside.
- Marketing site home page at `http://localhost:4323/` showed the new logo in the light header.

### Review

A review agent checked the complete worktree.

Issues found and fixed:

- Horizontal SVGs used live `<text>`/`font-family`; fixed by converting the wordmark to vector paths.
- Logo images inside accessible links had redundant alt text; fixed with decorative `alt=""` and `aria-hidden="true"` on the images while preserving link labels.
- Email logo URL was initially hardcoded to production; fixed with `buildEmailLogoUrl(marketingUrl)` and tests.

Final reviewer result: no remaining blockers for merge/deploy.

## Deployment Work Completed

After the initial merge, these deploy commands completed successfully:

```bash
pnpm run deploy:api
pnpm run deploy:web
```

The root `pnpm run deploy:site` failed on PowerShell because the script uses Unix-style environment assignment:

```bash
REQUIRE_LEAD_MAGNET_PDF_BUILD=1 pnpm --filter @grantpipe/site run build
```

The same production sequence was then run manually with PowerShell syntax:

```powershell
$env:REQUIRE_LEAD_MAGNET_PDF_BUILD='1'; pnpm --filter @grantpipe/site run build
pnpm run sync:lead-magnets:r2
pnpm run verify:lead-magnets:r2
pnpm --filter @grantpipe/site run deploy
```

Those completed successfully once:

- API deployed.
- Web deployed.
- Site deployed to `grantpipe-site`.
- Site deploy returned version ID `9deb6fb5-f938-4b22-95a1-7ff0dc9c5e74`.
- R2 verification confirmed all 35 lead-magnet PDFs were available.

After noticing `master` had moved back to `upstream/master`, the logo rollout branch was merged again into current `master` at `7743745`, and redeploys were started from the final merged state:

- `pnpm run deploy:api` completed successfully.
- `pnpm run deploy:web` completed successfully.
- `$env:REQUIRE_LEAD_MAGNET_PDF_BUILD='1'; pnpm --filter @grantpipe/site run build` completed successfully.
- `pnpm run sync:lead-magnets:r2` was interrupted when this report was requested.

The interrupted final site deploy sequence was completed from current `master` commit `7743745`:

```powershell
pnpm run sync:lead-magnets:r2
pnpm run verify:lead-magnets:r2
pnpm --filter @grantpipe/site run deploy
```

Final deploy results:

- R2 sync uploaded all 35 lead-magnet PDFs.
- R2 verification confirmed all 35 lead-magnet PDFs were available.
- Site deployed to `grantpipe-site`.
- Site deploy returned version ID `c41d6f5c-8b8e-45a4-a6a0-f41dcf265d6a`.
- The deploy uploaded the new public logo assets, including `logo-email.png`,
  `favicon.svg`, `logo-light.svg`, `logo-light.svg`, `apple-touch-icon.png`,
  and OG images.

Production URL verification after the final deploy:

| URL                                    | Result                  |
| -------------------------------------- | ----------------------- |
| `https://grantpipe.com/`               | 200 OK                  |
| `https://www.grantpipe.com/`           | 200 OK                  |
| `https://app.grantpipe.com/`           | 200 OK                  |
| `https://grantpipe.com/logo-email.png` | 200 OK, `image/png`     |
| `https://grantpipe.com/favicon.svg`    | 200 OK, `image/svg+xml` |

The stale physical worktree directory
`.worktrees/logo-rollout` was removed after
stopping the old Astro preview, Vite preview, esbuild, and workerd processes
whose command lines were rooted in that stale worktree path.

## Missing / Still To Do

1. Decide what to do with unrelated local changes in the main checkout:

- `.gitignore`
- `package.json`
- `pnpm-lock.yaml`
- `.claude/launch.json`
- `docs/seo/grantpipe seo.md`
- `new-urls.txt`
- `scripts/linkedin/`

2. Optional but recommended follow-up: make `deploy:site` cross-platform so it works in PowerShell without manual env syntax.

## Notes

- The deployed web and API were redeployed from the final merged `master` state.
- The final site deploy has now been completed from the final merged `master`
  state.
- The rollout intentionally avoids pipe, routing, arrow, and flow imagery in the implemented brand assets and accessible names.
