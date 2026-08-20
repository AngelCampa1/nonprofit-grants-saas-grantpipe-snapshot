# Phase 3: Donor CRM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Donor CRM - contact management, donation tracking, tags, pipeline kanban, communication log, saved segments, giving history, and retention analytics - across API and frontend.

**Architecture:** Single `domains/donors/` API domain mounted at `/api/donors` with split service files (contact, donation, tag, communication, segment, stats). Frontend uses TanStack Router file-based routes under `_authenticated/donors/` with TanStack Query hooks consuming Hono RPC. Kanban uses @dnd-kit, retention chart uses Recharts. All forms use React Hook Form + shared Zod validators.

**Tech Stack:** Hono (RPC), Drizzle ORM, Zod, React 19, TanStack Router/Query, Shadcn/UI, @dnd-kit/core, Recharts, React Hook Form, Vitest, React Testing Library

**Spec:** `docs/superpowers/specs/2026-04-07-phase-3-donor-crm-design.md`

---

## Parallel Execution Groups

```
Task 1 (Install Dependencies)
  â”œâ”€â”€ Group A - Shared (parallel): Tasks 2, 3
  â”‚     â””â”€â”€ Group B - Services (parallel): Tasks 4, 5, 6, 7, 8, 9
  â”‚           â””â”€â”€ Task 10 (Routes)
  â”‚                 â””â”€â”€ Task 11 (Wire app.ts)
  â””â”€â”€ Task 12 (Shadcn Components - independent of API work)
        â”‚
        Tasks 11 + 12
        â””â”€â”€ Task 13 (Frontend Hooks)
              â””â”€â”€ Group C - Components (parallel): Tasks 14, 15, 16
                    â””â”€â”€ Group D - Pages (parallel): Tasks 17, 18, 19
```

Tasks in the same group have no dependencies on each other and can be dispatched in parallel.

---

## File Structure

```
packages/shared/src/
  utils/
    fiscal-year.ts           # FY boundary calculations from fiscalYearStartMonth
    fiscal-year.test.ts
  validators/
    donors.ts                # All donor-related Zod schemas
    donors.test.ts
    index.ts                 # Updated re-exports

packages/ui/src/
  components/                # Shadcn components (installed via CLI)
    button.tsx
    input.tsx
    label.tsx
    table.tsx
    dialog.tsx
    tabs.tsx
    select.tsx
    badge.tsx
    card.tsx
    dropdown-menu.tsx
    popover.tsx
    separator.tsx
    skeleton.tsx
    textarea.tsx
    command.tsx
    sonner.tsx
  index.ts                   # Updated re-exports

apps/api/src/
  domains/donors/
    routes.ts                # All donor route definitions
    routes.test.ts
    contact.service.ts       # Contact CRUD + listing
    contact.service.test.ts
    donation.service.ts      # Donation CRUD
    donation.service.test.ts
    tag.service.ts           # Tag CRUD + contact-tag junction
    tag.service.test.ts
    communication.service.ts # Communication log
    communication.service.test.ts
    segment.service.ts       # Saved segment CRUD
    segment.service.test.ts
    stats.service.ts         # Aggregate stats, retention, pipeline
    stats.service.test.ts
  app.ts                     # Updated - mount donor routes

apps/web/src/
  hooks/
    use-donors.ts            # TanStack Query hooks for all donor endpoints
    use-donors.test.ts
  components/
    donors/
      contact-form.tsx       # Create/edit contact
      contact-form.test.tsx
      donation-form.tsx      # Create/edit donation
      donation-form.test.tsx
      communication-form.tsx # Log communication
      communication-form.test.tsx
      tag-picker.tsx         # Tag selection with create-new
      tag-picker.test.tsx
      pipeline-stage-select.tsx  # Stage dropdown
      pipeline-stage-select.test.tsx
      stats-bar.tsx          # Aggregate metrics row
      stats-bar.test.tsx
      retention-chart.tsx    # FY retention trend line
      retention-chart.test.tsx
      pipeline-board.tsx     # Kanban board
      pipeline-board.test.tsx
  routes/
    _authenticated/
      donors/
        index.tsx            # Donor list view
        index.test.tsx
        pipeline.tsx         # Kanban pipeline view
        pipeline.test.tsx
        $contactId.tsx       # Contact detail (tabbed)
        $contactId.test.tsx
```

---

## Task 1: Install Dependencies

**Files:**

- Modify: `apps/web/package.json`
- Modify: `packages/ui/package.json`

- [ ] **Step 1: Install frontend dependencies**

```bash
cd /c/Users/dev/Documents/grantpipe
pnpm --filter @grantpipe/web add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities recharts react-hook-form @hookform/resolvers sonner
```

- [ ] **Step 2: Install Shadcn dependencies in UI package**

```bash
pnpm --filter @grantpipe/ui add @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-label @radix-ui/react-popover @radix-ui/react-select @radix-ui/react-separator @radix-ui/react-slot @radix-ui/react-tabs @radix-ui/react-tooltip cmdk
```

- [ ] **Step 3: Verify installation**

```bash
pnpm install
turbo typecheck
```

Expected: No errors. All packages resolve.

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json packages/ui/package.json pnpm-lock.yaml
git commit -m "chore: add dnd-kit, recharts, react-hook-form, and Radix UI deps for Phase 3"
```

---

## Task 2: Donor Validators

**Files:**

- Create: `packages/shared/src/validators/donors.ts`
- Create: `packages/shared/src/validators/donors.test.ts`
- Modify: `packages/shared/src/validators/index.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/shared/src/validators/donors.test.ts
import { describe, it, expect } from "vitest";
import {
  createContactSchema,
  updateContactSchema,
  updatePipelineStageSchema,
  contactListSchema,
  createDonationSchema,
  updateDonationSchema,
  createTagSchema,
  updateTagSchema,
  addTagsSchema,
  createCommunicationSchema,
  createSegmentSchema,
  updateSegmentSchema,
} from "./donors";

// ---------------------------------------------------------------------------
// createContactSchema
// ---------------------------------------------------------------------------

