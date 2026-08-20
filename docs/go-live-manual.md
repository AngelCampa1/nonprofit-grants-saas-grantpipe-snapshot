# GrantPipe - Manual Go-Live Runbook

_Last updated: 2026-04-28_

Everything **you (Angel)** personally need to do - outside the codebase - to take GrantPipe from "builds locally" to "paying customers at grantpipe.com". The deep technical reference lives in `docs/production-readiness.md`. This file is the ordered action list: accounts to create, dashboards to click through, cards to enter, DNS to paste, secrets to set.

> Rule of thumb: do sections 1-5 in order. Sections 6+ can be parallelized. Section 14 is the final gate.

---

## 0. Pre-flight (1 hour)

- [ ] Confirm you own `grantpipe.com` at your registrar. If DNS is not already at Cloudflare, migrate the nameservers (Cloudflare → Websites → Add site → free plan → copy the two NS records to your registrar).
- [ ] Create (or log into) these accounts using `angel.campa@grantpipe.com`:
  - [ ] Cloudflare (workers, pages, R2, DNS, WAF)
  - [ ] Supabase (Postgres)
  - [ ] Stripe (billing)
  - [ ] Resend (transactional email)
  - [ ] Google Cloud Console (OAuth client)
  - [ ] Sentry (errors)
  - [ ] PostHog (product analytics) - already set up, keys configured
  - [ ] GitHub (already have it; confirm `grantpipe` repo is on `master`)
- [ ] Install CLIs locally and authenticate:
  ```bash
  pnpm dlx wrangler login
  supabase login                       # optional, dashboard works too
  pnpm dlx stripe login                # optional, web works too
  ```
- [ ] Grab a password manager entry - you will generate and paste ~15 secrets in the next hour. Do NOT paste them into chat, commit messages, or `.env` files you might accidentally push.
- [ ] Generate two long random strings and stash them. You will need these in §4:
  ```bash
  openssl rand -base64 32   # BETTER_AUTH_SECRET
  openssl rand -base64 32   # LEAD_UNSUBSCRIBE_SECRET
  openssl rand -base64 32   # DOWNLOAD_LINK_SECRET
  ```

---

## 1. DNS & domain (Cloudflare) - 30 min

In Cloudflare Dashboard → `grantpipe.com` zone:

- [ ] Confirm the zone is active (green "Active" badge). If not, wait for nameserver propagation.
- [ ] SSL/TLS → Overview → set to **Full (strict)**.
- [ ] SSL/TLS → Edge Certificates → Always Use HTTPS **on**. Enable **HSTS** with `max-age=31536000`, include subdomains, preload **off** (turn on later after everything is stable for 30 days).
- [ ] DNS → leave the apex + `www` records alone for now - Pages will add them in §2.
- [ ] Email Routing → Enable → set `angel.campa@grantpipe.com` to forward to your personal inbox. This is your support / reply-to address.

You will add more DNS records in §5 (Resend) and §2 (Pages custom domains auto-create A/AAAA/CNAMEs).

---

## 2. Cloudflare Workers & Pages (Wrangler-first setup) - 45 min

GrantPipe production deploys are driven by the repo's Wrangler scripts, not GitHub Actions and not Cloudflare git auto-deploy. Cloudflare should host these three production resources only:

- [ ] Worker: `grantpipe-api`
- [ ] Pages app: `grantpipe-web`
- [ ] Worker-style marketing site: `grantpipe-site`

### 2a. Verify / clean Pages projects

- [ ] Run `pnpm dlx wrangler pages project list`.
- [ ] Confirm `grantpipe-web` owns `app.grantpipe.com`.
- [ ] Confirm the stale `grantpipe` Pages project is the only GrantPipe Pages holdover.
- [ ] Delete the stale marketing Pages project so only one GrantPipe marketing site remains.
      Today the stale project to remove is `grantpipe`:
  ```bash
  pnpm dlx wrangler pages project delete grantpipe --yes
  ```
- [ ] In the Cloudflare dashboard, disconnect Git-based auto-deploy for the GrantPipe Pages projects if it is still enabled. The repo scripts are the source of truth for production deploys.

### 2b. `apps/api` - Worker deploy

