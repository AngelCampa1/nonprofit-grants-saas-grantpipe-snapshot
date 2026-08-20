# Onboarding Activation Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace GrantPipe's bland configuration-first onboarding with an activation-first flow — a role-branched welcome wizard, a real "first value" aha moment, a role-aware dashboard checklist with a progress bar, one-click explorable sample data, and teaching empty states — all with privacy-safe PostHog + Sentry coverage.

**Architecture:** Elevation of existing surfaces, not greenfield. Reuse `organizations.onboardingCompleted`, `userGuideProgress`, the PostHog `ANALYTICS_EVENTS` taxonomy, and the `TeachAndActEmptyState` primitive. New persistence: one nullable `organizations.onboardingGoal` column and one `sample_data_records` ledger table that records every seeded `(entityTable, entityId)` so a one-click clear can FK-safely hard-delete exactly what was seeded. A new authenticated, org-scoped `sample-data` API domain ports the realistic content from `packages/db/src/seed-demo.ts` into the caller's current org.

**Tech Stack:** Drizzle ORM + Neon Postgres (`packages/db`), Zod validators (`packages/shared`), Hono RPC on Cloudflare Workers (`apps/api`), React 19 + Vite + TanStack Router/Query (`apps/web`), Shadcn/Tailwind 4 (`packages/ui`), Vitest + RTL throughout.

**Spec:** `docs/superpowers/specs/2026-06-19-onboarding-activation-redesign.md`

---

## Conventions (verified against the codebase — follow exactly)

- **Schema columns:** `text("snake_case")`, nullable = omit `.notNull()`, FK via `.references(() => table.id)`. Tables: second arg `(table) => ({ idx: index("name").on(table.col) })`. Inferred types: `export type X = typeof table.$inferSelect;` co-located in the schema file.
- **Schema barrel:** add `export * from "./sample-data";` to `packages/db/src/schema/index.ts`.
- **Migrations:** `pnpm --filter @grantpipe/db generate` → emits `packages/db/src/migrations/*.sql` (committed). Drizzle config: `packages/db/drizzle.config.ts` (`schema: ./src/schema/index.ts`, `out: ./src/migrations`). Never hand-edit generated SQL.
- **Validators:** Zod in `packages/shared/src/validators/`, const arrays `as const` + `z.enum(...)`, `export type X = z.infer<...>`, barrel via `packages/shared/src/validators/index.ts`.
- **Analytics events:** add string-valued keys to `ANALYTICS_EVENTS` in `packages/shared/src/constants/analytics.ts`.
- **API routes:** `new Hono<AppEnv>()` chain; context accessors `c.get("db")`, `c.get("orgId")!`, `c.get("user")!` (`{id,email,name}`), `c.get("memberRole")`. Role guard middleware `requireRole("admin")` / `requirePermission(feature, level)` from `apps/api/src/middleware/require-role.ts`. Register in `apps/api/src/app.ts` via `.route("/sample-data", sampleDataRoutes)`.
- **API services:** `(db: Database, params)` signature; multi-table writes wrapped in `db.transaction(async (tx) => { ... })`, pass `tx` to every write.
- **API analytics capture:** `getIntegrations(c.get("db"), c.env ?? {}).analytics.capture({ orgId, eventName, payload })`, wrapped in try/catch → `captureBackgroundException(error, "sample_data", { telemetry: "analytics_capture", operation })`. Helpers in `apps/api/src/lib/integrations.ts` and `apps/api/src/lib/sentry.ts`.
- **API tests:** Vitest. `vi.mock("./service")`, `vi.mock("../../lib/integrations")`, `vi.mock("../../lib/sentry")`; `makeApp()` factory installs a context-seeding middleware then `app.route(...)`. Service tests mock the Drizzle `db` with `vi.fn()` chains (no real Postgres).
- **Web analytics:** `captureEvent(event, properties?, options?)` from `apps/web/src/lib/analytics.ts` (PII-redacting, best-effort).
- **Web Sentry:** `captureAppException(error, { tags, extra })` / `captureQueryError(error, operation, extra)` from `apps/web/src/lib/sentry.ts`.
- **Web API client:** `import { api } from "../lib/api-client"` (the `hc<AppType>()` client). Mutations via TanStack Query `useMutation`.
- **Web session:** `useSession()` from `apps/web/src/hooks/use-session.ts` → `{ user, memberRole, onboardingCompleted, orgSubscription, ... }`.
- **Web tests:** RTL + Vitest, wrap in `QueryClientProvider` (retry:false), `vi.mock("../lib/api-client")`.
- **Design canon:** pill buttons (`rounded-full`) on every CTA; warm emerald/ochre; light theme only. Copy must read calm and concrete (founder voice; user-facing copy runs through the `humanizer` then `third-grade-copy` skills in Task 28 before completion).

---

## File Structure

**Create:**
- `packages/db/src/schema/sample-data.ts` — `sampleDataRecords` ledger table + inferred types.
- `packages/shared/src/validators/sample-data.ts` — request/response Zod schemas.
- `apps/api/src/domains/sample-data/service.ts` — seed / clear / status logic + ledger helper.
- `apps/api/src/domains/sample-data/seed-content.ts` — org-scoped sample content builder (ported from `seed-demo.ts`).
- `apps/api/src/domains/sample-data/routes.ts` — `POST` / `DELETE` / `GET /status` + observability.
- `apps/api/src/domains/sample-data/service.test.ts`, `routes.test.ts`.
- `apps/web/src/hooks/use-sample-data.ts` — status query + seed/clear mutations.
- `apps/web/src/components/sample-data-banner.tsx` — app-wide "exploring sample data" banner.
- `apps/web/src/components/onboarding/goal-step.tsx` — wizard goal-selection step.
- `apps/web/src/lib/onboarding-goal.ts` — goal → landing-route + checklist-ordering helpers.
- `apps/web/src/hooks/use-activation-aha.ts` — fire-once activation event guard.
- Test files co-located (`*.test.ts(x)`) for each of the above.

**Modify:**
- `packages/db/src/schema/auth.ts` — add `onboardingGoal` column to `organizations`.
- `packages/db/src/schema/index.ts` — export new schema file.
- `packages/shared/src/validators/auth.ts` — extend `onboardingSchema` with optional `onboardingGoal`; add `ONBOARDING_GOALS`.
- `packages/shared/src/validators/index.ts` — export sample-data validators.
- `packages/shared/src/constants/analytics.ts` — new event keys.
- `apps/api/src/domains/onboarding/service.ts` + `routes.ts` — persist `onboardingGoal`, fire `onboardingGoalSelected`.
- `apps/api/src/app.ts` — register `sample-data` routes.
- `apps/web/src/routes/_authenticated/onboarding.tsx` — wizard redesign.
- `apps/web/src/components/onboarding-checklist.tsx` — goal branching + progress bar + 100% hand-off.
- `apps/web/src/routes/_authenticated/route.tsx` (authenticated layout) — mount `SampleDataBanner`.
- Donors / Grants / Funds / Reports list routes — upgrade empty states.

