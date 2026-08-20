# Phase 2: Database & Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define the complete Drizzle schema for all V1 tables, integrate Better Auth (email/password + Google SSO), build auth middleware (session, org context, role enforcement), and create the signup â†’ onboarding â†’ invite flows on both API and frontend.

**Architecture:** Better Auth handles core authentication (users, sessions, accounts, verification). Our custom tables handle multi-tenancy (organizations, org_members, invite_links). All domain tables (contacts, grants, funds, etc.) are defined as schema-only so Phase 3+ can start immediately. Hono middleware chain: error handler â†’ CORS â†’ (public routes) â†’ session â†’ org context â†’ (protected routes). Frontend uses Better Auth React client with TanStack Router auth guard.

**Tech Stack:** Better Auth, Drizzle ORM (Neon Postgres), Hono (Cloudflare Workers), React 19, TanStack Router, TanStack Query, Zod, Vitest, React Testing Library

**Spec:** `docs/superpowers/specs/2026-04-07-grantpipe-v1-design.md` - Sections 4 (Data Model), 5 (API Design), 6 (Auth & Permissions), 7 (Frontend Architecture)

---

## Parallel Execution Groups

```
Task 1 (Install Dependencies)
  â”œâ”€â”€ Group A - Schema (parallel): Tasks 2, 3, 4, 5, 6, 7
  â”‚     â””â”€â”€ Task 8 (Schema Index + Migration)
  â”œâ”€â”€ Task 9 (Auth Validators - independent)
  â””â”€â”€ Task 10 (Web Test Infrastructure - independent)
        â”‚
        Task 8 + Task 9
        â””â”€â”€ Group B - API (sequential): Tasks 11 â†’ 12 â†’ 13 â†’ 14 â†’ 15 â†’ 16 â†’ 17 â†’ 18
              â”‚
              Task 18
              â””â”€â”€ Group C - Frontend (parallel): Tasks 19, 20, 21, 22, 23
```

---

## File Structure

```
packages/db/src/schema/
  auth.ts              - Better Auth tables (user, session, account, verification) + organizations, org_members, invite_links
  contacts.ts          - contacts, donations, tags, contact_tags
  grants.ts            - funders, funder_contacts, grants, funds, grant_fund_allocations, expenses, grant_impact_metrics
  compliance.ts        - grant_reporting_requirements, impact_metric_entries, grant_closeout_items, generated_reports
  events.ts            - events, event_attendees, volunteer_hours
  infrastructure.ts    - communication_log, documents, activity_log, custom_field_definitions, custom_field_values, notifications, notification_preferences, saved_segments
  index.ts             - re-exports all tables + relations

packages/shared/src/validators/
  auth.ts              - signupSchema, loginSchema, onboardingSchema, createInviteSchema
  index.ts             - updated re-exports

apps/api/src/
  types.ts             - Bindings, Variables, AppEnv type
  lib/
    auth.ts            - createAuth() factory
  middleware/
    error-handler.ts   - JSON error responses
    error-handler.test.ts
    session.ts         - Better Auth session validation
    session.test.ts
    org-context.ts     - Load org + member from session user
    org-context.test.ts
    require-role.ts    - Role-based access control
    require-role.test.ts
  domains/
    auth/
      routes.ts        - Mount Better Auth handler + session endpoint
      routes.test.ts
      service.ts       - Org creation on signup, invite logic
      service.test.ts
    onboarding/
      routes.ts        - GET status + PATCH org setup
      routes.test.ts
      service.ts       - Onboarding business logic
      service.test.ts
  app.ts               - Updated middleware chain + route composition

apps/web/
  vitest.config.ts     - Vitest config for React
  src/
    lib/
      auth-client.ts   - Better Auth React client
    hooks/
      use-session.ts   - Session query hook
      use-session.test.ts
    routes/
      login.tsx
      login.test.tsx
      signup.tsx
      signup.test.tsx
      invite.$token.tsx
      invite.$token.test.tsx
      _authenticated.tsx
      _authenticated.test.tsx
      _authenticated/
        onboarding.tsx
        onboarding.test.tsx
```

---

## Task 1: Install Dependencies

**Files:**

- Modify: `apps/api/package.json`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install Better Auth in API**

```bash
cd /c/Users/dev/Documents/grantpipe
pnpm --filter @grantpipe/api add better-auth
```

- [ ] **Step 2: Install Better Auth + testing libs in Web**

```bash
pnpm --filter @grantpipe/web add better-auth
pnpm --filter @grantpipe/web add -D vitest @vitest/coverage-v8 @testing-library/react @testing-library/jest-dom happy-dom
```

- [ ] **Step 3: Verify installation**

```bash
pnpm install
turbo typecheck
```

Expected: No errors. All packages resolve.

- [ ] **Step 4: Commit**

```bash
git add apps/api/package.json apps/web/package.json pnpm-lock.yaml
git commit -m "chore: add better-auth and web test dependencies for Phase 2"
```

---

## Task 2: Auth & Organization Schema

**Files:**

- Create: `packages/db/src/schema/auth.ts`

This file defines Better Auth's required tables (user, session, account, verification) and our custom auth tables (organizations, org_members, invite_links). Better Auth's Drizzle adapter maps to these tables by name.

- [ ] **Step 1: Write the auth schema**

```typescript
// packages/db/src/schema/auth.ts
import { pgTable, text, timestamp, boolean, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// =============================================================================
// Better Auth managed tables
// Table/column names MUST match Better Auth's expectations exactly.
// =============================================================================

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// =============================================================================
// GrantPipe auth tables
// =============================================================================

export const organizations = pgTable("organizations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ein: text("ein"),
  fiscalYearStartMonth: integer("fiscal_year_start_month").notNull().default(1),
  timezone: text("timezone").notNull().default("America/New_York"),
  logoUrl: text("logo_url"),
  address: text("address"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  planTier: text("plan_tier").notNull().default("foundation"),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const orgMembers = pgTable(
  "org_members",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    role: text("role").notNull().default("viewer"),
    invitedBy: text("invited_by").references(() => user.id),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("org_member_unique").on(t.orgId, t.userId)],
);

export const inviteLinks = pgTable("invite_links", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  token: text("token").notNull().unique(),
  role: text("role").notNull().default("viewer"),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedBy: text("used_by").references(() => user.id),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

// =============================================================================
// Relations
// =============================================================================

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  orgMembers: many(orgMembers),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const organizationRelations = relations(organizations, ({ many }) => ({
  members: many(orgMembers),
  inviteLinks: many(inviteLinks),
}));

export const orgMemberRelations = relations(orgMembers, ({ one }) => ({
  organization: one(organizations, { fields: [orgMembers.orgId], references: [organizations.id] }),
  user: one(user, { fields: [orgMembers.userId], references: [user.id] }),
  inviter: one(user, { fields: [orgMembers.invitedBy], references: [user.id] }),
}));

export const inviteLinkRelations = relations(inviteLinks, ({ one }) => ({
  organization: one(organizations, { fields: [inviteLinks.orgId], references: [organizations.id] }),
  creator: one(user, { fields: [inviteLinks.createdBy], references: [user.id] }),
  acceptor: one(user, { fields: [inviteLinks.usedBy], references: [user.id] }),
}));
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @grantpipe/db typecheck
```

Expected: PASS - no type errors.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/auth.ts
git commit -m "feat(db): add Better Auth tables and organization schema"
```

---

## Task 3: Contacts & Donations Schema

**Files:**

- Create: `packages/db/src/schema/contacts.ts`

- [ ] **Step 1: Write the contacts schema**

```typescript
// packages/db/src/schema/contacts.ts
import { pgTable, text, timestamp, boolean, integer, primaryKey } from "drizzle-orm/pg-core";
import { relations, type AnyPgColumn } from "drizzle-orm";
import { organizations, user } from "./auth";