- [ ] Confirm the Worker name is `grantpipe-api`.
- [ ] Confirm the route is `app.grantpipe.com/api/*`.
- [ ] Deploy from the repo root:
  ```bash
  pnpm run deploy:api
  ```

### 2c. `apps/web` - Pages deploy

- [ ] Confirm the Pages project name is `grantpipe-web`.
- [ ] Confirm `app.grantpipe.com` is attached to that project.
- [ ] Deploy from the repo root:
  ```bash
  pnpm run deploy:web
  ```
- [ ] Verify the Sentry release gate before a production deploy:
  ```bash
  pnpm run check:sentry-release:web
  ```

### 2d. `apps/site` - Worker deploy

- [ ] Confirm the Worker name is `grantpipe-site`.
- [ ] Confirm `grantpipe.com` and `www.grantpipe.com` are attached to that Worker.
- [ ] Deploy from the repo root:
  ```bash
  pnpm run deploy:site
  ```
- [ ] Verify the Sentry release gate before a production deploy:
  ```bash
  pnpm run check:sentry-release:site
  ```

### 2e. Changed-project deploys after merge

- [ ] Use `pnpm run deploy:changed` after merging work from a feature worktree when only some runtime apps were touched.
- [ ] Use `pnpm run deploy:changed:dry-run` first if you want to verify which apps will ship.
- [ ] Default mapping:
  - `apps/api` and `packages/db` deploy the API Worker
  - `apps/web` deploys the web app
  - `packages/shared` deploys the API Worker, web app, and marketing site
  - `apps/site` deploys the marketing site
  - `packages/ui` deploys the web app and marketing site

---

## 3. Supabase Postgres - 20 min

- [ ] Supabase dashboard -> New Project -> name `grantpipe-prod` -> choose the production region closest to the Cloudflare Worker runtime.
- [ ] Save the Supabase project ref and database password in the password manager. Do not commit either value.
- [ ] Copy **two** database connection strings and stash them in the password manager:
  - Direct connection string - for Cloudflare Hyperdrive and provider audits.
  - Migration/runtime connection string - for Drizzle migrations and the Worker `DATABASE_URL` fallback secret.
- [ ] Run migrations once, from your laptop, against the migration/runtime URL:
  ```bash
  DATABASE_URL="postgresql://postgres.<project-ref>:***@aws-0-us-east-1.pooler.supabase.com:5432/postgres" \
    pnpm --filter @grantpipe/db migrate
  ```
- [ ] Verify tables exist: `pnpm --filter @grantpipe/db studio`; confirm `organizations`, `user`, `contacts`, `grants`, `funds`, and `activity_log`.
- [ ] For a Neon-to-Supabase cutover, follow `docs/operations/neon-to-supabase-runbook.md`. Neon must remain intact after cutover for rollback, audit, and reference until a later retirement plan explicitly approves deletion.

### Hyperdrive (connection pooling for Worker)

- [ ] Create a new Hyperdrive config pointing at the Supabase **Direct** connection string. Do not repoint or delete the old Neon Hyperdrive config during the migration window.
  ```bash
  pnpm dlx wrangler hyperdrive create grantpipe-db-supabase \
    --connection-string="postgresql://postgres.<project-ref>:***@db.<project-ref>.supabase.co:5432/postgres"
  ```
- [ ] Copy the returned Hyperdrive ID. Edit `apps/api/wrangler.toml` under `[[env.production.hyperdrive]]`, commit, and deploy through the Wrangler scripts.

### Restore drill (mandatory before launch)

- [ ] Test Supabase point-in-time recovery or a fresh logical restore into a scratch project. Run `scripts/db/provider-migration-audit.ts` against source and target and verify schema, row counts, migration history, extensions, constraints, indexes, triggers, and sequences before deleting the scratch target.

---

## 4. Cloudflare bindings & secrets (Workers) - 30 min

### 4a. R2 bucket

- [ ] Create the document bucket:
  ```bash
  pnpm dlx wrangler r2 bucket create grantpipe-documents
  ```
- [ ] If uploads go browser → R2 directly: R2 → `grantpipe-documents` → Settings → CORS → allow origin `https://app.grantpipe.com`.

### 4b. KV namespace (rate limiting)