---

## Phase A — Shared + DB foundations

### Task 1: `onboardingGoal` enum + validator

**Files:**
- Modify: `packages/shared/src/validators/auth.ts`
- Test: `packages/shared/src/validators/auth.test.ts`

- [ ] **Step 1: Write failing test** — append to `auth.test.ts`:

```typescript
import { ONBOARDING_GOALS, onboardingGoalSchema, onboardingSchema } from "./auth";

describe("onboarding goal", () => {
  it("defines the three approved goals", () => {
    expect(ONBOARDING_GOALS).toEqual(["donors", "grants", "compliance"]);
  });

  it("accepts a known goal and rejects an unknown one", () => {
    expect(onboardingGoalSchema.parse("grants")).toBe("grants");
    expect(() => onboardingGoalSchema.parse("payroll")).toThrow();
  });

  it("treats onboardingGoal as optional on the onboarding payload", () => {
    const base = { orgName: "Acme", fiscalYearStartMonth: 1, timezone: "UTC" };
    expect(onboardingSchema.parse(base).onboardingGoal).toBeUndefined();
    expect(onboardingSchema.parse({ ...base, onboardingGoal: "compliance" }).onboardingGoal).toBe(
      "compliance",
    );
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm --filter @grantpipe/shared test -- auth.test.ts`
Expected: FAIL (`ONBOARDING_GOALS` / `onboardingGoalSchema` undefined).

- [ ] **Step 3: Implement** — in `packages/shared/src/validators/auth.ts`, above `onboardingSchema`:

```typescript
export const ONBOARDING_GOALS = ["donors", "grants", "compliance"] as const;
export type OnboardingGoal = (typeof ONBOARDING_GOALS)[number];
export const onboardingGoalSchema = z.enum(ONBOARDING_GOALS);
```

Then add the field to `onboardingSchema`:

```typescript
export const onboardingSchema = z.object({
  orgName: z.string().trim().min(1, "Organization name is required").max(200),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  timezone: z.string().trim().min(1, "Timezone is required"),
  onboardingGoal: onboardingGoalSchema.optional(),
});
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @grantpipe/shared test -- auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/validators/auth.ts packages/shared/src/validators/auth.test.ts
git commit -m "feat(shared): add onboardingGoal enum and optional onboarding field"
```

---

### Task 2: Sample-data request/response validators

**Files:**
- Create: `packages/shared/src/validators/sample-data.ts`
- Modify: `packages/shared/src/validators/index.ts`
- Test: `packages/shared/src/validators/sample-data.test.ts`

- [ ] **Step 1: Write failing test** (`sample-data.test.ts`):

```typescript
import { describe, expect, it } from "vitest";
import { sampleDataStatusSchema } from "./sample-data";

describe("sample data validators", () => {
  it("parses a seeded status", () => {
    expect(sampleDataStatusSchema.parse({ seeded: true, recordCount: 42 })).toEqual({
      seeded: true,
      recordCount: 42,
    });
  });

  it("rejects a negative record count", () => {
    expect(() => sampleDataStatusSchema.parse({ seeded: false, recordCount: -1 })).toThrow();
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm --filter @grantpipe/shared test -- sample-data.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** (`packages/shared/src/validators/sample-data.ts`):

```typescript
import { z } from "zod";

export const sampleDataStatusSchema = z.object({
  seeded: z.boolean(),
  recordCount: z.number().int().min(0),
});
export type SampleDataStatus = z.infer<typeof sampleDataStatusSchema>;

export const sampleDataSeedResultSchema = z.object({
  seeded: z.literal(true),
  recordCount: z.number().int().min(1),
});
export type SampleDataSeedResult = z.infer<typeof sampleDataSeedResultSchema>;

export const sampleDataClearResultSchema = z.object({
  cleared: z.boolean(),
  recordCount: z.number().int().min(0),
});
export type SampleDataClearResult = z.infer<typeof sampleDataClearResultSchema>;
```

Add to `packages/shared/src/validators/index.ts`: `export * from "./sample-data";`

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @grantpipe/shared test -- sample-data.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/validators/sample-data.ts packages/shared/src/validators/sample-data.test.ts packages/shared/src/validators/index.ts
git commit -m "feat(shared): add sample-data status/result validators"
```

---

### Task 3: New analytics event keys

**Files:**
- Modify: `packages/shared/src/constants/analytics.ts`
- Test: `packages/shared/src/constants/analytics.test.ts` (create if absent; otherwise extend the existing taxonomy test)

- [ ] **Step 1: Write failing test** — add a describe block asserting the new keys map to privacy-safe snake_case names:

```typescript
import { ANALYTICS_EVENTS } from "./analytics";

describe("activation analytics events", () => {
  it("exposes the onboarding activation event names", () => {
    expect(ANALYTICS_EVENTS.onboardingGoalSelected).toBe("onboarding_goal_selected");
    expect(ANALYTICS_EVENTS.onboardingSampleDataChosen).toBe("onboarding_sample_data_chosen");
    expect(ANALYTICS_EVENTS.sampleDataSeeded).toBe("sample_data_seeded");
    expect(ANALYTICS_EVENTS.sampleDataCleared).toBe("sample_data_cleared");
    expect(ANALYTICS_EVENTS.activationFirstValueViewed).toBe("activation_first_value_viewed");
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm --filter @grantpipe/shared test -- analytics.test.ts`
Expected: FAIL (keys undefined).

- [ ] **Step 3: Implement** — add to the `ANALYTICS_EVENTS` object:

```typescript
  onboardingGoalSelected: "onboarding_goal_selected",
  onboardingSampleDataChosen: "onboarding_sample_data_chosen",
  sampleDataSeeded: "sample_data_seeded",
  sampleDataCleared: "sample_data_cleared",
  activationFirstValueViewed: "activation_first_value_viewed",
```

- [ ] **Step 4: Run, verify pass** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/constants/analytics.ts packages/shared/src/constants/analytics.test.ts
git commit -m "feat(shared): add onboarding activation + sample-data analytics events"
```

---

### Task 4: `organizations.onboardingGoal` column

**Files:**
- Modify: `packages/db/src/schema/auth.ts`
- Test: `packages/db/src/schema/auth.test.ts` (extend; if no schema test exists, add a minimal column-presence assertion file)

- [ ] **Step 1: Write failing test** — assert the column exists and is nullable:

```typescript
import { organizations } from "./auth";