export const contacts = pgTable("contacts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  type: text("type").notNull(), // individual | organization
  firstName: text("first_name"),
  lastName: text("last_name"),
  organizationName: text("organization_name"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  pipelineStage: text("pipeline_stage").notNull().default("prospect"),
  affiliatedOrgId: text("affiliated_org_id").references((): AnyPgColumn => contacts.id),
  isVolunteer: boolean("is_volunteer").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const donations = pgTable("donations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  contactId: text("contact_id")
    .notNull()
    .references(() => contacts.id),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  date: timestamp("date", { withTimezone: true }).notNull(),
  type: text("type").notNull(), // one_time | recurring | pledge
  restriction: text("restriction").notNull().default("unrestricted"),
  fundId: text("fund_id"), // FK added after funds table exists - set via migration
  grantId: text("grant_id"), // FK added after grants table exists - set via migration
  paymentMethod: text("payment_method"),
  receiptSent: boolean("receipt_sent").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const tags = pgTable("tags", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  color: text("color"),
});

export const contactTags = pgTable(
  "contact_tags",
  {
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id),
  },
  (t) => [primaryKey({ columns: [t.contactId, t.tagId] })],
);

// =============================================================================
// Relations
// =============================================================================

export const contactRelations = relations(contacts, ({ one, many }) => ({
  organization: one(organizations, { fields: [contacts.orgId], references: [organizations.id] }),
  affiliatedOrg: one(contacts, { fields: [contacts.affiliatedOrgId], references: [contacts.id] }),
  donations: many(donations),
  contactTags: many(contactTags),
}));

export const donationRelations = relations(donations, ({ one }) => ({
  organization: one(organizations, { fields: [donations.orgId], references: [organizations.id] }),
  contact: one(contacts, { fields: [donations.contactId], references: [contacts.id] }),
}));

export const tagRelations = relations(tags, ({ one, many }) => ({
  organization: one(organizations, { fields: [tags.orgId], references: [organizations.id] }),
  contactTags: many(contactTags),
}));

export const contactTagRelations = relations(contactTags, ({ one }) => ({
  contact: one(contacts, { fields: [contactTags.contactId], references: [contacts.id] }),
  tag: one(tags, { fields: [contactTags.tagId], references: [tags.id] }),
}));
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @grantpipe/db typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/contacts.ts
git commit -m "feat(db): add contacts, donations, tags schema"
```

---

## Task 4: Grants & Funds Schema

**Files:**

- Create: `packages/db/src/schema/grants.ts`

- [ ] **Step 1: Write the grants schema**

```typescript
// packages/db/src/schema/grants.ts
import { pgTable, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, user } from "./auth";

export const funders = pgTable("funders", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  type: text("type").notNull(), // foundation | corporate | government | other
  website: text("website"),
  priorities: text("priorities"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const funderContacts = pgTable("funder_contacts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  funderId: text("funder_id")
    .notNull()
    .references(() => funders.id),
  name: text("name").notNull(),
  title: text("title"),
  email: text("email"),
  phone: text("phone"),
  notes: text("notes"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const grants = pgTable("grants", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  funderId: text("funder_id")
    .notNull()
    .references(() => funders.id),
  name: text("name").notNull(),
  status: text("status").notNull().default("discovery"),
  amountCents: integer("amount_cents"),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  applicationDeadline: timestamp("application_deadline", { withTimezone: true }),
  description: text("description"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const funds = pgTable("funds", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  type: text("type").notNull(), // temporarily_restricted | permanently_restricted | unrestricted
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const grantFundAllocations = pgTable("grant_fund_allocations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  grantId: text("grant_id")
    .notNull()
    .references(() => grants.id),
  fundId: text("fund_id")
    .notNull()
    .references(() => funds.id),
  allocatedAmountCents: integer("allocated_amount_cents").notNull(),
});

export const expenses = pgTable("expenses", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  grantId: text("grant_id").references(() => grants.id),
  fundId: text("fund_id").references(() => funds.id),
  amountCents: integer("amount_cents").notNull(),
  date: timestamp("date", { withTimezone: true }).notNull(),
  description: text("description"),
  category: text("category"),
  vendor: text("vendor"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const grantImpactMetrics = pgTable("grant_impact_metrics", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  grantId: text("grant_id")
    .notNull()
    .references(() => grants.id),
  name: text("name").notNull(),
  targetValue: numeric("target_value"),
  unit: text("unit"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// =============================================================================
// Relations
// =============================================================================

export const funderRelations = relations(funders, ({ one, many }) => ({
  organization: one(organizations, { fields: [funders.orgId], references: [organizations.id] }),
  contacts: many(funderContacts),
  grants: many(grants),
}));

export const funderContactRelations = relations(funderContacts, ({ one }) => ({
  organization: one(organizations, {
    fields: [funderContacts.orgId],
    references: [organizations.id],
  }),
  funder: one(funders, { fields: [funderContacts.funderId], references: [funders.id] }),
}));

export const grantRelations = relations(grants, ({ one, many }) => ({
  organization: one(organizations, { fields: [grants.orgId], references: [organizations.id] }),
  funder: one(funders, { fields: [grants.funderId], references: [funders.id] }),
  fundAllocations: many(grantFundAllocations),
  expenses: many(expenses),
  impactMetrics: many(grantImpactMetrics),
}));

export const fundRelations = relations(funds, ({ one, many }) => ({
  organization: one(organizations, { fields: [funds.orgId], references: [organizations.id] }),
  grantAllocations: many(grantFundAllocations),
  expenses: many(expenses),
}));

export const grantFundAllocationRelations = relations(grantFundAllocations, ({ one }) => ({
  grant: one(grants, { fields: [grantFundAllocations.grantId], references: [grants.id] }),
  fund: one(funds, { fields: [grantFundAllocations.fundId], references: [funds.id] }),
}));

export const expenseRelations = relations(expenses, ({ one }) => ({
  organization: one(organizations, { fields: [expenses.orgId], references: [organizations.id] }),
  grant: one(grants, { fields: [expenses.grantId], references: [grants.id] }),
  fund: one(funds, { fields: [expenses.fundId], references: [funds.id] }),
}));

export const grantImpactMetricRelations = relations(grantImpactMetrics, ({ one }) => ({
  organization: one(organizations, {
    fields: [grantImpactMetrics.orgId],
    references: [organizations.id],
  }),
  grant: one(grants, { fields: [grantImpactMetrics.grantId], references: [grants.id] }),
}));
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @grantpipe/db typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/grants.ts
git commit -m "feat(db): add funders, grants, funds, expenses, impact metrics schema"
```

---

## Task 5: Compliance Schema

**Files:**

- Create: `packages/db/src/schema/compliance.ts`

- [ ] **Step 1: Write the compliance schema**

```typescript
// packages/db/src/schema/compliance.ts
import { pgTable, text, timestamp, boolean, numeric } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, user } from "./auth";
import { grants, grantImpactMetrics } from "./grants";

export const grantReportingRequirements = pgTable("grant_reporting_requirements", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  grantId: text("grant_id")
    .notNull()
    .references(() => grants.id),
  reportType: text("report_type").notNull(), // quarterly | annual | final | custom
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("upcoming"), // upcoming | in_progress | submitted | overdue
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  notes: text("notes"),
});

export const impactMetricEntries = pgTable("impact_metric_entries", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  metricId: text("metric_id")
    .notNull()
    .references(() => grantImpactMetrics.id),
  value: numeric("value").notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const grantCloseoutItems = pgTable("grant_closeout_items", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  grantId: text("grant_id")
    .notNull()
    .references(() => grants.id),
  label: text("label").notNull(),
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completedBy: text("completed_by").references(() => user.id),
});

export const generatedReports = pgTable("generated_reports", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  type: text("type").notNull(), // compliance | board | audit | 990
  grantId: text("grant_id").references(() => grants.id),
  fileKey: text("file_key").notNull(),
  generatedBy: text("generated_by")
    .notNull()
    .references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// =============================================================================
// Relations
// =============================================================================

export const grantReportingRequirementRelations = relations(
  grantReportingRequirements,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [grantReportingRequirements.orgId],
      references: [organizations.id],
    }),
    grant: one(grants, { fields: [grantReportingRequirements.grantId], references: [grants.id] }),
  }),
);

export const impactMetricEntryRelations = relations(impactMetricEntries, ({ one }) => ({
  metric: one(grantImpactMetrics, {
    fields: [impactMetricEntries.metricId],
    references: [grantImpactMetrics.id],
  }),
}));

export const grantCloseoutItemRelations = relations(grantCloseoutItems, ({ one }) => ({
  organization: one(organizations, {
    fields: [grantCloseoutItems.orgId],
    references: [organizations.id],
  }),
  grant: one(grants, { fields: [grantCloseoutItems.grantId], references: [grants.id] }),
  completedByUser: one(user, { fields: [grantCloseoutItems.completedBy], references: [user.id] }),
}));

export const generatedReportRelations = relations(generatedReports, ({ one }) => ({
  organization: one(organizations, {
    fields: [generatedReports.orgId],
    references: [organizations.id],
  }),
  grant: one(grants, { fields: [generatedReports.grantId], references: [grants.id] }),
  generator: one(user, { fields: [generatedReports.generatedBy], references: [user.id] }),
}));
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @grantpipe/db typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/compliance.ts
git commit -m "feat(db): add compliance schema - reporting, metrics entries, closeout, generated reports"
```

---

## Task 6: Events & Volunteers Schema

**Files:**

- Create: `packages/db/src/schema/events.ts`

- [ ] **Step 1: Write the events schema**

```typescript
// packages/db/src/schema/events.ts
import { pgTable, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./auth";
import { contacts, donations } from "./contacts";

export const events = pgTable("events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  type: text("type").notNull(), // gala | fundraiser | campaign | meeting | other
  date: timestamp("date", { withTimezone: true }),
  location: text("location"),
  description: text("description"),
  revenueGoalCents: integer("revenue_goal_cents"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const eventAttendees = pgTable("event_attendees", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  eventId: text("event_id")
    .notNull()
    .references(() => events.id),
  contactId: text("contact_id")
    .notNull()
    .references(() => contacts.id),
  rsvpStatus: text("rsvp_status").notNull().default("invited"), // invited | confirmed | attended | declined
  donationId: text("donation_id").references(() => donations.id),
});

export const volunteerHours = pgTable("volunteer_hours", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  contactId: text("contact_id")
    .notNull()
    .references(() => contacts.id),
  eventId: text("event_id").references(() => events.id),
  program: text("program"),
  hours: numeric("hours").notNull(),
  date: timestamp("date", { withTimezone: true }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// =============================================================================
// Relations
// =============================================================================

export const eventRelations = relations(events, ({ one, many }) => ({
  organization: one(organizations, { fields: [events.orgId], references: [organizations.id] }),
  attendees: many(eventAttendees),
  volunteerHours: many(volunteerHours),
}));

export const eventAttendeeRelations = relations(eventAttendees, ({ one }) => ({
  event: one(events, { fields: [eventAttendees.eventId], references: [events.id] }),
  contact: one(contacts, { fields: [eventAttendees.contactId], references: [contacts.id] }),
  donation: one(donations, { fields: [eventAttendees.donationId], references: [donations.id] }),
}));

export const volunteerHourRelations = relations(volunteerHours, ({ one }) => ({
  organization: one(organizations, {
    fields: [volunteerHours.orgId],
    references: [organizations.id],
  }),
  contact: one(contacts, { fields: [volunteerHours.contactId], references: [contacts.id] }),
  event: one(events, { fields: [volunteerHours.eventId], references: [events.id] }),
}));
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @grantpipe/db typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/events.ts
git commit -m "feat(db): add events, attendees, volunteer hours schema"
```

---

## Task 7: Infrastructure Schema

**Files:**

- Create: `packages/db/src/schema/infrastructure.ts`

- [ ] **Step 1: Write the infrastructure schema**

```typescript
// packages/db/src/schema/infrastructure.ts
import { pgTable, text, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations, user } from "./auth";
import { contacts } from "./contacts";

export const communicationLog = pgTable("communication_log", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  contactId: text("contact_id")
    .notNull()
    .references(() => contacts.id),
  type: text("type").notNull(), // note | email | call | meeting
  subject: text("subject"),
  body: text("body"),
  loggedBy: text("logged_by")
    .notNull()
    .references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const documents = pgTable("documents", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  fileKey: text("file_key").notNull(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  entityType: text("entity_type").notNull(), // contact | grant | donation | funder
  entityId: text("entity_id").notNull(),
  uploadedBy: text("uploaded_by")
    .notNull()
    .references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const activityLog = pgTable("activity_log", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  actorId: text("actor_id")
    .notNull()
    .references(() => user.id),
  action: text("action").notNull(), // created | updated | deleted | exported | ...
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  changes: jsonb("changes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customFieldDefinitions = pgTable("custom_field_definitions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  entityType: text("entity_type").notNull(), // contact | donation | grant
  name: text("name").notNull(),
  fieldType: text("field_type").notNull(), // text | number | date | single_select | multi_select
  options: jsonb("options"), // for select types
  sortOrder: integer("sort_order").notNull().default(0),
});

export const customFieldValues = pgTable("custom_field_values", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  fieldId: text("field_id")
    .notNull()
    .references(() => customFieldDefinitions.id),
  entityId: text("entity_id").notNull(),
  value: text("value"),
});

export const notifications = pgTable("notifications", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  type: text("type").notNull(), // grant_deadline | report_due | import_complete | ...
  title: text("title").notNull(),
  body: text("body"),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationPreferences = pgTable("notification_preferences", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  notificationType: text("notification_type").notNull(),
  emailEnabled: boolean("email_enabled").notNull().default(true),
  inAppEnabled: boolean("in_app_enabled").notNull().default(true),
});

export const savedSegments = pgTable("saved_segments", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  entityType: text("entity_type").notNull(), // contact
  filters: jsonb("filters").notNull(),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// =============================================================================
// Relations
// =============================================================================

export const communicationLogRelations = relations(communicationLog, ({ one }) => ({
  organization: one(organizations, {
    fields: [communicationLog.orgId],
    references: [organizations.id],
  }),
  contact: one(contacts, { fields: [communicationLog.contactId], references: [contacts.id] }),
  logger: one(user, { fields: [communicationLog.loggedBy], references: [user.id] }),
}));

export const documentRelations = relations(documents, ({ one }) => ({
  organization: one(organizations, { fields: [documents.orgId], references: [organizations.id] }),
  uploader: one(user, { fields: [documents.uploadedBy], references: [user.id] }),
}));

export const activityLogRelations = relations(activityLog, ({ one }) => ({
  organization: one(organizations, { fields: [activityLog.orgId], references: [organizations.id] }),
  actor: one(user, { fields: [activityLog.actorId], references: [user.id] }),
}));

export const customFieldDefinitionRelations = relations(
  customFieldDefinitions,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [customFieldDefinitions.orgId],
      references: [organizations.id],
    }),
    values: many(customFieldValues),
  }),
);

export const customFieldValueRelations = relations(customFieldValues, ({ one }) => ({
  definition: one(customFieldDefinitions, {
    fields: [customFieldValues.fieldId],
    references: [customFieldDefinitions.id],
  }),
}));

export const notificationRelations = relations(notifications, ({ one }) => ({
  organization: one(organizations, {
    fields: [notifications.orgId],
    references: [organizations.id],
  }),
  user: one(user, { fields: [notifications.userId], references: [user.id] }),
}));

export const notificationPreferenceRelations = relations(notificationPreferences, ({ one }) => ({
  user: one(user, { fields: [notificationPreferences.userId], references: [user.id] }),
  organization: one(organizations, {
    fields: [notificationPreferences.orgId],
    references: [organizations.id],
  }),
}));

export const savedSegmentRelations = relations(savedSegments, ({ one }) => ({
  organization: one(organizations, {
    fields: [savedSegments.orgId],
    references: [organizations.id],
  }),
  creator: one(user, { fields: [savedSegments.createdBy], references: [user.id] }),
}));
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @grantpipe/db typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/infrastructure.ts
git commit -m "feat(db): add infrastructure schema - comms, docs, activity, custom fields, notifications, segments"
```

---

## Task 8: Schema Index & Migration

**Files:**

- Modify: `packages/db/src/schema/index.ts`

**Depends on:** Tasks 2-7

- [ ] **Step 1: Update the schema index to re-export all tables and relations**

```typescript
// packages/db/src/schema/index.ts
export * from "./auth";
export * from "./contacts";
export * from "./grants";
export * from "./compliance";
export * from "./events";
export * from "./infrastructure";
```

- [ ] **Step 2: Verify full typecheck**

```bash
pnpm --filter @grantpipe/db typecheck
```

Expected: PASS.

- [ ] **Step 3: Generate migration**

```bash
pnpm --filter @grantpipe/db generate
```

Expected: Drizzle Kit generates a SQL migration file in `packages/db/src/migrations/`. Inspect it to confirm all 28+ tables are present.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/index.ts packages/db/src/migrations/
git commit -m "feat(db): re-export all schema tables and generate initial migration"
```

---

## Task 9: Auth & Onboarding Validators

**Files:**

- Create: `packages/shared/src/validators/auth.ts`
- Create: `packages/shared/src/validators/auth.test.ts`
- Modify: `packages/shared/src/validators/index.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/shared/src/validators/auth.test.ts
import { describe, it, expect } from "vitest";
import { signupSchema, loginSchema, onboardingSchema, createInviteSchema } from "./auth";

describe("signupSchema", () => {
  it("accepts valid name, email, password", () => {
    const result = signupSchema.safeParse({
      name: "Angel Campa",
      email: "angel@grantpipe.com",
      password: "secureP@ss123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = signupSchema.safeParse({
      name: "",
      email: "a@b.com",
      password: "secureP@ss123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = signupSchema.safeParse({
      name: "Test",
      email: "not-an-email",
      password: "secureP@ss123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password shorter than 8 characters", () => {
    const result = signupSchema.safeParse({
      name: "Test",
      email: "a@b.com",
      password: "short",
    });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts valid email and password", () => {
    const result = loginSchema.safeParse({
      email: "angel@grantpipe.com",
      password: "secureP@ss123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing password", () => {
    const result = loginSchema.safeParse({ email: "a@b.com" });
    expect(result.success).toBe(false);
  });
});

describe("onboardingSchema", () => {
  it("accepts valid org setup data", () => {
    const result = onboardingSchema.safeParse({
      orgName: "Hope Foundation",
      fiscalYearStartMonth: 7,
      timezone: "America/Chicago",
    });
    expect(result.success).toBe(true);
  });

  it("rejects fiscal month outside 1-12", () => {
    const result = onboardingSchema.safeParse({
      orgName: "Test",
      fiscalYearStartMonth: 13,
      timezone: "America/Chicago",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty org name", () => {
    const result = onboardingSchema.safeParse({
      orgName: "",
      fiscalYearStartMonth: 1,
      timezone: "UTC",
    });
    expect(result.success).toBe(false);
  });
});

describe("createInviteSchema", () => {
  it("accepts valid role", () => {
    const result = createInviteSchema.safeParse({ role: "editor" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid role", () => {
    const result = createInviteSchema.safeParse({ role: "superadmin" });
    expect(result.success).toBe(false);
  });

  it("defaults to viewer when omitted", () => {
    const result = createInviteSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe("viewer");
    }
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
pnpm --filter @grantpipe/shared test -- --run src/validators/auth.test.ts
```

Expected: FAIL - module `./auth` not found.

- [ ] **Step 3: Write the validator implementations**

```typescript
// packages/shared/src/validators/auth.ts
import { z } from "zod";

export const signupSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const onboardingSchema = z.object({
  orgName: z.string().min(1, "Organization name is required").max(200),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  timezone: z.string().min(1, "Timezone is required"),
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const createInviteSchema = z.object({
  role: z.enum(["admin", "editor", "viewer"]).default("viewer"),
});
export type CreateInviteInput = z.infer<typeof createInviteSchema>;
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter @grantpipe/shared test -- --run src/validators/auth.test.ts
```

Expected: All 9 tests PASS.

- [ ] **Step 5: Update validators index**

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
```

- [ ] **Step 6: Run full test suite with coverage**

```bash
pnpm --filter @grantpipe/shared test:coverage
```

Expected: PASS with â‰¥95% coverage on `auth.ts`.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/validators/auth.ts packages/shared/src/validators/auth.test.ts packages/shared/src/validators/index.ts
git commit -m "feat(shared): add auth and onboarding Zod validators"
```

---

## Task 10: Web Test Infrastructure

**Files:**

- Create: `apps/web/vitest.config.ts`
- Modify: `apps/web/package.json` (add test scripts)

- [ ] **Step 1: Create vitest config for React**

```typescript
// apps/web/vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "happy-dom",
    coverage: {
      provider: "v8",
      thresholds: { lines: 95, functions: 95, branches: 95, statements: 95 },
    },
  },
});
```

- [ ] **Step 2: Add test scripts to package.json**

Add to `apps/web/package.json` scripts:

```json
{
  "test": "vitest run",
  "test:watch": "vitest watch",
  "test:coverage": "vitest run --coverage"
}
```

- [ ] **Step 3: Verify vitest runs**

```bash
pnpm --filter @grantpipe/web test
```

Expected: PASS (no test files yet, but vitest exits cleanly).

- [ ] **Step 4: Commit**

```bash
git add apps/web/vitest.config.ts apps/web/package.json
git commit -m "chore(web): add vitest config with happy-dom for React testing"
```

---

## Task 11: API Types & Better Auth Config

**Files:**

- Create: `apps/api/src/types.ts`
- Create: `apps/api/src/lib/auth.ts`

**Depends on:** Tasks 1, 8

- [ ] **Step 1: Define Hono environment types**

```typescript
// apps/api/src/types.ts
import type { Database } from "@grantpipe/db";
import type { Role } from "@grantpipe/shared";

export type Bindings = {
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  APP_URL: string;
};

export type Variables = {
  db: Database;
  user: { id: string; email: string; name: string } | null;
  session: { id: string; userId: string; token: string } | null;
  orgId: string | null;
  memberRole: Role | null;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};
```

- [ ] **Step 2: Create Better Auth factory**

```typescript
// apps/api/src/lib/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Database } from "@grantpipe/db";
import * as schema from "@grantpipe/db";
import type { Bindings } from "../types";

export function createAuth(db: Database, env: Bindings) {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.APP_URL,
    basePath: "/api/auth",
    emailAndPassword: {
      enabled: true,
    },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm --filter @grantpipe/api typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/types.ts apps/api/src/lib/auth.ts
git commit -m "feat(api): add Hono env types and Better Auth factory"
```

---

## Task 12: Error Handler Middleware

**Files:**

- Create: `apps/api/src/middleware/error-handler.ts`
- Create: `apps/api/src/middleware/error-handler.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// apps/api/src/middleware/error-handler.test.ts
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { errorHandler } from "./error-handler";

describe("errorHandler", () => {
  function createApp() {
    const app = new Hono();
    app.onError(errorHandler);
    return app;
  }

  it("converts HTTPException to JSON error", async () => {
    const app = createApp();
    app.get("/test", () => {
      throw new HTTPException(403, { message: "Forbidden" });
    });

    const res = await app.request("/test");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "Forbidden" });
  });

  it("converts unknown errors to 500", async () => {
    const app = createApp();
    app.get("/test", () => {
      throw new Error("unexpected");
    });

    const res = await app.request("/test");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Internal Server Error" });
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pnpm --filter @grantpipe/api test -- --run src/middleware/error-handler.test.ts
```

Expected: FAIL - module not found.

- [ ] **Step 3: Implement error handler**

```typescript
// apps/api/src/middleware/error-handler.ts
import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal Server Error" }, 500);
};
```

- [ ] **Step 4: Run test to confirm pass**

```bash
pnpm --filter @grantpipe/api test -- --run src/middleware/error-handler.test.ts
```

Expected: All 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/middleware/error-handler.ts apps/api/src/middleware/error-handler.test.ts
git commit -m "feat(api): add error handler middleware with JSON responses"
```

---

## Task 13: Session Middleware

**Files:**

- Create: `apps/api/src/middleware/session.ts`
- Create: `apps/api/src/middleware/session.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/api/src/middleware/session.test.ts
import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { createSessionMiddleware } from "./session";

function createTestApp(mockGetSession: ReturnType<typeof vi.fn>) {
  const app = new Hono();
  app.use("*", createSessionMiddleware(mockGetSession));
  app.get("/test", (c) => {
    return c.json({
      userId: c.get("user")?.id ?? null,
      sessionId: c.get("session")?.id ?? null,
    });
  });
  return app;
}

describe("sessionMiddleware", () => {
  it("returns 401 when no session exists", async () => {
    const mockGetSession = vi.fn().mockResolvedValue(null);
    const app = createTestApp(mockGetSession);

    const res = await app.request("/test");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("sets user and session on context when session is valid", async () => {
    const mockGetSession = vi.fn().mockResolvedValue({
      user: { id: "user-1", email: "test@test.com", name: "Test" },
      session: { id: "session-1", userId: "user-1", token: "tok" },
    });
    const app = createTestApp(mockGetSession);

    const res = await app.request("/test");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ userId: "user-1", sessionId: "session-1" });
  });

  it("passes request headers to getSession", async () => {
    const mockGetSession = vi.fn().mockResolvedValue(null);
    const app = createTestApp(mockGetSession);

    await app.request("/test", {
      headers: { cookie: "session=abc" },
    });

    expect(mockGetSession).toHaveBeenCalledTimes(1);
    const passedHeaders = mockGetSession.mock.calls[0][0];
    expect(passedHeaders.get("cookie")).toBe("session=abc");
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pnpm --filter @grantpipe/api test -- --run src/middleware/session.test.ts
```

Expected: FAIL - module not found.

- [ ] **Step 3: Implement session middleware**

The middleware accepts a `getSession` function for testability. In production, this is wired to `auth.api.getSession`. In tests, it's a mock.

```typescript
// apps/api/src/middleware/session.ts
import { createMiddleware } from "hono/factory";

type SessionUser = { id: string; email: string; name: string };
type SessionData = { id: string; userId: string; token: string };
type GetSessionFn = (
  headers: Headers,
) => Promise<{ user: SessionUser; session: SessionData } | null>;

export function createSessionMiddleware(getSession: GetSessionFn) {
  return createMiddleware<{
    Variables: {
      user: SessionUser | null;
      session: SessionData | null;
    };
  }>(async (c, next) => {
    const result = await getSession(c.req.raw.headers);

    if (!result) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("user", result.user);
    c.set("session", result.session);
    await next();
  });
}
```

- [ ] **Step 4: Run test to confirm pass**

```bash
pnpm --filter @grantpipe/api test -- --run src/middleware/session.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/middleware/session.ts apps/api/src/middleware/session.test.ts
git commit -m "feat(api): add session middleware with injectable getSession"
```

---

## Task 14: Org Context Middleware

**Files:**

- Create: `apps/api/src/middleware/org-context.ts`
- Create: `apps/api/src/middleware/org-context.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/api/src/middleware/org-context.test.ts
import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { createOrgContextMiddleware } from "./org-context";

type MockMember = { orgId: string; role: string; deletedAt: null | string } | undefined;

function createTestApp(mockFindMember: ReturnType<typeof vi.fn>) {
  const app = new Hono<{
    Variables: {
      user: { id: string; email: string; name: string } | null;
      session: { id: string; userId: string; token: string } | null;
      orgId: string | null;
      memberRole: string | null;
    };
  }>();

  // Simulate session middleware already ran
  app.use("*", async (c, next) => {
    c.set("user", { id: "user-1", email: "t@t.com", name: "Test" });
    c.set("session", { id: "s-1", userId: "user-1", token: "tok" });
    await next();
  });

  app.use("*", createOrgContextMiddleware(mockFindMember));

  app.get("/test", (c) => {
    return c.json({
      orgId: c.get("orgId"),
      memberRole: c.get("memberRole"),
    });
  });
  return app;
}

describe("orgContextMiddleware", () => {
  it("returns 403 when user has no org membership", async () => {
    const mockFindMember = vi.fn().mockResolvedValue(undefined);
    const app = createTestApp(mockFindMember);

    const res = await app.request("/test");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "No organization membership" });
  });

  it("sets orgId and memberRole when membership exists", async () => {
    const mockFindMember = vi.fn().mockResolvedValue({
      orgId: "org-1",
      role: "admin",
      deletedAt: null,
    });
    const app = createTestApp(mockFindMember);

    const res = await app.request("/test");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ orgId: "org-1", memberRole: "admin" });
  });

  it("queries with the correct user ID", async () => {
    const mockFindMember = vi.fn().mockResolvedValue({
      orgId: "org-1",
      role: "viewer",
      deletedAt: null,
    });
    const app = createTestApp(mockFindMember);

    await app.request("/test");
    expect(mockFindMember).toHaveBeenCalledWith("user-1");
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pnpm --filter @grantpipe/api test -- --run src/middleware/org-context.test.ts
```

Expected: FAIL - module not found.

- [ ] **Step 3: Implement org context middleware**

```typescript
// apps/api/src/middleware/org-context.ts
import { createMiddleware } from "hono/factory";

type MemberRecord = { orgId: string; role: string; deletedAt: null | string } | undefined;
type FindMemberFn = (userId: string) => Promise<MemberRecord>;

export function createOrgContextMiddleware(findMember: FindMemberFn) {
  return createMiddleware<{
    Variables: {
      user: { id: string; email: string; name: string } | null;
      orgId: string | null;
      memberRole: string | null;
    };
  }>(async (c, next) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "No organization membership" }, 403);
    }

    const member = await findMember(user.id);
    if (!member || member.deletedAt !== null) {
      return c.json({ error: "No organization membership" }, 403);
    }

    c.set("orgId", member.orgId);
    c.set("memberRole", member.role);
    await next();
  });
}
```

- [ ] **Step 4: Run test to confirm pass**

```bash
pnpm --filter @grantpipe/api test -- --run src/middleware/org-context.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/middleware/org-context.ts apps/api/src/middleware/org-context.test.ts
git commit -m "feat(api): add org context middleware with injectable member lookup"
```

---

## Task 15: requireRole Middleware

**Files:**

- Create: `apps/api/src/middleware/require-role.ts`
- Create: `apps/api/src/middleware/require-role.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/api/src/middleware/require-role.test.ts
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { requireRole } from "./require-role";
import type { Role } from "@grantpipe/shared";

function createTestApp(requiredRole: Role, userRole: Role | null) {
  const app = new Hono<{
    Variables: {
      memberRole: Role | null;
    };
  }>();

  app.use("*", async (c, next) => {
    c.set("memberRole", userRole);
    await next();
  });

  app.use("*", requireRole(requiredRole));
  app.get("/test", (c) => c.json({ ok: true }));
  return app;
}

describe("requireRole", () => {
  it("allows admin to access admin routes", async () => {
    const app = createTestApp("admin", "admin");
    const res = await app.request("/test");
    expect(res.status).toBe(200);
  });

  it("allows admin to access editor routes", async () => {
    const app = createTestApp("editor", "admin");
    const res = await app.request("/test");
    expect(res.status).toBe(200);
  });

  it("allows admin to access viewer routes", async () => {
    const app = createTestApp("viewer", "admin");
    const res = await app.request("/test");
    expect(res.status).toBe(200);
  });

  it("allows editor to access editor routes", async () => {
    const app = createTestApp("editor", "editor");
    const res = await app.request("/test");
    expect(res.status).toBe(200);
  });

  it("allows editor to access viewer routes", async () => {
    const app = createTestApp("viewer", "editor");
    const res = await app.request("/test");
    expect(res.status).toBe(200);
  });

  it("blocks editor from admin routes", async () => {
    const app = createTestApp("admin", "editor");
    const res = await app.request("/test");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "Forbidden" });
  });

  it("blocks viewer from editor routes", async () => {
    const app = createTestApp("editor", "viewer");
    const res = await app.request("/test");
    expect(res.status).toBe(403);
  });

  it("blocks viewer from admin routes", async () => {
    const app = createTestApp("admin", "viewer");
    const res = await app.request("/test");
    expect(res.status).toBe(403);
  });

  it("returns 403 when no role on context", async () => {
    const app = createTestApp("viewer", null);
    const res = await app.request("/test");
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pnpm --filter @grantpipe/api test -- --run src/middleware/require-role.test.ts
```

Expected: FAIL - module not found.

- [ ] **Step 3: Implement requireRole**

```typescript
// apps/api/src/middleware/require-role.ts
import { createMiddleware } from "hono/factory";
import { type Role, ROLE_HIERARCHY } from "@grantpipe/shared";

export function requireRole(minimumRole: Role) {
  return createMiddleware<{
    Variables: { memberRole: Role | null };
  }>(async (c, next) => {
    const userRole = c.get("memberRole");

    if (!userRole || ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY[minimumRole]) {
      return c.json({ error: "Forbidden" }, 403);
    }

    await next();
  });
}
```

- [ ] **Step 4: Run test to confirm pass**

```bash
pnpm --filter @grantpipe/api test -- --run src/middleware/require-role.test.ts
```

Expected: All 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/middleware/require-role.ts apps/api/src/middleware/require-role.test.ts
git commit -m "feat(api): add requireRole middleware with hierarchical role check"
```

---

## Task 16: Auth Service

**Files:**

- Create: `apps/api/src/domains/auth/service.ts`
- Create: `apps/api/src/domains/auth/service.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/api/src/domains/auth/service.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOrgForUser, generateInviteToken, acceptInvite } from "./service";

function createMockDb() {
  return {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "org-1" }]),
      }),
    }),
    query: {
      inviteLinks: {
        findFirst: vi.fn(),
      },
    },
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  };
}

describe("createOrgForUser", () => {
  it("creates an organization and org_member with admin role", async () => {
    const db = createMockDb();
    const insertCalls: Array<{ table: string; values: Record<string, unknown> }> = [];

    db.insert.mockImplementation((table: unknown) => ({
      values: (vals: Record<string, unknown>) => {
        insertCalls.push({ table: (table as { _: { name: string } })._.name, values: vals });
        return {
          returning: vi.fn().mockResolvedValue([{ id: "org-1", slug: "test-org" }]),
        };
      },
    }));

    const result = await createOrgForUser(db as never, {
      userId: "user-1",
      userName: "Test User",
    });

    expect(result.id).toBe("org-1");
    expect(insertCalls.length).toBe(2);
    expect(insertCalls[0]!.table).toBe("organizations");
    expect(insertCalls[0]!.values).toMatchObject({
      name: "Test User's Organization",
    });
    expect(insertCalls[1]!.table).toBe("org_members");
    expect(insertCalls[1]!.values).toMatchObject({
      orgId: "org-1",
      userId: "user-1",
      role: "admin",
    });
  });
});

describe("generateInviteToken", () => {
  it("returns a 48-character hex token", () => {
    const token = generateInviteToken();
    expect(token).toMatch(/^[a-f0-9]{48}$/);
  });

  it("generates unique tokens", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a).not.toBe(b);
  });
});

describe("acceptInvite", () => {
  it("returns error when token not found", async () => {
    const db = createMockDb();
    db.query.inviteLinks.findFirst.mockResolvedValue(undefined);

    const result = await acceptInvite(db as never, { token: "bad-token", userId: "user-1" });
    expect(result).toEqual({ error: "Invalid or expired invite link" });
  });

  it("returns error when token is expired", async () => {
    const db = createMockDb();
    db.query.inviteLinks.findFirst.mockResolvedValue({
      id: "inv-1",
      orgId: "org-1",
      role: "editor",
      expiresAt: new Date("2020-01-01"),
      usedBy: null,
    });

    const result = await acceptInvite(db as never, { token: "expired", userId: "user-1" });
    expect(result).toEqual({ error: "Invalid or expired invite link" });
  });

  it("returns error when token already used", async () => {
    const db = createMockDb();
    db.query.inviteLinks.findFirst.mockResolvedValue({
      id: "inv-1",
      orgId: "org-1",
      role: "editor",
      expiresAt: new Date("2099-01-01"),
      usedBy: "other-user",
    });

    const result = await acceptInvite(db as never, { token: "used", userId: "user-1" });
    expect(result).toEqual({ error: "Invalid or expired invite link" });
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pnpm --filter @grantpipe/api test -- --run src/domains/auth/service.test.ts
```

Expected: FAIL - module not found.

- [ ] **Step 3: Implement auth service**

```typescript
// apps/api/src/domains/auth/service.ts
import { eq, and, isNull } from "drizzle-orm";
import { organizations, orgMembers, inviteLinks } from "@grantpipe/db";
import type { Database } from "@grantpipe/db";

export async function createOrgForUser(db: Database, input: { userId: string; userName: string }) {
  const slug =
    input.userName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) +
    "-" +
    Date.now().toString(36);

  const [org] = await db
    .insert(organizations)
    .values({
      name: `${input.userName}'s Organization`,
      slug,
    })
    .returning();

  await db.insert(orgMembers).values({
    orgId: org!.id,
    userId: input.userId,
    role: "admin",
  });

  return org!;
}

export function generateInviteToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function acceptInvite(
  db: Database,
  input: { token: string; userId: string },
): Promise<{ orgId: string; role: string } | { error: string }> {
  const invite = await db.query.inviteLinks.findFirst({
    where: eq(inviteLinks.token, input.token),
  });

  if (!invite || invite.usedBy || invite.expiresAt < new Date()) {
    return { error: "Invalid or expired invite link" };
  }

  await db.insert(orgMembers).values({
    orgId: invite.orgId,
    userId: input.userId,
    role: invite.role,
    invitedBy: invite.createdBy,
  });

  await db
    .update(inviteLinks)
    .set({ usedBy: input.userId, usedAt: new Date() })
    .where(eq(inviteLinks.id, invite.id));

  return { orgId: invite.orgId, role: invite.role };
}
```

- [ ] **Step 4: Run test to confirm pass**

```bash
pnpm --filter @grantpipe/api test -- --run src/domains/auth/service.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/auth/service.ts apps/api/src/domains/auth/service.test.ts
git commit -m "feat(api): add auth service - org creation, invite tokens, invite acceptance"
```

---

## Task 17: Auth Routes

**Files:**

- Create: `apps/api/src/domains/auth/routes.ts`
- Create: `apps/api/src/domains/auth/routes.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/api/src/domains/auth/routes.test.ts
import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { authRoutes } from "./routes";

describe("GET /auth/session", () => {
  it("returns user and session from context", async () => {
    const app = new Hono();

    // Simulate middleware populating context
    app.use("*", async (c, next) => {
      c.set("user", { id: "u-1", email: "a@b.com", name: "Test" });
      c.set("session", { id: "s-1", userId: "u-1", token: "tok" });
      c.set("orgId", "org-1");
      c.set("memberRole", "admin");
      await next();
    });

    app.route("/auth", authRoutes);

    const res = await app.request("/auth/session");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.id).toBe("u-1");
    expect(body.orgId).toBe("org-1");
    expect(body.memberRole).toBe("admin");
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pnpm --filter @grantpipe/api test -- --run src/domains/auth/routes.test.ts
```

Expected: FAIL - module not found.

- [ ] **Step 3: Implement auth routes**

```typescript
// apps/api/src/domains/auth/routes.ts
import { Hono } from "hono";
import type { AppEnv } from "../../types";

export const authRoutes = new Hono<AppEnv>().get("/session", (c) => {
  const user = c.get("user");
  const session = c.get("session");
  const orgId = c.get("orgId");
  const memberRole = c.get("memberRole");

  return c.json({
    user,
    session: { id: session?.id },
    orgId,
    memberRole,
  });
});
```

- [ ] **Step 4: Run test to confirm pass**

```bash
pnpm --filter @grantpipe/api test -- --run src/domains/auth/routes.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/auth/routes.ts apps/api/src/domains/auth/routes.test.ts
git commit -m "feat(api): add auth routes - session endpoint"
```

---

## Task 18: Onboarding Service & Routes

**Files:**

- Create: `apps/api/src/domains/onboarding/service.ts`
- Create: `apps/api/src/domains/onboarding/service.test.ts`
- Create: `apps/api/src/domains/onboarding/routes.ts`
- Create: `apps/api/src/domains/onboarding/routes.test.ts`

- [ ] **Step 1: Write failing service tests**

```typescript
// apps/api/src/domains/onboarding/service.test.ts
import { describe, it, expect, vi } from "vitest";
import { getOnboardingStatus, completeOnboarding } from "./service";

function createMockDb() {
  return {
    query: {
      organizations: {
        findFirst: vi.fn(),
      },
    },
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: "org-1",
              name: "Hope Foundation",
              onboardingCompleted: true,
            },
          ]),
        }),
      }),
    }),
  };
}

describe("getOnboardingStatus", () => {
  it("returns completed=true when org has completed onboarding", async () => {
    const db = createMockDb();
    db.query.organizations.findFirst.mockResolvedValue({
      id: "org-1",
      onboardingCompleted: true,
      name: "My Org",
    });

    const result = await getOnboardingStatus(db as never, "org-1");
    expect(result).toEqual({ completed: true });
  });

  it("returns completed=false when org has not completed onboarding", async () => {
    const db = createMockDb();
    db.query.organizations.findFirst.mockResolvedValue({
      id: "org-1",
      onboardingCompleted: false,
      name: "My Org",
    });

    const result = await getOnboardingStatus(db as never, "org-1");
    expect(result).toEqual({ completed: false });
  });
});

describe("completeOnboarding", () => {
  it("updates org name, fiscal year, timezone, and marks onboarding complete", async () => {
    const db = createMockDb();
    const setCalls: Record<string, unknown>[] = [];

    db.update.mockReturnValue({
      set: (vals: Record<string, unknown>) => {
        setCalls.push(vals);
        return {
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: "org-1",
                name: "Hope Foundation",
                onboardingCompleted: true,
              },
            ]),
          }),
        };
      },
    });

    const result = await completeOnboarding(db as never, {
      orgId: "org-1",
      orgName: "Hope Foundation",
      fiscalYearStartMonth: 7,
      timezone: "America/Chicago",
    });

    expect(setCalls[0]).toMatchObject({
      name: "Hope Foundation",
      fiscalYearStartMonth: 7,
      timezone: "America/Chicago",
      onboardingCompleted: true,
    });
    expect(result.name).toBe("Hope Foundation");
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pnpm --filter @grantpipe/api test -- --run src/domains/onboarding/service.test.ts
```

Expected: FAIL - module not found.

- [ ] **Step 3: Implement onboarding service**

```typescript
// apps/api/src/domains/onboarding/service.ts
import { eq } from "drizzle-orm";
import { organizations } from "@grantpipe/db";
import type { Database } from "@grantpipe/db";

export async function getOnboardingStatus(db: Database, orgId: string) {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: { onboardingCompleted: true },
  });
  return { completed: org?.onboardingCompleted ?? false };
}

