# AI-CS Knowledge Foundation (P0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a typed, full-surface GrantPipe knowledge base (what/why/how per screen) that AI-CS stuffs into its prompt, with a mechanical label-extraction guard so a UI rename or route deletion breaks the build instead of silently producing wrong how-to steps.

**Architecture:** A new `packages/shared/src/knowledge/ai-cs/` module exports `FEATURE_KNOWLEDGE: FeatureKnowledge[]`, one entry per authenticated screen, each carrying `what`, `why`, ordered `how` steps anchored on **exact on-screen labels**, and the `uiLabels` those steps reference. Two build-time validators run in CI and the API build: (1) **route validation** — every `route` must exist in the generated TanStack route tree; (2) **label validation** — every string in `uiLabels` must appear verbatim in that route's component source. The API's existing `/api/ai-cs/context` builder maps `FEATURE_KNOWLEDGE` into the `AiCsAppContext` teaching fields (`concepts`, `howtos`, `faqs`) already defined in `@ventora/ai-cs-contracts`.

**Tech Stack:** TypeScript, Vitest, TanStack Router (generated `routeTree.gen.ts`), Hono on Cloudflare Workers, Drizzle (unchanged), pnpm workspaces + Turbo.

---

## File Structure

- `packages/shared/src/knowledge/ai-cs/types.ts` — `FeatureKnowledge`, `HowToStep`, `Role` (re-use existing `Role` if present), the `AI_CS_KNOWLEDGE_VERSION` const.
- `packages/shared/src/knowledge/ai-cs/feature-knowledge.ts` — the authored `FEATURE_KNOWLEDGE` array (one entry per screen).
- `packages/shared/src/knowledge/ai-cs/index.ts` — barrel re-export + a `getFeatureKnowledge(path)` lookup helper.
- `packages/shared/src/knowledge/ai-cs/feature-knowledge.test.ts` — data-shape + invariants tests (unique keys, non-empty how, every how label present in `uiLabels`).
- `apps/web/scripts/validate-ai-cs-knowledge.ts` — build-time validator: route existence (against `routeTree.gen.ts`) + label presence (against route component source). Exit non-zero on any miss.
- `apps/web/scripts/validate-ai-cs-knowledge.test.ts` — unit tests for the validator's pure helpers (pass case + each failure case).
- `apps/api/src/domains/ai-cs/context.ts` (modify) — map `FEATURE_KNOWLEDGE` into `concepts` / `howtos` / `faqs` on `AiCsAppContext`.
- `apps/api/src/domains/ai-cs/context.test.ts` (modify or create) — prove the mapping carries every screen's how-to and labels.
- `package.json` (root, modify) — add `ai-cs:validate-knowledge` script; wire into the API/web build.

> Locate the real ai-cs context builder file first (Task 0). Paths above for the API assume `apps/api/src/domains/ai-cs/`; correct them to the actual location discovered in Task 0 before writing code.

---

### Task 0: Locate the real seams (no code yet)

**Files:** none created.

- [ ] **Step 1: Find the context endpoint builder**

Run: `rg -n "ai-cs/context|AiCsAppContext|buildAiCsContext|authenticatedOnly" apps/api/src --type ts`
Expected: the route handler + the function that assembles the `AiCsAppContext` object. Record its exact path and the current shape it returns.

- [ ] **Step 2: Confirm the route tree generator output path**

Run: `rg -n "routeTree.gen" apps/web -l` and `ls apps/web/src/routeTree.gen.ts`
Expected: the generated file exists. Confirm it lists routes as `/_authenticated/grants/` etc. This is the source of truth for route validation.

- [ ] **Step 3: Confirm the existing `Role` type**

Run: `rg -n "export type Role|export const ROLES" packages/shared/src --type ts`
Expected: a canonical `Role` union (`"admin" | "editor" | "viewer" | "auditor"`). Re-use it; do NOT redefine.

- [ ] **Step 4: Record findings**

No commit. Write the three paths into the top of this plan's Task 5/Task 7 as you reach them.

---

### Task 1: The knowledge types

**Files:**