describe("organizations.onboardingGoal", () => {
  it("declares a nullable onboarding_goal column", () => {
    const col = organizations.onboardingGoal;
    expect(col).toBeDefined();
    expect(col.name).toBe("onboarding_goal");
    expect(col.notNull).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm --filter @grantpipe/db test -- auth.test.ts`
Expected: FAIL (`onboardingGoal` undefined).

- [ ] **Step 3: Implement** — in `packages/db/src/schema/auth.ts`, directly after the `onboardingCompleted` line in the `organizations` table:

```typescript
  onboardingGoal: text("onboarding_goal"),
```

- [ ] **Step 4: Run, verify pass** — Expected: PASS.

- [ ] **Step 5: Generate migration**

Run: `pnpm --filter @grantpipe/db generate`
Expected: a new `packages/db/src/migrations/NNNN_*.sql` adding `onboarding_goal`. Inspect it; do not hand-edit.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/auth.ts packages/db/src/schema/auth.test.ts packages/db/src/migrations
git commit -m "feat(db): add organizations.onboarding_goal column"
```

---

### Task 5: `sample_data_records` ledger table

**Files:**
- Create: `packages/db/src/schema/sample-data.ts`
- Modify: `packages/db/src/schema/index.ts`
- Test: `packages/db/src/schema/sample-data.test.ts`

- [ ] **Step 1: Write failing test**:

```typescript
import { describe, expect, it } from "vitest";
import { sampleDataRecords } from "./sample-data";

describe("sampleDataRecords ledger", () => {
  it("declares the org-scoped ledger columns", () => {
    expect(sampleDataRecords.orgId.name).toBe("org_id");
    expect(sampleDataRecords.entityTable.name).toBe("entity_table");
    expect(sampleDataRecords.entityId.name).toBe("entity_id");
    expect(sampleDataRecords.orgId.notNull).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm --filter @grantpipe/db test -- sample-data.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** (`packages/db/src/schema/sample-data.ts`):

```typescript
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations } from "./auth";

export const sampleDataRecords = pgTable(
  "sample_data_records",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    entityTable: text("entity_table").notNull(),
    entityId: text("entity_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("sample_data_records_org_idx").on(table.orgId),
    orgTableIdx: index("sample_data_records_org_table_idx").on(table.orgId, table.entityTable),
  }),
);

export type SampleDataRecord = typeof sampleDataRecords.$inferSelect;
export type NewSampleDataRecord = typeof sampleDataRecords.$inferInsert;
```

Add to `packages/db/src/schema/index.ts`: `export * from "./sample-data";`

- [ ] **Step 4: Run, verify pass** — Expected: PASS.

- [ ] **Step 5: Generate migration**

Run: `pnpm --filter @grantpipe/db generate`
Expected: a new migration creating `sample_data_records` + its indexes.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/sample-data.ts packages/db/src/schema/index.ts packages/db/src/schema/sample-data.test.ts packages/db/src/migrations
git commit -m "feat(db): add sample_data_records ledger table"
```

---

## Phase B — Sample-data API domain

### Task 6: Ledger-recording transaction helper + seed content builder

**Files:**
- Create: `apps/api/src/domains/sample-data/seed-content.ts`
- Test: `apps/api/src/domains/sample-data/seed-content.test.ts`

The seed content is a **faithful, org-parameterized port** of the senior-care nonprofit fixtures in `packages/db/src/seed-demo.ts` (funders, funds, grants, allocations, expenses, reporting requirements, contacts, donations, restriction lifecycle). Two non-negotiable changes from the source:
1. Every insert takes `orgId` from the caller — never a hardcoded local DB or demo org.
2. Every human-visible name carries a `[Sample]` marker so the data is unmistakable (e.g. `"[Sample] Heartland Senior Services"`, `"[Sample] Title III-C Nutrition"`).

`seed-content.ts` exports a **pure builder** (no DB) that returns the rows to insert, so it is unit-testable without Postgres. The service (Task 7) consumes it inside a transaction and records the ledger.

- [ ] **Step 1: Write failing test**:

```typescript
import { describe, expect, it } from "vitest";
import { buildSampleContent, SAMPLE_MARKER } from "./seed-content";

describe("buildSampleContent", () => {
  const content = buildSampleContent({ orgId: "org-1" });

  it("scopes every entity to the caller org", () => {
    const allRows = Object.values(content).flat() as Array<{ orgId?: string }>;
    expect(allRows.length).toBeGreaterThan(0);
    for (const row of allRows) {
      if ("orgId" in row) expect(row.orgId).toBe("org-1");
    }
  });

  it("marks every funder, fund, and grant name as sample data", () => {
    for (const f of content.funders) expect(f.name).toContain(SAMPLE_MARKER);
    for (const f of content.funds) expect(f.name).toContain(SAMPLE_MARKER);
    for (const g of content.grants) expect(g.name).toContain(SAMPLE_MARKER);
  });

  it("produces a non-trivial dataset", () => {
    expect(content.grants.length).toBeGreaterThanOrEqual(4);
    expect(content.contacts.length).toBeGreaterThanOrEqual(5);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm --filter @grantpipe/api test -- seed-content.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — export `SAMPLE_MARKER = "[Sample]"` and `buildSampleContent({ orgId })`. Port each fixture block from `packages/db/src/seed-demo.ts`, generating stable ids with `crypto.randomUUID()` and threading parent ids (funder→fund→grant→allocation→expense, contact→donation, restriction terms/additions/releases/evidence). Return a typed object:

```typescript
export const SAMPLE_MARKER = "[Sample]";

export interface SampleContent {
  funders: NewFunder[];
  funds: NewFund[];
  grants: NewGrant[];
  allocations: NewGrantFundAllocation[];
  expenses: NewExpense[];
  reportingRequirements: NewReportingRequirement[];
  contacts: NewContact[];
  donations: NewDonation[];
  restrictionTerms: NewRestrictionTerm[];
  // ...one array per seeded table, in FK-safe insert order
}

export function buildSampleContent(params: { orgId: string }): SampleContent {
  const { orgId } = params;
  // ...port seed-demo.ts content, orgId-scoped, names prefixed with SAMPLE_MARKER
}
```

Use the `New*` inferred insert types from `@grantpipe/db`. Keep the array order = FK-safe insert order. Do not seed auth/user/org rows (the org already exists). Money stays integer cents. Dates: `seed-demo.ts` uses `new Date()`; in a Worker that is fine here (this is request-time, not a plan script) — but prefer deterministic relative dates derived from a single `now` passed in for testability:

```typescript
export function buildSampleContent(params: { orgId: string; now?: Date }): SampleContent
```

- [ ] **Step 4: Run, verify pass** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/sample-data/seed-content.ts apps/api/src/domains/sample-data/seed-content.test.ts
git commit -m "feat(api): add org-scoped sample-data content builder"
```

---

### Task 7: Seed service (transaction + ledger + real-data refusal)

**Files:**
- Create: `apps/api/src/domains/sample-data/service.ts`
- Test: `apps/api/src/domains/sample-data/service.test.ts`

- [ ] **Step 1: Write failing tests** (mock the Drizzle `db` with `vi.fn()` chains):

```typescript
import { describe, expect, it, vi } from "vitest";
import { seedSampleData, SampleDataConflictError } from "./service";

function makeDb(overrides: { existingSample?: number; existingReal?: boolean } = {}) {
  const inserted: Array<{ table: string; values: unknown }> = [];
  const tx = {
    insert: vi.fn((table: { _: { name: string } }) => ({
      values: (values: unknown) => ({ returning: async () => {
        inserted.push({ table: table._?.name ?? "t", values });
        return Array.isArray(values) ? values : [values];
      } }),
    })),
  };
  const db = {
    transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    // status precheck helpers the service uses:
    $count: vi.fn(),
  };
  return { db, tx, inserted };
}

describe("seedSampleData", () => {
  it("refuses to seed when the org already has real data", async () => {
    const { db } = makeDb();
    vi.spyOn({ hasRealData: async () => true }, "hasRealData");
    await expect(
      seedSampleData(db as never, { orgId: "org-1", hasRealData: async () => true, alreadySeeded: async () => false }),
    ).rejects.toBeInstanceOf(SampleDataConflictError);
  });

  it("is idempotent: refuses if sample data already seeded", async () => {
    const { db } = makeDb();
    await expect(
      seedSampleData(db as never, { orgId: "org-1", hasRealData: async () => false, alreadySeeded: async () => true }),
    ).rejects.toBeInstanceOf(SampleDataConflictError);
  });

  it("inserts content and records one ledger row per inserted entity", async () => {
    const { db, inserted } = makeDb();
    const result = await seedSampleData(db as never, {
      orgId: "org-1",
      hasRealData: async () => false,
      alreadySeeded: async () => false,
    });
    expect(result.recordCount).toBeGreaterThan(0);
    const ledgerInserts = inserted.filter((i) => i.table === "sample_data_records");
    expect(ledgerInserts.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm --filter @grantpipe/api test -- service.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** (`service.ts`):

```typescript
import type { Database } from "../../lib/db-types"; // match the Database type used by other services
import { sampleDataRecords } from "@grantpipe/db";
import { buildSampleContent, type SampleContent } from "./seed-content";

export class SampleDataConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SampleDataConflictError";
  }
}

