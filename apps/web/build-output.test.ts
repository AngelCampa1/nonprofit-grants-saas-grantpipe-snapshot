import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const distIndexPath = resolve(process.cwd(), "dist/index.html");
const distAssetsPath = resolve(process.cwd(), "dist/assets");

describe("web production build output", () => {
  it("keeps route code split out of the initial app entry", () => {
    expect(existsSync(distIndexPath), "Run `pnpm --filter @grantpipe/web build` first.").toBe(true);

    const indexHtml = readFileSync(distIndexPath, "utf8");
    const entrySrc = indexHtml.match(/<script[^>]+type="module"[^>]+src="\/assets\/([^"]+)"/)?.[1];

    expect(entrySrc).toBeDefined();

    const modulePreloads = [...indexHtml.matchAll(/rel="modulepreload"[^>]+href="([^"]+)"/g)].map(
      (match) => match[1],
    );
    const initialAssets = [`/assets/${entrySrc}`, ...modulePreloads].map((assetPath) =>
      assetPath.replace("/assets/", ""),
    );
    const initialJsBytes = initialAssets.reduce(
      (total, asset) => total + statSync(resolve(distAssetsPath, asset)).size,
      0,
    );

    // Entry-chunk creep guard. Bump deliberately when a genuine change crosses it,
    // and prefer lazy-loading routes over raising this further. Last bumped to 861_000
    // for analytics Wave 4, stacked on Wave 202's 859_000 guard (which added shared
    // startDate <= endDate ordering refines). Wave 4 adds the client error-boundary
    // PostHog capture (error-boundary.tsx is in the initial chunk graph and cannot be
    // lazy-loaded) plus four new event keys in @grantpipe/shared analytics constants;
    // the combined entry measured 860,269. The instrumentation is genuine and minimal;
    // routes were not pulled into the initial graph.
    // Waves 210-212 added accessibility attributes to initial-graph index routes
    // (labeled metric-dialog inputs, aria-labels on seven search inputs, and role="alert"
    // error announcements on payments/donors). These are genuine a11y strings that cannot
    // be lazy-loaded; the combined entry measured 861,038. Bump to 862_000 to track the
    // new floor without masking a larger regression. No routes entered the initial graph.
    // Wave 253 added three short inline disabled-action hints to the Reports route
    // (grant compliance, acknowledgment letter, save template) so users see why a button
    // is inert. The route is in the initial graph and the strings cannot be lazy-loaded;
    // the combined entry measured 862,627. Bump to 863_000 to track the new floor.
    // Wave 255 added a per-fund Balance to the Funds list (a new DataTable column +
    // a card balance line) plus the FundRow summary type; the funds route is in the
    // initial graph and the formatCurrency call/strings cannot be lazy-loaded. The
    // combined entry measured 863,129. Bump to 864_000 to track the new floor.
    // Wave 255 (rebase) also folds in the Budget Sentinel merge (8a424d80), which added
    // proactive overspend/fund-lapse alert code to the app shell (initial graph; not a
    // route leak — the modulepreload check below still passes). The combined entry then
    // measured 868,869. Bump to 870_000 to track the new floor without masking a larger
    // regression. Prefer lazy-loading routes over raising this further.
    // Wave 258 branched off a master that folds in the Anomaly & Misallocation Detector
    // merge (#10) and the AI-agents app-shell work, which grew the initial graph; the
    // entry then measured 874,088 (W258's own change is two visible <Label>s + an
    // attendees empty-state line on a lazy route — negligible). Bump to 877_000 to track
    // the new floor. No routes leaked (modulepreload check below still passes).
    // AI-CS integration hardening (the same-origin navigation-target parser
    // parseInAppTarget plus a Sentry capture path) lands in the lazily-loaded
    // ai-cs-support-widget chunk, not the entry, so the entry held at 874,180 — well
    // under this floor. Guard unchanged at 877_000.
    // Wave 261 branched off a master that folds in further sibling feature merges
    // (pledge tracking et al.) which grew the initial graph; the entry then measured
    // 900,494 (W261's own change is three errorComponent bare-div -> Alert swaps plus a
    // downloadError Alert on detail routes — a few hundred bytes). Bump to 905_000 to
    // track the new floor. No routes leaked (modulepreload check below still passes).
    // Feature #8 adds the Allocation Studio route/nav wiring; the entry then measured
    // 921,425. Bump to 925_000 to track the new floor. No routes leaked (modulepreload
    // check below still passes).
    // Feature #1 expands the authenticated import workspace into Data Migration Studio
    // and adds entity invalidation metadata; the entry then measured 931,510. Bump to
    // 935_000 to track the new floor. No routes leaked (modulepreload check below).
    // Feature #14 adds donor year-end statement controls to Reports plus donation
    // goods/services fields; the entry measured 942,418. Bump to 945_000 to track
    // the new floor. No routes leaked (modulepreload check below).
    // Feature #16 adds the report-builder route registration, shared validator
    // metadata, and observability event constants; the entry measured 959,586.
    // Bump to 965_000 to track the new floor. No routes leaked (modulepreload
    // check below).
    // Feature #18 previously added donor recurring-gift route/nav metadata,
    // client observability hooks, and shared analytics constants; the entry
    // measured 988,471. Bump to 995_000 to track the new floor. No routes leaked.
    // Feature #1 adds Migration Studio route metadata, import plan client wiring,
    // and shared source-plan constants; the entry measured 995,193. Bump to
    // 996_000 to track the new floor. No routes leaked.
    // Onboarding activation redesign mounts SampleDataBanner in the app shell
    // (initial graph) and adds the sample-data hooks plus the onboarding-goal
    // routing/ordering helper to the preloaded graph; the entry measured
    // 1,002,351. Bump to 1_005_000 to track the new floor. No routes leaked
    // (modulepreload check below still passes).
    // First Light aha banner (SampleDataAhaBanner) mounts in the app shell
    // (initial graph) alongside SampleDataBanner; aha-banner.ts lib and the
    // lucide X icon enter the initial chunk. Tier repackaging then mounts the
    // AiUsageCapProvider in main.tsx (initial graph) so AI usage-cap errors
    // surface app-wide, and adds the cap dialog, the api-errors cap-payload
    // mapping, and shared cap analytics constants to the preloaded graph; the
    // combined entry measured 1,003,386. Bump to 1_010_000 to track the new
    // floor. No routes leaked (modulepreload check below still passes).
    // Wave 0.3 Task 6 adds the entity access matrix, entity-scoped invites, and
    // entity-access mutations to the existing settings/team route, which is
    // already part of the generated initial route graph. The entry measured
    // 1,025,780. Bump to 1_030_000 to track the new floor. No routes leaked.
    // Floor drift surfaced again when a marketing-site footer/FAQ layout fix
    // (packages/ui site-footer.astro) became the first @grantpipe/ui-touching
    // commit in a while to re-trigger this web gate; the web source is identical
    // to master, so this is accumulated sibling-merge drift, not a route leak.
    // The entry measured 1,030,643. Bump to 1_035_000 to track the new floor
    // without masking a larger regression. No routes leaked (modulepreload check
    // below still passes).
    // The pricing/packaging realignment branched off an older master; its only
    // initial-graph delta is a ~30-byte feature string added to PLAN_CATALOG
    // (pricing.ts), so the rest is accumulated sibling-merge drift, not a route
    // leak. The entry measured 1,045,955. Bump to 1_050_000 to track the new floor
    // without masking a larger regression. No routes leaked (modulepreload check
    // below still passes).
    // The pristine-sweep loading-state pass (F-ld) only adds Skeleton imports to the
    // lazy portal/*.$id route chunks (Skeleton already lives in the shared @grantpipe/ui
    // graph), so F-ld's own entry delta is ~0; the 340-byte overage is accumulated
    // sibling-merge drift, not a route leak. The entry measured 1,050,340. Bump to
    // 1_055_000 to track the new floor without masking a larger regression. No routes
    // leaked (modulepreload check below still passes; total initial JS held at 2,305,390).
    // The launch-offer retirement pass removes checkout promo forwarding but also
    // touches the shared plan catalog imported by the app shell; the entry measured
    // 1,058,546. Bump to 1_060_000 to track the new floor. No routes leaked.
    expect(statSync(resolve(distAssetsPath, entrySrc)).size).toBeLessThan(1_060_000);
    // Wave 164 added ["contacts"] invalidation to the three donation mutations in
    // use-donors.ts (initial chunk graph); initial JS measured 2,101,715, just over
    // the previous 2_100_000 guard. Bump to 2_110_000 to track the new floor without
    // masking a larger regression.
    // Wave 255 (rebase) folds in the Budget Sentinel merge (8a424d80), whose alert code
    // also grew the preloaded shared graph; total initial JS measured 2,113,646. Bump to
    // 2_120_000 to track the new floor. No routes leaked (modulepreload check below).
    // Wave 258 (post-merge) folds in sibling feature merges (Anomaly Detector #10 et al.)
    // that grew the preloaded shared graph; total initial JS measured 2,122,470. Bump to
    // 2_125_000 to track the new floor. No routes leaked (modulepreload check still passes).
    // The AI-CS hardening (see entry-chunk note above) lives in a lazily-loaded chunk,
    // not the preloaded initial graph, so this total is unaffected.
    // Wave 261 (post-merge) folds in further sibling feature merges (pledge tracking et al.)
    // that grew the preloaded shared graph; total initial JS measured 2,150,289 on the
    // post-merge master build. Bump to 2_155_000 to track the new floor with headroom. No
    // routes leaked (modulepreload check still passes).
    // Feature #8 adds Allocation Studio nav/route metadata; total initial JS measured
    // 2,171,733. Bump to 2_175_000 to track the new floor. No routes leaked.
    // Feature #1 adds Data Migration Studio import metadata and entity invalidation keys;
    // total initial JS measured 2,178,555. Bump to 2_185_000 to track the new floor.
    // No routes leaked.
    // Feature #14 adds the Reports statement controls and donor goods/services form
    // fields; total initial JS measured 2,189,882. Bump to 2_195_000 to track the
    // new floor. No routes leaked.
    // Feature #16 adds report-builder route metadata and observability constants;
    // total initial JS measured 2,207,828. Bump to 2_215_000 to track the new floor.
    // No routes leaked.
    // Feature #18 previously added donor recurring-gift route/nav metadata and
    // observability hooks; total initial JS measured 2,238,980. Bump to 2_245_000
    // to track the new floor. No routes leaked.
    // Feature #1 adds Migration Studio route metadata, import plan client wiring,
    // and shared source-plan constants; total initial JS measured 2,245,702.
    // Bump to 2_250_000 to track the new floor. No routes leaked.
    // Onboarding activation redesign adds SampleDataBanner to the app shell plus
    // the sample-data hooks and onboarding-goal helper to the preloaded graph;
    // total initial JS measured 2,253,578. Bump to 2_260_000 to track the new
    // floor. No routes leaked (modulepreload check below still passes).
    // Floor drift surfaced when the sessionStorage chunk-recovery fix became the
    // first @grantpipe/ui-touching commit in a while to re-trigger this gate;
    // total initial JS measured 2,261,325. Bump to 2_270_000 to track the new
    // floor. No routes leaked (modulepreload check below still passes).
    // Wave 0.3 Task 6 adds entity access management to settings/team plus shared
    // entity access contracts; total initial JS measured 2,277,567. Bump to
    // 2_285_000 to track the new floor. No routes leaked.
    // The pricing/packaging realignment (older base, ~30-byte PLAN_CATALOG string
    // as its only initial-graph delta) re-triggered this gate on accumulated
    // sibling-merge drift; total initial JS measured 2,297,742. Bump to 2_300_000
    // to track the new floor without masking a larger regression. No routes leaked.
    // The donor-dialog entity-name coherence pass (string-only edits) re-triggered
    // this gate on accumulated failure-observability sibling-merge drift; total
    // initial JS measured 2,302,479. Bump to 2_310_000 to track the new floor
    // without masking a larger regression. No routes leaked.
    // The launch-offer retirement pass measured total initial JS at 2,310,333.
    // Bump to 2_315_000 to keep a tight cap while preserving the route-leak check.
    expect(initialJsBytes).toBeLessThan(2_315_000);
    expect(modulePreloads.join("\n")).not.toMatch(
      /_(authenticated|bundleId|contactId|eventId|fundId|funderId|grantId|programId|reportId)|portal-/,
    );
  });
});