describe("createContactSchema", () => {
  it("accepts a valid individual contact", () => {
    const result = createContactSchema.safeParse({
      type: "individual",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid organization contact", () => {
    const result = createContactSchema.safeParse({
      type: "organization",
      organizationName: "Acme Corp",
    });
    expect(result.success).toBe(true);
  });

  it("requires firstName when type is individual", () => {
    const result = createContactSchema.safeParse({
      type: "individual",
      lastName: "Doe",
    });
    expect(result.success).toBe(false);
  });

  it("requires organizationName when type is organization", () => {
    const result = createContactSchema.safeParse({
      type: "organization",
      firstName: "Jane",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid type", () => {
    const result = createContactSchema.safeParse({
      type: "unknown",
      firstName: "Jane",
    });
    expect(result.success).toBe(false);
  });

  it("defaults pipelineStage to prospect", () => {
    const result = createContactSchema.safeParse({
      type: "individual",
      firstName: "Jane",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pipelineStage).toBe("prospect");
    }
  });

  it("rejects invalid pipelineStage", () => {
    const result = createContactSchema.safeParse({
      type: "individual",
      firstName: "Jane",
      pipelineStage: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("validates email format", () => {
    const result = createContactSchema.safeParse({
      type: "individual",
      firstName: "Jane",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all optional fields", () => {
    const result = createContactSchema.safeParse({
      type: "individual",
      firstName: "Jane",
      lastName: "Doe",
      organizationName: "Acme",
      email: "jane@example.com",
      phone: "555-1234",
      address: "123 Main St",
      pipelineStage: "cultivation",
      affiliatedOrgId: "abc-123",
      notes: "Met at conference",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// updateContactSchema
// ---------------------------------------------------------------------------

describe("updateContactSchema", () => {
  it("accepts partial update with just firstName", () => {
    const result = updateContactSchema.safeParse({ firstName: "Updated" });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    const result = updateContactSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = updateContactSchema.safeParse({ email: "bad" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updatePipelineStageSchema
// ---------------------------------------------------------------------------

describe("updatePipelineStageSchema", () => {
  it("accepts valid stage", () => {
    const result = updatePipelineStageSchema.safeParse({ stage: "stewardship" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid stage", () => {
    const result = updatePipelineStageSchema.safeParse({ stage: "invalid" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// contactListSchema
// ---------------------------------------------------------------------------

describe("contactListSchema", () => {
  it("accepts empty query (all defaults)", () => {
    const result = contactListSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.sortBy).toBe("name");
      expect(result.data.sortOrder).toBe("asc");
    }
  });

  it("accepts all filter params", () => {
    const result = contactListSchema.safeParse({
      page: "2",
      pageSize: "10",
      search: "jane",
      pipelineStage: "prospect",
      tagId: "tag-1",
      type: "individual",
      sortBy: "totalGiving",
      sortOrder: "desc",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid sortBy", () => {
    const result = contactListSchema.safeParse({ sortBy: "invalid" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid type filter", () => {
    const result = contactListSchema.safeParse({ type: "robot" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createDonationSchema
// ---------------------------------------------------------------------------

describe("createDonationSchema", () => {
  it("accepts a valid donation", () => {
    const result = createDonationSchema.safeParse({
      amountCents: 5000,
      date: "2026-01-15T00:00:00Z",
      type: "one_time",
    });
    expect(result.success).toBe(true);
  });

  it("defaults restriction to unrestricted", () => {
    const result = createDonationSchema.safeParse({
      amountCents: 5000,
      date: "2026-01-15T00:00:00Z",
      type: "one_time",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.restriction).toBe("unrestricted");
    }
  });

  it("rejects zero amountCents", () => {
    const result = createDonationSchema.safeParse({
      amountCents: 0,
      date: "2026-01-15T00:00:00Z",
      type: "one_time",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative amountCents", () => {
    const result = createDonationSchema.safeParse({
      amountCents: -100,
      date: "2026-01-15T00:00:00Z",
      type: "one_time",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid donation type", () => {
    const result = createDonationSchema.safeParse({
      amountCents: 5000,
      date: "2026-01-15T00:00:00Z",
      type: "grant",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all optional fields", () => {
    const result = createDonationSchema.safeParse({
      amountCents: 10000,
      currency: "USD",
      date: "2026-03-01T00:00:00Z",
      type: "recurring",
      restriction: "restricted",
      fundId: "fund-1",
      grantId: "grant-1",
      paymentMethod: "check",
      notes: "Annual pledge payment",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// updateDonationSchema
// ---------------------------------------------------------------------------

describe("updateDonationSchema", () => {
  it("accepts partial update", () => {
    const result = updateDonationSchema.safeParse({ amountCents: 7500 });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    const result = updateDonationSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createTagSchema
// ---------------------------------------------------------------------------

describe("createTagSchema", () => {
  it("accepts name only", () => {
    const result = createTagSchema.safeParse({ name: "Major Donor" });
    expect(result.success).toBe(true);
  });

  it("accepts name and color", () => {
    const result = createTagSchema.safeParse({ name: "VIP", color: "#e07a5f" });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createTagSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid hex color", () => {
    const result = createTagSchema.safeParse({ name: "VIP", color: "red" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateTagSchema
// ---------------------------------------------------------------------------

describe("updateTagSchema", () => {
  it("accepts partial update", () => {
    const result = updateTagSchema.safeParse({ color: "#065f46" });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// addTagsSchema
// ---------------------------------------------------------------------------

describe("addTagsSchema", () => {
  it("accepts non-empty tagIds array", () => {
    const result = addTagsSchema.safeParse({ tagIds: ["tag-1", "tag-2"] });
    expect(result.success).toBe(true);
  });

  it("rejects empty tagIds array", () => {
    const result = addTagsSchema.safeParse({ tagIds: [] });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createCommunicationSchema
// ---------------------------------------------------------------------------

describe("createCommunicationSchema", () => {
  it("accepts with subject only", () => {
    const result = createCommunicationSchema.safeParse({
      type: "note",
      subject: "Follow-up call",
    });
    expect(result.success).toBe(true);
  });

  it("accepts with body only", () => {
    const result = createCommunicationSchema.safeParse({
      type: "email",
      body: "Sent grant proposal",
    });
    expect(result.success).toBe(true);
  });

  it("rejects when both subject and body are missing", () => {
    const result = createCommunicationSchema.safeParse({ type: "call" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid communication type", () => {
    const result = createCommunicationSchema.safeParse({
      type: "sms",
      subject: "Hello",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createSegmentSchema
// ---------------------------------------------------------------------------

describe("createSegmentSchema", () => {
  it("accepts name with empty filters", () => {
    const result = createSegmentSchema.safeParse({
      name: "Active Prospects",
      filters: {},
    });
    expect(result.success).toBe(true);
  });

  it("accepts name with all filters", () => {
    const result = createSegmentSchema.safeParse({
      name: "Major Donors in Stewardship",
      filters: {
        pipelineStage: "stewardship",
        tagId: "tag-major",
        type: "individual",
        search: "smith",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createSegmentSchema.safeParse({ name: "", filters: {} });
    expect(result.success).toBe(false);
  });

  it("rejects missing filters object", () => {
    const result = createSegmentSchema.safeParse({ name: "Test" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateSegmentSchema
// ---------------------------------------------------------------------------

describe("updateSegmentSchema", () => {
  it("accepts partial update with name only", () => {
    const result = updateSegmentSchema.safeParse({ name: "Updated Name" });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with filters only", () => {
    const result = updateSegmentSchema.safeParse({
      filters: { pipelineStage: "prospect" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    const result = updateSegmentSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @grantpipe/shared test -- --run src/validators/donors.test.ts
```

Expected: FAIL - module `./donors` not found.

- [ ] **Step 3: Implement the validators**

```typescript
// packages/shared/src/validators/donors.ts
import { z } from "zod";
import {
  DONOR_PIPELINE_STAGES,
  CONTACT_TYPES,
  DONATION_TYPES,
  RESTRICTION_TYPES,
  COMMUNICATION_TYPES,
} from "../constants";
import { paginationSchema } from "./pagination";

// ---------------------------------------------------------------------------
// Contact schemas
// ---------------------------------------------------------------------------

const contactBaseSchema = z.object({
  type: z.enum(CONTACT_TYPES),
  firstName: z.string().min(1).max(200).optional(),
  lastName: z.string().max(200).optional(),
  organizationName: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  address: z.string().max(500).optional(),
  pipelineStage: z.enum(DONOR_PIPELINE_STAGES).default("prospect"),
  affiliatedOrgId: z.string().optional(),
  notes: z.string().optional(),
});

export const createContactSchema = contactBaseSchema.superRefine((data, ctx) => {
  if (data.type === "individual" && !data.firstName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "First name is required for individuals",
      path: ["firstName"],
    });
  }
  if (data.type === "organization" && !data.organizationName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Organization name is required for organizations",
      path: ["organizationName"],
    });
  }
});
export type CreateContactInput = z.infer<typeof createContactSchema>;

export const updateContactSchema = z.object({
  type: z.enum(CONTACT_TYPES).optional(),
  firstName: z.string().min(1).max(200).optional(),
  lastName: z.string().max(200).optional(),
  organizationName: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  address: z.string().max(500).optional(),
  pipelineStage: z.enum(DONOR_PIPELINE_STAGES).optional(),
  affiliatedOrgId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type UpdateContactInput = z.infer<typeof updateContactSchema>;

export const updatePipelineStageSchema = z.object({
  stage: z.enum(DONOR_PIPELINE_STAGES),
});
export type UpdatePipelineStageInput = z.infer<typeof updatePipelineStageSchema>;

export const contactListSchema = paginationSchema.extend({
  search: z.string().optional(),
  pipelineStage: z.enum(DONOR_PIPELINE_STAGES).optional(),
  tagId: z.string().optional(),
  type: z.enum(CONTACT_TYPES).optional(),
  sortBy: z.enum(["name", "createdAt", "lastDonationDate", "totalGiving"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});
export type ContactListParams = z.infer<typeof contactListSchema>;

// ---------------------------------------------------------------------------
// Donation schemas
// ---------------------------------------------------------------------------

export const createDonationSchema = z.object({
  amountCents: z.number().int().positive("Amount must be positive"),
  currency: z.string().default("USD"),
  date: z.string().datetime(),
  type: z.enum(DONATION_TYPES),
  restriction: z.enum(RESTRICTION_TYPES).default("unrestricted"),
  fundId: z.string().optional(),
  grantId: z.string().optional(),
  paymentMethod: z.string().optional(),
  notes: z.string().optional(),
});
export type CreateDonationInput = z.infer<typeof createDonationSchema>;

export const updateDonationSchema = z.object({
  amountCents: z.number().int().positive().optional(),
  currency: z.string().optional(),
  date: z.string().datetime().optional(),
  type: z.enum(DONATION_TYPES).optional(),
  restriction: z.enum(RESTRICTION_TYPES).optional(),
  fundId: z.string().nullable().optional(),
  grantId: z.string().nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type UpdateDonationInput = z.infer<typeof updateDonationSchema>;

// ---------------------------------------------------------------------------
// Tag schemas
// ---------------------------------------------------------------------------

export const createTagSchema = z.object({
  name: z.string().min(1, "Tag name is required").max(100),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex color like #e07a5f")
    .optional(),
});
export type CreateTagInput = z.infer<typeof createTagSchema>;

export const updateTagSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
});
export type UpdateTagInput = z.infer<typeof updateTagSchema>;

export const addTagsSchema = z.object({
  tagIds: z.array(z.string()).min(1, "At least one tag is required"),
});
export type AddTagsInput = z.infer<typeof addTagsSchema>;

// ---------------------------------------------------------------------------
// Communication schemas
// ---------------------------------------------------------------------------

export const createCommunicationSchema = z
  .object({
    type: z.enum(COMMUNICATION_TYPES),
    subject: z.string().max(300).optional(),
    body: z.string().optional(),
  })
  .refine((data) => data.subject || data.body, {
    message: "Either subject or body is required",
    path: ["subject"],
  });
export type CreateCommunicationInput = z.infer<typeof createCommunicationSchema>;

// ---------------------------------------------------------------------------
// Segment schemas
// ---------------------------------------------------------------------------

const segmentFiltersSchema = z.object({
  pipelineStage: z.enum(DONOR_PIPELINE_STAGES).optional(),
  tagId: z.string().optional(),
  type: z.enum(CONTACT_TYPES).optional(),
  search: z.string().optional(),
});

export const createSegmentSchema = z.object({
  name: z.string().min(1, "Segment name is required").max(200),
  filters: segmentFiltersSchema,
});
export type CreateSegmentInput = z.infer<typeof createSegmentSchema>;

export const updateSegmentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  filters: segmentFiltersSchema.optional(),
});
export type UpdateSegmentInput = z.infer<typeof updateSegmentSchema>;
```

- [ ] **Step 4: Update validators index**

```typescript
// packages/shared/src/validators/index.ts
export { paginationSchema, type PaginationParams } from "./pagination";
export {
  signupSchema,
  type SignupInput,
  loginSchema,
  type LoginInput,
  onboardingSchema,
  type OnboardingInput,
  createInviteSchema,
  type CreateInviteInput,
} from "./auth";
export {
  createContactSchema,
  type CreateContactInput,
  updateContactSchema,
  type UpdateContactInput,
  updatePipelineStageSchema,
  type UpdatePipelineStageInput,
  contactListSchema,
  type ContactListParams,
  createDonationSchema,
  type CreateDonationInput,
  updateDonationSchema,
  type UpdateDonationInput,
  createTagSchema,
  type CreateTagInput,
  updateTagSchema,
  type UpdateTagInput,
  addTagsSchema,
  type AddTagsInput,
  createCommunicationSchema,
  type CreateCommunicationInput,
  createSegmentSchema,
  type CreateSegmentInput,
  updateSegmentSchema,
  type UpdateSegmentInput,
} from "./donors";
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm --filter @grantpipe/shared test -- --run src/validators/donors.test.ts
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/validators/donors.ts packages/shared/src/validators/donors.test.ts packages/shared/src/validators/index.ts
git commit -m "feat(shared): add donor CRM validators - contacts, donations, tags, communications, segments"
```

---

## Task 3: Fiscal Year Utility

**Files:**

- Create: `packages/shared/src/utils/fiscal-year.ts`
- Create: `packages/shared/src/utils/fiscal-year.test.ts`
- Create: `packages/shared/src/utils/index.ts`
- Modify: `packages/shared/src/index.ts`

The stats service needs to compute FY boundaries from an org's `fiscalYearStartMonth`. This utility provides `getFiscalYearRange(fiscalYearStartMonth, referenceDate?)` and `getFiscalYearLabel(fiscalYearStartMonth, referenceDate?)`.

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/shared/src/utils/fiscal-year.test.ts
import { describe, it, expect } from "vitest";
import { getFiscalYearRange, getFiscalYearLabel, getFiscalYearsBack } from "./fiscal-year";

describe("getFiscalYearRange", () => {
  it("returns calendar year boundaries when fiscalYearStartMonth=1", () => {
    const range = getFiscalYearRange(1, new Date("2026-06-15"));
    expect(range.start).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    expect(range.end).toEqual(new Date("2026-12-31T23:59:59.999Z"));
  });

  it("returns July-June boundaries when fiscalYearStartMonth=7", () => {
    // Reference date in October 2025 â†’ FY starts July 2025, ends June 2026
    const range = getFiscalYearRange(7, new Date("2025-10-15"));
    expect(range.start).toEqual(new Date("2025-07-01T00:00:00.000Z"));
    expect(range.end).toEqual(new Date("2026-06-30T23:59:59.999Z"));
  });

  it("handles reference date before start month (wraps to previous year)", () => {
    // FY starts July. Reference date in March 2026 â†’ FY is July 2025-June 2026
    const range = getFiscalYearRange(7, new Date("2026-03-15"));
    expect(range.start).toEqual(new Date("2025-07-01T00:00:00.000Z"));
    expect(range.end).toEqual(new Date("2026-06-30T23:59:59.999Z"));
  });

  it("handles fiscalYearStartMonth=10 (Oct-Sep)", () => {
    const range = getFiscalYearRange(10, new Date("2026-01-15"));
    expect(range.start).toEqual(new Date("2025-10-01T00:00:00.000Z"));
    expect(range.end).toEqual(new Date("2026-09-30T23:59:59.999Z"));
  });

  it("reference date exactly on start month boundary", () => {
    const range = getFiscalYearRange(7, new Date("2026-07-01"));
    expect(range.start).toEqual(new Date("2026-07-01T00:00:00.000Z"));
    expect(range.end).toEqual(new Date("2027-06-30T23:59:59.999Z"));
  });
});

describe("getFiscalYearLabel", () => {
  it("returns 'FY2026' for calendar year FY", () => {
    expect(getFiscalYearLabel(1, new Date("2026-06-15"))).toBe("FY2026");
  });

  it("returns 'FY2026' for July-start when reference is Oct 2025", () => {
    // FY July 2025-June 2026 â†’ labeled by end year
    expect(getFiscalYearLabel(7, new Date("2025-10-15"))).toBe("FY2026");
  });
});

describe("getFiscalYearsBack", () => {
  it("returns 5 fiscal year ranges going backward", () => {
    const ranges = getFiscalYearsBack(1, 5, new Date("2026-06-15"));
    expect(ranges).toHaveLength(5);
    expect(ranges[0]!.label).toBe("FY2022");
    expect(ranges[4]!.label).toBe("FY2026");
  });

  it("returns correct ranges for July-start FY", () => {
    const ranges = getFiscalYearsBack(7, 3, new Date("2025-10-15"));
    expect(ranges).toHaveLength(3);
    // Current FY: July 2025-June 2026 (FY2026)
    // Previous: July 2024-June 2025 (FY2025)
    // Before that: July 2023-June 2024 (FY2024)
    expect(ranges[0]!.label).toBe("FY2024");
    expect(ranges[1]!.label).toBe("FY2025");
    expect(ranges[2]!.label).toBe("FY2026");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @grantpipe/shared test -- --run src/utils/fiscal-year.test.ts
```

Expected: FAIL - module not found.

- [ ] **Step 3: Implement the fiscal year utility**

```typescript
// packages/shared/src/utils/fiscal-year.ts

export type FiscalYearRange = {
  start: Date;
  end: Date;
  label: string;
};

/**
 * Get the fiscal year date range that contains the reference date.
 * `fiscalYearStartMonth` is 1-based (1=January, 7=July, etc.).
 */
export function getFiscalYearRange(
  fiscalYearStartMonth: number,
  referenceDate: Date = new Date(),
): { start: Date; end: Date } {
  const refYear = referenceDate.getUTCFullYear();
  const refMonth = referenceDate.getUTCMonth() + 1; // 1-based

  let startYear: number;
  if (refMonth >= fiscalYearStartMonth) {
    startYear = refYear;
  } else {
    startYear = refYear - 1;
  }

  const start = new Date(Date.UTC(startYear, fiscalYearStartMonth - 1, 1));

  let endYear: number;
  let endMonth: number;
  if (fiscalYearStartMonth === 1) {
    endYear = startYear;
    endMonth = 12;
  } else {
    endYear = startYear + 1;
    endMonth = fiscalYearStartMonth - 1;
  }

  // Last day of the end month
  const lastDay = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate();
  const end = new Date(Date.UTC(endYear, endMonth - 1, lastDay, 23, 59, 59, 999));

  return { start, end };
}

/**
 * Label for the fiscal year containing the reference date.
 * Uses the year in which the FY ends: July 2025-June 2026 â†’ "FY2026".
 * Calendar-year FYs: Jan-Dec 2026 â†’ "FY2026".
 */
export function getFiscalYearLabel(
  fiscalYearStartMonth: number,
  referenceDate: Date = new Date(),
): string {
  const { end } = getFiscalYearRange(fiscalYearStartMonth, referenceDate);
  return `FY${end.getUTCFullYear()}`;
}

/**
 * Returns `count` fiscal year ranges ending with the current FY,
 * ordered chronologically (oldest first).
 */
export function getFiscalYearsBack(
  fiscalYearStartMonth: number,
  count: number,
  referenceDate: Date = new Date(),
): FiscalYearRange[] {
  const ranges: FiscalYearRange[] = [];
  const currentFY = getFiscalYearRange(fiscalYearStartMonth, referenceDate);

  for (let i = count - 1; i >= 0; i--) {
    // Shift the start date back by `i` years
    const shiftedRef = new Date(currentFY.start);
    shiftedRef.setUTCFullYear(shiftedRef.getUTCFullYear() - i);
    // Use a date in the middle of that FY to avoid edge cases
    shiftedRef.setUTCMonth(shiftedRef.getUTCMonth() + 1);

    const range = getFiscalYearRange(fiscalYearStartMonth, shiftedRef);
    const label = getFiscalYearLabel(fiscalYearStartMonth, shiftedRef);
    ranges.push({ ...range, label });
  }

  return ranges;
}
```

- [ ] **Step 4: Create utils index and update shared exports**

```typescript
// packages/shared/src/utils/index.ts
export {
  getFiscalYearRange,
  getFiscalYearLabel,
  getFiscalYearsBack,
  type FiscalYearRange,
} from "./fiscal-year";
```

```typescript
// packages/shared/src/index.ts
export * from "./types";
export * from "./constants";
export * from "./validators";
export * from "./utils";
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm --filter @grantpipe/shared test -- --run src/utils/fiscal-year.test.ts
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/utils/ packages/shared/src/index.ts
git commit -m "feat(shared): add fiscal year utility - FY range, label, and historical range calculations"
```

---

## Task 4: Contact Service

**Files:**

- Create: `apps/api/src/domains/donors/contact.service.ts`
- Create: `apps/api/src/domains/donors/contact.service.test.ts`

Each service function receives `db: Database` as the first argument. The DB is mocked in tests using the `as never` pattern established in Phase 2.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/domains/donors/contact.service.test.ts
import { describe, it, expect, vi } from "vitest";
import {
  listContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
  updatePipelineStage,
} from "./contact.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSelectMock(returnValue: unknown) {
  const offsetFn = vi.fn().mockResolvedValue(returnValue);
  const limitFn = vi.fn().mockReturnValue({ offset: offsetFn });
  const orderByFn = vi.fn().mockReturnValue({ limit: limitFn });
  const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  const selectFn = vi.fn().mockReturnValue({ from: fromFn });
  return { selectFn, fromFn, whereFn, orderByFn, limitFn, offsetFn };
}

function makeCountMock(count: number) {
  const whereFn = vi.fn().mockResolvedValue([{ count }]);
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  const selectFn = vi.fn().mockReturnValue({ from: fromFn });
  return { selectFn, fromFn, whereFn };
}

function makeInsertMock(returnValue: unknown) {
  const returningFn = vi.fn().mockResolvedValue([returnValue]);
  const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
  const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
  return { insertFn, valuesFn, returningFn };
}

function makeUpdateMock(returnValue: unknown) {
  const returningFn = vi.fn().mockResolvedValue([returnValue]);
  const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
  const setFn = vi.fn().mockReturnValue({ where: whereFn });
  const updateFn = vi.fn().mockReturnValue({ set: setFn });
  return { updateFn, setFn, whereFn, returningFn };
}

// ---------------------------------------------------------------------------
// createContact
// ---------------------------------------------------------------------------

describe("createContact", () => {
  it("inserts a contact with orgId and returns it", async () => {
    const newContact = {
      id: "c-1",
      orgId: "org-1",
      type: "individual" as const,
      firstName: "Jane",
      lastName: "Doe",
      pipelineStage: "prospect",
    };
    const { insertFn, valuesFn } = makeInsertMock(newContact);
    const db = { insert: insertFn };

    const result = await createContact(db as never, {
      orgId: "org-1",
      type: "individual",
      firstName: "Jane",
      lastName: "Doe",
    });

    expect(insertFn).toHaveBeenCalledTimes(1);
    const insertedValues = valuesFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(insertedValues.orgId).toBe("org-1");
    expect(insertedValues.type).toBe("individual");
    expect(insertedValues.firstName).toBe("Jane");
    expect(result).toEqual(newContact);
  });

  it("throws when insert returns no rows", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = { insert: insertFn };

    await expect(
      createContact(db as never, { orgId: "org-1", type: "individual", firstName: "Jane" }),
    ).rejects.toThrow("Failed to create contact");
  });
});

// ---------------------------------------------------------------------------
// updateContact
// ---------------------------------------------------------------------------

describe("updateContact", () => {
  it("updates a contact scoped by orgId and returns it", async () => {
    const updated = { id: "c-1", orgId: "org-1", firstName: "Janet" };
    const { updateFn, setFn } = makeUpdateMock(updated);
    const db = { update: updateFn };

    const result = await updateContact(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      data: { firstName: "Janet" },
    });

    expect(updateFn).toHaveBeenCalledTimes(1);
    const setArg = setFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(setArg.firstName).toBe("Janet");
    expect(setArg.updatedAt).toBeInstanceOf(Date);
    expect(result).toEqual(updated);
  });

  it("throws when contact not found", async () => {
    const { updateFn } = makeUpdateMock(undefined);
    const returningFn = vi.fn().mockResolvedValue([]);
    // Rebuild to return empty array
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFnEmpty = vi.fn().mockReturnValue({ set: setFn });
    const db = { update: updateFnEmpty };

    await expect(
      updateContact(db as never, {
        orgId: "org-1",
        contactId: "c-missing",
        data: { firstName: "X" },
      }),
    ).rejects.toThrow("Contact not found");
  });
});

// ---------------------------------------------------------------------------
// deleteContact
// ---------------------------------------------------------------------------

describe("deleteContact", () => {
  it("sets deletedAt on the contact", async () => {
    const deleted = { id: "c-1", deletedAt: new Date() };
    const { updateFn, setFn } = makeUpdateMock(deleted);
    const db = { update: updateFn };

    await deleteContact(db as never, { orgId: "org-1", contactId: "c-1" });

    const setArg = setFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(setArg.deletedAt).toBeInstanceOf(Date);
  });

  it("throws when contact not found", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = { update: updateFn };

    await expect(
      deleteContact(db as never, { orgId: "org-1", contactId: "c-missing" }),
    ).rejects.toThrow("Contact not found");
  });
});

// ---------------------------------------------------------------------------
// updatePipelineStage
// ---------------------------------------------------------------------------

describe("updatePipelineStage", () => {
  it("updates only pipelineStage and updatedAt", async () => {
    const updated = { id: "c-1", pipelineStage: "stewardship" };
    const { updateFn, setFn } = makeUpdateMock(updated);
    const db = { update: updateFn };

    const result = await updatePipelineStage(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      stage: "stewardship",
    });

    const setArg = setFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(setArg.pipelineStage).toBe("stewardship");
    expect(setArg.updatedAt).toBeInstanceOf(Date);
    expect(Object.keys(setArg)).toHaveLength(2);
    expect(result).toEqual(updated);
  });
});

// ---------------------------------------------------------------------------
// getContact
// ---------------------------------------------------------------------------

describe("getContact", () => {
  it("returns a contact with giving stats", async () => {
    const contact = { id: "c-1", orgId: "org-1", firstName: "Jane", type: "individual" };
    const givingStats = {
      totalLifetimeGiving: 50000,
      donationCount: 5,
      firstGiftDate: new Date("2024-01-15"),
      lastGiftDate: new Date("2026-03-01"),
      averageGiftAmount: 10000,
    };
    const tags = [{ id: "t-1", name: "Major Donor", color: "#e07a5f" }];
    const db = {
      query: {
        contacts: {
          findFirst: vi.fn().mockResolvedValue(contact),
        },
        contactTags: {
          findMany: vi.fn().mockResolvedValue(tags.map((t) => ({ tag: t }))),
        },
      },
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([givingStats]),
        }),
      }),
    };

    const result = await getContact(db as never, { orgId: "org-1", contactId: "c-1" });

    expect(result.contact).toEqual(contact);
    expect(result.tags).toEqual(tags);
    expect(result.givingStats).toEqual(givingStats);
  });

  it("throws when contact not found", async () => {
    const db = {
      query: {
        contacts: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
    };

    await expect(
      getContact(db as never, { orgId: "org-1", contactId: "c-missing" }),
    ).rejects.toThrow("Contact not found");
  });
});

// ---------------------------------------------------------------------------
// listContacts
// ---------------------------------------------------------------------------

describe("listContacts", () => {
  it("returns paginated contacts with total count", async () => {
    const contacts = [
      { id: "c-1", firstName: "Jane" },
      { id: "c-2", firstName: "Bob" },
    ];

    const db = {
      select: vi.fn().mockImplementation(() => {
        // First call: data query, second call: count query
        const callCount = db.select.mock.calls.length;
        if (callCount === 1) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    offset: vi.fn().mockResolvedValue(contacts),
                  }),
                }),
              }),
            }),
          };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 2 }]),
          }),
        };
      }),
    };

    const result = await listContacts(db as never, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      sortBy: "name",
      sortOrder: "asc",
    });

    expect(result.data).toEqual(contacts);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @grantpipe/api test -- --run src/domains/donors/contact.service.test.ts
```

Expected: FAIL - module not found.

- [ ] **Step 3: Implement the contact service**

```typescript
// apps/api/src/domains/donors/contact.service.ts
import { eq, and, isNull, ilike, or, sql, count as drizzleCount, desc, asc } from "drizzle-orm";
import { contacts, contactTags, tags, donations } from "@grantpipe/db";
import type { Database } from "@grantpipe/db";
import type { CreateContactInput, UpdateContactInput, DonorPipelineStage } from "@grantpipe/shared";

// ---------------------------------------------------------------------------
// createContact
// ---------------------------------------------------------------------------

export async function createContact(
  db: Database,
  params: { orgId: string } & CreateContactInput,
): Promise<typeof contacts.$inferSelect> {
  const { orgId, ...data } = params;

  const [contact] = await db
    .insert(contacts)
    .values({ orgId, ...data })
    .returning();

  if (!contact) throw new Error("Failed to create contact");
  return contact;
}

// ---------------------------------------------------------------------------
// updateContact
// ---------------------------------------------------------------------------

export async function updateContact(
  db: Database,
  params: { orgId: string; contactId: string; data: UpdateContactInput },
): Promise<typeof contacts.$inferSelect> {
  const [updated] = await db
    .update(contacts)
    .set({ ...params.data, updatedAt: new Date() })
    .where(
      and(
        eq(contacts.id, params.contactId),
        eq(contacts.orgId, params.orgId),
        isNull(contacts.deletedAt),
      ),
    )
    .returning();

  if (!updated) throw new Error("Contact not found");
  return updated;
}

// ---------------------------------------------------------------------------
// deleteContact
// ---------------------------------------------------------------------------

export async function deleteContact(
  db: Database,
  params: { orgId: string; contactId: string },
): Promise<void> {
  const [deleted] = await db
    .update(contacts)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(contacts.id, params.contactId),
        eq(contacts.orgId, params.orgId),
        isNull(contacts.deletedAt),
      ),
    )
    .returning();

  if (!deleted) throw new Error("Contact not found");
}

// ---------------------------------------------------------------------------
// updatePipelineStage
// ---------------------------------------------------------------------------

export async function updatePipelineStage(
  db: Database,
  params: { orgId: string; contactId: string; stage: DonorPipelineStage },
): Promise<typeof contacts.$inferSelect> {
  const [updated] = await db
    .update(contacts)
    .set({ pipelineStage: params.stage, updatedAt: new Date() })
    .where(
      and(
        eq(contacts.id, params.contactId),
        eq(contacts.orgId, params.orgId),
        isNull(contacts.deletedAt),
      ),
    )
    .returning();

  if (!updated) throw new Error("Contact not found");
  return updated;
}

// ---------------------------------------------------------------------------
// getContact
// ---------------------------------------------------------------------------

type GivingStats = {
  totalLifetimeGiving: number;
  donationCount: number;
  firstGiftDate: Date | null;
  lastGiftDate: Date | null;
  averageGiftAmount: number;
};

type TagInfo = { id: string; name: string; color: string | null };

export async function getContact(
  db: Database,
  params: { orgId: string; contactId: string },
): Promise<{
  contact: typeof contacts.$inferSelect;
  givingStats: GivingStats;
  tags: TagInfo[];
}> {
  const contact = await db.query.contacts.findFirst({
    where: and(
      eq(contacts.id, params.contactId),
      eq(contacts.orgId, params.orgId),
      isNull(contacts.deletedAt),
    ),
  });

  if (!contact) throw new Error("Contact not found");

  // Giving stats
  const [stats] = await db
    .select({
      totalLifetimeGiving: sql<number>`COALESCE(SUM(${donations.amountCents}), 0)`,
      donationCount: drizzleCount(),
      firstGiftDate: sql<Date | null>`MIN(${donations.date})`,
      lastGiftDate: sql<Date | null>`MAX(${donations.date})`,
      averageGiftAmount: sql<number>`COALESCE(AVG(${donations.amountCents}), 0)`,
    })
    .from(donations)
    .where(
      and(
        eq(donations.contactId, params.contactId),
        eq(donations.orgId, params.orgId),
        isNull(donations.deletedAt),
      ),
    );

  // Tags
  const tagRows = await db.query.contactTags.findMany({
    where: eq(contactTags.contactId, params.contactId),
    with: { tag: true },
  });

  const contactTagsList: TagInfo[] = tagRows.map((row) => ({
    id: row.tag.id,
    name: row.tag.name,
    color: row.tag.color,
  }));

  return {
    contact,
    givingStats: stats ?? {
      totalLifetimeGiving: 0,
      donationCount: 0,
      firstGiftDate: null,
      lastGiftDate: null,
      averageGiftAmount: 0,
    },
    tags: contactTagsList,
  };
}

// ---------------------------------------------------------------------------
// listContacts
// ---------------------------------------------------------------------------

type ListContactsParams = {
  orgId: string;
  page: number;
  pageSize: number;
  sortBy: "name" | "createdAt" | "lastDonationDate" | "totalGiving";
  sortOrder: "asc" | "desc";
  search?: string;
  pipelineStage?: string;
  tagId?: string;
  type?: string;
};

export async function listContacts(
  db: Database,
  params: ListContactsParams,
): Promise<{
  data: (typeof contacts.$inferSelect)[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const { orgId, page, pageSize, sortBy, sortOrder, search, pipelineStage, tagId, type } = params;

  // Build WHERE conditions
  const conditions = [eq(contacts.orgId, orgId), isNull(contacts.deletedAt)];

  if (pipelineStage) {
    conditions.push(eq(contacts.pipelineStage, pipelineStage));
  }
  if (type) {
    conditions.push(eq(contacts.type, type));
  }
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        ilike(contacts.firstName, pattern),
        ilike(contacts.lastName, pattern),
        ilike(contacts.email, pattern),
        ilike(contacts.organizationName, pattern),
      )!,
    );
  }
  if (tagId) {
    // Subquery: contacts that have this tag
    conditions.push(
      sql`${contacts.id} IN (SELECT ${contactTags.contactId} FROM ${contactTags} WHERE ${contactTags.tagId} = ${tagId})`,
    );
  }

  const where = and(...conditions);

  // Sort expression
  const sortDir = sortOrder === "desc" ? desc : asc;
  let orderExpr;
  switch (sortBy) {
    case "name":
      orderExpr = sortDir(sql`COALESCE(${contacts.lastName}, ${contacts.organizationName})`);
      break;
    case "createdAt":
      orderExpr = sortDir(contacts.createdAt);
      break;
    case "lastDonationDate":
      orderExpr = sortDir(
        sql`(SELECT MAX(${donations.date}) FROM ${donations} WHERE ${donations.contactId} = ${contacts.id} AND ${donations.deletedAt} IS NULL)`,
      );
      break;
    case "totalGiving":
      orderExpr = sortDir(
        sql`(SELECT COALESCE(SUM(${donations.amountCents}), 0) FROM ${donations} WHERE ${donations.contactId} = ${contacts.id} AND ${donations.deletedAt} IS NULL)`,
      );
      break;
  }

  // Data query
  const data = await db
    .select()
    .from(contacts)
    .where(where)
    .orderBy(orderExpr)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  // Count query
  const [countResult] = await db.select({ count: drizzleCount() }).from(contacts).where(where);

  return {
    data,
    total: countResult?.count ?? 0,
    page,
    pageSize,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @grantpipe/api test -- --run src/domains/donors/contact.service.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/donors/contact.service.ts apps/api/src/domains/donors/contact.service.test.ts
git commit -m "feat(api): add contact service - CRUD, pipeline stage update, listing with filters"
```

---

## Task 5: Donation Service

**Files:**

- Create: `apps/api/src/domains/donors/donation.service.ts`
- Create: `apps/api/src/domains/donors/donation.service.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/domains/donors/donation.service.test.ts
import { describe, it, expect, vi } from "vitest";
import { listDonations, createDonation, updateDonation, deleteDonation } from "./donation.service";

// ---------------------------------------------------------------------------
// createDonation
// ---------------------------------------------------------------------------

describe("createDonation", () => {
  it("inserts a donation with orgId and contactId", async () => {
    const newDonation = {
      id: "d-1",
      orgId: "org-1",
      contactId: "c-1",
      amountCents: 5000,
      type: "one_time",
    };
    const returningFn = vi.fn().mockResolvedValue([newDonation]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = { insert: insertFn };

    const result = await createDonation(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      amountCents: 5000,
      date: "2026-01-15T00:00:00Z",
      type: "one_time",
    });

    const inserted = valuesFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(inserted.orgId).toBe("org-1");
    expect(inserted.contactId).toBe("c-1");
    expect(inserted.amountCents).toBe(5000);
    expect(result).toEqual(newDonation);
  });

  it("throws when insert returns no rows", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = { insert: insertFn };

    await expect(
      createDonation(db as never, {
        orgId: "org-1",
        contactId: "c-1",
        amountCents: 5000,
        date: "2026-01-15T00:00:00Z",
        type: "one_time",
      }),
    ).rejects.toThrow("Failed to create donation");
  });
});

// ---------------------------------------------------------------------------
// updateDonation
// ---------------------------------------------------------------------------

describe("updateDonation", () => {
  it("updates a donation scoped by orgId and contactId", async () => {
    const updated = { id: "d-1", amountCents: 7500 };
    const returningFn = vi.fn().mockResolvedValue([updated]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = { update: updateFn };

    const result = await updateDonation(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      donationId: "d-1",
      data: { amountCents: 7500 },
    });

    expect(result).toEqual(updated);
  });

  it("throws when donation not found", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = { update: updateFn };

    await expect(
      updateDonation(db as never, {
        orgId: "org-1",
        contactId: "c-1",
        donationId: "d-missing",
        data: { amountCents: 100 },
      }),
    ).rejects.toThrow("Donation not found");
  });
});

// ---------------------------------------------------------------------------
// deleteDonation
// ---------------------------------------------------------------------------

describe("deleteDonation", () => {
  it("sets deletedAt on the donation", async () => {
    const deleted = { id: "d-1", deletedAt: new Date() };
    const returningFn = vi.fn().mockResolvedValue([deleted]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = { update: updateFn };

    await deleteDonation(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      donationId: "d-1",
    });

    const setArg = setFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(setArg.deletedAt).toBeInstanceOf(Date);
  });

  it("throws when donation not found", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = { update: updateFn };

    await expect(
      deleteDonation(db as never, {
        orgId: "org-1",
        contactId: "c-1",
        donationId: "d-missing",
      }),
    ).rejects.toThrow("Donation not found");
  });
});

// ---------------------------------------------------------------------------
// listDonations
// ---------------------------------------------------------------------------

describe("listDonations", () => {
  it("returns paginated donations for a contact", async () => {
    const donationRows = [
      { id: "d-1", amountCents: 5000 },
      { id: "d-2", amountCents: 10000 },
    ];

    const db = {
      select: vi.fn().mockImplementation(() => {
        const callCount = db.select.mock.calls.length;
        if (callCount === 1) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    offset: vi.fn().mockResolvedValue(donationRows),
                  }),
                }),
              }),
            }),
          };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 2 }]),
          }),
        };
      }),
    };

    const result = await listDonations(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      page: 1,
      pageSize: 25,
    });

    expect(result.data).toEqual(donationRows);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @grantpipe/api test -- --run src/domains/donors/donation.service.test.ts
```

Expected: FAIL - module not found.

- [ ] **Step 3: Implement the donation service**

```typescript
// apps/api/src/domains/donors/donation.service.ts
import { eq, and, isNull, desc, count as drizzleCount } from "drizzle-orm";
import { donations } from "@grantpipe/db";
import type { Database } from "@grantpipe/db";
import type { CreateDonationInput, UpdateDonationInput } from "@grantpipe/shared";

// ---------------------------------------------------------------------------
// createDonation
// ---------------------------------------------------------------------------

export async function createDonation(
  db: Database,
  params: { orgId: string; contactId: string } & CreateDonationInput,
): Promise<typeof donations.$inferSelect> {
  const { orgId, contactId, date, ...rest } = params;

  const [donation] = await db
    .insert(donations)
    .values({ orgId, contactId, date: new Date(date), ...rest })
    .returning();

  if (!donation) throw new Error("Failed to create donation");
  return donation;
}

// ---------------------------------------------------------------------------
// updateDonation
// ---------------------------------------------------------------------------

export async function updateDonation(
  db: Database,
  params: { orgId: string; contactId: string; donationId: string; data: UpdateDonationInput },
): Promise<typeof donations.$inferSelect> {
  const { date, ...rest } = params.data;
  const setData: Record<string, unknown> = { ...rest };
  if (date) setData.date = new Date(date);

  const [updated] = await db
    .update(donations)
    .set(setData)
    .where(
      and(
        eq(donations.id, params.donationId),
        eq(donations.orgId, params.orgId),
        eq(donations.contactId, params.contactId),
        isNull(donations.deletedAt),
      ),
    )
    .returning();

  if (!updated) throw new Error("Donation not found");
  return updated;
}

// ---------------------------------------------------------------------------
// deleteDonation
// ---------------------------------------------------------------------------

export async function deleteDonation(
  db: Database,
  params: { orgId: string; contactId: string; donationId: string },
): Promise<void> {
  const [deleted] = await db
    .update(donations)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(donations.id, params.donationId),
        eq(donations.orgId, params.orgId),
        eq(donations.contactId, params.contactId),
        isNull(donations.deletedAt),
      ),
    )
    .returning();

  if (!deleted) throw new Error("Donation not found");
}

// ---------------------------------------------------------------------------
// listDonations
// ---------------------------------------------------------------------------

export async function listDonations(
  db: Database,
  params: { orgId: string; contactId: string; page: number; pageSize: number },
): Promise<{
  data: (typeof donations.$inferSelect)[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const { orgId, contactId, page, pageSize } = params;

  const where = and(
    eq(donations.orgId, orgId),
    eq(donations.contactId, contactId),
    isNull(donations.deletedAt),
  );

  const data = await db
    .select()
    .from(donations)
    .where(where)
    .orderBy(desc(donations.date))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [countResult] = await db.select({ count: drizzleCount() }).from(donations).where(where);

  return { data, total: countResult?.count ?? 0, page, pageSize };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @grantpipe/api test -- --run src/domains/donors/donation.service.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/donors/donation.service.ts apps/api/src/domains/donors/donation.service.test.ts
git commit -m "feat(api): add donation service - CRUD with org scoping and pagination"
```

---

## Task 6: Tag Service

**Files:**

- Create: `apps/api/src/domains/donors/tag.service.ts`
- Create: `apps/api/src/domains/donors/tag.service.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/domains/donors/tag.service.test.ts
import { describe, it, expect, vi } from "vitest";
import {
  listTags,
  createTag,
  updateTag,
  deleteTag,
  addContactTags,
  removeContactTag,
} from "./tag.service";

// ---------------------------------------------------------------------------
// listTags
// ---------------------------------------------------------------------------

describe("listTags", () => {
  it("returns all tags for the org", async () => {
    const orgTags = [
      { id: "t-1", name: "Major Donor", color: "#e07a5f" },
      { id: "t-2", name: "Board Member", color: "#065f46" },
    ];
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(orgTags),
          }),
        }),
      }),
    };

    const result = await listTags(db as never, "org-1");
    expect(result).toEqual(orgTags);
  });
});

// ---------------------------------------------------------------------------
// createTag
// ---------------------------------------------------------------------------

describe("createTag", () => {
  it("inserts a tag with orgId", async () => {
    const newTag = { id: "t-1", orgId: "org-1", name: "VIP", color: "#e07a5f" };
    const returningFn = vi.fn().mockResolvedValue([newTag]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = { insert: insertFn };

    const result = await createTag(db as never, {
      orgId: "org-1",
      name: "VIP",
      color: "#e07a5f",
    });

    expect(result).toEqual(newTag);
  });

  it("throws when insert fails", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = { insert: insertFn };

    await expect(createTag(db as never, { orgId: "org-1", name: "VIP" })).rejects.toThrow(
      "Failed to create tag",
    );
  });
});

// ---------------------------------------------------------------------------
// updateTag
// ---------------------------------------------------------------------------

describe("updateTag", () => {
  it("updates a tag scoped by orgId", async () => {
    const updated = { id: "t-1", name: "Updated" };
    const returningFn = vi.fn().mockResolvedValue([updated]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = { update: updateFn };

    const result = await updateTag(db as never, {
      orgId: "org-1",
      tagId: "t-1",
      data: { name: "Updated" },
    });

    expect(result).toEqual(updated);
  });

  it("throws when tag not found", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = { update: updateFn };

    await expect(
      updateTag(db as never, { orgId: "org-1", tagId: "t-missing", data: { name: "X" } }),
    ).rejects.toThrow("Tag not found");
  });
});

// ---------------------------------------------------------------------------
// deleteTag
// ---------------------------------------------------------------------------

describe("deleteTag", () => {
  it("deletes the tag and its contact associations", async () => {
    const returningFn = vi.fn().mockResolvedValue([{ id: "t-1" }]);
    const deleteWhereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const deleteFn = vi.fn().mockReturnValue({ where: deleteWhereFn });
    // Also need a delete for contactTags
    const ctDeleteWhereFn = vi.fn().mockResolvedValue(undefined);
    const ctDeleteFn = vi.fn().mockReturnValue({ where: ctDeleteWhereFn });

    let callCount = 0;
    const db = {
      delete: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First delete: contact_tags junction rows
          return { where: ctDeleteWhereFn };
        }
        // Second delete: the tag itself
        return { where: deleteWhereFn };
      }),
    };

    await deleteTag(db as never, { orgId: "org-1", tagId: "t-1" });
    expect(db.delete).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// addContactTags
// ---------------------------------------------------------------------------

describe("addContactTags", () => {
  it("inserts junction rows for each tagId", async () => {
    const onConflictFn = vi.fn().mockResolvedValue(undefined);
    const valuesFn = vi.fn().mockReturnValue({ onConflictDoNothing: onConflictFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = { insert: insertFn };

    await addContactTags(db as never, {
      contactId: "c-1",
      tagIds: ["t-1", "t-2"],
    });

    const insertedValues = valuesFn.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(insertedValues).toHaveLength(2);
    expect(insertedValues[0]!.contactId).toBe("c-1");
    expect(insertedValues[0]!.tagId).toBe("t-1");
    expect(insertedValues[1]!.tagId).toBe("t-2");
  });
});

// ---------------------------------------------------------------------------
// removeContactTag
// ---------------------------------------------------------------------------

describe("removeContactTag", () => {
  it("deletes the junction row", async () => {
    const whereFn = vi.fn().mockResolvedValue(undefined);
    const deleteFn = vi.fn().mockReturnValue({ where: whereFn });
    const db = { delete: deleteFn };

    await removeContactTag(db as never, { contactId: "c-1", tagId: "t-1" });
    expect(deleteFn).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @grantpipe/api test -- --run src/domains/donors/tag.service.test.ts
```

Expected: FAIL - module not found.

- [ ] **Step 3: Implement the tag service**

```typescript
// apps/api/src/domains/donors/tag.service.ts
import { eq, and, asc } from "drizzle-orm";
import { tags, contactTags } from "@grantpipe/db";
import type { Database } from "@grantpipe/db";
import type { CreateTagInput, UpdateTagInput } from "@grantpipe/shared";

export async function listTags(db: Database, orgId: string): Promise<(typeof tags.$inferSelect)[]> {
  return db.select().from(tags).where(eq(tags.orgId, orgId)).orderBy(asc(tags.name));
}

export async function createTag(
  db: Database,
  params: { orgId: string } & CreateTagInput,
): Promise<typeof tags.$inferSelect> {
  const { orgId, ...data } = params;
  const [tag] = await db
    .insert(tags)
    .values({ orgId, ...data })
    .returning();
  if (!tag) throw new Error("Failed to create tag");
  return tag;
}

export async function updateTag(
  db: Database,
  params: { orgId: string; tagId: string; data: UpdateTagInput },
): Promise<typeof tags.$inferSelect> {
  const [updated] = await db
    .update(tags)
    .set(params.data)
    .where(and(eq(tags.id, params.tagId), eq(tags.orgId, params.orgId)))
    .returning();

  if (!updated) throw new Error("Tag not found");
  return updated;
}

export async function deleteTag(
  db: Database,
  params: { orgId: string; tagId: string },
): Promise<void> {
  // Remove junction rows first
  await db.delete(contactTags).where(eq(contactTags.tagId, params.tagId));

  // Then remove the tag
  const [deleted] = await db
    .delete(tags)
    .where(and(eq(tags.id, params.tagId), eq(tags.orgId, params.orgId)))
    .returning();

  if (!deleted) throw new Error("Tag not found");
}

export async function addContactTags(
  db: Database,
  params: { contactId: string; tagIds: string[] },
): Promise<void> {
  const rows = params.tagIds.map((tagId) => ({
    contactId: params.contactId,
    tagId,
  }));
  await db.insert(contactTags).values(rows).onConflictDoNothing();
}

export async function removeContactTag(
  db: Database,
  params: { contactId: string; tagId: string },
): Promise<void> {
  await db
    .delete(contactTags)
    .where(and(eq(contactTags.contactId, params.contactId), eq(contactTags.tagId, params.tagId)));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @grantpipe/api test -- --run src/domains/donors/tag.service.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/donors/tag.service.ts apps/api/src/domains/donors/tag.service.test.ts
git commit -m "feat(api): add tag service - CRUD, contact-tag associations, cascade delete"
```

---

## Task 7: Communication Service

**Files:**

- Create: `apps/api/src/domains/donors/communication.service.ts`
- Create: `apps/api/src/domains/donors/communication.service.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/domains/donors/communication.service.test.ts
import { describe, it, expect, vi } from "vitest";
import { listCommunications, createCommunication } from "./communication.service";

// ---------------------------------------------------------------------------
// createCommunication
// ---------------------------------------------------------------------------

describe("createCommunication", () => {
  it("inserts a communication log entry", async () => {
    const entry = {
      id: "comm-1",
      orgId: "org-1",
      contactId: "c-1",
      type: "note",
      subject: "Follow-up",
      loggedBy: "user-1",
    };
    const returningFn = vi.fn().mockResolvedValue([entry]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = { insert: insertFn };

    const result = await createCommunication(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      loggedBy: "user-1",
      type: "note",
      subject: "Follow-up",
    });

    const inserted = valuesFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(inserted.orgId).toBe("org-1");
    expect(inserted.contactId).toBe("c-1");
    expect(inserted.loggedBy).toBe("user-1");
    expect(result).toEqual(entry);
  });

  it("throws when insert fails", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = { insert: insertFn };

    await expect(
      createCommunication(db as never, {
        orgId: "org-1",
        contactId: "c-1",
        loggedBy: "user-1",
        type: "note",
        subject: "Test",
      }),
    ).rejects.toThrow("Failed to create communication");
  });
});

// ---------------------------------------------------------------------------
// listCommunications
// ---------------------------------------------------------------------------

describe("listCommunications", () => {
  it("returns paginated communications for a contact", async () => {
    const entries = [
      { id: "comm-1", type: "note", subject: "Call notes" },
      { id: "comm-2", type: "email", subject: "Thank you" },
    ];

    const db = {
      select: vi.fn().mockImplementation(() => {
        const callCount = db.select.mock.calls.length;
        if (callCount === 1) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    offset: vi.fn().mockResolvedValue(entries),
                  }),
                }),
              }),
            }),
          };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 2 }]),
          }),
        };
      }),
    };

    const result = await listCommunications(db as never, {
      orgId: "org-1",
      contactId: "c-1",
      page: 1,
      pageSize: 25,
    });

    expect(result.data).toEqual(entries);
    expect(result.total).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @grantpipe/api test -- --run src/domains/donors/communication.service.test.ts
```

Expected: FAIL - module not found.

- [ ] **Step 3: Implement the communication service**

```typescript
// apps/api/src/domains/donors/communication.service.ts
import { eq, and, desc, count as drizzleCount } from "drizzle-orm";
import { communicationLog } from "@grantpipe/db";
import type { Database } from "@grantpipe/db";
import type { CreateCommunicationInput } from "@grantpipe/shared";

export async function createCommunication(
  db: Database,
  params: { orgId: string; contactId: string; loggedBy: string } & CreateCommunicationInput,
): Promise<typeof communicationLog.$inferSelect> {
  const { orgId, contactId, loggedBy, ...data } = params;

  const [entry] = await db
    .insert(communicationLog)
    .values({ orgId, contactId, loggedBy, ...data })
    .returning();

  if (!entry) throw new Error("Failed to create communication");
  return entry;
}

export async function listCommunications(
  db: Database,
  params: { orgId: string; contactId: string; page: number; pageSize: number },
): Promise<{
  data: (typeof communicationLog.$inferSelect)[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const { orgId, contactId, page, pageSize } = params;

  const where = and(eq(communicationLog.orgId, orgId), eq(communicationLog.contactId, contactId));

  const data = await db
    .select()
    .from(communicationLog)
    .where(where)
    .orderBy(desc(communicationLog.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [countResult] = await db
    .select({ count: drizzleCount() })
    .from(communicationLog)
    .where(where);

  return { data, total: countResult?.count ?? 0, page, pageSize };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @grantpipe/api test -- --run src/domains/donors/communication.service.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/donors/communication.service.ts apps/api/src/domains/donors/communication.service.test.ts
git commit -m "feat(api): add communication service - create and list log entries"
```

---

## Task 8: Segment Service

**Files:**

- Create: `apps/api/src/domains/donors/segment.service.ts`
- Create: `apps/api/src/domains/donors/segment.service.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/domains/donors/segment.service.test.ts
import { describe, it, expect, vi } from "vitest";
import { listSegments, createSegment, updateSegment, deleteSegment } from "./segment.service";

// ---------------------------------------------------------------------------
// listSegments
// ---------------------------------------------------------------------------

describe("listSegments", () => {
  it("returns all segments for the org", async () => {
    const segments = [
      { id: "seg-1", name: "Active Prospects" },
      { id: "seg-2", name: "Major Donors" },
    ];
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(segments),
          }),
        }),
      }),
    };

    const result = await listSegments(db as never, "org-1");
    expect(result).toEqual(segments);
  });
});

// ---------------------------------------------------------------------------
// createSegment
// ---------------------------------------------------------------------------

describe("createSegment", () => {
  it("inserts a segment with orgId, createdBy, and entityType=contact", async () => {
    const segment = {
      id: "seg-1",
      orgId: "org-1",
      name: "Active",
      entityType: "contact",
      filters: { pipelineStage: "prospect" },
    };
    const returningFn = vi.fn().mockResolvedValue([segment]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = { insert: insertFn };

    const result = await createSegment(db as never, {
      orgId: "org-1",
      createdBy: "user-1",
      name: "Active",
      filters: { pipelineStage: "prospect" },
    });

    const inserted = valuesFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(inserted.entityType).toBe("contact");
    expect(inserted.orgId).toBe("org-1");
    expect(inserted.createdBy).toBe("user-1");
    expect(result).toEqual(segment);
  });

  it("throws when insert fails", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
    const db = { insert: insertFn };

    await expect(
      createSegment(db as never, {
        orgId: "org-1",
        createdBy: "user-1",
        name: "Test",
        filters: {},
      }),
    ).rejects.toThrow("Failed to create segment");
  });
});

// ---------------------------------------------------------------------------
// updateSegment
// ---------------------------------------------------------------------------

describe("updateSegment", () => {
  it("updates name and filters", async () => {
    const updated = { id: "seg-1", name: "Updated" };
    const returningFn = vi.fn().mockResolvedValue([updated]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = { update: updateFn };

    const result = await updateSegment(db as never, {
      orgId: "org-1",
      segmentId: "seg-1",
      data: { name: "Updated" },
    });

    const setArg = setFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(setArg.name).toBe("Updated");
    expect(setArg.updatedAt).toBeInstanceOf(Date);
    expect(result).toEqual(updated);
  });

  it("throws when segment not found", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const db = { update: updateFn };

    await expect(
      updateSegment(db as never, {
        orgId: "org-1",
        segmentId: "seg-missing",
        data: { name: "X" },
      }),
    ).rejects.toThrow("Segment not found");
  });
});

// ---------------------------------------------------------------------------
// deleteSegment
// ---------------------------------------------------------------------------

describe("deleteSegment", () => {
  it("hard-deletes the segment", async () => {
    const returningFn = vi.fn().mockResolvedValue([{ id: "seg-1" }]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const deleteFn = vi.fn().mockReturnValue({ where: whereFn });
    const db = { delete: deleteFn };

    await deleteSegment(db as never, { orgId: "org-1", segmentId: "seg-1" });
    expect(deleteFn).toHaveBeenCalledTimes(1);
  });

  it("throws when segment not found", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const deleteFn = vi.fn().mockReturnValue({ where: whereFn });
    const db = { delete: deleteFn };

    await expect(
      deleteSegment(db as never, { orgId: "org-1", segmentId: "seg-missing" }),
    ).rejects.toThrow("Segment not found");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @grantpipe/api test -- --run src/domains/donors/segment.service.test.ts
```

Expected: FAIL - module not found.

- [ ] **Step 3: Implement the segment service**

```typescript
// apps/api/src/domains/donors/segment.service.ts
import { eq, and, asc } from "drizzle-orm";
import { savedSegments } from "@grantpipe/db";
import type { Database } from "@grantpipe/db";
import type { CreateSegmentInput, UpdateSegmentInput } from "@grantpipe/shared";

export async function listSegments(
  db: Database,
  orgId: string,
): Promise<(typeof savedSegments.$inferSelect)[]> {
  return db
    .select()
    .from(savedSegments)
    .where(eq(savedSegments.orgId, orgId))
    .orderBy(asc(savedSegments.name));
}

export async function createSegment(
  db: Database,
  params: { orgId: string; createdBy: string } & CreateSegmentInput,
): Promise<typeof savedSegments.$inferSelect> {
  const { orgId, createdBy, name, filters } = params;

  const [segment] = await db
    .insert(savedSegments)
    .values({ orgId, createdBy, name, filters, entityType: "contact" })
    .returning();

  if (!segment) throw new Error("Failed to create segment");
  return segment;
}

export async function updateSegment(
  db: Database,
  params: { orgId: string; segmentId: string; data: UpdateSegmentInput },
): Promise<typeof savedSegments.$inferSelect> {
  const [updated] = await db
    .update(savedSegments)
    .set({ ...params.data, updatedAt: new Date() })
    .where(and(eq(savedSegments.id, params.segmentId), eq(savedSegments.orgId, params.orgId)))
    .returning();

  if (!updated) throw new Error("Segment not found");
  return updated;
}

export async function deleteSegment(
  db: Database,
  params: { orgId: string; segmentId: string },
): Promise<void> {
  const [deleted] = await db
    .delete(savedSegments)
    .where(and(eq(savedSegments.id, params.segmentId), eq(savedSegments.orgId, params.orgId)))
    .returning();

  if (!deleted) throw new Error("Segment not found");
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @grantpipe/api test -- --run src/domains/donors/segment.service.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/donors/segment.service.ts apps/api/src/domains/donors/segment.service.test.ts
git commit -m "feat(api): add segment service - CRUD for saved contact filter presets"
```

---

## Task 9: Stats Service

**Files:**

- Create: `apps/api/src/domains/donors/stats.service.ts`
- Create: `apps/api/src/domains/donors/stats.service.test.ts`

This is the most complex service - it computes aggregate donor stats, retention rates, and pipeline groupings. It uses the fiscal year utility from `@grantpipe/shared`.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/domains/donors/stats.service.test.ts
import { describe, it, expect, vi } from "vitest";
import { getDonorStats, getRetentionStats, getPipelineGroups } from "./stats.service";

// ---------------------------------------------------------------------------
// getDonorStats
// ---------------------------------------------------------------------------

describe("getDonorStats", () => {
  it("returns aggregate donor metrics", async () => {
    // Mock: totalDonors=10, totalGivingThisFY=50000, newDonorsThisFY=3
    // retentionRate computed from retainedCount/previousFYDonorCount
    const db = {
      select: vi.fn().mockImplementation(() => {
        const callCount = db.select.mock.calls.length;
        switch (callCount) {
          case 1:
            // totalDonors: distinct contacts with donations
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ count: 10 }]),
              }),
            };
          case 2:
            // totalGivingThisFY
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ total: 50000 }]),
              }),
            };
          case 3:
            // newDonorsThisFY
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ count: 3 }]),
              }),
            };
          case 4:
            // previousFY donors
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ count: 8 }]),
              }),
            };
          case 5:
            // retained donors (in both previous and current FY)
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ count: 6 }]),
              }),
            };
          default:
            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ count: 0 }]),
              }),
            };
        }
      }),
    };

    const result = await getDonorStats(db as never, {
      orgId: "org-1",
      fiscalYearStartMonth: 1,
      now: new Date("2026-06-15"),
    });

    expect(result.totalDonors).toBe(10);
    expect(result.totalGivingThisFY).toBe(50000);
    expect(result.newDonorsThisFY).toBe(3);
    expect(result.retentionRate).toBeCloseTo(0.75); // 6/8
  });

  it("returns 0 retention when no donors in previous FY", async () => {
    const db = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 0, total: 0 }]),
        }),
      })),
    };

    const result = await getDonorStats(db as never, {
      orgId: "org-1",
      fiscalYearStartMonth: 1,
      now: new Date("2026-06-15"),
    });

    expect(result.retentionRate).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getRetentionStats
// ---------------------------------------------------------------------------

describe("getRetentionStats", () => {
  it("returns retention rates for multiple fiscal years", async () => {
    // For simplicity, mock 3 FYs with known donor counts
    // FY2024: 5 donors, FY2025: 4 retained of 5 = 0.8, FY2026: 3 retained of 6 = 0.5
    let callIdx = 0;
    const mockResults = [
      // FY2024 donors
      [{ count: 5 }],
      // FY2024â†’FY2025 retained
      [{ count: 4 }],
      // FY2025 donors
      [{ count: 6 }],
      // FY2025â†’FY2026 retained
      [{ count: 3 }],
    ];

    const db = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockResults[callIdx++] ?? [{ count: 0 }]),
        }),
      })),
    };

    const result = await getRetentionStats(db as never, {
      orgId: "org-1",
      fiscalYearStartMonth: 1,
      count: 3,
      now: new Date("2026-06-15"),
    });

    expect(result).toHaveLength(3);
    // First FY has no "previous" so retention is null
    expect(result[0]!.fiscalYear).toBe("FY2024");
    expect(result[1]!.fiscalYear).toBe("FY2025");
    expect(result[1]!.retentionRate).toBeCloseTo(0.8);
    expect(result[2]!.fiscalYear).toBe("FY2026");
    expect(result[2]!.retentionRate).toBeCloseTo(0.5);
  });
});

// ---------------------------------------------------------------------------
// getPipelineGroups
// ---------------------------------------------------------------------------

describe("getPipelineGroups", () => {
  it("returns contacts grouped by pipeline stage", async () => {
    const prospectContacts = [{ id: "c-1", firstName: "Jane", pipelineStage: "prospect" }];
    const cultivationContacts = [{ id: "c-2", firstName: "Bob", pipelineStage: "cultivation" }];

    const db = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockImplementation(() => {
                const calls = db.select.mock.calls.length;
                // Alternating: data query then count query for each stage
                if (calls % 2 === 1) {
                  // Data queries
                  if (calls <= 2) return { offset: vi.fn().mockResolvedValue(prospectContacts) };
                  if (calls <= 4) return { offset: vi.fn().mockResolvedValue(cultivationContacts) };
                  return { offset: vi.fn().mockResolvedValue([]) };
                }
                return { offset: vi.fn().mockResolvedValue([]) };
              }),
            }),
          }),
        }),
      })),
    };

    // The actual implementation uses a simpler approach - one query per stage
    // This test just validates the return shape
    const result = await getPipelineGroups(db as never, { orgId: "org-1" });

    expect(result).toHaveProperty("prospect");
    expect(result).toHaveProperty("cultivation");
    expect(result).toHaveProperty("solicitation");
    expect(result).toHaveProperty("stewardship");
    expect(result.prospect).toHaveProperty("contacts");
    expect(result.prospect).toHaveProperty("count");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @grantpipe/api test -- --run src/domains/donors/stats.service.test.ts
```

Expected: FAIL - module not found.

- [ ] **Step 3: Implement the stats service**

```typescript
// apps/api/src/domains/donors/stats.service.ts
import { eq, and, isNull, sql, count as drizzleCount, desc } from "drizzle-orm";
import { contacts, donations, contactTags, tags } from "@grantpipe/db";
import type { Database } from "@grantpipe/db";
import {
  DONOR_PIPELINE_STAGES,
  type DonorPipelineStage,
  getFiscalYearRange,
  getFiscalYearsBack,
} from "@grantpipe/shared";

// ---------------------------------------------------------------------------
// getDonorStats
// ---------------------------------------------------------------------------

type DonorStats = {
  totalDonors: number;
  totalGivingThisFY: number;
  newDonorsThisFY: number;
  retentionRate: number;
};

export async function getDonorStats(
  db: Database,
  params: { orgId: string; fiscalYearStartMonth: number; now?: Date },
): Promise<DonorStats> {
  const { orgId, fiscalYearStartMonth, now = new Date() } = params;
  const currentFY = getFiscalYearRange(fiscalYearStartMonth, now);

  // Shift back one year to get previous FY
  const prevRef = new Date(currentFY.start);
  prevRef.setUTCFullYear(prevRef.getUTCFullYear() - 1);
  prevRef.setUTCMonth(prevRef.getUTCMonth() + 1);
  const previousFY = getFiscalYearRange(fiscalYearStartMonth, prevRef);

  const donationBase = and(eq(donations.orgId, orgId), isNull(donations.deletedAt));

  // Total distinct donors (all time)
  const [totalDonorsResult] = await db
    .select({ count: sql<number>`COUNT(DISTINCT ${donations.contactId})` })
    .from(donations)
    .where(donationBase);

  // Total giving this FY
  const [totalGivingResult] = await db
    .select({ total: sql<number>`COALESCE(SUM(${donations.amountCents}), 0)` })
    .from(donations)
    .where(
      and(
        donationBase,
        sql`${donations.date} >= ${currentFY.start}`,
        sql`${donations.date} <= ${currentFY.end}`,
      ),
    );

  // New donors this FY (first donation in current FY)
  const [newDonorsResult] = await db
    .select({ count: sql<number>`COUNT(DISTINCT sub.contact_id)` })
    .from(
      sql`(
        SELECT ${donations.contactId} AS contact_id
        FROM ${donations}
        WHERE ${donations.orgId} = ${orgId}
          AND ${donations.deletedAt} IS NULL
        GROUP BY ${donations.contactId}
        HAVING MIN(${donations.date}) >= ${currentFY.start}
          AND MIN(${donations.date}) <= ${currentFY.end}
      ) AS sub`,
    );

  // Retention: donors in previous FY who also donated in current FY
  const [prevFYDonorsResult] = await db
    .select({ count: sql<number>`COUNT(DISTINCT ${donations.contactId})` })
    .from(donations)
    .where(
      and(
        donationBase,
        sql`${donations.date} >= ${previousFY.start}`,
        sql`${donations.date} <= ${previousFY.end}`,
      ),
    );

  const prevFYDonorCount = prevFYDonorsResult?.count ?? 0;
  let retentionRate = 0;

  if (prevFYDonorCount > 0) {
    const [retainedResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(
      sql`(
          SELECT ${donations.contactId}
          FROM ${donations}
          WHERE ${donations.orgId} = ${orgId}
            AND ${donations.deletedAt} IS NULL
            AND ${donations.date} >= ${previousFY.start}
            AND ${donations.date} <= ${previousFY.end}
          INTERSECT
          SELECT ${donations.contactId}
          FROM ${donations}
          WHERE ${donations.orgId} = ${orgId}
            AND ${donations.deletedAt} IS NULL
            AND ${donations.date} >= ${currentFY.start}
            AND ${donations.date} <= ${currentFY.end}
        ) AS retained`,
    );

    retentionRate = (retainedResult?.count ?? 0) / prevFYDonorCount;
  }

  return {
    totalDonors: totalDonorsResult?.count ?? 0,
    totalGivingThisFY: totalGivingResult?.total ?? 0,
    newDonorsThisFY: newDonorsResult?.count ?? 0,
    retentionRate,
  };
}

// ---------------------------------------------------------------------------
// getRetentionStats
// ---------------------------------------------------------------------------

type RetentionEntry = {
  fiscalYear: string;
  retentionRate: number | null;
  donorCount: number;
  retainedCount: number;
};

export async function getRetentionStats(
  db: Database,
  params: { orgId: string; fiscalYearStartMonth: number; count: number; now?: Date },
): Promise<RetentionEntry[]> {
  const { orgId, fiscalYearStartMonth, count, now = new Date() } = params;
  const fiscalYears = getFiscalYearsBack(fiscalYearStartMonth, count, now);
  const results: RetentionEntry[] = [];

  const donationBase = and(eq(donations.orgId, orgId), isNull(donations.deletedAt));

  for (let i = 0; i < fiscalYears.length; i++) {
    const fy = fiscalYears[i]!;

    // Donor count for this FY
    const [donorResult] = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${donations.contactId})` })
      .from(donations)
      .where(
        and(
          donationBase,
          sql`${donations.date} >= ${fy.start}`,
          sql`${donations.date} <= ${fy.end}`,
        ),
      );

    const donorCount = donorResult?.count ?? 0;

    if (i === 0) {
      // First FY - no previous to compare against
      results.push({
        fiscalYear: fy.label,
        retentionRate: null,
        donorCount,
        retainedCount: 0,
      });
      continue;
    }

    // Retained from previous FY
    const prevFY = fiscalYears[i - 1]!;
    const [retainedResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(
      sql`(
          SELECT ${donations.contactId}
          FROM ${donations}
          WHERE ${donations.orgId} = ${orgId}
            AND ${donations.deletedAt} IS NULL
            AND ${donations.date} >= ${prevFY.start}
            AND ${donations.date} <= ${prevFY.end}
          INTERSECT
          SELECT ${donations.contactId}
          FROM ${donations}
          WHERE ${donations.orgId} = ${orgId}
            AND ${donations.deletedAt} IS NULL
            AND ${donations.date} >= ${fy.start}
            AND ${donations.date} <= ${fy.end}
        ) AS retained`,
    );

    const prevDonorCount = results[i - 1]!.donorCount;
    const retainedCount = retainedResult?.count ?? 0;

    results.push({
      fiscalYear: fy.label,
      retentionRate: prevDonorCount > 0 ? retainedCount / prevDonorCount : 0,
      donorCount,
      retainedCount,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// getPipelineGroups
// ---------------------------------------------------------------------------

type PipelineContact = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  organizationName: string | null;
  email: string | null;
  type: string;
  pipelineStage: string;
};

type PipelineGroups = Record<DonorPipelineStage, { contacts: PipelineContact[]; count: number }>;

const PIPELINE_LIMIT = 50;

export async function getPipelineGroups(
  db: Database,
  params: { orgId: string },
): Promise<PipelineGroups> {
  const { orgId } = params;
  const groups = {} as PipelineGroups;

  for (const stage of DONOR_PIPELINE_STAGES) {
    const where = and(
      eq(contacts.orgId, orgId),
      eq(contacts.pipelineStage, stage),
      isNull(contacts.deletedAt),
    );

    const stageContacts = await db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        organizationName: contacts.organizationName,
        email: contacts.email,
        type: contacts.type,
        pipelineStage: contacts.pipelineStage,
      })
      .from(contacts)
      .where(where)
      .orderBy(desc(contacts.updatedAt))
      .limit(PIPELINE_LIMIT);

    const [countResult] = await db.select({ count: drizzleCount() }).from(contacts).where(where);

    groups[stage] = {
      contacts: stageContacts,
      count: countResult?.count ?? 0,
    };
  }

  return groups;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @grantpipe/api test -- --run src/domains/donors/stats.service.test.ts
```

Expected: All tests pass. Some tests may need mock adjustments based on the actual SQL query patterns - fix any failures by aligning mock return values with the queries in the implementation.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/donors/stats.service.ts apps/api/src/domains/donors/stats.service.test.ts
git commit -m "feat(api): add stats service - aggregate metrics, FY retention trends, pipeline grouping"
```

---

## Task 10: Donor Routes

**Files:**

- Create: `apps/api/src/domains/donors/routes.ts`
- Create: `apps/api/src/domains/donors/routes.test.ts`

Routes compose all services. Tests mock the service modules (same pattern as Phase 2 onboarding routes).

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/domains/donors/routes.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { donorRoutes } from "./routes";

// ---------------------------------------------------------------------------
// Mock all service modules
// ---------------------------------------------------------------------------

vi.mock("./contact.service", () => ({
  listContacts: vi.fn(),
  getContact: vi.fn(),
  createContact: vi.fn(),
  updateContact: vi.fn(),
  deleteContact: vi.fn(),
  updatePipelineStage: vi.fn(),
}));

vi.mock("./donation.service", () => ({
  listDonations: vi.fn(),
  createDonation: vi.fn(),
  updateDonation: vi.fn(),
  deleteDonation: vi.fn(),
}));

vi.mock("./tag.service", () => ({
  listTags: vi.fn(),
  createTag: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
  addContactTags: vi.fn(),
  removeContactTag: vi.fn(),
}));

vi.mock("./communication.service", () => ({
  listCommunications: vi.fn(),
  createCommunication: vi.fn(),
}));

vi.mock("./segment.service", () => ({
  listSegments: vi.fn(),
  createSegment: vi.fn(),
  updateSegment: vi.fn(),
  deleteSegment: vi.fn(),
}));

vi.mock("./stats.service", () => ({
  getDonorStats: vi.fn(),
  getRetentionStats: vi.fn(),
  getPipelineGroups: vi.fn(),
}));

import { listContacts, getContact, createContact } from "./contact.service";
import { listDonations, createDonation } from "./donation.service";
import { listTags, createTag, addContactTags, removeContactTag } from "./tag.service";
import { listCommunications, createCommunication } from "./communication.service";
import { listSegments, createSegment } from "./segment.service";
import { getDonorStats, getRetentionStats, getPipelineGroups } from "./stats.service";

// ---------------------------------------------------------------------------
// Test app setup
// ---------------------------------------------------------------------------

function buildApp(role: "admin" | "editor" | "viewer" = "admin") {
  return new Hono<AppEnv>()
    .use("/donors/*", async (c, next) => {
      c.set("db", {} as never);
      c.set("orgId", "org-1");
      c.set("user", { id: "user-1", email: "test@example.com", name: "Test" });
      c.set("session", { id: "sess-1", userId: "user-1", token: "tok-1" });
      c.set("memberRole", role);
      await next();
    })
    .route("/donors", donorRoutes);
}

// ---------------------------------------------------------------------------
// GET /donors (list contacts)
// ---------------------------------------------------------------------------

describe("GET /donors", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 200 with paginated contacts", async () => {
    vi.mocked(listContacts).mockResolvedValue({
      data: [{ id: "c-1" }] as never,
      total: 1,
      page: 1,
      pageSize: 25,
    });

    const app = buildApp("viewer");
    const res = await app.request("/donors?page=1");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// GET /donors/:contactId (get contact detail)
// ---------------------------------------------------------------------------

describe("GET /donors/:contactId", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 200 with contact, stats, and tags", async () => {
    vi.mocked(getContact).mockResolvedValue({
      contact: { id: "c-1", firstName: "Jane" } as never,
      givingStats: {
        totalLifetimeGiving: 5000,
        donationCount: 2,
        firstGiftDate: null,
        lastGiftDate: null,
        averageGiftAmount: 2500,
      },
      tags: [],
    });

    const app = buildApp();
    const res = await app.request("/donors/c-1");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.contact.id).toBe("c-1");
    expect(body.givingStats.totalLifetimeGiving).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// POST /donors (create contact)
// ---------------------------------------------------------------------------

describe("POST /donors", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 201 when editor creates a contact", async () => {
    vi.mocked(createContact).mockResolvedValue({ id: "c-new" } as never);

    const app = buildApp("editor");
    const res = await app.request("/donors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "individual", firstName: "Jane" }),
    });

    expect(res.status).toBe(201);
  });

  it("returns 403 when viewer tries to create", async () => {
    const app = buildApp("viewer");
    const res = await app.request("/donors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "individual", firstName: "Jane" }),
    });

    expect(res.status).toBe(403);
    expect(createContact).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid input", async () => {
    const app = buildApp("editor");
    const res = await app.request("/donors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "invalid" }),
    });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// DELETE /donors/:contactId (admin only)
// ---------------------------------------------------------------------------

describe("DELETE /donors/:contactId", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 403 when editor tries to delete", async () => {
    const app = buildApp("editor");
    const res = await app.request("/donors/c-1", { method: "DELETE" });

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Tags routes
// ---------------------------------------------------------------------------

describe("GET /donors/tags", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 200 with tags", async () => {
    vi.mocked(listTags).mockResolvedValue([{ id: "t-1", name: "VIP" }] as never);

    const app = buildApp();
    const res = await app.request("/donors/tags");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });
});

describe("POST /donors/tags", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 201 when editor creates a tag", async () => {
    vi.mocked(createTag).mockResolvedValue({ id: "t-new" } as never);

    const app = buildApp("editor");
    const res = await app.request("/donors/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Major Donor" }),
    });

    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// Contact tags
// ---------------------------------------------------------------------------

describe("POST /donors/:contactId/tags", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 204 when adding tags to a contact", async () => {
    vi.mocked(addContactTags).mockResolvedValue(undefined);

    const app = buildApp("editor");
    const res = await app.request("/donors/c-1/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagIds: ["t-1", "t-2"] }),
    });

    expect(res.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// Stats routes
// ---------------------------------------------------------------------------

describe("GET /donors/stats", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 200 with aggregate stats", async () => {
    vi.mocked(getDonorStats).mockResolvedValue({
      totalDonors: 10,
      totalGivingThisFY: 50000,
      newDonorsThisFY: 3,
      retentionRate: 0.75,
    });

    const app = buildApp();
    const res = await app.request("/donors/stats");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalDonors).toBe(10);
  });
});

describe("GET /donors/stats/retention", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 200 with retention trend", async () => {
    vi.mocked(getRetentionStats).mockResolvedValue([
      { fiscalYear: "FY2024", retentionRate: null, donorCount: 5, retainedCount: 0 },
      { fiscalYear: "FY2025", retentionRate: 0.8, donorCount: 6, retainedCount: 4 },
    ]);

    const app = buildApp();
    const res = await app.request("/donors/stats/retention");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });
});

describe("GET /donors/pipeline", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 200 with pipeline groups", async () => {
    vi.mocked(getPipelineGroups).mockResolvedValue({
      prospect: { contacts: [], count: 0 },
      cultivation: { contacts: [], count: 0 },
      solicitation: { contacts: [], count: 0 },
      stewardship: { contacts: [], count: 0 },
    });

    const app = buildApp();
    const res = await app.request("/donors/pipeline");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prospect).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @grantpipe/api test -- --run src/domains/donors/routes.test.ts
```

Expected: FAIL - module `./routes` not found.

- [ ] **Step 3: Implement the routes**

The routes file needs access to the org's `fiscalYearStartMonth` for stats endpoints. It will query the org from the DB.

```typescript
// apps/api/src/domains/donors/routes.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createContactSchema,
  updateContactSchema,
  updatePipelineStageSchema,
  contactListSchema,
  createDonationSchema,
  updateDonationSchema,
  createTagSchema,
  updateTagSchema,
  addTagsSchema,
  createCommunicationSchema,
  createSegmentSchema,
  updateSegmentSchema,
  paginationSchema,
} from "@grantpipe/shared";
import { organizations } from "@grantpipe/db";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../../types";
import { requireRole } from "../../middleware/require-role";
import {
  listContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
  updatePipelineStage,
} from "./contact.service";
import { listDonations, createDonation, updateDonation, deleteDonation } from "./donation.service";
import {
  listTags,
  createTag,
  updateTag,
  deleteTag,
  addContactTags,
  removeContactTag,
} from "./tag.service";
import { listCommunications, createCommunication } from "./communication.service";
import { listSegments, createSegment, updateSegment, deleteSegment } from "./segment.service";
import { getDonorStats, getRetentionStats, getPipelineGroups } from "./stats.service";

// ---------------------------------------------------------------------------
// Helper: get org fiscal year start month
// ---------------------------------------------------------------------------

async function getOrgFiscalMonth(
  db: Parameters<typeof getDonorStats>[0],
  orgId: string,
): Promise<number> {
  const org = await (
    db as unknown as {
      query: {
        organizations: {
          findFirst: (opts: unknown) => Promise<{ fiscalYearStartMonth: number } | undefined>;
        };
      };
    }
  ).query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: { fiscalYearStartMonth: true },
  });
  return org?.fiscalYearStartMonth ?? 1;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const donorRoutes = new Hono<AppEnv>()
  // -------------------------------------------------------------------------
  // Stats & Pipeline (must be before /:contactId to avoid route conflicts)
  // -------------------------------------------------------------------------
  .get("/stats", requireRole("viewer"), async (c) => {
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const fiscalYearStartMonth = await getOrgFiscalMonth(db, orgId);
    const stats = await getDonorStats(db, { orgId, fiscalYearStartMonth });
    return c.json(stats);
  })
  .get("/stats/retention", requireRole("viewer"), async (c) => {
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const fiscalYearStartMonth = await getOrgFiscalMonth(db, orgId);
    const retention = await getRetentionStats(db, {
      orgId,
      fiscalYearStartMonth,
      count: 5,
    });
    return c.json(retention);
  })
  .get("/pipeline", requireRole("viewer"), async (c) => {
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const groups = await getPipelineGroups(db, { orgId });
    return c.json(groups);
  })

  // -------------------------------------------------------------------------
  // Tags (must be before /:contactId)
  // -------------------------------------------------------------------------
  .get("/tags", requireRole("viewer"), async (c) => {
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const result = await listTags(db, orgId);
    return c.json(result);
  })
  .post("/tags", requireRole("editor"), zValidator("json", createTagSchema), async (c) => {
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const data = c.req.valid("json");
    const tag = await createTag(db, { orgId, ...data });
    return c.json(tag, 201);
  })
  .patch("/tags/:tagId", requireRole("editor"), zValidator("json", updateTagSchema), async (c) => {
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const tagId = c.req.param("tagId");
    const data = c.req.valid("json");
    const tag = await updateTag(db, { orgId, tagId, data });
    return c.json(tag);
  })
  .delete("/tags/:tagId", requireRole("admin"), async (c) => {
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const tagId = c.req.param("tagId");
    await deleteTag(db, { orgId, tagId });
    return c.body(null, 204);
  })

  // -------------------------------------------------------------------------
  // Segments (must be before /:contactId)
  // -------------------------------------------------------------------------
  .get("/segments", requireRole("viewer"), async (c) => {
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const result = await listSegments(db, orgId);
    return c.json(result);
  })
  .post("/segments", requireRole("editor"), zValidator("json", createSegmentSchema), async (c) => {
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const userId = c.get("user")!.id;
    const data = c.req.valid("json");
    const segment = await createSegment(db, { orgId, createdBy: userId, ...data });
    return c.json(segment, 201);
  })
  .patch(
    "/segments/:segmentId",
    requireRole("editor"),
    zValidator("json", updateSegmentSchema),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const segmentId = c.req.param("segmentId");
      const data = c.req.valid("json");
      const segment = await updateSegment(db, { orgId, segmentId, data });
      return c.json(segment);
    },
  )
  .delete("/segments/:segmentId", requireRole("admin"), async (c) => {
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const segmentId = c.req.param("segmentId");
    await deleteSegment(db, { orgId, segmentId });
    return c.body(null, 204);
  })

  // -------------------------------------------------------------------------
  // Contacts
  // -------------------------------------------------------------------------
  .get("/", requireRole("viewer"), zValidator("query", contactListSchema), async (c) => {
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const params = c.req.valid("query");
    const result = await listContacts(db, { orgId, ...params });
    return c.json(result);
  })
  .post("/", requireRole("editor"), zValidator("json", createContactSchema), async (c) => {
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const data = c.req.valid("json");
    const contact = await createContact(db, { orgId, ...data });
    return c.json(contact, 201);
  })
  .get("/:contactId", requireRole("viewer"), async (c) => {
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const contactId = c.req.param("contactId");
    const result = await getContact(db, { orgId, contactId });
    return c.json(result);
  })
  .patch(
    "/:contactId",
    requireRole("editor"),
    zValidator("json", updateContactSchema),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const contactId = c.req.param("contactId");
      const data = c.req.valid("json");
      const contact = await updateContact(db, { orgId, contactId, data });
      return c.json(contact);
    },
  )
  .delete("/:contactId", requireRole("admin"), async (c) => {
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const contactId = c.req.param("contactId");
    await deleteContact(db, { orgId, contactId });
    return c.body(null, 204);
  })
  .patch(
    "/:contactId/stage",
    requireRole("editor"),
    zValidator("json", updatePipelineStageSchema),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const contactId = c.req.param("contactId");
      const { stage } = c.req.valid("json");
      const contact = await updatePipelineStage(db, { orgId, contactId, stage });
      return c.json(contact);
    },
  )

  // -------------------------------------------------------------------------
  // Donations (nested under contact)
  // -------------------------------------------------------------------------
  .get(
    "/:contactId/donations",
    requireRole("viewer"),
    zValidator("query", paginationSchema),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const contactId = c.req.param("contactId");
      const { page, pageSize } = c.req.valid("query");
      const result = await listDonations(db, { orgId, contactId, page, pageSize });
      return c.json(result);
    },
  )
  .post(
    "/:contactId/donations",
    requireRole("editor"),
    zValidator("json", createDonationSchema),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const contactId = c.req.param("contactId");
      const data = c.req.valid("json");
      const donation = await createDonation(db, { orgId, contactId, ...data });
      return c.json(donation, 201);
    },
  )
  .patch(
    "/:contactId/donations/:donationId",
    requireRole("editor"),
    zValidator("json", updateDonationSchema),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const contactId = c.req.param("contactId");
      const donationId = c.req.param("donationId");
      const data = c.req.valid("json");
      const donation = await updateDonation(db, { orgId, contactId, donationId, data });
      return c.json(donation);
    },
  )
  .delete("/:contactId/donations/:donationId", requireRole("admin"), async (c) => {
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const contactId = c.req.param("contactId");
    const donationId = c.req.param("donationId");
    await deleteDonation(db, { orgId, contactId, donationId });
    return c.body(null, 204);
  })

  // -------------------------------------------------------------------------
  // Contact Tags
  // -------------------------------------------------------------------------
  .post("/:contactId/tags", requireRole("editor"), zValidator("json", addTagsSchema), async (c) => {
    const db = c.get("db");
    const { tagIds } = c.req.valid("json");
    const contactId = c.req.param("contactId");
    await addContactTags(db, { contactId, tagIds });
    return c.body(null, 204);
  })
  .delete("/:contactId/tags/:tagId", requireRole("editor"), async (c) => {
    const db = c.get("db");
    const contactId = c.req.param("contactId");
    const tagId = c.req.param("tagId");
    await removeContactTag(db, { contactId, tagId });
    return c.body(null, 204);
  })

  // -------------------------------------------------------------------------
  // Communications (nested under contact)
  // -------------------------------------------------------------------------
  .get(
    "/:contactId/communications",
    requireRole("viewer"),
    zValidator("query", paginationSchema),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const contactId = c.req.param("contactId");
      const { page, pageSize } = c.req.valid("query");
      const result = await listCommunications(db, { orgId, contactId, page, pageSize });
      return c.json(result);
    },
  )
  .post(
    "/:contactId/communications",
    requireRole("editor"),
    zValidator("json", createCommunicationSchema),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const contactId = c.req.param("contactId");
      const userId = c.get("user")!.id;
      const data = c.req.valid("json");
      const entry = await createCommunication(db, { orgId, contactId, loggedBy: userId, ...data });
      return c.json(entry, 201);
    },
  );
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @grantpipe/api test -- --run src/domains/donors/routes.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/donors/routes.ts apps/api/src/domains/donors/routes.test.ts
git commit -m "feat(api): add donor routes - contacts, donations, tags, comms, segments, stats, pipeline"
```

---

## Task 11: Wire Donor Routes into App

**Files:**

- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Mount donor routes in app.ts**

Add the import and route mount after the existing protected routes:

```typescript
// apps/api/src/app.ts - add these two lines:

// Import (add near top with other route imports):
import { donorRoutes } from "./domains/donors/routes";

// Mount (add after .route("/onboarding", onboardingRoutes)):
.route("/donors", donorRoutes)
```

The full updated file should read:

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createDb, orgMembers } from "@grantpipe/db";
import { eq, isNull, and } from "drizzle-orm";
import { createAuth } from "./lib/auth";
import { errorHandler } from "./middleware/error-handler";
import { healthRoutes } from "./domains/health/routes";
import { authRoutes } from "./domains/auth/routes";
import { onboardingRoutes } from "./domains/onboarding/routes";
import { donorRoutes } from "./domains/donors/routes";
import type { AppEnv } from "./types";
import type { Role } from "@grantpipe/shared";

const app = new Hono<AppEnv>()
  .basePath("/api")
  .onError(errorHandler)
  .use("*", async (c, next) => {
    const corsMiddleware = cors({
      origin: c.env.APP_URL,
      credentials: true,
    });
    return corsMiddleware(c, next);
  })
  .use("*", async (c, next) => {
    const db = createDb(c.env.DATABASE_URL);
    c.set("db", db);
    await next();
  })
  .route("/health", healthRoutes)
  .on(["POST", "GET"], "/auth/better/*", async (c) => {
    const db = c.get("db");
    const auth = createAuth(db, c.env);
    return auth.handler(c.req.raw);
  })
  .use("*", async (c, next) => {
    const db = c.get("db");
    const auth = createAuth(db, c.env);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    c.set("user", session.user);
    c.set("session", session.session);
    await next();
  })
  .use("*", async (c, next) => {
    const db = c.get("db");
    const userId = c.get("user")!.id;
    const member = await db.query.orgMembers.findFirst({
      where: and(eq(orgMembers.userId, userId), isNull(orgMembers.deletedAt)),
    });
    if (!member) return c.json({ error: "No organization membership" }, 403);
    c.set("orgId", member.orgId);
    c.set("memberRole", member.role as Role);
    await next();
  })
  .route("/auth", authRoutes)
  .route("/onboarding", onboardingRoutes)
  .route("/donors", donorRoutes);

export type AppType = typeof app;
export { app };
export default app;
```

- [ ] **Step 2: Verify typecheck passes**

```bash
turbo typecheck --filter=@grantpipe/api
```

Expected: No type errors.

- [ ] **Step 3: Run all API tests**

```bash
pnpm --filter @grantpipe/api test
```

Expected: All tests pass (existing + new donor tests).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/app.ts
git commit -m "feat(api): mount donor routes at /api/donors"
```

---

## Task 12: Shadcn Components

**Files:**

- Create: `packages/ui/src/components/*.tsx` (multiple)
- Modify: `packages/ui/src/index.ts`

Install the Shadcn components needed for the donor CRM UI. These are added via the Shadcn CLI into `packages/ui/src/components/`.

- [ ] **Step 1: Install Shadcn components**

```bash
cd /c/Users/dev/Documents/grantpipe/packages/ui
npx shadcn@latest add button input label table dialog tabs select badge card dropdown-menu popover separator skeleton textarea command sonner tooltip --yes
```

If the CLI doesn't work in the monorepo, install manually by copying from shadcn/ui source. The key is that each component lives at `packages/ui/src/components/<name>.tsx`.

- [ ] **Step 2: Update the UI package exports**

```typescript
// packages/ui/src/index.ts
export { cn } from "./lib/utils";

// Shadcn components
export { Button, buttonVariants } from "./components/button";
export { Input } from "./components/input";
export { Label } from "./components/label";
export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "./components/table";
export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "./components/dialog";
export { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/tabs";
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
} from "./components/select";
export { Badge, badgeVariants } from "./components/badge";
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from "./components/card";
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./components/dropdown-menu";
export { Popover, PopoverTrigger, PopoverContent } from "./components/popover";
export { Separator } from "./components/separator";
export { Skeleton } from "./components/skeleton";
export { Textarea } from "./components/textarea";
export { Toaster } from "./components/sonner";
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "./components/tooltip";
```

Adjust the exports based on what the Shadcn CLI actually generates - component names and export patterns may vary slightly. The key is that all components are re-exported from the index.

- [ ] **Step 3: Verify typecheck**

```bash
turbo typecheck --filter=@grantpipe/ui
```

Expected: No errors. If Shadcn components reference imports not yet available, install missing Radix deps.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/dev/Documents/grantpipe
git add packages/ui/
git commit -m "feat(ui): add Shadcn components - button, input, table, dialog, tabs, select, badge, card, and more"
```

---

## Task 13: Frontend Hooks

**Files:**

- Create: `apps/web/src/hooks/use-donors.ts`
- Create: `apps/web/src/hooks/use-donors.test.ts`

TanStack Query hooks wrapping the Hono RPC client for all donor endpoints.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/web/src/hooks/use-donors.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the API client
vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      donors: {
        $get: vi.fn(),
        $post: vi.fn(),
        tags: {
          $get: vi.fn(),
          $post: vi.fn(),
        },
        segments: {
          $get: vi.fn(),
          $post: vi.fn(),
        },
        stats: {
          $get: vi.fn(),
          retention: { $get: vi.fn() },
        },
        pipeline: { $get: vi.fn() },
      },
    },
  },
}));

// Mock TanStack Query
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
  })),
}));

import { useQuery } from "@tanstack/react-query";
import {
  useContacts,
  useDonorStats,
  useRetentionStats,
  usePipeline,
  useTags,
  useSegments,
} from "./use-donors";

describe("useContacts", () => {
  beforeEach(() => vi.resetAllMocks());

  it("calls useQuery with correct query key and enabled flag", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as never);

    useContacts({ page: 1, pageSize: 25, sortBy: "name", sortOrder: "asc" });

    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: expect.arrayContaining(["contacts"]),
      }),
    );
  });
});

describe("useDonorStats", () => {
  beforeEach(() => vi.resetAllMocks());

  it("calls useQuery with stats query key", () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined, isLoading: true } as never);

    useDonorStats();

    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["donor-stats"],
      }),
    );
  });
});

describe("useRetentionStats", () => {
  beforeEach(() => vi.resetAllMocks());

  it("calls useQuery with retention query key", () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined, isLoading: true } as never);

    useRetentionStats();

    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["retention-stats"],
      }),
    );
  });
});

describe("usePipeline", () => {
  beforeEach(() => vi.resetAllMocks());

  it("calls useQuery with pipeline query key", () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined, isLoading: true } as never);

    usePipeline();

    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["pipeline"],
      }),
    );
  });
});

describe("useTags", () => {
  beforeEach(() => vi.resetAllMocks());

  it("calls useQuery with tags query key", () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined, isLoading: true } as never);

    useTags();

    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["tags"],
      }),
    );
  });
});

describe("useSegments", () => {
  beforeEach(() => vi.resetAllMocks());

  it("calls useQuery with segments query key", () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined, isLoading: true } as never);

    useSegments();

    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["segments"],
      }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @grantpipe/web test -- --run src/hooks/use-donors.test.ts
```

Expected: FAIL - module not found.

- [ ] **Step 3: Implement the hooks**

```typescript
// apps/web/src/hooks/use-donors.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api-client";
import type { ContactListParams } from "@grantpipe/shared";

const donors = api.api.donors;

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export function useContacts(params: ContactListParams) {
  return useQuery({
    queryKey: ["contacts", params],
    queryFn: async () => {
      const res = await donors.$get({
        query: {
          page: String(params.page),
          pageSize: String(params.pageSize),
          sortBy: params.sortBy,
          sortOrder: params.sortOrder,
          ...(params.search ? { search: params.search } : {}),
          ...(params.pipelineStage ? { pipelineStage: params.pipelineStage } : {}),
          ...(params.tagId ? { tagId: params.tagId } : {}),
          ...(params.type ? { type: params.type } : {}),
        },
      });
      return res.json();
    },
  });
}

export function useContact(contactId: string) {
  return useQuery({
    queryKey: ["contact", contactId],
    queryFn: async () => {
      const res = await donors[":contactId"].$get({ param: { contactId } });
      return res.json();
    },
    enabled: !!contactId,
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await donors.$post({ json: data as never });
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      void queryClient.invalidateQueries({ queryKey: ["pipeline"] });
      void queryClient.invalidateQueries({ queryKey: ["donor-stats"] });
    },
  });
}

export function useUpdateContact(contactId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await donors[":contactId"].$patch({ param: { contactId }, json: data as never });
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      void queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
      void queryClient.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contactId: string) => {
      await donors[":contactId"].$delete({ param: { contactId } });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      void queryClient.invalidateQueries({ queryKey: ["pipeline"] });
      void queryClient.invalidateQueries({ queryKey: ["donor-stats"] });
    },
  });
}

export function useUpdatePipelineStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ contactId, stage }: { contactId: string; stage: string }) => {
      const res = await donors[":contactId"].stage.$patch({
        param: { contactId },
        json: { stage } as never,
      });
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      void queryClient.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Donations
// ---------------------------------------------------------------------------

export function useDonations(contactId: string, page = 1, pageSize = 25) {
  return useQuery({
    queryKey: ["donations", contactId, page, pageSize],
    queryFn: async () => {
      const res = await donors[":contactId"].donations.$get({
        param: { contactId },
        query: { page: String(page), pageSize: String(pageSize) },
      });
      return res.json();
    },
    enabled: !!contactId,
  });
}

export function useCreateDonation(contactId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await donors[":contactId"].donations.$post({
        param: { contactId },
        json: data as never,
      });
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["donations", contactId] });
      void queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
      void queryClient.invalidateQueries({ queryKey: ["donor-stats"] });
    },
  });
}

export function useUpdateDonation(contactId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      donationId,
      data,
    }: {
      donationId: string;
      data: Record<string, unknown>;
    }) => {
      const res = await donors[":contactId"].donations[":donationId"].$patch({
        param: { contactId, donationId },
        json: data as never,
      });
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["donations", contactId] });
      void queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
      void queryClient.invalidateQueries({ queryKey: ["donor-stats"] });
    },
  });
}

export function useDeleteDonation(contactId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (donationId: string) => {
      await donors[":contactId"].donations[":donationId"].$delete({
        param: { contactId, donationId },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["donations", contactId] });
      void queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
      void queryClient.invalidateQueries({ queryKey: ["donor-stats"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: async () => {
      const res = await donors.tags.$get();
      return res.json();
    },
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; color?: string }) => {
      const res = await donors.tags.$post({ json: data as never });
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tags"] });
    },
  });
}

export function useAddContactTags(contactId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tagIds: string[]) => {
      await donors[":contactId"].tags.$post({
        param: { contactId },
        json: { tagIds } as never,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
    },
  });
}

export function useRemoveContactTag(contactId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tagId: string) => {
      await donors[":contactId"].tags[":tagId"].$delete({
        param: { contactId, tagId },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
    },
  });
}

// ---------------------------------------------------------------------------
// Communications
// ---------------------------------------------------------------------------

export function useCommunications(contactId: string, page = 1, pageSize = 25) {
  return useQuery({
    queryKey: ["communications", contactId, page, pageSize],
    queryFn: async () => {
      const res = await donors[":contactId"].communications.$get({
        param: { contactId },
        query: { page: String(page), pageSize: String(pageSize) },
      });
      return res.json();
    },
    enabled: !!contactId,
  });
}

export function useCreateCommunication(contactId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await donors[":contactId"].communications.$post({
        param: { contactId },
        json: data as never,
      });
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["communications", contactId] });
    },
  });
}

// ---------------------------------------------------------------------------
// Segments
// ---------------------------------------------------------------------------

export function useSegments() {
  return useQuery({
    queryKey: ["segments"],
    queryFn: async () => {
      const res = await donors.segments.$get();
      return res.json();
    },
  });
}

export function useCreateSegment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; filters: Record<string, unknown> }) => {
      const res = await donors.segments.$post({ json: data as never });
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["segments"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export function useDonorStats() {
  return useQuery({
    queryKey: ["donor-stats"],
    queryFn: async () => {
      const res = await donors.stats.$get();
      return res.json();
    },
  });
}

export function useRetentionStats() {
  return useQuery({
    queryKey: ["retention-stats"],
    queryFn: async () => {
      const res = await donors.stats.retention.$get();
      return res.json();
    },
  });
}

export function usePipeline() {
  return useQuery({
    queryKey: ["pipeline"],
    queryFn: async () => {
      const res = await donors.pipeline.$get();
      return res.json();
    },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @grantpipe/web test -- --run src/hooks/use-donors.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/use-donors.ts apps/web/src/hooks/use-donors.test.ts
git commit -m "feat(web): add TanStack Query hooks for all donor endpoints"
```

---

## Tasks 14-19: Frontend Components & Pages

**Tasks 14-19 cover the frontend components and pages.** The implementation patterns are established by the hooks and the existing auth pages. Each task follows the same cycle: write test â†’ implement component â†’ verify â†’ commit.

Due to the volume of frontend code, the remaining tasks provide **component specifications and key implementation details** rather than full code blocks. The implementing agent should follow these patterns:

- **Forms** use React Hook Form + `@hookform/resolvers/zod` + shared Zod schemas
- **Components** use Shadcn UI primitives from `@grantpipe/ui`
- **Tests** use React Testing Library + Vitest, mocking hooks from `../hooks/use-donors`
- **Styling** uses Tailwind CSS 4 with design tokens from `@grantpipe/ui/globals.css`

---

### Task 14: Form Components

**Files:** Create `apps/web/src/components/donors/contact-form.tsx`, `donation-form.tsx`, `communication-form.tsx`, `tag-picker.tsx`, `pipeline-stage-select.tsx` + test files for each.

- [ ] **Step 1: Write tests for ContactForm**

Test renders all fields, shows required-field validation, submits valid individual contact, submits valid org contact, shows conditional fields based on type selection.

- [ ] **Step 2: Implement ContactForm**

React Hook Form with `zodResolver(createContactSchema)`. Shadcn Input, Label, Select (for type/stage), Button. On submit calls `onSubmit(data)` prop. Conditional: shows firstName/lastName when type=individual, organizationName when type=organization.

- [ ] **Step 3: Write tests for DonationForm**

Test renders amount (in dollars - divides display by 100, multiplies back on submit), date picker, type dropdown, restriction dropdown. Validates positive amount.

- [ ] **Step 4: Implement DonationForm**

Amount input shows dollars (divide `amountCents` by 100 for display), converts back to cents on submit. Date input as type="date". Type and restriction as Select.

- [ ] **Step 5: Write tests for CommunicationForm**

Test renders type dropdown, subject, body textarea. Validates at least one of subject/body.

- [ ] **Step 6: Implement CommunicationForm**

Select for type, Input for subject, Textarea for body.

- [ ] **Step 7: Write tests for TagPicker**

Test renders existing tags as checkable items, fires onToggle callback, has "create new" input.

- [ ] **Step 8: Implement TagPicker**

Uses Popover + Command (Shadcn combobox pattern). Lists org tags from `useTags()`. Checked state for tags on the contact. "Create new" input at bottom calls `useCreateTag()`.

- [ ] **Step 9: Write tests for PipelineStageSelect**

Test renders all 4 stages, fires onChange with selected stage.

- [ ] **Step 10: Implement PipelineStageSelect**

Shadcn Select with Badge-colored options for each `DONOR_PIPELINE_STAGES` value.

- [ ] **Step 11: Run all component tests**

```bash
pnpm --filter @grantpipe/web test -- --run src/components/donors/
```

- [ ] **Step 12: Commit**

```bash
git add apps/web/src/components/donors/
git commit -m "feat(web): add donor form components - ContactForm, DonationForm, CommunicationForm, TagPicker, PipelineStageSelect"
```

---

### Task 15: StatsBar & RetentionChart

**Files:** Create `apps/web/src/components/donors/stats-bar.tsx`, `retention-chart.tsx` + test files.

- [ ] **Step 1: Write tests for StatsBar**

Test renders 4 metric cards (total donors, new this FY, retention rate %, total giving formatted as currency). Test loading skeleton state. Test with zero values.

- [ ] **Step 2: Implement StatsBar**

Horizontal row of 4 Shadcn Cards. Each card: label, value (large font), subtitle. Format `totalGivingThisFY` as `$X,XXX` (cents â†’ dollars). Format `retentionRate` as `XX%`. Includes a small `RetentionChart` in the retention card.

- [ ] **Step 3: Write tests for RetentionChart**

Test renders an SVG (Recharts renders as SVG). Test handles empty data gracefully.

- [ ] **Step 4: Implement RetentionChart**

Recharts `AreaChart` with `Area` fill. X-axis: fiscal year labels. Y-axis: retention rate 0-100%. Small size (sparkline: ~200px wide, 60px tall). Tooltips showing FY, rate%, donor count, retained count.

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @grantpipe/web test -- --run src/components/donors/stats-bar.test.tsx src/components/donors/retention-chart.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/donors/stats-bar.tsx apps/web/src/components/donors/stats-bar.test.tsx apps/web/src/components/donors/retention-chart.tsx apps/web/src/components/donors/retention-chart.test.tsx
git commit -m "feat(web): add StatsBar and RetentionChart components"
```

---

### Task 16: PipelineBoard

**Files:** Create `apps/web/src/components/donors/pipeline-board.tsx` + test file.

- [ ] **Step 1: Write tests for PipelineBoard**

Test renders 4 columns with stage names. Test renders contact cards. Test drag-and-drop fires `onStageChange(contactId, newStage)`.

- [ ] **Step 2: Implement PipelineBoard**

Uses `@dnd-kit/core` `DndContext` with `DragOverlay`. Four `DroppableColumn` components (one per stage). `DraggableCard` for each contact. On `DragEnd`, extracts the target column's stage and calls `onStageChange`. Each card shows: name, email, tag dots, last donation date, total giving. Column header shows stage name + count badge. "View all" link when count > 50.

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @grantpipe/web test -- --run src/components/donors/pipeline-board.test.tsx
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/donors/pipeline-board.tsx apps/web/src/components/donors/pipeline-board.test.tsx
git commit -m "feat(web): add PipelineBoard kanban component with drag-and-drop"
```

---

### Task 17: Donor List Page

**Files:** Create `apps/web/src/routes/_authenticated/donors/index.tsx` + test file.

- [ ] **Step 1: Write tests for the donor list page**

Test renders StatsBar, DataTable, filter bar, "Add contact" button. Test filter changes update query params. Test pagination. Test "Add contact" opens dialog (editor role). Test viewer cannot see create button.

- [ ] **Step 2: Implement the donor list page**

```typescript
// Route definition
export const Route = createFileRoute("/_authenticated/donors/")({
  component: DonorListPage,
});
```

Page layout:

1. StatsBar (uses `useDonorStats()` + `useRetentionStats()`)
2. View toggle: tabs/links for "List" (active) and "Pipeline" (`/donors/pipeline`)
3. Filter bar: search Input, PipelineStage Select, Tag Select (from `useTags()`), Type Select, Segment dropdown (from `useSegments()`)
4. "Add contact" Button â†’ opens Dialog with ContactForm â†’ calls `useCreateContact()`
5. DataTable with columns from spec, sorted by column headers
6. Pagination controls

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @grantpipe/web test -- --run src/routes/_authenticated/donors/index.test.tsx
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/_authenticated/donors/index.tsx apps/web/src/routes/_authenticated/donors/index.test.tsx
git commit -m "feat(web): add donor list page with stats, filters, segments, and DataTable"
```

---

### Task 18: Pipeline Page

**Files:** Create `apps/web/src/routes/_authenticated/donors/pipeline.tsx` + test file.

- [ ] **Step 1: Write tests for the pipeline page**

Test renders StatsBar and PipelineBoard. Test stage change triggers mutation. Test optimistic update moves card immediately.

- [ ] **Step 2: Implement the pipeline page**

```typescript
export const Route = createFileRoute("/_authenticated/donors/pipeline")({
  component: PipelinePage,
});
```

Page layout:

1. StatsBar (same as list page)
2. View toggle: "List" (`/donors`) and "Pipeline" (active)
3. PipelineBoard (uses `usePipeline()`)
4. On stage change: call `useUpdatePipelineStage()` with optimistic update - update the `usePipeline` query cache directly before the mutation completes.

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @grantpipe/web test -- --run src/routes/_authenticated/donors/pipeline.test.tsx
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/_authenticated/donors/pipeline.tsx apps/web/src/routes/_authenticated/donors/pipeline.test.tsx
git commit -m "feat(web): add pipeline kanban page with drag-and-drop stage updates"
```

---

### Task 19: Contact Detail Page

**Files:** Create `apps/web/src/routes/_authenticated/donors/$contactId.tsx` + test file.

- [ ] **Step 1: Write tests for the contact detail page**

Test renders header with name, type badge, stage selector, tags. Test renders 3 tabs (Overview, Donations, Communications). Test Overview tab shows giving stats. Test Donations tab renders donation table. Test Communications tab renders timeline. Test edit opens ContactForm dialog. Test admin can see delete button, editor cannot.

- [ ] **Step 2: Implement the contact detail page**

```typescript
export const Route = createFileRoute("/_authenticated/donors/$contactId")({
  component: ContactDetailPage,
});
```

Page layout:

1. Header: Contact name, Type Badge, PipelineStageSelect (inline change via `useUpdatePipelineStage()`), TagPicker, Edit Button â†’ Dialog with ContactForm, Delete Button (admin only) â†’ confirmation dialog â†’ `useDeleteContact()`
2. Tabs component with 3 tabs:

**Overview tab:**

- Grid of 7 Shadcn Cards showing giving stats from `useContact(contactId)`.givingStats
- Format cents as dollars, dates as localized strings
- Notes section: editable textarea that auto-saves on blur via `useUpdateContact()`
- Affiliated org link (if set)
- Volunteer Badge (if `isVolunteer`)

**Donations tab:**

- DataTable from `useDonations(contactId)` - columns: date, amount ($), type badge, restriction badge, fund, payment method, notes
- "Add donation" Button â†’ Dialog with DonationForm â†’ `useCreateDonation(contactId)`
- Row actions: Edit (Dialog + DonationForm), Delete (admin only, confirmation)
- Pagination

**Communications tab:**

- Timeline list from `useCommunications(contactId)` - each entry: type icon (lucide-react icons: StickyNote, Mail, Phone, Users), subject (bold), body (truncated, expandable), logged by, timestamp
- "Log communication" Button â†’ Dialog with CommunicationForm â†’ `useCreateCommunication(contactId)`
- Pagination

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @grantpipe/web test -- --run src/routes/_authenticated/donors/\$contactId.test.tsx
```

- [ ] **Step 4: Run full test suite**

```bash
turbo test
```

Expected: All tests pass across all packages.

- [ ] **Step 5: Run typecheck**

```bash
turbo typecheck
```

Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes/_authenticated/donors/\$contactId.tsx apps/web/src/routes/_authenticated/donors/\$contactId.test.tsx
git commit -m "feat(web): add contact detail page with overview, donations, and communications tabs"
```

---

## Post-Implementation

After all tasks complete, run the full quality check:

```bash
turbo typecheck
turbo test:coverage
turbo lint
pnpm format:check
```

All must pass before the branch is ready for review.