interface SeedDeps {
  orgId: string;
  // injected for testability; real callers pass DB-backed implementations
  hasRealData: () => Promise<boolean>;
  alreadySeeded: () => Promise<boolean>;
  now?: Date;
}

// Maps a SampleContent key to its Drizzle table; drives FK-safe insert order.
const INSERT_ORDER: Array<{ key: keyof SampleContent; table: PgTable; entityTable: string }> = [
  // funders, funds, grants, allocations, expenses, reportingRequirements, contacts, donations, restriction* ...
];

export async function seedSampleData(db: Database, deps: SeedDeps) {
  if (await deps.alreadySeeded()) {
    throw new SampleDataConflictError("Sample data already exists for this organization.");
  }
  if (await deps.hasRealData()) {
    throw new SampleDataConflictError("Real data is present; refusing to seed sample data.");
  }
  const content = buildSampleContent({ orgId: deps.orgId, now: deps.now });

  return db.transaction(async (tx) => {
    let recordCount = 0;
    for (const { key, table, entityTable } of INSERT_ORDER) {
      const rows = content[key];
      if (!rows.length) continue;
      const inserted = await tx.insert(table).values(rows).returning();
      await tx.insert(sampleDataRecords).values(
        inserted.map((r: { id: string }) => ({
          orgId: deps.orgId,
          entityTable,
          entityId: r.id,
        })),
      );
      recordCount += inserted.length;
    }
    return { seeded: true as const, recordCount };
  });
}
```

Provide real DB-backed `hasRealData` / `alreadySeeded` in the route layer (Task 9): `alreadySeeded` = `count(sampleDataRecords where orgId) > 0`; `hasRealData` = any non-sample contact/grant/fund row exists beyond a small threshold (count rows of a couple of core tables minus ledger-tracked ids). Keep the precheck queries org-scoped.

- [ ] **Step 4: Run, verify pass** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/sample-data/service.ts apps/api/src/domains/sample-data/service.test.ts
git commit -m "feat(api): seed sample data into caller org with ledger + guardrails"
```

---

### Task 8: Clear + status service

**Files:**
- Modify: `apps/api/src/domains/sample-data/service.ts`
- Test: `apps/api/src/domains/sample-data/service.test.ts`

- [ ] **Step 1: Write failing tests** — add:

```typescript
import { clearSampleData, getSampleDataStatus } from "./service";

describe("clearSampleData", () => {
  it("deletes by ledger in reverse FK order then clears the ledger, idempotently", async () => {
    const deletes: string[] = [];
    const tx = {
      delete: vi.fn((table: { _: { name: string } }) => ({
        where: async () => { deletes.push(table._?.name ?? "t"); return []; },
      })),
    };
    const db = {
      transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const result = await clearSampleData(db as never, {
      orgId: "org-1",
      ledgerByTable: async () => ({ donations: ["d1"], grants: ["g1"], funders: ["f1"] }),
    });
    expect(result.cleared).toBe(true);
    // sample_data_records cleared last
    expect(deletes[deletes.length - 1]).toBe("sample_data_records");
  });

  it("is a no-op when nothing is seeded", async () => {
    const db = { transaction: vi.fn(async (fn) => fn({ delete: vi.fn() })) };
    const result = await clearSampleData(db as never, {
      orgId: "org-1",
      ledgerByTable: async () => ({}),
    });
    expect(result).toEqual({ cleared: false, recordCount: 0 });
  });
});

describe("getSampleDataStatus", () => {
  it("returns seeded=false when ledger is empty", async () => {
    const status = await getSampleDataStatus({ countLedger: async () => 0 });
    expect(status).toEqual({ seeded: false, recordCount: 0 });
  });
  it("returns seeded=true with the ledger count", async () => {
    const status = await getSampleDataStatus({ countLedger: async () => 37 });
    expect(status).toEqual({ seeded: true, recordCount: 37 });
  });
});
```

- [ ] **Step 2: Run, verify it fails** — Expected: FAIL.

- [ ] **Step 3: Implement** — add to `service.ts`. Clear iterates `INSERT_ORDER` **reversed**, deleting rows whose ids appear in the ledger for that table, then deletes the org's `sample_data_records`. `getSampleDataStatus` reads the ledger count. Return early `{ cleared: false, recordCount: 0 }` when the ledger is empty.