- Create: `packages/shared/src/knowledge/ai-cs/types.ts`
- Test: `packages/shared/src/knowledge/ai-cs/feature-knowledge.test.ts` (created in Task 3; types are exercised there)

- [ ] **Step 1: Write the types**

```ts
import type { Role } from "../../auth/roles"; // adjust to the path found in Task 0 Step 3

/** One numbered how-to step. `label` is the exact on-screen anchor the user clicks. */
export interface HowToStep {
  /** The exact visible UI string (button/tab/field). Must also appear in the owning entry's `uiLabels`. */
  label: string;
  /** Plain-language instruction performed at that anchor. Third-grade reading level. */
  action: string;
}

/** Everything AI-CS needs to teach one screen. */
export interface FeatureKnowledge {
  /** Stable snake_case id, unique across the array. */
  key: string;
  /** In-app path, must exist in the generated route tree. */
  route: string;
  /** Plain title a user would recognize. */
  title: string;
  /** What this screen is, in one or two plain sentences. */
  what: string;
  /** Why it exists / when to use it. Teaches judgement, not just clicks. */
  why: string;
  /** Ordered steps. Each `label` is an exact on-screen anchor. */
  how: HowToStep[];
  /** Every exact UI string referenced by `how`. The build asserts each appears in the route source. */
  uiLabels: string[];
  /** Roles that can reach this screen, if restricted. */
  roles?: Role[];
  /** Related feature keys, for follow-up suggestions. */
  related?: string[];
  /** Things users confuse this with but it is NOT (abstention anchors). */
  notFeatures?: string[];
}

/** Bumped whenever FEATURE_KNOWLEDGE changes; surfaced in observability for sync auditing. */
export const AI_CS_KNOWLEDGE_VERSION = "2026-06-20.1";
```

- [ ] **Step 2: No test yet** — types are validated through Task 3's data tests. Proceed.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/knowledge/ai-cs/types.ts
git commit -m "feat(ai-cs): add FeatureKnowledge knowledge types"
```

---

### Task 2: The lookup helper (TDD)

**Files:**

- Create: `packages/shared/src/knowledge/ai-cs/index.ts`
- Test: `packages/shared/src/knowledge/ai-cs/index.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { getFeatureKnowledge, FEATURE_KNOWLEDGE } from "./index";