- [ ] Create:
  ```bash
  pnpm dlx wrangler kv:namespace create RATE_LIMIT_KV
  ```
- [ ] Copy the returned ID. Edit `apps/api/wrangler.toml` → replace `REPLACE_WITH_REAL_KV_ID`. Commit + push.

### 4c. Secrets (production only)

All of these go in the **production** Worker. Run each and paste the value when prompted. Nothing here is in the repo - nothing here should ever be in the repo.

```bash
cd apps/api

wrangler secret put DATABASE_URL --env production
# Paste: Supabase migration/runtime connection string (only used if Hyperdrive ever fails over)

wrangler secret put BETTER_AUTH_SECRET --env production
# Paste: openssl rand -base64 32 from §0

wrangler secret put LEAD_UNSUBSCRIBE_SECRET --env production
wrangler secret put DOWNLOAD_LINK_SECRET --env production
# Paste: the two extra random strings from §0

wrangler secret put GOOGLE_CLIENT_ID --env production
wrangler secret put GOOGLE_CLIENT_SECRET --env production
# See §6

wrangler secret put STRIPE_SECRET_KEY --env production            # sk_live_...
wrangler secret put STRIPE_WEBHOOK_SECRET --env production        # whsec_...
wrangler secret put STRIPE_PRICE_STARTER_MONTHLY --env production
wrangler secret put STRIPE_PRICE_STARTER_ANNUAL --env production
wrangler secret put STRIPE_PRICE_GROWTH_MONTHLY --env production
wrangler secret put STRIPE_PRICE_GROWTH_ANNUAL --env production
wrangler secret put STRIPE_PRICE_AUDIT_READY_MONTHLY --env production
wrangler secret put STRIPE_PRICE_AUDIT_READY_ANNUAL --env production
# See §7

wrangler secret put RESEND_API_KEY --env production
# See §5

wrangler secret put SENTRY_DSN --env production
# See §9

wrangler secret put POSTHOG_KEY --env production
# PostHog project API key (server-side events)
```

- [ ] Verify: `wrangler secret list --env production` - confirm all 16 are present.

---

## 5. Email - Resend + DNS - 30 min (+ up to 24h DNS wait)

You will send from a **subdomain** (`mail.grantpipe.com`) to isolate reputation from the marketing site.

- [ ] Resend Dashboard → Domains → Add domain → `mail.grantpipe.com`.
- [ ] Resend shows ~4 DNS records (SPF TXT, 2× DKIM CNAME, return-path CNAME). Add **all of them** in Cloudflare → DNS for `grantpipe.com`. Turn OFF the proxy (grey cloud) for every mail-related record.
- [ ] Add DMARC at `_dmarc.mail.grantpipe.com` (TXT):
  ```
  v=DMARC1; p=none; rua=mailto:dmarc-reports@grantpipe.com
  ```
  Start with `p=none`. After 30 days of clean reports, ratchet to `p=quarantine`, then `p=reject`.
- [ ] Back in Resend → **Verify DNS records**. SPF+DKIM usually propagate within 15 min on Cloudflare; DMARC can take longer.
- [ ] API Keys → Create key → scope to **Full access** → name `grantpipe-prod`. Copy value - this is `RESEND_API_KEY` in §4c.
- [ ] Send a test email from Resend's dashboard to a personal address. Confirm delivery, confirm `from` reads `angel.campa@grantpipe.com`.
- [ ] Bounce/complaint webhook: Resend → Webhooks → add endpoint `https://app.grantpipe.com/api/webhooks/resend` (only if we wire it - optional for V1; skip for now).

From addresses used by the app (all on verified `grantpipe.com` domain):

| Purpose                          | From                                             |
| -------------------------------- | ------------------------------------------------ |
| Auth (password reset)            | `GrantPipe <angel.campa@grantpipe.com>`          |
| System notifications to users    | `GrantPipe <angel.campa@grantpipe.com>`          |
| Billing receipts                 | `GrantPipe <angel.campa@grantpipe.com>`          |
| Lead magnet delivery + nurture   | `GrantPipe <angel.campa@grantpipe.com>`          |
| Feedback form (internal routing) | `GrantPipe Feedback <angel.campa@grantpipe.com>` |