```typescript
const DELETE_ORDER = [...INSERT_ORDER].reverse();

export async function clearSampleData(
  db: Database,
  deps: { orgId: string; ledgerByTable: () => Promise<Record<string, string[]>> },
) {
  const ledger = await deps.ledgerByTable();
  const total = Object.values(ledger).reduce((n, ids) => n + ids.length, 0);
  if (total === 0) return { cleared: false as const, recordCount: 0 };

  return db.transaction(async (tx) => {
    for (const { table, entityTable } of DELETE_ORDER) {
      const ids = ledger[entityTable] ?? [];
      if (ids.length) await tx.delete(table).where(inArray(table.id, ids));
    }
    await tx.delete(sampleDataRecords).where(eq(sampleDataRecords.orgId, deps.orgId));
    return { cleared: true as const, recordCount: total };
  });
}

export async function getSampleDataStatus(deps: { countLedger: () => Promise<number> }) {
  const recordCount = await deps.countLedger();
  return { seeded: recordCount > 0, recordCount };
}
```

- [ ] **Step 4: Run, verify pass** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/sample-data/service.ts apps/api/src/domains/sample-data/service.test.ts
git commit -m "feat(api): clear sample data by ledger + status read"
```

---

### Task 9: Routes + registration + observability

**Files:**
- Create: `apps/api/src/domains/sample-data/routes.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/domains/sample-data/routes.test.ts`

- [ ] **Step 1: Write failing tests** — mirror `pledges/routes.test.ts`: `vi.mock("./service")`, `vi.mock("../../lib/integrations")` (capturing `analytics.capture`), `vi.mock("../../lib/sentry")` (capturing `captureBackgroundException`); `makeApp({ role })` seeds context. Assert:

```typescript
it("POST / seeds and fires sample_data_seeded", async () => {
  vi.mocked(seedSampleData).mockResolvedValueOnce({ seeded: true, recordCount: 40 });
  const res = await makeApp({ role: "admin" }).request("/sample-data", { method: "POST" });
  expect(res.status).toBe(200);
  expect(mockAnalyticsCapture).toHaveBeenCalledWith(
    expect.objectContaining({ eventName: "sample_data_seeded" }),
  );
});

it("POST / returns 409 on conflict (real data present)", async () => {
  vi.mocked(seedSampleData).mockRejectedValueOnce(new SampleDataConflictError("nope"));
  const res = await makeApp({ role: "admin" }).request("/sample-data", { method: "POST" });
  expect(res.status).toBe(409);
});

it("POST / forbids viewers", async () => {
  const res = await makeApp({ role: "viewer" }).request("/sample-data", { method: "POST" });
  expect(res.status).toBe(403);
});

it("DELETE / clears and fires sample_data_cleared", async () => {
  vi.mocked(clearSampleData).mockResolvedValueOnce({ cleared: true, recordCount: 40 });
  const res = await makeApp({ role: "admin" }).request("/sample-data", { method: "DELETE" });
  expect(res.status).toBe(200);
  expect(mockAnalyticsCapture).toHaveBeenCalledWith(
    expect.objectContaining({ eventName: "sample_data_cleared" }),
  );
});

it("GET /status returns the status payload", async () => {
  vi.mocked(getSampleDataStatus).mockResolvedValueOnce({ seeded: false, recordCount: 0 });
  const res = await makeApp({ role: "admin" }).request("/sample-data/status");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ seeded: false, recordCount: 0 });
});

it("captures Sentry when seeding throws an unexpected error", async () => {
  vi.mocked(seedSampleData).mockRejectedValueOnce(new Error("boom"));
  const res = await makeApp({ role: "admin" }).request("/sample-data", { method: "POST" });
  expect(res.status).toBe(500);
  expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
    expect.any(Error), "sample_data", expect.objectContaining({ operation: "seed" }),
  );
});
```

- [ ] **Step 2: Run, verify it fails** — Expected: FAIL.

- [ ] **Step 3: Implement** (`routes.ts`) — `requireRole("editor")` (admins + editors; viewers/auditors blocked) on all three routes. Build the DB-backed `hasRealData` / `alreadySeeded` / `ledgerByTable` / `countLedger` closures here (org-scoped queries), call the service, map `SampleDataConflictError` → 409, other errors → 500 + `captureBackgroundException(err, "sample_data", { operation })`, and fire analytics on success:

```typescript
export const sampleDataRoutes = new Hono<AppEnv>()
  .get("/status", requireRole("editor"), async (c) => {
    const db = c.get("db"); const orgId = c.get("orgId")!;
    const status = await getSampleDataStatus({ countLedger: () => countLedger(db, orgId) });
    return c.json(status);
  })
  .post("/", requireRole("editor"), async (c) => {
    const db = c.get("db"); const orgId = c.get("orgId")!;
    try {
      const result = await seedSampleData(db, {
        orgId,
        hasRealData: () => hasRealData(db, orgId),
        alreadySeeded: async () => (await countLedger(db, orgId)) > 0,
      });
      await captureSampleEvent(c, ANALYTICS_EVENTS.sampleDataSeeded, "seed", {
        recordCount: result.recordCount,
      });
      return c.json(result);
    } catch (err) {
      if (err instanceof SampleDataConflictError) return c.json({ error: err.message }, 409);
      captureBackgroundException(err, "sample_data", { operation: "seed" });
      return c.json({ error: "Could not create sample data." }, 500);
    }
  })
  .delete("/", requireRole("editor"), async (c) => {
    const db = c.get("db"); const orgId = c.get("orgId")!;
    try {
      const result = await clearSampleData(db, {
        orgId,
        ledgerByTable: () => ledgerByTable(db, orgId),
      });
      await captureSampleEvent(c, ANALYTICS_EVENTS.sampleDataCleared, "clear", {
        recordCount: result.recordCount,
      });
      return c.json(result);
    } catch (err) {
      captureBackgroundException(err, "sample_data", { operation: "clear" });
      return c.json({ error: "Could not remove sample data." }, 500);
    }
  });
```

`captureSampleEvent` mirrors `capturePledgeEvent` (payload `{ surface: "api", recordCount }` only — **no** names/financials). Register in `apps/api/src/app.ts` near the other domain routes: `.route("/sample-data", sampleDataRoutes)` and import it.

- [ ] **Step 4: Run, verify pass** — Expected: PASS.

- [ ] **Step 5: Run the full API suite for the domain**

Run: `pnpm --filter @grantpipe/api test -- sample-data`
Expected: PASS, all files ≥95% (add tests for any uncovered branch in `countLedger`/`hasRealData`/`ledgerByTable` helpers).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/domains/sample-data/routes.ts apps/api/src/domains/sample-data/routes.test.ts apps/api/src/app.ts
git commit -m "feat(api): sample-data seed/clear/status routes with PostHog + Sentry"
```

---

## Phase C — Onboarding API

### Task 10: Persist `onboardingGoal` on PATCH + fire goal event

**Files:**
- Modify: `apps/api/src/domains/onboarding/service.ts`, `apps/api/src/domains/onboarding/routes.ts`
- Test: `apps/api/src/domains/onboarding/service.test.ts`, `routes.test.ts`