export async function completeOnboarding(
  db: Database,
  input: {
    orgId: string;
    orgName: string;
    fiscalYearStartMonth: number;
    timezone: string;
  },
) {
  const [updated] = await db
    .update(organizations)
    .set({
      name: input.orgName,
      fiscalYearStartMonth: input.fiscalYearStartMonth,
      timezone: input.timezone,
      onboardingCompleted: true,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, input.orgId))
    .returning();

  return updated!;
}
```

- [ ] **Step 4: Run service tests to confirm pass**

```bash
pnpm --filter @grantpipe/api test -- --run src/domains/onboarding/service.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Write failing route tests**

```typescript
// apps/api/src/domains/onboarding/routes.test.ts
import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";

// Mock the service module
vi.mock("./service", () => ({
  getOnboardingStatus: vi.fn(),
  completeOnboarding: vi.fn(),
}));

import { onboardingRoutes } from "./routes";
import { getOnboardingStatus, completeOnboarding } from "./service";

function createTestApp() {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("db", {} as never);
    c.set("orgId", "org-1");
    c.set("memberRole", "admin");
    await next();
  });
  app.route("/onboarding", onboardingRoutes);
  return app;
}

describe("GET /onboarding/status", () => {
  it("returns onboarding status", async () => {
    vi.mocked(getOnboardingStatus).mockResolvedValue({ completed: false });
    const app = createTestApp();

    const res = await app.request("/onboarding/status");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ completed: false });
  });
});

describe("PATCH /onboarding", () => {
  it("completes onboarding with valid input", async () => {
    vi.mocked(completeOnboarding).mockResolvedValue({
      id: "org-1",
      name: "Hope Foundation",
      onboardingCompleted: true,
    } as never);
    const app = createTestApp();

    const res = await app.request("/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgName: "Hope Foundation",
        fiscalYearStartMonth: 7,
        timezone: "America/Chicago",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Hope Foundation");
  });

  it("rejects invalid input with 400", async () => {
    const app = createTestApp();

    const res = await app.request("/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgName: "", fiscalYearStartMonth: 13, timezone: "" }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 6: Run route tests to confirm failure**

```bash
pnpm --filter @grantpipe/api test -- --run src/domains/onboarding/routes.test.ts
```

Expected: FAIL - module not found.

- [ ] **Step 7: Implement onboarding routes**

```typescript
// apps/api/src/domains/onboarding/routes.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { onboardingSchema } from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { getOnboardingStatus, completeOnboarding } from "./service";