---

## 6. Google OAuth (Sign in with Google) - 15 min

- [ ] Google Cloud Console → create project `grantpipe-prod`.
- [ ] APIs & Services → OAuth consent screen:
  - User type: **External**
  - App name: `GrantPipe`
  - Support email: `angel.campa@grantpipe.com`
  - App logo: upload from `apps/site/public/` (pick the square emerald mark)
  - App domain: `grantpipe.com`
  - Authorized domains: `grantpipe.com`
  - Developer contact: `angel.campa@grantpipe.com`
  - Scopes: `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `openid`
- [ ] Credentials → Create credentials → OAuth client ID → Web application:
  - Authorized JavaScript origins: `https://app.grantpipe.com`
  - Authorized redirect URIs: `https://app.grantpipe.com/api/auth/callback/google`
- [ ] Copy Client ID + Client Secret → paste into the prompts in §4c for `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
- [ ] OAuth consent screen → **Publish app** (moves from Testing → In production). Unverified apps still work - you'll see "Google hasn't verified this app" for ~100 users before verification is required. Submit for verification after first real customer if needed.

---

## 7. Stripe (live mode) - 60 min

- [ ] Stripe Dashboard → complete business profile: legal entity, tax ID, bank account for payouts, statement descriptor `GRANTPIPE`.
- [ ] Toggle **Live mode** (top-left). All remaining steps in this section are in live mode.

### 7a. Products + prices

- [ ] Create 3 products with 2 prices each (all prices are **recurring**):

  | Product     | Monthly | Annual                  |
  | ----------- | ------- | ----------------------- |
  | Starter     | $49/mo  | $39/mo billed annually  |
  | Growth      | $99/mo  | $79/mo billed annually  |
  | Audit-Ready | $199/mo | $159/mo billed annually |

  Enterprise is contact-founder only and does not use self-serve Stripe checkout.

- [ ] Copy each price ID and paste the 6 `STRIPE_PRICE_*` values into the prompts in §4c:
  - `STRIPE_PRICE_STARTER_MONTHLY`: `price_1TpHBILcwbPKn2Kg6KhahvP7`
  - `STRIPE_PRICE_STARTER_ANNUAL`: `price_1TpHBtLcwbPKn2KgGswNPVRz`
  - `STRIPE_PRICE_GROWTH_MONTHLY`: `price_1TpHERLcwbPKn2Kg7LC3F5h5`
  - `STRIPE_PRICE_GROWTH_ANNUAL`: `price_1TpHERLcwbPKn2Kg7LC3F5h5`
  - `STRIPE_PRICE_AUDIT_READY_MONTHLY`: `price_1TpHFJLcwbPKn2KgaaiO8VJY`
  - `STRIPE_PRICE_AUDIT_READY_ANNUAL`: `price_1TpHFnLcwbPKn2KgijASHvQL`

### 7b. Webhook

- [ ] Developers → Webhooks → Add endpoint:
  - URL: `https://app.grantpipe.com/api/billing/stripe/webhook`
  - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.trial_will_end`
- [ ] Reveal signing secret → paste as `STRIPE_WEBHOOK_SECRET` in §4c.

### 7c. Customer Portal

- [ ] Settings → Billing → Customer portal:
  - Cancel subscriptions: **end of period**
  - Pause: disabled
  - Update payment method: allowed
  - Plan switching: allow upgrades + downgrades across Starter/Growth/Audit-Ready (monthly ↔ annual)
  - Branding: upload logo, set accent color to GrantPipe emerald (`#047857` or whatever token resolves to in `apps/site`)

### 7d. Stripe Tax

- [ ] Tax → Activate → register business address → enable automatic tax on all 6 prices.

### 7e. API keys

- [ ] Developers → API keys → reveal **live secret key** → paste as `STRIPE_SECRET_KEY` in §4c. The publishable key goes in the web build only if we ever call Stripe.js directly; not required for V1 (Checkout handles it).

---

## 8. Security hardening (Cloudflare WAF) - 15 min

- [ ] Security → WAF → Managed rules → enable **Cloudflare Managed Ruleset**.
- [ ] Security → Bots → enable **Bot Fight Mode** (free tier is enough).
- [ ] Security → WAF → Rate limiting rules → add rule:
  - If `http.request.uri.path contains "/api/auth"` → limit **10 req / min per IP** → action: Block (429).