describe("getFeatureKnowledge", () => {
  it("returns the entry whose route matches exactly", () => {
    const entry = getFeatureKnowledge("/grants");
    expect(entry?.key).toBe("grants");
  });

  it("matches ignoring a trailing slash", () => {
    expect(getFeatureKnowledge("/grants/")?.key).toBe("grants");
  });

  it("returns undefined for an unknown path", () => {
    expect(getFeatureKnowledge("/nope")).toBeUndefined();
  });

  it("exposes the full array", () => {
    expect(FEATURE_KNOWLEDGE.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `pnpm --filter @grantpipe/shared test -- knowledge/ai-cs/index`
Expected: FAIL — `./index` has no exports yet.

- [ ] **Step 3: Write the barrel + helper**

```ts
export * from "./types";
export { FEATURE_KNOWLEDGE } from "./feature-knowledge";
import { FEATURE_KNOWLEDGE } from "./feature-knowledge";
import type { FeatureKnowledge } from "./types";

const normalize = (path: string) =>
  path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;

export function getFeatureKnowledge(path: string): FeatureKnowledge | undefined {
  const target = normalize(path);
  return FEATURE_KNOWLEDGE.find((entry) => normalize(entry.route) === target);
}
```

- [ ] **Step 4: Run it, expect pass** (after Task 3 lands the data; if running now, add a temporary one-entry array).

Run: `pnpm --filter @grantpipe/shared test -- knowledge/ai-cs/index`
Expected: PASS once `feature-knowledge.ts` exists.

- [ ] **Step 5: Commit** (combine with Task 3 if data not yet present).

---

### Task 3: Author the grants entry + invariants test (the worked example)

**Files:**

- Create: `packages/shared/src/knowledge/ai-cs/feature-knowledge.ts`
- Create: `packages/shared/src/knowledge/ai-cs/feature-knowledge.test.ts`

The grants entry below uses labels **verified against** `apps/web/src/routes/_authenticated/grants/index.tsx`: title `"Grants"`, button `"Add grant"`, tabs `"Opportunities"`, `"Pipeline"`, `"Portfolio"`, `"Live Grants.gov"`, `"Tracked/imported"`, `"Add to pipeline"`, `"Save"`.

- [ ] **Step 1: Write the invariants test first**

```ts
import { describe, expect, it } from "vitest";
import { FEATURE_KNOWLEDGE } from "./feature-knowledge";

describe("FEATURE_KNOWLEDGE invariants", () => {
  it("has unique keys", () => {
    const keys = FEATURE_KNOWLEDGE.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has unique routes", () => {
    const routes = FEATURE_KNOWLEDGE.map((f) => f.route);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it("every entry has non-empty what/why and at least one how step", () => {
    for (const f of FEATURE_KNOWLEDGE) {
      expect(f.what.trim().length, f.key).toBeGreaterThan(0);
      expect(f.why.trim().length, f.key).toBeGreaterThan(0);
      expect(f.how.length, f.key).toBeGreaterThan(0);
    }
  });

  it("every how-step label is declared in the entry uiLabels", () => {
    for (const f of FEATURE_KNOWLEDGE) {
      for (const step of f.how) {
        expect(f.uiLabels, `${f.key}: ${step.label}`).toContain(step.label);
      }
    }
  });

  it("includes the grants screen", () => {
    const grants = FEATURE_KNOWLEDGE.find((f) => f.key === "grants");
    expect(grants?.route).toBe("/grants");
    expect(grants?.uiLabels).toContain("Add grant");
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `pnpm --filter @grantpipe/shared test -- knowledge/ai-cs/feature-knowledge`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the data file with the grants entry**

```ts
import type { FeatureKnowledge } from "./types";

export const FEATURE_KNOWLEDGE: FeatureKnowledge[] = [
  {
    key: "grants",
    route: "/grants",
    title: "Grants",
    what: "The Grants screen is where you find new grants, track the ones you are going after, and manage the grants you have won.",
    why: "Use Grants for money from funders that comes with rules or a report. Keep plain gifts in Donors. When grant money can only be spent one way, connect it to a Fund.",
    how: [
      {
        label: "Opportunities",
        action: "Open the Opportunities tab to look for new grants to apply for.",
      },
      {
        label: "Live Grants.gov",
        action:
          "Stay on Live Grants.gov to search real federal listings, or switch to Tracked/imported for grants you added yourself.",
      },
      {
        label: "Add grant",
        action:
          "Choose Add grant to start a record for a grant you are applying for or already won.",
      },
      {
        label: "Pipeline",
        action: "Open the Pipeline tab to drag each grant through its stages, like a board.",
      },
      {
        label: "Portfolio",
        action:
          "Open the Portfolio tab to see every grant in a list and filter by status or funder.",
      },
    ],
    uiLabels: [
      "Grants",
      "Opportunities",
      "Pipeline",
      "Portfolio",
      "Live Grants.gov",
      "Tracked/imported",
      "Add grant",
      "Add to pipeline",
      "Save",
    ],
    roles: ["admin", "editor", "viewer", "auditor"],
    related: ["funds", "budget_sentinel"],
    notFeatures: ["Plain donations from individuals — those live in Donors."],
  },
  // Further screens authored in Task 6.
];
```

- [ ] **Step 4: Run it, expect pass**

Run: `pnpm --filter @grantpipe/shared test -- knowledge/ai-cs/feature-knowledge`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/knowledge/ai-cs/feature-knowledge.ts packages/shared/src/knowledge/ai-cs/feature-knowledge.test.ts packages/shared/src/knowledge/ai-cs/index.ts packages/shared/src/knowledge/ai-cs/index.test.ts
git commit -m "feat(ai-cs): author grants feature knowledge with verified labels"
```

---

### Task 4: Validator pure helpers (TDD)

**Files:**

- Create: `apps/web/scripts/validate-ai-cs-knowledge.ts`
- Test: `apps/web/scripts/validate-ai-cs-knowledge.test.ts`

The validator has two pure helpers (easy to unit test) plus a thin `main()` that reads files. Test the helpers; `main()` wiring is covered by the integration run in Task 5.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { findMissingRoutes, findMissingLabels } from "./validate-ai-cs-knowledge";

const ENTRY = {
  key: "grants",
  route: "/grants",
  title: "Grants",
  what: "x",
  why: "y",
  how: [{ label: "Add grant", action: "z" }],
  uiLabels: ["Add grant", "Grants"],
};

describe("findMissingRoutes", () => {
  it("returns nothing when the route is in the known set", () => {
    expect(findMissingRoutes([ENTRY], new Set(["/grants"]))).toEqual([]);
  });
  it("flags a route absent from the route tree", () => {
    expect(findMissingRoutes([ENTRY], new Set(["/donors"]))).toEqual([
      { key: "grants", route: "/grants" },
    ]);
  });
});

describe("findMissingLabels", () => {
  it("returns nothing when every label appears in the source", () => {
    const source = `<Button>Add grant</Button><h1>Grants</h1>`;
    expect(findMissingLabels(ENTRY, source)).toEqual([]);
  });
  it("flags a label missing from the source", () => {
    const source = `<h1>Grants</h1>`;
    expect(findMissingLabels(ENTRY, source)).toEqual(["Add grant"]);
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `pnpm --filter @grantpipe/web test -- validate-ai-cs-knowledge`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers + main**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FEATURE_KNOWLEDGE } from "@grantpipe/shared";
import type { FeatureKnowledge } from "@grantpipe/shared";

export function findMissingRoutes(
  entries: Pick<FeatureKnowledge, "key" | "route">[],
  knownRoutes: Set<string>,
): { key: string; route: string }[] {
  return entries
    .filter((e) => !knownRoutes.has(e.route))
    .map((e) => ({ key: e.key, route: e.route }));
}

export function findMissingLabels(
  entry: Pick<FeatureKnowledge, "uiLabels">,
  source: string,
): string[] {
  return entry.uiLabels.filter((label) => !source.includes(label));
}

/** Map a FeatureKnowledge route to its component source file. */
export function routeToSourceFile(route: string): string {
  const clean = route === "/" ? "/index" : route;
  // "/grants" -> "_authenticated/grants/index.tsx"; "/grants/sentinel" -> "_authenticated/grants/sentinel.tsx"
  const segments = clean.replace(/^\//, "").split("/");
  const base = resolve(__dirname, "../src/routes/_authenticated", ...segments);
  return base; // caller appends .tsx / index.tsx resolution
}
```

> Note: the route→source resolution and the route-tree parsing live in `main()`; Task 5 runs the real thing end-to-end and corrects `routeToSourceFile` against the actual folder layout (some screens are `foo/index.tsx`, some `foo.tsx`).

- [ ] **Step 4: Run it, expect pass**

Run: `pnpm --filter @grantpipe/web test -- validate-ai-cs-knowledge`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/scripts/validate-ai-cs-knowledge.ts apps/web/scripts/validate-ai-cs-knowledge.test.ts
git commit -m "feat(ai-cs): add knowledge validator pure helpers"
```

---

### Task 5: Wire the validator end-to-end against real source

**Files:**

- Modify: `apps/web/scripts/validate-ai-cs-knowledge.ts` (add `main()` + route-tree parse + source resolution)
- Modify: root `package.json` (add `ai-cs:validate-knowledge` script)

- [ ] **Step 1: Implement `main()`**

Read `apps/web/src/routeTree.gen.ts`, extract the set of real paths (strip the `/_authenticated` prefix; map `"/_authenticated/grants/"` → `"/grants"`). For each `FEATURE_KNOWLEDGE` entry: resolve its source file (`foo/index.tsx` else `foo.tsx`), read it, run `findMissingLabels`. Collect all route + label misses, print them, `process.exit(1)` if any.

```ts
function knownRoutesFromTree(treeSource: string): Set<string> {
  const matches = [...treeSource.matchAll(/path:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const routes = new Set<string>();
  for (const raw of matches) {
    const r = raw.replace("/_authenticated", "").replace(/\/$/, "") || "/";
    routes.add(r.startsWith("/") ? r : `/${r}`);
  }
  return routes;
}
```

> Validate this regex against the real `routeTree.gen.ts` format in Task 0 Step 2; TanStack may emit `path: '/grants/'` on `createFileRoute` calls or a flat `fullPath` map. Adjust the extraction to whatever the generated file actually contains, then confirm `/grants` is in the set.

- [ ] **Step 2: Add the npm script**

In root `package.json` scripts: `"ai-cs:validate-knowledge": "tsx apps/web/scripts/validate-ai-cs-knowledge.ts"`.

- [ ] **Step 3: Run it against the real tree (grants only so far)**

Run: `pnpm run ai-cs:validate-knowledge`
Expected: PASS — `/grants` resolves and all 9 grants labels are found in `grants/index.tsx`.

- [ ] **Step 4: Prove the guard bites**

Temporarily add `"ZZZ-not-on-screen"` to the grants `uiLabels`, re-run.
Expected: FAIL listing `grants: ZZZ-not-on-screen`. Then remove it and re-run to green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/scripts/validate-ai-cs-knowledge.ts package.json
git commit -m "feat(ai-cs): validate knowledge routes and labels against real source"
```

---

### Task 6: Author the remaining screens (drive the live app)

**Files:**

- Modify: `packages/shared/src/knowledge/ai-cs/feature-knowledge.ts`

Bring up the local stack (`GRANTPIPE_WEB_PORT=3050 GRANTPIPE_API_PORT=5050`, sign in `demo@grantpipe.com` / `Demo2026!` from origin `localhost:3050`). For EACH authenticated screen below, open it, read the exact visible labels, then author `what` / `why` / `how` / `uiLabels`. Reading-level rule: third-grade. After authoring, run the validator (Task 5) — it fails until every label is verbatim-correct, which doubles as your flaw test.

Screens to cover (from the route tree): `donors` (`/donors`), `donors/pledges`, `donors/at-risk`, `donors/email`, `funds` (`/funds`), `grants/pipeline`, `grants/sentinel`, `import`, `reports` (`/reports`), `reports/builder`, `reports/drafts`, `reports/ask-ledger`, `accounting/reports/activities`, `accounting/reports/functional-expenses`, `accounting/reports/financial-position`, `accounting/trial-balance`, `accounting/ledger`, `accounting/chart-of-accounts`, `accounting/periods`, `accounting/recurring`, `accounting/journal`, `accounting/bank`, `accounting/integrations`, `programs`, `subrecipients`, `evidence-bundles`, `calendar`, `activity`, `notifications`, `radar`, `payments`, `events`, `settings`, `settings/team`, `settings/billing`, `settings/portal-access`.

- [ ] **Step 1: For each screen — write/extend its entry** following the grants pattern exactly. Add to `related`/`notFeatures` where two screens are easy to confuse (e.g. Donors vs Grants, Funds vs Grants).

- [ ] **Step 2: Run the validator after every few screens**

Run: `pnpm run ai-cs:validate-knowledge`
Expected: PASS — fix any flagged label until green.

- [ ] **Step 3: Run the invariants test**

Run: `pnpm --filter @grantpipe/shared test -- knowledge/ai-cs/feature-knowledge`
Expected: PASS.

- [ ] **Step 4: Commit per batch**

```bash
git add packages/shared/src/knowledge/ai-cs/feature-knowledge.ts
git commit -m "feat(ai-cs): author <area> feature knowledge from live app"
```

---

### Task 7: Map knowledge into the context endpoint (TDD)

**Files:**

- Modify: the ai-cs context builder found in Task 0 Step 1
- Modify/Create: its test file

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildAiCsContext } from "./context"; // path from Task 0

describe("buildAiCsContext teaching fields", () => {
  it("includes a how-to for every feature-knowledge screen", () => {
    const ctx = buildAiCsContext({ appId: "grantpipe", currentPath: "/grants" });
    expect(ctx.howtos?.length).toBeGreaterThanOrEqual(1);
    const grants = ctx.howtos?.find((h) => h.goal.includes("Grants"));
    expect(grants?.steps[0]?.button).toBe("Opportunities");
  });

  it("carries the exact button labels as step.button", () => {
    const ctx = buildAiCsContext({ appId: "grantpipe", currentPath: "/grants" });
    const labels = ctx.howtos?.flatMap((h) => h.steps.map((s) => s.button));
    expect(labels).toContain("Add grant");
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `pnpm --filter @grantpipe/api test -- context`
Expected: FAIL — `howtos` empty / undefined.

- [ ] **Step 3: Implement the mapping**

In the context builder, map `FEATURE_KNOWLEDGE` → `AiCsAppContext.howtos` (each `FeatureKnowledge` → one `AiCsHowto`: `goal` from `title`+`what`, each `HowToStep` → `{ n, instruction: action, screen: title, button: label, path: route }`), and surface `notFeatures` as `faqs` ("Is X the same as Y?" abstention answers). Keep `sources` as-is for now (engine fix is P5/P2).

```ts
import { FEATURE_KNOWLEDGE } from "@grantpipe/shared";

const howtos = FEATURE_KNOWLEDGE.map((f) => ({
  id: f.key,
  goal: `${f.title}: ${f.what}`,
  prerequisites: f.roles ? [`Needs ${f.roles.join(" or ")} access.`] : undefined,
  steps: f.how.map((s, i) => ({
    n: i + 1,
    instruction: s.action,
    screen: f.title,
    button: s.label,
    path: f.route,
  })),
}));
```

- [ ] **Step 4: Run it, expect pass**

Run: `pnpm --filter @grantpipe/api test -- context`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/ai-cs/context.ts apps/api/src/domains/ai-cs/context.test.ts
git commit -m "feat(ai-cs): map feature knowledge into context endpoint teaching fields"
```

---

### Task 8: Gate the build on the validator

**Files:**

- Modify: root `package.json` and/or `turbo.json`

- [ ] **Step 1: Add the validator to the API + web build chain**

Make `ai-cs:validate-knowledge` a prerequisite of `turbo build` for `@grantpipe/web` and `@grantpipe/api` (e.g. a `prebuild` hook or a turbo task dependency). A rename/route deletion now fails CI.

- [ ] **Step 2: Run the whole gate**

Run: `pnpm run ai-cs:validate-knowledge && turbo typecheck --filter=@grantpipe/shared --filter=@grantpipe/api --filter=@grantpipe/web`
Expected: PASS.

- [ ] **Step 3: Confirm coverage on touched files**

Run: `pnpm --filter @grantpipe/shared test:coverage` and `pnpm --filter @grantpipe/api test:coverage`
Expected: every file created/modified here ≥ 95%.

- [ ] **Step 4: Commit**

```bash
git add package.json turbo.json
git commit -m "build(ai-cs): gate web/api build on knowledge validator"
```

---

## Self-Review

**Spec coverage:** P0 in the spec asks for (a) `FeatureKnowledge` model ✓ Task 1; (b) mechanical label extraction "B" guarantee ✓ Tasks 4–5, 8; (c) route validation ✓ Task 5; (d) compile to context endpoint ✓ Task 7; (e) full-surface authored knowledge ✓ Tasks 3, 6; (f) decision #4 "A" (derive from source + drive live app) ✓ Tasks 3, 6. Observability for the feature (PostHog/Sentry) is a P6 concern but the context builder's failure path should reuse the existing ai-cs Sentry wrapper — verify in Task 7 that `buildAiCsContext` errors are captured by the existing handler; if not, add a Sentry capture test there.

**Placeholder scan:** No TBD/TODO in code. Two explicit "verify against real file" notes (Task 0, Task 5 regex) are deliberate discovery steps, not deferred work — they are resolved within the same task before its commit.

**Type consistency:** `FeatureKnowledge` / `HowToStep` field names (`key`, `route`, `what`, `why`, `how`, `uiLabels`, `label`, `action`) are identical across Tasks 1, 3, 4, 7. The context mapping in Task 7 reads only those fields. `AiCsHowto` / `AiCsHowtoStep` field names (`goal`, `prerequisites`, `steps`, `n`, `instruction`, `screen`, `button`, `path`) match `@ventora/ai-cs-contracts` exactly.

**Gap fixed:** Added the Sentry-coverage check note to Task 7 so the feature does not ship without failure observability per CLAUDE.md.