export const onboardingRoutes = new Hono<AppEnv>()
  .get("/status", async (c) => {
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const result = await getOnboardingStatus(db, orgId);
    return c.json(result);
  })
  .patch("/", zValidator("json", onboardingSchema), async (c) => {
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const input = c.req.valid("json");

    const org = await completeOnboarding(db, {
      orgId,
      orgName: input.orgName,
      fiscalYearStartMonth: input.fiscalYearStartMonth,
      timezone: input.timezone,
    });

    return c.json(org);
  });
```

- [ ] **Step 8: Run route tests to confirm pass**

```bash
pnpm --filter @grantpipe/api test -- --run src/domains/onboarding/routes.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 9: Run full API test suite**

```bash
pnpm --filter @grantpipe/api test:coverage
```

Expected: PASS with â‰¥95% coverage on all new files.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/domains/onboarding/
git commit -m "feat(api): add onboarding service and routes - status check + org setup"
```

---

## Task 19: App Composition

**Files:**

- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/app.test.ts`

**Depends on:** Tasks 11-18

- [ ] **Step 1: Write failing tests for updated app**

```typescript
// apps/api/src/app.test.ts
import { describe, it, expect, vi } from "vitest";

// Mock Better Auth - we don't want real auth in unit tests
vi.mock("./lib/auth", () => ({
  createAuth: () => ({
    handler: () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
  }),
}));

import { app } from "./app";

describe("API app", () => {
  it("mounts health route at /api/health", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });

  it("returns 404 for unknown routes", async () => {
    const res = await app.request("/api/nonexistent");
    expect(res.status).toBe(404);
  });

  it("returns 401 for protected routes without session", async () => {
    const res = await app.request("/api/auth/session");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Update app.ts with full middleware chain**

```typescript
// apps/api/src/app.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createDb } from "@grantpipe/db/client";
import type { AppEnv } from "./types";
import { createAuth } from "./lib/auth";
import { errorHandler } from "./middleware/error-handler";
import { createSessionMiddleware } from "./middleware/session";
import { createOrgContextMiddleware } from "./middleware/org-context";
import { healthRoutes } from "./domains/health/routes";
import { authRoutes } from "./domains/auth/routes";
import { onboardingRoutes } from "./domains/onboarding/routes";
import { orgMembers } from "@grantpipe/db";
import { eq, isNull, and } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Public routes - no session required
// ---------------------------------------------------------------------------
const publicRoutes = new Hono<AppEnv>()
  .route("/health", healthRoutes)
  .on(["POST", "GET"], "/auth/better/*", async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    const auth = createAuth(db, c.env);
    return auth.handler(c.req.raw);
  });