- [ ] Security → WAF → Rate limiting rules → add rule:
  - If `http.request.uri.path contains "/api/billing/stripe/webhook"` → **exempt** (Stripe retries must not be rate-limited).

---

## 9. Sentry - 20 min

- [ ] sentry.io → create org `grantpipe` → create 2 projects:
  - `grantpipe-api` (platform: Cloudflare Workers)
  - `grantpipe-web` (platform: React)
- [ ] Each project → Settings → Client Keys → copy DSN.
  - API DSN → paste in §4c as `SENTRY_DSN`.
  - Web DSN → add to Pages env vars (`grantpipe-web` project in §2b): `VITE_SENTRY_DSN`.
- [ ] Settings → Alerts → default "issue alert" on new issues → route to your email. Promote to Slack or PagerDuty later.
- [ ] After first deploy, deliberately trigger an error on both web and api to confirm both projects receive events. Resolve the test events.

---

## 10. PostHog - 10 min

PostHog keys are already baked into the code with a fallback. To use a dedicated prod project (recommended for clean data):

- [ ] app.posthog.com → create project `grantpipe-prod` (US region).
- [ ] Project Settings → Project API Key → copy.
- [ ] Set three places:
  - Worker secret `POSTHOG_KEY` (§4c).
  - Pages env var `VITE_POSTHOG_KEY` on `grantpipe-web`.
  - Build env vars `PUBLIC_POSTHOG_KEY` and `PUBLIC_POSTHOG_HOST` for `grantpipe-site`.
- [ ] (Optional, EU traffic) Add a cookie consent banner before flipping PostHog on for EU users.

---

## 11. R2 - lead magnet PDFs - 10 min

- [ ] Build PDFs locally (first sync):
  ```bash
  pnpm --filter @grantpipe/site build    # build runs the PDF script automatically
  pnpm tsx apps/api/src/scripts/sync-lead-magnets-to-r2.ts
  ```
- [ ] Confirm `apps/site/.lead-magnet-pdfs/manifest.json` exists after the build. This manifest is the source of truth for every published PDF magnet and each expected R2 key.
- [ ] Verify the sync script did not fail on a missing promoted magnet, a missing local PDF, or an unexpected key. If it does, fix the content/build drift before uploading anything.
- [ ] Run the mocked download verification before touching production:
  ```bash
  pnpm --filter @grantpipe/api test -- src/domains/downloads/routes.test.ts
  ```
- [ ] Spot-check: open a lead magnet URL from the live site → confirm the signed R2 link works and the PDF downloads.
- [ ] Add a calendar reminder: **re-run the build and sync script whenever lead magnet content changes**. (Not part of CI - `wrangler r2 object put` requires your login.)

---

## 12. Uptime & status - 15 min

- [ ] BetterStack (betterstack.com) → free plan → add 2 monitors:
  - `GET https://app.grantpipe.com/api/health` - expect 200
  - `GET https://grantpipe.com/` - expect 200
- [ ] Incident alerts → email + SMS to yourself.
- [ ] (Optional) Create public status page `status.grantpipe.com` → add CNAME in Cloudflare.

---

## 13. Legal + search - 30 min

- [ ] Review `apps/site/src/pages/privacy.astro` - sub-processor list must include: **Cloudflare, Supabase, Stripe, Resend, Google (OAuth), Sentry, PostHog**. Edit + push if anything is missing.
- [ ] Review `apps/site/src/pages/terms.astro` - confirm business entity name, jurisdiction, refund policy match reality.
- [ ] Google Search Console → Add property → **Domain** → `grantpipe.com` → verify via Cloudflare TXT record (Search Console shows the exact value; Cloudflare auto-verifies within a minute).
- [ ] Search Console → Sitemaps → submit `https://grantpipe.com/sitemap.xml`.
- [ ] Google Analytics (optional if relying on PostHog): skip for V1.

---

## 14. Launch gate - do not skip - 1 hour

Do these **on the live production domain**, not staging. Each one is a signature-worthy "this actually works" check.

