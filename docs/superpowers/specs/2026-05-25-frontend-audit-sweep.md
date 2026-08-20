# Frontend Audit Sweep — 2026-05-25

Goal: find and fix every frontend bug and missing feature across `apps/web`, `apps/site`, and `packages/ui`. Sub-agent driven; multiple review/fix cycles until clean.

## Findings (Cycle 1)

### Wave A — Web app shell, routing, auth, error/loading

1. **P0** Password-reset redirect omits `/app` basepath — `apps/web/src/routes/forgot-password.tsx:24-27`
2. **P0** ErrorFallback "Back to dashboard" anchor bypasses basepath — `apps/web/src/components/error-fallback.tsx:25`
3. **P0** Reviewer portal scope cards use raw `<a>` with no basepath — `apps/web/src/routes/portal/home.tsx:33-113`
4. **P0** `<Toaster />` only mounted in one branch of `_authenticated.tsx` — silent mutation failures in onboarding/select-plan/paywall
5. **P1** UserMenu `currentOrgId` never passed — org switcher cannot mark active org
6. **P1** Org switch uses `window.location.reload()` instead of cache invalidation
7. **P1** Mobile topbar has no UserMenu — `app-topbar.userMenu` prop is dead
8. **P1** Dashboard "Award intake" quick action navigates to `/grants` — wrong target
9. **P1** Redirect components return `null` (blank flash) — `select-plan.tsx:33`, `settings.billing.tsx:28`
10. **P1** No route-level `errorComponent` anywhere
11. **P1** Session error path triggers redirect loop risk
12. **P1** Paywall blocked state has no path for non-admins
13. **P2** Sidebar prefix-match active state highlights duplicates
14. **P2** Onboarding overlay status hard-coded
15. **P2** Unjustified `eslint-disable` in `apps/web/src/routes/portal/$token.tsx:29`
16. **P2** RootLayout has no skip-link / global Suspense

### Wave B — Web app domain pages

17. **P1** Payments index — no role gate, no pagination, no search, plain empty state
18. **P1** Funds create form missing `description` field
19. **P1** Funders create form missing `website`/`priorities`/`notes`
20. **P1** Events empty-state CTA shown to viewer/auditor; dialog never mounts
21. **P1** Evidence bundles — no pagination/filter, date column uses `.slice(0,10)`
22. **P1** Subrecipients create — hard-coded `status: "active"`, no pagination, total uses `rows.length`
23. **P1** Programs create form covers only `name`/`code`/`description`
24. **P1** Reports — hard-coded `pageSize: 25`, hard-coded `FY2026`, `2026-01-01/12-31` defaults
25. **P2** Activity log entity-type filter renders raw enum
26. **P2** Restricted rollforward `onClick` bypasses shared handler

### Wave C — packages/ui + cross-cutting

27. **P1** Currency formatter triplicated with three different output shapes & units; site calculator takes dollars while web takes cents
28. **P1** `formatNumber`/date helpers stuck in `apps/web`
29. **P1** Brand token drift web↔site (oklch vs hex) for `accent-*` and `primary`
30. **P1** `Button` icon-\* sizes overlap with separate `IconButton` — two ways to do one thing
31. **P1** `IconButton` tooltip not propagated to `aria-label` — icon-only buttons unnamed for SR
32. **P1** Missing tests for `card.tsx` and `label.tsx` (95%/file rule)
33. **P2** `key={i}` on real data rows in accounting (`journal/new.tsx:238`, `journal/index.tsx:139`, `recurring.tsx:280`)
34. **P2** Stage/grant-status tokens hardcode hex instead of referencing ramps
35. **P2** Shadcn `CardTitle` is `<div>` — no semantic heading

### Wave D — Marketing site

36. **P1** Lead magnet form does not block submit when Turnstile token empty
37. **P1** `discoveryCallUrl` (mailto) and footer link (cal.com) disagree
38. **P1** AI SDR widget lacks consent gate, SRI; failed-load button stays clickable
39. **P1** `/downloads/` whitelist still active but folder empty — contract drift
40. **P2** Email input lacks `aria-invalid`/`aria-describedby`
41. **P2** Deprecated `MediaQueryList.addListener` in `paid-search-landing-page.astro:544`
42. **P2** Unused `Props` interface in `field.astro`
43. **P2** Auditor role FAQ copy contradicts CLAUDE.md role matrix
44. **P2** Trailing slash missing before `#` anchors (`/pricing#…`, `/compare#…`)
45. **P2** `unsubscribe.astro` canonical missing trailing slash
46. **P2** Personal LinkedIn URL duplicated in footer vs marketingKnowledge
47. **P2** Footer surfaces `llms.txt`/`AGENTS.md` in Resources group
48. **P2** Homepage tautological "funded vs restricted" copy
49. **P2** Lead-magnet `lead_magnet_offer_shown` not re-fired on alternative selection
50. **P2** Hero "Watch the product tour" CTA jumps off-page to in-page anchor

## Execution

Fix waves dispatched in parallel by file scope (no overlap). Each wave runs tests for its slice before reporting back.