// ---------------------------------------------------------------------------
// Protected routes - session + org context required
// ---------------------------------------------------------------------------
const protectedRoutes = new Hono<AppEnv>().use(
  "*",
  createSessionMiddleware(async (headers) => {
    // This gets overridden per-request in the init middleware below
    // The actual wiring happens in the main app's middleware chain
    return null;
  }),
);

// ---------------------------------------------------------------------------
// Main app
// ---------------------------------------------------------------------------
const app = new Hono<AppEnv>()
  .basePath("/api")
  .onError(errorHandler)
  .use("*", async (c, next) => {
    // CORS
    const corsHandler = cors({ origin: c.env.APP_URL, credentials: true });
    return corsHandler(c, next);
  })
  .use("*", async (c, next) => {
    // Initialize DB on context for all routes
    const db = createDb(c.env.DATABASE_URL);
    c.set("db", db);
    await next();
  })
  // Public - no auth
  .route("/health", healthRoutes)
  .on(["POST", "GET"], "/auth/better/*", async (c) => {
    const db = c.get("db");
    const auth = createAuth(db, c.env);
    return auth.handler(c.req.raw);
  })
  // Protected - session required
  .use("*", async (c, next) => {
    const db = c.get("db");
    const auth = createAuth(db, c.env);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });

    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("user", session.user as AppEnv["Variables"]["user"]);
    c.set("session", session.session as AppEnv["Variables"]["session"]);
    await next();
  })
  // Org context
  .use("*", async (c, next) => {
    const db = c.get("db");
    const userId = c.get("user")!.id;

    const member = await db.query.orgMembers.findFirst({
      where: and(eq(orgMembers.userId, userId), isNull(orgMembers.deletedAt)),
    });

    if (!member) {
      return c.json({ error: "No organization membership" }, 403);
    }

    c.set("orgId", member.orgId);
    c.set("memberRole", member.role as AppEnv["Variables"]["memberRole"]);
    await next();
  })
  // Protected domain routes
  .route("/auth", authRoutes)
  .route("/onboarding", onboardingRoutes);