- [ ] **Step 1: Write failing tests** — service: `completeOnboarding` writes `onboardingGoal` when provided, leaves it untouched when omitted. Route: when body includes `onboardingGoal`, fires `ANALYTICS_EVENTS.onboardingGoalSelected` with payload `{ goal }` (enum only).

```typescript
it("persists onboardingGoal when provided", async () => {
  const update = vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: async () => [{ id: "org-1" }] }) }) });
  await completeOnboarding({ update } as never, { orgId: "org-1", orgName: "A", fiscalYearStartMonth: 1, timezone: "UTC", onboardingGoal: "grants" });
  // assert set() called with onboardingGoal: "grants"
});

it("fires onboarding_goal_selected with the enum only", async () => {
  const res = await makeApp({ role: "admin" }).request("/", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orgName: "A", fiscalYearStartMonth: 1, timezone: "UTC", onboardingGoal: "compliance" }),
  });
  expect(res.status).toBe(200);
  expect(mockAnalyticsCapture).toHaveBeenCalledWith(
    expect.objectContaining({ eventName: "onboarding_goal_selected", payload: expect.objectContaining({ goal: "compliance" }) }),
  );
});
```

- [ ] **Step 2: Run, verify it fails** — Expected: FAIL.

- [ ] **Step 3: Implement** — add `onboardingGoal?: OnboardingGoal` to `completeOnboarding`'s params, include it in the `.set({...})` only when defined (and in the raw-SQL fallback path). In `routes.ts` PATCH handler, after the existing `onboardingCompleted` capture, when `onboardingGoal` is present fire `onboardingGoalSelected` with `payload: { actorId, goal }`.

- [ ] **Step 4: Run, verify pass** — Expected: PASS, files ≥95%.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/onboarding
git commit -m "feat(api): persist onboardingGoal and emit onboarding_goal_selected"
```

---

## Phase D — Web

### Task 11: Goal → routing/ordering helper

**Files:**
- Create: `apps/web/src/lib/onboarding-goal.ts`
- Test: `apps/web/src/lib/onboarding-goal.test.ts`

- [ ] **Step 1: Write failing test**:

```typescript
import { describe, expect, it } from "vitest";
import { ahaRouteForGoal, checklistOrderForGoal } from "./onboarding-goal";

describe("onboarding goal routing", () => {
  it("routes each goal to its first-value screen", () => {
    expect(ahaRouteForGoal("grants")).toBe("/funds");
    expect(ahaRouteForGoal("compliance")).toBe("/compliance");
    expect(ahaRouteForGoal("donors")).toBe("/dashboard");
    expect(ahaRouteForGoal(null)).toBe("/dashboard");
  });

  it("orders checklist keys per goal, donor-first vs compliance-first", () => {
    expect(checklistOrderForGoal("donors")[0]).toBe("import_contacts");
    expect(checklistOrderForGoal("compliance")[0]).toBe("create_grant");
  });
});
```

- [ ] **Step 2: Run, verify it fails** — Expected: FAIL.

- [ ] **Step 3: Implement** — pure functions over the `OnboardingGoal` type (import from `@grantpipe/shared`), returning route strings and an ordered `GuideKey[]`. Default (`null`/unknown) → `/dashboard` and the current checklist order.

- [ ] **Step 4: Run, verify pass** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/onboarding-goal.ts apps/web/src/lib/onboarding-goal.test.ts
git commit -m "feat(web): goal-based routing and checklist ordering helpers"
```

---

### Task 12: Sample-data hook (status query + seed/clear mutations)

**Files:**
- Create: `apps/web/src/hooks/use-sample-data.ts`
- Test: `apps/web/src/hooks/use-sample-data.test.tsx`

- [ ] **Step 1: Write failing test** — render the hook in a QueryClient wrapper, mock `api` so `api.api["sample-data"].status.$get` resolves `{ seeded: false, recordCount: 0 }`; assert `useSampleDataStatus().data`. Mock the seed mutation endpoint and assert it invalidates the status query + dashboard overview on success.

```typescript
vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      "sample-data": {
        status: { $get: vi.fn(async () => ({ ok: true, json: async () => ({ seeded: false, recordCount: 0 }) })) },
        $post: vi.fn(async () => ({ ok: true, json: async () => ({ seeded: true, recordCount: 40 }) })),
        $delete: vi.fn(async () => ({ ok: true, json: async () => ({ cleared: true, recordCount: 40 }) })),
      },
    },
  },
}));
```

- [ ] **Step 2: Run, verify it fails** — Expected: FAIL.

- [ ] **Step 3: Implement** — `useSampleDataStatus()` (`useQuery`, key `["sample-data-status"]`), `useSeedSampleData()` / `useClearSampleData()` (`useMutation`) that on success `queryClient.invalidateQueries` for `["sample-data-status"]` and `["dashboard-overview"]` (match the real overview key) and fire `captureEvent`. Wrap failures with `captureQueryError(error, "sample_data_seed" | "sample_data_clear")`.

- [ ] **Step 4: Run, verify pass** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/use-sample-data.ts apps/web/src/hooks/use-sample-data.test.tsx
git commit -m "feat(web): sample-data status/seed/clear hooks with analytics"
```

---

### Task 13: Welcome wizard redesign — goal step

**Files:**
- Create: `apps/web/src/components/onboarding/goal-step.tsx`
- Test: `apps/web/src/components/onboarding/goal-step.test.tsx`

- [ ] **Step 1: Write failing test** — renders three pill options; clicking one calls `onSelect("grants")` and the continue button is disabled until a goal is chosen. Assert `captureEvent` is NOT fired here (the parent fires it on advance) — or, if firing here, assert `onboarding_goal_selected` fires once with `{ goal }`.

```typescript
it("requires a goal before continuing and reports the choice", () => {
  const onSelect = vi.fn();
  render(<GoalStep onSelect={onSelect} />, { wrapper: createWrapper() });
  fireEvent.click(screen.getByRole("button", { name: /track grants/i }));
  expect(onSelect).toHaveBeenCalledWith("grants");
});
```

- [ ] **Step 2: Run, verify it fails** — Expected: FAIL.

- [ ] **Step 3: Implement** — three selectable pill cards (`rounded-full` CTA; selectable cards `rounded-2xl`), warm one-line labels:
  - `donors` — "Manage donors and gifts"
  - `grants` — "Track grants and restricted funds"
  - `compliance` — "Stay audit-ready"
  Controlled `selected` + `onSelect`. (Final copy audited in Task 28.)

- [ ] **Step 4: Run, verify pass** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/onboarding/goal-step.tsx apps/web/src/components/onboarding/goal-step.test.tsx
git commit -m "feat(web): onboarding goal-selection step"
```

---