- [ ] From an incognito window: visit `grantpipe.com` → marketing site loads with HTTPS, correct fonts, no console errors.
- [ ] Click "Start trial" → lands on `app.grantpipe.com` signup → email/password signup succeeds → verification email arrives from `no-reply@mail.grantpipe.com` within 30 seconds → click link → account activated.
- [ ] Log out, log back in with Google → lands in onboarding.
- [ ] Complete onboarding: create org, invite a teammate (use a second email you control), teammate receives invite from `no-reply@mail.grantpipe.com`, accepts, appears in org.
- [ ] Create a donor, log a donation, create a grant, upload a document (confirm R2 upload + signed-URL download roundtrips), generate a report, export PDF.
- [ ] Billing: upgrade from trial to Starter monthly with a real card (use your personal card - refund yourself via Stripe after). Confirm:
  - Stripe Checkout loads
  - Subscription created in Stripe Dashboard
  - Webhook hit recorded in Stripe Dashboard (200 response)
  - Database row in `orgs` updated with plan + subscription_id
  - Receipt email from `billing@mail.grantpipe.com` arrives
- [ ] Open Customer Portal from the app → cancel subscription at period end → confirm it shows "cancels on …" in the app.
- [ ] Deliberately throw an error in the app (e.g. visit `/api/__boom` if wired, or trigger a validation path that's broken) → confirm Sentry receives it on both web and api projects.
- [ ] Wait for the next cron tick (top of the hour) → confirm grant deadline reminder job logs a successful run in Cloudflare → Workers → `grantpipe-api` → Logs (or triggers a real email if a deadline is within the window).
- [ ] Run Lighthouse on `grantpipe.com`, `grantpipe.com/pricing`, `app.grantpipe.com/login` → all ≥ 90 on performance, accessibility, best practices, SEO.
- [ ] Supabase restore drill -> restore the latest backup or logical dump into a scratch project, then run `scripts/db/provider-migration-audit.ts`. Redo it now that real signup/billing rows exist, so the restore proof covers production-shaped data.

All 14 checks green = launch.

---

## 15. First 72 hours post-launch

- [ ] Watch Sentry every few hours. Any issue with > 5 events: fix same day.
- [ ] Watch Cloudflare → Workers → `grantpipe-api` → Logs for unexpected 5xxs.
- [ ] Watch Stripe → Developers → Events for failed webhooks. Any failure: investigate immediately, Stripe retries for up to 3 days.
- [ ] Watch Resend → Emails for bounces/complaints. Any complaint rate > 0.1%: pause and investigate before sending more.
- [ ] Watch Supabase database metrics and Cloudflare Hyperdrive analytics for connection saturation or query errors.
- [ ] Daily: `wrangler tail --env production` for 10 minutes during peak traffic window.

---

## Rollback

If a deploy breaks production:

```bash
cd apps/api
wrangler deployments list --env production
wrangler rollback <previous-deployment-id> --env production
```

For `grantpipe-web` (Pages): Cloudflare Dashboard → project → Deployments → three-dot menu on the last-known-good deploy → **Rollback**.

For `grantpipe-site` (Worker): use `pnpm dlx wrangler deployments list`, then `pnpm dlx wrangler rollback <deployment-id>`.

Database rollbacks are harder after writes reopen on Supabase. Keep the old Neon database intact for reference and rollback before the write cutoff; after Supabase accepts writes, prefer forward fixes unless a reconciliation plan is approved.

---

## What this runbook deliberately skips

- **Staging environment.** Not yet worth it for a solo founder - launch gate (§14) runs against prod with your own test org. Run live checks through `pnpm e2e:live -- <command>` so cleanup runs before and after the check; see `docs/production-e2e-cleanup.md`. Add a staging branch + separate Supabase project + separate Pages env after first 3 paying customers.
- **GitHub Actions deploys.** This repo does not use GitHub Actions for production deploys. Production ships through the Wrangler scripts so the touched apps can be deployed explicitly after merge.
- **DPA / SOC2.** Draft DPA template lives as a TODO; SOC2 is a 2026 Q3 item, not pre-launch.
- **Multi-region.** Single database region (Supabase Postgres + global Workers) is enough until p95 latency outside the US becomes a customer complaint.