export type AppType = typeof app;
export { app };
export default app;
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @grantpipe/api test -- --run src/app.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 4: Run full typecheck**

```bash
pnpm --filter @grantpipe/api typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/app.test.ts
git commit -m "feat(api): wire middleware chain - CORS, session, org context, auth + onboarding routes"
```

---

## Task 20: Web Auth Client & Session Hook

**Files:**

- Create: `apps/web/src/lib/auth-client.ts`
- Create: `apps/web/src/hooks/use-session.ts`
- Create: `apps/web/src/hooks/use-session.test.ts`

- [ ] **Step 1: Create Better Auth client**

```typescript
// apps/web/src/lib/auth-client.ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: "/api/auth/better",
});

export const { signIn, signUp, signOut, useSession: useBetterAuthSession } = authClient;
```

- [ ] **Step 2: Write failing test for session hook**

```typescript
// apps/web/src/hooks/use-session.test.ts
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSession } from "./use-session";

// Mock the auth client
vi.mock("../lib/auth-client", () => ({
  useBetterAuthSession: vi.fn(),
}));

import { useBetterAuthSession } from "../lib/auth-client";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe("useSession", () => {
  it("returns loading state initially", () => {
    vi.mocked(useBetterAuthSession).mockReturnValue({
      data: null,
      isPending: true,
      error: null,
    } as never);

    const { result } = renderHook(() => useSession(), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.user).toBeNull();
  });

  it("returns user when session exists", () => {
    vi.mocked(useBetterAuthSession).mockReturnValue({
      data: {
        user: { id: "u-1", email: "a@b.com", name: "Test" },
        session: { id: "s-1" },
      },
      isPending: false,
      error: null,
    } as never);

    const { result } = renderHook(() => useSession(), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.user?.id).toBe("u-1");
  });

  it("returns null user when no session", () => {
    vi.mocked(useBetterAuthSession).mockReturnValue({
      data: null,
      isPending: false,
      error: null,
    } as never);

    const { result } = renderHook(() => useSession(), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.user).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to confirm failure**

```bash
pnpm --filter @grantpipe/web test -- --run src/hooks/use-session.test.ts
```

Expected: FAIL - module not found.

- [ ] **Step 4: Implement session hook**

```typescript
// apps/web/src/hooks/use-session.ts
import { useBetterAuthSession } from "../lib/auth-client";