### Task 14: Rewire `onboarding.tsx` (goal step + sample-data door + skips + progress)

**Files:**
- Modify: `apps/web/src/routes/_authenticated/onboarding.tsx`
- Test: `apps/web/src/routes/_authenticated/onboarding.test.tsx` (create or extend)

- [ ] **Step 1: Write failing tests** — new step order: Welcome+Goal → Org basics → Get-data-in. Assert:
  - Step 1 renders `GoalStep`; advancing without a goal is blocked; advancing fires `onboarding_goal_selected`.
  - Step 2 PATCH body now includes `onboardingGoal`.
  - Step 3 shows three doors: "Import my spreadsheet" (→ `/import`), "Explore with sample data" (calls `useSeedSampleData` then navigates to `ahaRouteForGoal(goal)` and fires `onboarding_sample_data_chosen`), "I'll start from scratch" (→ `ahaRouteForGoal(goal)`).
  - Every step still fires `onboarding_step_viewed/completed`; "Do this later" present on each.
  - All existing events preserved.

- [ ] **Step 2: Run, verify it fails** — Expected: FAIL.

- [ ] **Step 3: Implement** — restructure the step machine (now 3 steps). Add goal state, thread it into the PATCH body and the sample-data door. Keep `markOnboardingComplete` cache update. Keep back-nav + abandon events. Thin progress indicator already implied by step count — render a slim progress bar (`completed/TOTAL_STEPS`). Pill buttons throughout.

- [ ] **Step 4: Run, verify pass** — Expected: PASS, file ≥95%.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/_authenticated/onboarding.tsx apps/web/src/routes/_authenticated/onboarding.test.tsx
git commit -m "feat(web): activation-first onboarding wizard with goal + sample-data door"
```

---

### Task 15: Aha moment — fire-once activation event

**Files:**
- Create: `apps/web/src/hooks/use-activation-aha.ts`
- Test: `apps/web/src/hooks/use-activation-aha.test.tsx`

- [ ] **Step 1: Write failing test** — given a screen that has ≥1 record (real or sample), the hook fires `activation_first_value_viewed` exactly once per org and persists the guard (via `userGuideProgress` key + localStorage fallback) so a remount does not refire.

```typescript
it("fires activation_first_value_viewed once and not again after the guard is set", () => {
  const { rerender } = renderHook(() => useActivationAha({ hasValue: true, orgId: "org-1" }), { wrapper });
  rerender();
  expect(captureEvent).toHaveBeenCalledTimes(1);
  expect(captureEvent).toHaveBeenCalledWith("activation_first_value_viewed", expect.any(Object));
});