export function useSession() {
  const { data, isPending, error } = useBetterAuthSession();

  return {
    user: data?.user ?? null,
    session: data?.session ?? null,
    isLoading: isPending,
    error,
  };
}
```

- [ ] **Step 5: Run test to confirm pass**

```bash
pnpm --filter @grantpipe/web test -- --run src/hooks/use-session.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/auth-client.ts apps/web/src/hooks/use-session.ts apps/web/src/hooks/use-session.test.ts
git commit -m "feat(web): add Better Auth client and useSession hook"
```

---

## Task 21: Login Page

**Files:**

- Create: `apps/web/src/routes/login.tsx`
- Create: `apps/web/src/routes/login.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/web/src/routes/login.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { LoginPage } from "./login";

// Mock auth client
vi.mock("../lib/auth-client", () => ({
  signIn: {
    email: vi.fn().mockResolvedValue({ error: null }),
    social: vi.fn().mockResolvedValue({ error: null }),
  },
}));

// Mock TanStack Router
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({ component: undefined }),
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
    React.createElement("a", { href: to }, children),
}));

import { signIn } from "../lib/auth-client";

describe("LoginPage", () => {
  it("renders email and password fields", () => {
    render(React.createElement(LoginPage));
    expect(screen.getByLabelText(/email/i)).toBeDefined();
    expect(screen.getByLabelText(/password/i)).toBeDefined();
  });

  it("renders login button", () => {
    render(React.createElement(LoginPage));
    expect(screen.getByRole("button", { name: /sign in/i })).toBeDefined();
  });

  it("renders Google sign-in button", () => {
    render(React.createElement(LoginPage));
    expect(screen.getByRole("button", { name: /google/i })).toBeDefined();
  });

  it("renders link to signup page", () => {
    render(React.createElement(LoginPage));
    expect(screen.getByText(/create an account/i)).toBeDefined();
  });

  it("calls signIn.email with form values on submit", async () => {
    render(React.createElement(LoginPage));

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitBtn = screen.getByRole("button", { name: /sign in/i });

    fireEvent.change(emailInput, { target: { value: "a@b.com" } });
    fireEvent.change(passwordInput, { target: { value: "password123" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(signIn.email).toHaveBeenCalledWith(
        expect.objectContaining({ email: "a@b.com", password: "password123" }),
      );
    });
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pnpm --filter @grantpipe/web test -- --run src/routes/login.test.tsx
```

Expected: FAIL - module not found.

- [ ] **Step 3: Implement login page**

```tsx
// apps/web/src/routes/login.tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { signIn } from "../lib/auth-client";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn.email({
      email,
      password,
      callbackURL: "/dashboard",
    });

    setLoading(false);
    if (result.error) {
      setError(result.error.message ?? "Login failed");
    } else {
      navigate({ to: "/" });
    }
  }

  async function handleGoogleSignIn() {
    await signIn.social({
      provider: "google",
      callbackURL: "/dashboard",
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-6">
        <div className="text-center">
          <h1 className="text-2xl font-heading font-bold text-primary-800">Sign in to GrantPipe</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border px-3 py-2"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border px-3 py-2"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary-700 px-4 py-2 text-white font-medium hover:bg-primary-800 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-background px-2 text-muted-foreground">or</span>
          </div>
        </div>

        <button
          onClick={handleGoogleSignIn}
          className="w-full rounded-md border px-4 py-2 font-medium hover:bg-muted"
        >
          Continue with Google
        </button>

        <p className="text-center text-sm text-muted-foreground">
          Don't have an account?{" "}
          <Link to="/signup" className="text-primary-700 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to confirm pass**

```bash
pnpm --filter @grantpipe/web test -- --run src/routes/login.test.tsx
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/login.tsx apps/web/src/routes/login.test.tsx
git commit -m "feat(web): add login page - email/password + Google OAuth"
```

---

## Task 22: Signup Page

**Files:**

- Create: `apps/web/src/routes/signup.tsx`
- Create: `apps/web/src/routes/signup.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/web/src/routes/signup.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { SignupPage } from "./signup";

vi.mock("../lib/auth-client", () => ({
  signUp: {
    email: vi.fn().mockResolvedValue({ error: null }),
  },
  signIn: {
    social: vi.fn().mockResolvedValue({ error: null }),
  },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({ component: undefined }),
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
    React.createElement("a", { href: to }, children),
}));

import { signUp } from "../lib/auth-client";

describe("SignupPage", () => {
  it("renders name, email, and password fields", () => {
    render(React.createElement(SignupPage));
    expect(screen.getByLabelText(/name/i)).toBeDefined();
    expect(screen.getByLabelText(/email/i)).toBeDefined();
    expect(screen.getByLabelText(/password/i)).toBeDefined();
  });

  it("renders create account button", () => {
    render(React.createElement(SignupPage));
    expect(screen.getByRole("button", { name: /create account/i })).toBeDefined();
  });

  it("calls signUp.email with form values on submit", async () => {
    render(React.createElement(SignupPage));

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Test User" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "t@t.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(signUp.email).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Test User", email: "t@t.com", password: "password123" }),
      );
    });
  });

  it("renders link to login page", () => {
    render(React.createElement(SignupPage));
    expect(screen.getByText(/already have an account/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pnpm --filter @grantpipe/web test -- --run src/routes/signup.test.tsx
```

Expected: FAIL - module not found.

- [ ] **Step 3: Implement signup page**

```tsx
// apps/web/src/routes/signup.tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { signUp, signIn } from "../lib/auth-client";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

export function SignupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signUp.email({
      name,
      email,
      password,
      callbackURL: "/onboarding",
    });

    setLoading(false);
    if (result.error) {
      setError(result.error.message ?? "Signup failed");
    } else {
      navigate({ to: "/onboarding" });
    }
  }

  async function handleGoogleSignUp() {
    await signIn.social({
      provider: "google",
      callbackURL: "/onboarding",
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-6">
        <div className="text-center">
          <h1 className="text-2xl font-heading font-bold text-primary-800">
            Create your GrantPipe account
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium">
              Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border px-3 py-2"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border px-3 py-2"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="mt-1 block w-full rounded-md border px-3 py-2"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary-700 px-4 py-2 text-white font-medium hover:bg-primary-800 disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-background px-2 text-muted-foreground">or</span>
          </div>
        </div>

        <button
          onClick={handleGoogleSignUp}
          className="w-full rounded-md border px-4 py-2 font-medium hover:bg-muted"
        >
          Continue with Google
        </button>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="text-primary-700 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to confirm pass**

```bash
pnpm --filter @grantpipe/web test -- --run src/routes/signup.test.tsx
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/signup.tsx apps/web/src/routes/signup.test.tsx
git commit -m "feat(web): add signup page - name/email/password + Google OAuth"
```

---

## Task 23: Auth Guard, Onboarding & Invite Pages

**Files:**

- Create: `apps/web/src/routes/_authenticated.tsx`
- Create: `apps/web/src/routes/_authenticated.test.tsx`
- Create: `apps/web/src/routes/_authenticated/onboarding.tsx`
- Create: `apps/web/src/routes/_authenticated/onboarding.test.tsx`
- Create: `apps/web/src/routes/invite.$token.tsx`
- Create: `apps/web/src/routes/invite.$token.test.tsx`

- [ ] **Step 1: Write failing test for auth guard**

```tsx
// apps/web/src/routes/_authenticated.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { AuthenticatedLayout } from "./_authenticated";

vi.mock("../hooks/use-session", () => ({
  useSession: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({ component: undefined }),
  useNavigate: () => vi.fn(),
  Outlet: () => React.createElement("div", { "data-testid": "outlet" }, "outlet"),
  redirect: vi.fn(),
}));

import { useSession } from "../hooks/use-session";

describe("AuthenticatedLayout", () => {
  it("shows loading state when session is pending", () => {
    vi.mocked(useSession).mockReturnValue({
      user: null,
      session: null,
      isLoading: true,
      error: null,
    });

    render(React.createElement(AuthenticatedLayout));
    expect(screen.getByText(/loading/i)).toBeDefined();
  });

  it("renders outlet when user is authenticated", () => {
    vi.mocked(useSession).mockReturnValue({
      user: { id: "u-1", email: "a@b.com", name: "Test" },
      session: { id: "s-1" },
      isLoading: false,
      error: null,
    } as never);

    render(React.createElement(AuthenticatedLayout));
    expect(screen.getByTestId("outlet")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pnpm --filter @grantpipe/web test -- --run src/routes/_authenticated.test.tsx
```

Expected: FAIL - module not found.

- [ ] **Step 3: Implement auth guard layout**

```tsx
// apps/web/src/routes/_authenticated.tsx
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSession } from "../hooks/use-session";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

export function AuthenticatedLayout() {
  const { user, isLoading } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate({ to: "/login" });
    }
  }, [isLoading, user, navigate]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <Outlet />;
}
```

- [ ] **Step 4: Run auth guard test to confirm pass**

```bash
pnpm --filter @grantpipe/web test -- --run src/routes/_authenticated.test.tsx
```

Expected: All 2 tests PASS.

- [ ] **Step 5: Write failing test for onboarding page**

```tsx
// apps/web/src/routes/_authenticated/onboarding.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { OnboardingPage } from "./onboarding";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({ component: undefined }),
  useNavigate: () => vi.fn(),
}));

vi.mock("../../lib/api-client", () => ({
  api: {
    onboarding: {
      $patch: vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: "org-1", name: "Hope" }),
      }),
    },
  },
}));