it("does not fire while there is no value to show", () => {
  renderHook(() => useActivationAha({ hasValue: false, orgId: "org-1" }), { wrapper });
  expect(captureEvent).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run, verify it fails** — Expected: FAIL.

- [ ] **Step 3: Implement** — `useActivationAha({ hasValue, orgId })`: when `hasValue` && not already fired (check a dedicated `GuideKey`, e.g. add `activation_first_value` to `GUIDE_KEYS` in `packages/shared/src/validators/help.ts` + a localStorage key `gp:activation:{orgId}`), fire the event, set the guide-progress flag, and return `{ justActivated: boolean }` so the screen can show one calm, dismissible affirmation banner ("Your funds are reconciling"). Use `useEffect` with a ref to avoid double-fire within a session.

> Note: adding `activation_first_value` to `GUIDE_KEYS` touches `packages/shared` — extend `help.test.ts` to include it, and expect the pre-commit to run the full api+web+ui coverage gate (~13 min; poll, don't idle).

- [ ] **Step 4: Run, verify pass** — Expected: PASS.

- [ ] **Step 5: Wire into the funds/compliance/dashboard landing** — in the route the wizard sends `grants`/`compliance` users to (funds or compliance view) and the donor dashboard, call `useActivationAha({ hasValue: recordCount > 0, orgId })` and render the affirmation banner when `justActivated`. Add a focused test on that route asserting the banner appears with data and not without.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/hooks/use-activation-aha.ts apps/web/src/hooks/use-activation-aha.test.tsx packages/shared/src/validators/help.ts packages/shared/src/validators/help.test.ts apps/web/src/routes/_authenticated
git commit -m "feat(web): fire-once activation aha event + affirmation banner"
```

---

### Task 16: Role-aware checklist + progress bar + 100% hand-off

**Files:**
- Modify: `apps/web/src/components/onboarding-checklist.tsx`
- Test: `apps/web/src/components/onboarding-checklist.test.tsx`

- [ ] **Step 1: Write failing tests**:
  - Items are ordered by `checklistOrderForGoal(goal)` (donor-first vs compliance-first) — assert DOM order of titles for two goals.
  - A visible progress bar renders with `aria-valuenow` = completed count and `aria-valuemax` = total (today only "X of Y" text exists).
  - At 100% the surface renders a calm "you're all set — here's what's next" hand-off (it currently returns `null`); assert that hand-off node is present rather than nothing.
  - Existing behaviors preserved: collapse-to-banner, dismiss-all, data-derived auto-completion (`deriveChecklistSignals`).

- [ ] **Step 2: Run, verify it fails** — Expected: FAIL.

- [ ] **Step 3: Implement** — accept an optional `goal?: OnboardingGoal | null` prop (read from `useSession()` org context at the call site). Sort `CHECKLIST_ITEMS` by `checklistOrderForGoal(goal)`. Reframe each `description` as an outcome (final copy in Task 28). Add a progress bar (use the `@grantpipe/ui` Progress component if present, else a div with `role="progressbar"` + aria values). Replace the `openItems.length === 0 → return null` early-out with a dismissible "all set" card linking to the goal's next action. Keep all existing persistence and derived rules.

- [ ] **Step 4: Run, verify pass** — Expected: PASS, file ≥95%.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/onboarding-checklist.tsx apps/web/src/components/onboarding-checklist.test.tsx
git commit -m "feat(web): goal-ordered checklist with progress bar and 100% hand-off"
```

---

### Task 17: App-wide sample-data banner

**Files:**
- Create: `apps/web/src/components/sample-data-banner.tsx`
- Modify: the authenticated layout route (`apps/web/src/routes/_authenticated/route.tsx` — confirm exact path)
- Test: `apps/web/src/components/sample-data-banner.test.tsx`

- [ ] **Step 1: Write failing tests**:
  - When `useSampleDataStatus()` → `{ seeded: true }`, the banner renders with a "Remove it" pill that opens a confirm dialog; confirming calls `useClearSampleData().mutate`.
  - When `{ seeded: false }`, the banner renders nothing.
  - Clear success fires `sample_data_cleared` via the hook (already covered) and the banner disappears.

- [ ] **Step 2: Run, verify it fails** — Expected: FAIL.

- [ ] **Step 3: Implement** — a slim, high-contrast (warm ochre) bar: "You're exploring sample data." + a `rounded-full` "Remove it" button → confirm dialog → `clear`. Returns `null` when not seeded or while loading. Mount once in the authenticated layout so it shows on every in-app screen.

- [ ] **Step 4: Run, verify pass** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/sample-data-banner.tsx apps/web/src/routes/_authenticated/route.tsx apps/web/src/components/sample-data-banner.test.tsx
git commit -m "feat(web): app-wide explore-sample-data banner with one-click clear"
```

---

### Task 18: Teaching empty states on list routes

**Files:**
- Modify: Donors, Grants, Funds, Reports list routes (confirm exact paths under `apps/web/src/routes/_authenticated/`)
- Test: extend each route's test (or add one) asserting the empty state renders the teaching copy + the two CTAs

- [ ] **Step 1: Write failing test (per route)** — when the list query returns `[]`, assert `TeachAndActEmptyState` renders with the route's heading, a primary "Add your first …" CTA, and a secondary "Explore with sample data" action wired to `useSeedSampleData`.

```typescript
it("teaches and offers sample data when there are no grants", () => {
  // mock grants query → []
  render(<GrantsRoute />, { wrapper });
  expect(screen.getByRole("region", { name: /your first grant/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /explore with sample data/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run, verify it fails** — Expected: FAIL for any route lacking the upgraded state.

- [ ] **Step 3: Implement** — in each list route's zero-data branch, render `TeachAndActEmptyState` with: a branded lucide icon, outcome heading, `primaryAction` ("Add your first grant" → create flow, gated on `canEdit`), `secondaryAction` ("Explore with sample data" → `useSeedSampleData().mutate`, shown only when not already seeded and the user can edit). Keep any existing role-gating. (Copy audited in Task 28.)

- [ ] **Step 4: Run, verify pass** — Expected: PASS per route, each file ≥95%.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/_authenticated
git commit -m "feat(web): teaching empty states with sample-data door on list routes"
```

---

## Phase E — Quality, copy, verification, review, ship

### Task 28: Copy audit pass (humanizer → third-grade-copy)

- [ ] Collect every new user-facing string added in Phase D (wizard labels, goal options, affirmation banner, checklist titles/descriptions, sample-data banner, empty-state headings/CTAs).
- [ ] Run the `humanizer` skill over them; apply edits.
- [ ] Run the `third-grade-copy` skill over the result; apply edits. (Source package: `<sibling repo>` if the global skill is missing.)
- [ ] Verify zero lies (no invented numbers/claims/social proof; founder voice).
- [ ] Update the components + their tests for any changed strings; re-run the affected web tests.
- [ ] Commit: `chore(web): humanize and simplify onboarding copy`.

### Task 29: Full typecheck + coverage gate

- [ ] Run `turbo typecheck` — fix any `any`/type errors (no `any`; no `eslint-disable` without explanation).
- [ ] Run `turbo test:coverage` (or per-package) — confirm **95% per touched file**. Add tests for any gap.
- [ ] If turbo returns a cached green right after merges, re-run with `--force` (known stale-cache behavior).
- [ ] Apply the DB migrations locally (`pnpm --filter @grantpipe/db migrate`) against the local stack and smoke-check.

### Task 30: Local E2E verification (preview tools)

- [ ] Bring up the local stack (DB+API+web on ports 3050/5050 per CLAUDE.md). Use `preview_start`.
- [ ] Walk the full flow: signup → wizard (pick a goal) → org basics → "Explore with sample data" → land on the goal's first-value screen → see the affirmation banner + reconciled values → see the app-wide sample-data banner → open the dashboard checklist (goal-ordered, progress bar) → "Remove it" → confirm → sample data gone, empty states teach again.
- [ ] Capture `preview_console_logs` (no errors) and a `preview_screenshot` of the aha screen + the checklist as proof.
- [ ] Verify empty states on Donors/Grants/Funds/Reports show the teaching CTA.

### Task 31: Review → fix → merge → deploy

- [ ] Get a review of the whole worktree via the permitted review path (subagent-driven-development's review stage). Address **every** finding; re-review until clean. Multiple cycles expected per the goal.
- [ ] Confirm observability review gate: PostHog events + Sentry capture present and tested on each feature's success/failure paths.
- [ ] Merge `feat/onboarding-activation` → `master`.
- [ ] Remove the worktree (`git worktree remove .worktrees/onboarding-activation`).
- [ ] Deploy via Wrangler: `pnpm run deploy:api`, `pnpm run deploy:web`. (Site untouched — skip `deploy:site`.) Apply the DB migration to the production Neon branch as part of the api deploy step.
- [ ] Post-deploy: smoke-check the live wizard + sample-data seed/clear on the prod E2E account; confirm events land in PostHog project 390138.

---

## Self-Review (run before execution)

**1. Spec coverage:**
- WS1 role-branched wizard → Tasks 1, 10, 11, 13, 14. ✓
- WS2 first-value aha + `activation_first_value_viewed` → Task 15. ✓
- WS3 role-aware checklist + progress bar + hand-off → Task 16. ✓
- WS4 sample-data (ledger, seeder, endpoints, banner, guardrails) → Tasks 2, 5, 6, 7, 8, 9, 12, 17. ✓
- WS5 teaching empty states → Task 18. ✓
- Schema changes (`onboardingGoal`, `sample_data_records`) → Tasks 4, 5. ✓
- Observability (5 new events + Sentry) → Tasks 3, 7, 9, 10, 12, 15, plus tests. ✓
- Copy guardrails → Task 28. ✓
- TDD + 95%/file → every task is test-first; Task 29 gate. ✓
- Review→merge→deploy → Task 31. ✓

**2. Placeholder scan:** No "TBD/handle errors later" steps. The one deliberate non-verbatim block is `seed-content.ts` (Task 6), which references the existing in-repo fixture `packages/db/src/seed-demo.ts` as the content source with explicit transformation rules (org-scoped, `[Sample]`-marked, FK-ordered) and a complete builder interface + tests — actionable, not a placeholder.

**3. Type consistency:** `OnboardingGoal` (shared) used in db column semantics, API service param, web helpers, components. `SampleContent`/`INSERT_ORDER`/`DELETE_ORDER` consistent across Tasks 6–8. Event keys identical across shared/api/web. `buildSampleContent({ orgId, now })`, `seedSampleData`, `clearSampleData`, `getSampleDataStatus`, `ahaRouteForGoal`, `checklistOrderForGoal`, `useActivationAha`, `useSampleDataStatus/useSeedSampleData/useClearSampleData` names are stable throughout.

**Open confirmations for the executor (resolve while implementing, not blockers):** exact `Database` type import path used by sibling services; exact authenticated-layout route file; exact dashboard-overview query key; whether `@grantpipe/ui` already exports a `Progress` component (fallback: `role="progressbar"` div).