describe("OnboardingPage", () => {
  it("renders org name, fiscal year, and timezone fields", () => {
    render(React.createElement(OnboardingPage));
    expect(screen.getByLabelText(/organization name/i)).toBeDefined();
    expect(screen.getByLabelText(/fiscal year/i)).toBeDefined();
    expect(screen.getByLabelText(/timezone/i)).toBeDefined();
  });

  it("renders submit button", () => {
    render(React.createElement(OnboardingPage));
    expect(screen.getByRole("button", { name: /complete setup/i })).toBeDefined();
  });
});
```

- [ ] **Step 6: Run onboarding test to confirm failure**

```bash
pnpm --filter @grantpipe/web test -- --run src/routes/_authenticated/onboarding.test.tsx
```

Expected: FAIL - module not found.

- [ ] **Step 7: Implement onboarding page**

```tsx
// apps/web/src/routes/_authenticated/onboarding.tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "../../lib/api-client";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: OnboardingPage,
});

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "UTC",
];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function OnboardingPage() {
  const navigate = useNavigate();
  const [orgName, setOrgName] = useState("");
  const [fiscalYearStartMonth, setFiscalYearStartMonth] = useState(1);
  const [timezone, setTimezone] = useState("America/New_York");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await api.onboarding.$patch({
      json: { orgName, fiscalYearStartMonth, timezone },
    });

    setLoading(false);
    if (res.ok) {
      navigate({ to: "/" });
    } else {
      setError("Failed to complete setup. Please try again.");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-6 p-6">
        <div className="text-center">
          <h1 className="text-2xl font-heading font-bold text-primary-800">
            Set up your organization
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tell us about your nonprofit to get started.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="orgName" className="block text-sm font-medium">
              Organization name
            </label>
            <input
              id="orgName"
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border px-3 py-2"
            />
          </div>

          <div>
            <label htmlFor="fiscalYear" className="block text-sm font-medium">
              Fiscal year start month
            </label>
            <select
              id="fiscalYear"
              value={fiscalYearStartMonth}
              onChange={(e) => setFiscalYearStartMonth(Number(e.target.value))}
              className="mt-1 block w-full rounded-md border px-3 py-2"
            >
              {MONTHS.map((month, i) => (
                <option key={month} value={i + 1}>
                  {month}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="timezone" className="block text-sm font-medium">
              Timezone
            </label>
            <select
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="mt-1 block w-full rounded-md border px-3 py-2"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary-700 px-4 py-2 text-white font-medium hover:bg-primary-800 disabled:opacity-50"
          >
            {loading ? "Saving..." : "Complete setup"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Write failing test for invite page**

```tsx
// apps/web/src/routes/invite.$token.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { InvitePage } from "./invite.$token";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({ component: undefined }),
  useParams: () => ({ token: "test-token-123" }),
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
    React.createElement("a", { href: to }, children),
}));

vi.mock("../hooks/use-session", () => ({
  useSession: vi.fn().mockReturnValue({
    user: null,
    isLoading: false,
    error: null,
  }),
}));

describe("InvitePage", () => {
  it("renders invite accept UI", () => {
    render(React.createElement(InvitePage));
    expect(screen.getByText(/you've been invited/i)).toBeDefined();
  });

  it("shows signup and login links when not authenticated", () => {
    render(React.createElement(InvitePage));
    expect(screen.getByText(/sign up/i)).toBeDefined();
    expect(screen.getByText(/sign in/i)).toBeDefined();
  });
});
```

- [ ] **Step 9: Implement invite page**

```tsx
// apps/web/src/routes/invite.$token.tsx
import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useSession } from "../hooks/use-session";
import { api } from "../lib/api-client";

export const Route = createFileRoute("/invite/$token")({
  component: InvitePage,
});

export function InvitePage() {
  const { token } = useParams({ from: "/invite/$token" });
  const { user, isLoading } = useSession();
  const navigate = useNavigate();
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setAccepting(true);
    setError(null);

    const res = await api.auth.invite[":token"].accept.$post({
      param: { token },
    });

    setAccepting(false);
    if (res.ok) {
      navigate({ to: "/" });
    } else {
      const body = await res.json();
      setError((body as { error?: string }).error ?? "Failed to accept invite");
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-6 text-center">
        <h1 className="text-2xl font-heading font-bold text-primary-800">
          You've been invited to GrantPipe
        </h1>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {user ? (
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="w-full rounded-md bg-primary-700 px-4 py-2 text-white font-medium hover:bg-primary-800 disabled:opacity-50"
          >
            {accepting ? "Accepting..." : "Accept invite"}
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Create an account or sign in to accept this invitation.
            </p>
            <Link
              to="/signup"
              search={{ invite: token }}
              className="block w-full rounded-md bg-primary-700 px-4 py-2 text-white font-medium hover:bg-primary-800"
            >
              Sign up
            </Link>
            <Link
              to="/login"
              search={{ invite: token }}
              className="block w-full rounded-md border px-4 py-2 font-medium hover:bg-muted"
            >
              Sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Run all frontend tests**

```bash
pnpm --filter @grantpipe/web test -- --run
```

Expected: All tests PASS.

- [ ] **Step 11: Run full typecheck**

```bash
turbo typecheck
```

Expected: PASS across all packages.

- [ ] **Step 12: Commit**

```bash
git add apps/web/src/routes/_authenticated.tsx apps/web/src/routes/_authenticated.test.tsx apps/web/src/routes/_authenticated/onboarding.tsx apps/web/src/routes/_authenticated/onboarding.test.tsx apps/web/src/routes/invite.\$token.tsx apps/web/src/routes/invite.\$token.test.tsx
git commit -m "feat(web): add auth guard layout, onboarding page, and invite accept page"
```

---

## Post-Plan Verification

After all tasks complete, run the full quality gate:

```bash
turbo typecheck
turbo test:coverage
turbo lint
pnpm format:check
```

All must pass. The codebase should now have:

- 28+ database tables defined in Drizzle schema with relations
- Better Auth integration (email/password + Google SSO)
- Session, org context, and requireRole middleware
- Auth service (org creation on signup, invite acceptance)
- Onboarding flow (API + frontend)
- Login, signup, invite, and auth guard pages
- Generated migration ready to apply
