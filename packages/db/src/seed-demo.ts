/**
 * Demo seed script — creates a realistic senior-care nonprofit account for live demos.
 * Safe to re-run (wipes existing demo org first).
 *
 * Usage (from repo root):
 *   pnpm --filter @grantpipe/db exec tsx src/seed-demo.ts
 *
 * Credentials:
 *   Email:    demo@grantpipe.com
 *   Password: Demo2026!
 *   URL:      http://localhost:3050
 */

import { randomBytes, scrypt } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import * as schema from "./schema";
import { createDbHandle, type Database } from "./client";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DATABASE_URL = "postgres://postgres:postgres@localhost:55439/grantpipe";
const DEMO_EMAIL = "demo@grantpipe.com";
const DEMO_PASSWORD = "Demo2026!";
const DEMO_NAME = "Sarah Mitchell";
const DEMO_ORG_NAME = "Heartland Senior Services";
const DEMO_ORG_SLUG = "heartland-senior-services";

// Initialized inside seed() via createDbHandle so the underlying pool can be
// closed cleanly on exit. All module-level helpers below reference `db`
// indirectly through the closure captured by seed().
let db!: Database;
let closeDb: (() => Promise<void>) | null = null;

// ---------------------------------------------------------------------------
// Password hashing — same algorithm as Better Auth (password.node.mjs)
// scrypt: N=16384, r=16, p=1, dkLen=64, format: "hex_salt:hex_key"
// ---------------------------------------------------------------------------

function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      64,
      { N: 16384, r: 16, p: 1, maxmem: 128 * 16384 * 16 * 2 },
      (err, key) => (err ? reject(err) : resolve(`${salt}:${key.toString("hex")}`)),
    );
  });
}

function cents(dollars: number) {
  return Math.round(dollars * 100);
}

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function daysAgo(days: number): Date {
  return daysFromNow(-days);
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

async function cleanup() {
  const existingOrgs = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, DEMO_ORG_SLUG));

  if (existingOrgs[0]) {
    const orgId = existingOrgs[0].id;
    console.log("Cleaning up existing demo org:", orgId);

    // Disable FK checks, delete everything scoped to this org, re-enable.
    // Safe for a local dev seed script — never run against production.
    await db.execute(sql`SET session_replication_role = replica`);
    try {
      // Tables without org_id — delete via subquery join to parent
      await db.execute(
        sql.raw(
          `DELETE FROM impact_metric_entries WHERE metric_id IN (SELECT id FROM grant_impact_metrics WHERE org_id = '${orgId}')`,
        ),
      );
      await db.execute(
        sql.raw(
          `DELETE FROM grant_fund_allocations WHERE grant_id IN (SELECT id FROM grants WHERE org_id = '${orgId}')`,
        ),
      );
      await db.execute(
        sql.raw(
          `DELETE FROM custom_field_values WHERE field_id IN (SELECT id FROM custom_field_definitions WHERE org_id = '${orgId}')`,
        ),
      );
      await db.execute(
        sql.raw(
          `DELETE FROM contact_tags WHERE contact_id IN (SELECT id FROM contacts WHERE org_id = '${orgId}')`,
        ),
      );
      await db.execute(
        sql.raw(
          `DELETE FROM event_attendees WHERE event_id IN (SELECT id FROM events WHERE org_id = '${orgId}')`,
        ),
      );

      // Tables with org_id — bulk delete
      for (const table of [
        "restriction_evidence_links",
        "restriction_releases",
        "restriction_additions",
        "restriction_balances",
        "restriction_allowed_categories",
        "restriction_allowed_programs",
        "restriction_terms",
        "grant_impact_metrics",
        "grant_closeout_items",
        "grant_reporting_requirements",
        "generated_reports",
        "report_templates",
        "expenses",
        "grants",
        "funder_contacts",
        "funders",
        "funds",
        "documents",
        "donations",
        "contacts",
        "invite_links",
        "org_members",
        "activity_log",
        "communication_log",
        "notifications",
        "notification_preferences",
        "custom_field_definitions",
        "saved_segments",
        "import_history",
        "volunteer_hours",
        "events",
        "tags",
      ]) {
        await db.execute(sql.raw(`DELETE FROM "${table}" WHERE org_id = '${orgId}'`));
      }
      await db.execute(sql.raw(`DELETE FROM organizations WHERE id = '${orgId}'`));
    } finally {
      await db.execute(sql`SET session_replication_role = DEFAULT`);
    }
  }

  const existingUsers = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, DEMO_EMAIL));
  if (existingUsers[0]) {
    const uid = existingUsers[0].id;
    await db.delete(schema.account).where(eq(schema.account.userId, uid));
    await db.delete(schema.session).where(eq(schema.session.userId, uid));
    await db.delete(schema.user).where(eq(schema.user.id, uid));
  }

  console.log("Cleanup done.");
}

// ---------------------------------------------------------------------------
// Restriction lifecycle seed — exercises the Growth+ restricted fund flows.
// Triggers four of the six alert types out of the box:
//   - release_without_support (Term A and Term C have un-evidenced releases)
//   - expired_time_restriction (Term C is past its end date with leftover)
//   - negative_restricted_balance (Term D is intentionally overdrawn)
//   - missing_evidence (Term E requires evidence and has none recorded)
// release_term_conflict and expense_term_conflict are not seeded because
// they require deliberately malformed data; QA exercises them via fixtures.
// ---------------------------------------------------------------------------

async function seedRestrictions(opts: {
  orgId: string;
  userId: string;
  fundNutritionId: string;
  grantTitleIIIId: string;
  grantPASSPORTId: string;
  grantGCFId: string;
  grantPGId: string;
}) {
  const {
    orgId,
    userId,
    fundNutritionId,
    grantTitleIIIId,
    grantPASSPORTId,
    grantGCFId,
    grantPGId,
  } = opts;

  // Demo evidence documents (referenced by evidence links below).
  const [titleIIIAgreement] = await db
    .insert(schema.documents)
    .values({
      orgId,
      fileKey: `${orgId}/seed/title-iii-grant-agreement.pdf`,
      filename: "Title III-C grant agreement.pdf",
      mimeType: "application/pdf",
      sizeBytes: 248_000,
      entityType: "grant",
      entityId: grantTitleIIIId,
      uploadedBy: userId,
    })
    .returning();

  const [passportAward] = await db
    .insert(schema.documents)
    .values({
      orgId,
      fileKey: `${orgId}/seed/passport-award-letter.pdf`,
      filename: "PASSPORT award letter.pdf",
      mimeType: "application/pdf",
      sizeBytes: 184_000,
      entityType: "grant",
      entityId: grantPASSPORTId,
      uploadedBy: userId,
    })
    .returning();

  // Pull a few expense IDs so releases can cite the underlying spend.
  const nutritionExpenses = await db
    .select({ id: schema.expenses.id })
    .from(schema.expenses)
    .where(eq(schema.expenses.fundId, fundNutritionId))
    .limit(3);
  const passportExpenses = await db
    .select({ id: schema.expenses.id })
    .from(schema.expenses)
    .where(eq(schema.expenses.grantId, grantPASSPORTId))
    .limit(2);

  // Term A — purpose-restricted nutrition program, healthy.
  const [termNutrition] = await db
    .insert(schema.restrictionTerms)
    .values({
      orgId,
      fundId: fundNutritionId,
      sourceDocumentId: titleIIIAgreement!.id,
      restrictionType: "purpose",
      source: "funder",
      title: "Title III-C senior meal program",
      purposeStatement: "Funds may only be spent on congregate and home-delivered meal programs.",
      releaseRule: "Release as program expenses are incurred each month.",
      startDate: new Date("2025-10-01"),
      beginningBalanceCents: 0,
      currency: "USD",
      evidenceRequirement: "Quarterly progress report + invoice copies",
      createdBy: userId,
    })
    .returning();

  await db.insert(schema.restrictionAllowedCategories).values([
    {
      orgId,
      restrictionTermId: termNutrition!.id,
      category: "Program Supplies",
    },
    {
      orgId,
      restrictionTermId: termNutrition!.id,
      category: "Personnel",
    },
  ]);

  await db.insert(schema.restrictionAdditions).values({
    orgId,
    restrictionTermId: termNutrition!.id,
    grantId: grantTitleIIIId,
    amountCents: cents(185_000),
    date: new Date("2025-10-01"),
    description: "Title III-C award funded",
    createdBy: userId,
  });

  const nutritionReleases = await db
    .insert(schema.restrictionReleases)
    .values([
      {
        orgId,
        restrictionTermId: termNutrition!.id,
        expenseId: nutritionExpenses[0]?.id ?? null,
        amountCents: cents(9_420),
        date: daysAgo(155),
        reason: "October meal program supplies",
        createdBy: userId,
      },
      {
        orgId,
        restrictionTermId: termNutrition!.id,
        expenseId: nutritionExpenses[1]?.id ?? null,
        amountCents: cents(4_800),
        date: daysAgo(155),
        reason: "October nutrition coordinator allocation",
        createdBy: userId,
      },
    ])
    .returning();

  // Evidence on the first release; second left unsupported on purpose.
  if (nutritionReleases[0]) {
    await db.insert(schema.restrictionEvidenceLinks).values({
      orgId,
      restrictionReleaseId: nutritionReleases[0].id,
      documentId: titleIIIAgreement!.id,
      label: "Title III-C grant agreement",
      evidenceType: "grant_agreement",
      createdBy: userId,
    });
  }

  // Term B — time-bound PASSPORT grant, currently healthy.
  const [termPassport] = await db
    .insert(schema.restrictionTerms)
    .values({
      orgId,
      grantId: grantPASSPORTId,
      sourceDocumentId: passportAward!.id,
      restrictionType: "purpose_and_time",
      source: "funder",
      title: "PASSPORT home care services",
      purposeStatement: "Restricted to PASSPORT-eligible home and community services.",
      releaseRule: "Bill monthly against units of service delivered.",
      startDate: new Date("2025-07-01"),
      endDate: new Date("2026-06-30"),
      beginningBalanceCents: 0,
      currency: "USD",
      evidenceRequirement: "Monthly billing report + signed timesheet",
      createdBy: userId,
    })
    .returning();

  await db.insert(schema.restrictionAdditions).values({
    orgId,
    restrictionTermId: termPassport!.id,
    grantId: grantPASSPORTId,
    amountCents: cents(94_000),
    date: new Date("2025-07-01"),
    description: "PASSPORT award funded",
    createdBy: userId,
  });

  const [passportRelease] = await db
    .insert(schema.restrictionReleases)
    .values({
      orgId,
      restrictionTermId: termPassport!.id,
      expenseId: passportExpenses[0]?.id ?? null,
      amountCents: cents(7_800),
      date: daysAgo(40),
      reason: "PASSPORT March billing",
      createdBy: userId,
    })
    .returning();

  if (passportRelease) {
    await db.insert(schema.restrictionEvidenceLinks).values({
      orgId,
      restrictionReleaseId: passportRelease.id,
      documentId: passportAward!.id,
      label: "PASSPORT award letter",
      evidenceType: "award_letter",
      createdBy: userId,
    });
  }

  // Term C — time-bound, EXPIRED with leftover balance (triggers
  // expired_time_restriction alert and release_without_support).
  const [termPG] = await db
    .insert(schema.restrictionTerms)
    .values({
      orgId,
      grantId: grantPGId,
      restrictionType: "time",
      source: "funder",
      title: "Senior Wellbeing Initiative — closeout",
      releaseRule: "Spend down before final report April 30, 2026.",
      startDate: new Date("2025-04-01"),
      endDate: daysAgo(15),
      beginningBalanceCents: 0,
      currency: "USD",
      createdBy: userId,
    })
    .returning();

  await db.insert(schema.restrictionAdditions).values({
    orgId,
    restrictionTermId: termPG!.id,
    grantId: grantPGId,
    amountCents: cents(15_000),
    date: new Date("2025-04-01"),
    description: "P&G award funded",
    createdBy: userId,
  });

  await db.insert(schema.restrictionReleases).values({
    orgId,
    restrictionTermId: termPG!.id,
    amountCents: cents(14_500),
    date: daysAgo(60),
    reason: "Wellness programming expenses",
    createdBy: userId,
  });

  // Term D — purpose-restricted Capacity grant intentionally overdrawn for
  // demo (triggers negative_restricted_balance alert).
  const [termGCF] = await db
    .insert(schema.restrictionTerms)
    .values({
      orgId,
      grantId: grantGCFId,
      restrictionType: "purpose",
      source: "funder",
      title: "Aging in Place Capacity Grant",
      purposeStatement: "Restricted to data system implementation and staff training.",
      beginningBalanceCents: 0,
      currency: "USD",
      createdBy: userId,
    })
    .returning();

  await db.insert(schema.restrictionAdditions).values({
    orgId,
    restrictionTermId: termGCF!.id,
    grantId: grantGCFId,
    amountCents: cents(35_000),
    date: new Date("2026-01-01"),
    description: "GCF capacity award funded",
    createdBy: userId,
  });

  await db.insert(schema.restrictionReleases).values([
    {
      orgId,
      restrictionTermId: termGCF!.id,
      amountCents: cents(20_000),
      date: daysAgo(45),
      reason: "Client data platform license",
      createdBy: userId,
    },
    {
      orgId,
      restrictionTermId: termGCF!.id,
      amountCents: cents(16_000),
      date: daysAgo(10),
      reason: "Staff training onsite delivery",
      createdBy: userId,
    },
  ]);

  // Term E — recently funded Title III-B with an evidence requirement that
  // has not been recorded yet (triggers missing_evidence alert).
  const [termTitleIIIB] = await db
    .insert(schema.restrictionTerms)
    .values({
      orgId,
      grantId: grantTitleIIIId,
      restrictionType: "purpose",
      source: "funder",
      title: "Title III-B supportive services — pending documentation",
      purposeStatement:
        "Funds may only be spent on transportation, legal assistance, and information & referral services.",
      releaseRule: "Release as program expenses are incurred.",
      startDate: daysAgo(20),
      beginningBalanceCents: 0,
      currency: "USD",
      evidenceRequirement: "Signed grant agreement on file before first release",
      createdBy: userId,
    })
    .returning();

  await db.insert(schema.restrictionAdditions).values({
    orgId,
    restrictionTermId: termTitleIIIB!.id,
    grantId: grantTitleIIIId,
    amountCents: cents(62_000),
    date: daysAgo(20),
    description: "Title III-B supplemental award funded",
    createdBy: userId,
  });
  // Intentionally no releases or evidence links so the alert engine surfaces
  // this term as needing documentation.
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function seed() {
  const handle = await createDbHandle(DATABASE_URL);
  db = handle.db;
  closeDb = handle.close;

  await cleanup();

  // 1. User
  console.log("Creating user...");
  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  await db.insert(schema.user).values({
    id: userId,
    name: DEMO_NAME,
    email: DEMO_EMAIL,
    emailVerified: true,
  });

  await db.insert(schema.account).values({
    id: crypto.randomUUID(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: passwordHash,
  });

  // 2. Org
  console.log("Creating org...");
  const orgId = crypto.randomUUID();
  const demoEntityId = crypto.randomUUID();
  const trialStart = new Date();
  const trialEnd = new Date(trialStart.getTime() + 30 * 24 * 60 * 60 * 1000);

  await db.insert(schema.organizations).values({
    id: orgId,
    name: DEMO_ORG_NAME,
    slug: DEMO_ORG_SLUG,
    ein: "45-2819304",
    fiscalYearStartMonth: 7,
    timezone: "America/New_York",
    address: "2145 Reading Rd, Cincinnati, OH 45202",
    onboardingCompleted: true,
    planSelectedAt: trialStart,
    planTier: "growth",
    billingCycle: "monthly",
    subscriptionStatus: "active",
    trialStartedAt: trialStart,
    trialEndsAt: trialEnd,
  });

  await db.insert(schema.entities).values({
    id: demoEntityId,
    orgId,
    name: DEMO_ORG_NAME,
    kind: "root",
  });

  await db
    .update(schema.organizations)
    .set({ defaultEntityId: demoEntityId })
    .where(eq(schema.organizations.id, orgId));

  const [demoOrgMember] = await db
    .insert(schema.orgMembers)
    .values({
      orgId,
      userId,
      role: "admin",
    })
    .returning({ id: schema.orgMembers.id });

  if (!demoOrgMember) {
    throw new Error("Failed to create demo org member");
  }

  // Entity membership is required by the org-entity-context middleware; without
  // it every entity-scoped route (dashboard, grants, funds, …) returns 403.
  await db.insert(schema.entityMembers).values({
    orgId,
    entityId: demoEntityId,
    orgMemberId: demoOrgMember.id,
    role: "admin",
  });

  // 3. Funders
  console.log("Creating funders...");
  const [funderHHS] = await db
    .insert(schema.funders)
    .values({
      orgId,
      entityId: demoEntityId,
      name: "U.S. Dept. of Health & Human Services",
      type: "government",
      website: "https://www.hhs.gov",
      priorities: "Aging services, nutrition programs, caregiver support, Title III",
    })
    .returning();

  const [funderODA] = await db
    .insert(schema.funders)
    .values({
      orgId,
      entityId: demoEntityId,
      name: "Ohio Department of Aging",
      type: "government",
      website: "https://aging.ohio.gov",
      priorities: "Home and community-based services, PASSPORT program, senior centers",
    })
    .returning();

  const [funderGCF] = await db
    .insert(schema.funders)
    .values({
      orgId,
      entityId: demoEntityId,
      name: "Greater Cincinnati Foundation",
      type: "foundation",
      website: "https://www.gcfdn.org",
      priorities: "Economic mobility, health equity, aging in place",
    })
    .returning();

  const [funderPG] = await db
    .insert(schema.funders)
    .values({
      orgId,
      entityId: demoEntityId,
      name: "Procter & Gamble Fund",
      type: "corporate",
      website: "https://us.pg.com/pg-fund",
      priorities: "Community development, senior wellbeing",
    })
    .returning();

  // 4. Funds
  console.log("Creating funds...");
  const [fundNutrition] = await db
    .insert(schema.funds)
    .values({
      orgId,
      entityId: demoEntityId,
      name: "Title III-C Nutrition Fund",
      type: "temporarily_restricted",
      description: "HHS Title III-C funds restricted to congregate and home-delivered meals only.",
    })
    .returning();

  const [fundCaregiving] = await db
    .insert(schema.funds)
    .values({
      orgId,
      entityId: demoEntityId,
      name: "Caregiver Support Fund",
      type: "temporarily_restricted",
      description: "Restricted to home care, respite, and caregiver support services.",
    })
    .returning();

  const [fundCapacity] = await db
    .insert(schema.funds)
    .values({
      orgId,
      entityId: demoEntityId,
      name: "Capacity Building Fund",
      type: "temporarily_restricted",
      description:
        "GCF grant restricted to staff training, technology, and program infrastructure.",
    })
    .returning();

  const [fundGeneral] = await db
    .insert(schema.funds)
    .values({
      orgId,
      entityId: demoEntityId,
      name: "General Operating Fund",
      type: "unrestricted",
      description: "Unrestricted revenue for general operations.",
    })
    .returning();

  // 5. Grants
  console.log("Creating grants...");
  const [grantTitleIII] = await db
    .insert(schema.grants)
    .values({
      orgId,
      entityId: demoEntityId,
      funderId: funderHHS!.id,
      name: "Title III-C Nutrition Services Grant",
      status: "active",
      amountCents: cents(185_000),
      startDate: new Date("2025-10-01"),
      endDate: new Date("2026-09-30"),
      description:
        "Federal nutrition services funding under the Older Americans Act Title III-C. Supports congregate dining and home-delivered meals for adults 60+ in Hamilton County.",
      notes: "Quarterly narrative + financial reports required. Indirect cost rate capped at 8%.",
    })
    .returning();

  const [grantPASSPORT] = await db
    .insert(schema.grants)
    .values({
      orgId,
      entityId: demoEntityId,
      funderId: funderODA!.id,
      name: "PASSPORT Home Care Services",
      status: "reporting",
      amountCents: cents(94_000),
      startDate: new Date("2025-07-01"),
      endDate: new Date("2026-06-30"),
      description:
        "State-funded home and community-based services for Medicaid-eligible older adults. Covers personal care, homemaker, and transportation.",
      notes: "Monthly billing reports required. Performance metric: units of service delivered.",
    })
    .returning();

  const [grantGCF] = await db
    .insert(schema.grants)
    .values({
      orgId,
      entityId: demoEntityId,
      funderId: funderGCF!.id,
      name: "Aging in Place Capacity Grant",
      status: "active",
      amountCents: cents(35_000),
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      description:
        "Capacity-building grant to implement a client data management system and train staff on outcome tracking.",
      notes: "Mid-year and final narrative reports. Budget modifications require prior approval.",
    })
    .returning();

  const [grantPG] = await db
    .insert(schema.grants)
    .values({
      orgId,
      entityId: demoEntityId,
      funderId: funderPG!.id,
      name: "Senior Wellbeing Initiative",
      status: "closeout",
      amountCents: cents(15_000),
      startDate: new Date("2025-04-01"),
      endDate: new Date("2026-03-31"),
      description: "Wellness programming and social engagement activities for homebound seniors.",
      notes: "Final report due April 30, 2026. All funds expended.",
    })
    .returning();

  await db
    .insert(schema.grants)
    .values({
      orgId,
      entityId: demoEntityId,
      funderId: funderHHS!.id,
      name: "Title III-B Supportive Services",
      status: "application",
      amountCents: cents(62_000),
      applicationDeadline: daysFromNow(18),
      description:
        "Older Americans Act Title III-B funding for transportation, legal assistance, and information & referral services.",
      notes: "Application in progress. Budget narrative and work plan required.",
    })
    .returning();

  // 6. Allocations
  console.log("Creating fund allocations...");
  await db.insert(schema.grantFundAllocations).values(
    [
      {
        grantId: grantTitleIII!.id,
        fundId: fundNutrition!.id,
        allocatedAmountCents: cents(185_000),
      },
      {
        grantId: grantPASSPORT!.id,
        fundId: fundCaregiving!.id,
        allocatedAmountCents: cents(94_000),
      },
      { grantId: grantGCF!.id, fundId: fundCapacity!.id, allocatedAmountCents: cents(35_000) },
      { grantId: grantPG!.id, fundId: fundGeneral!.id, allocatedAmountCents: cents(15_000) },
    ].map((row) => ({ ...row, entityId: demoEntityId })),
  );

  // 7. Expenses
  console.log("Creating expenses...");
  await db.insert(schema.expenses).values(
    [
      // Title III-C — 6 months of meal program spend
      {
        orgId,
        grantId: grantTitleIII!.id,
        fundId: fundNutrition!.id,
        amountCents: cents(9_420),
        date: daysAgo(155),
        description: "Congregate meal ingredients & supplies — Oct",
        category: "Program Supplies",
        vendor: "Sysco Cincinnati",
      },
      {
        orgId,
        grantId: grantTitleIII!.id,
        fundId: fundNutrition!.id,
        amountCents: cents(4_800),
        date: daysAgo(155),
        description: "Nutrition coordinator — Oct salary allocation",
        category: "Personnel",
        vendor: null,
      },
      {
        orgId,
        grantId: grantTitleIII!.id,
        fundId: fundNutrition!.id,
        amountCents: cents(9_610),
        date: daysAgo(124),
        description: "Congregate meal ingredients & supplies — Nov",
        category: "Program Supplies",
        vendor: "Sysco Cincinnati",
      },
      {
        orgId,
        grantId: grantTitleIII!.id,
        fundId: fundNutrition!.id,
        amountCents: cents(4_800),
        date: daysAgo(124),
        description: "Nutrition coordinator — Nov salary allocation",
        category: "Personnel",
        vendor: null,
      },
      {
        orgId,
        grantId: grantTitleIII!.id,
        fundId: fundNutrition!.id,
        amountCents: cents(9_200),
        date: daysAgo(93),
        description: "Home-delivered meal packaging & delivery — Dec",
        category: "Program Supplies",
        vendor: "Sysco Cincinnati",
      },
      {
        orgId,
        grantId: grantTitleIII!.id,
        fundId: fundNutrition!.id,
        amountCents: cents(4_800),
        date: daysAgo(93),
        description: "Nutrition coordinator — Dec salary allocation",
        category: "Personnel",
        vendor: null,
      },
      {
        orgId,
        grantId: grantTitleIII!.id,
        fundId: fundNutrition!.id,
        amountCents: cents(9_750),
        date: daysAgo(62),
        description: "Meal program supplies — Jan",
        category: "Program Supplies",
        vendor: "Sysco Cincinnati",
      },
      {
        orgId,
        grantId: grantTitleIII!.id,
        fundId: fundNutrition!.id,
        amountCents: cents(4_800),
        date: daysAgo(62),
        description: "Nutrition coordinator — Jan salary allocation",
        category: "Personnel",
        vendor: null,
      },
      {
        orgId,
        grantId: grantTitleIII!.id,
        fundId: fundNutrition!.id,
        amountCents: cents(9_380),
        date: daysAgo(31),
        description: "Meal program supplies — Feb",
        category: "Program Supplies",
        vendor: "Sysco Cincinnati",
      },
      {
        orgId,
        grantId: grantTitleIII!.id,
        fundId: fundNutrition!.id,
        amountCents: cents(4_800),
        date: daysAgo(31),
        description: "Nutrition coordinator — Feb salary allocation",
        category: "Personnel",
        vendor: null,
      },
      {
        orgId,
        grantId: grantTitleIII!.id,
        fundId: fundNutrition!.id,
        amountCents: cents(9_100),
        date: daysAgo(3),
        description: "Meal program supplies — Mar",
        category: "Program Supplies",
        vendor: "Sysco Cincinnati",
      },

      // PASSPORT — home care spend
      {
        orgId,
        grantId: grantPASSPORT!.id,
        fundId: fundCaregiving!.id,
        amountCents: cents(7_200),
        date: daysAgo(180),
        description: "Personal care aide hours — Jul",
        category: "Personnel",
        vendor: null,
      },
      {
        orgId,
        grantId: grantPASSPORT!.id,
        fundId: fundCaregiving!.id,
        amountCents: cents(7_400),
        date: daysAgo(150),
        description: "Personal care aide hours — Aug",
        category: "Personnel",
        vendor: null,
      },
      {
        orgId,
        grantId: grantPASSPORT!.id,
        fundId: fundCaregiving!.id,
        amountCents: cents(1_800),
        date: daysAgo(150),
        description: "Client transportation — Aug",
        category: "Transportation",
        vendor: "Metro/TANK",
      },
      {
        orgId,
        grantId: grantPASSPORT!.id,
        fundId: fundCaregiving!.id,
        amountCents: cents(7_100),
        date: daysAgo(120),
        description: "Personal care aide hours — Sep",
        category: "Personnel",
        vendor: null,
      },
      {
        orgId,
        grantId: grantPASSPORT!.id,
        fundId: fundCaregiving!.id,
        amountCents: cents(7_500),
        date: daysAgo(90),
        description: "Personal care aide hours — Oct",
        category: "Personnel",
        vendor: null,
      },
      {
        orgId,
        grantId: grantPASSPORT!.id,
        fundId: fundCaregiving!.id,
        amountCents: cents(7_250),
        date: daysAgo(60),
        description: "Personal care aide hours — Nov",
        category: "Personnel",
        vendor: null,
      },
      {
        orgId,
        grantId: grantPASSPORT!.id,
        fundId: fundCaregiving!.id,
        amountCents: cents(1_600),
        date: daysAgo(60),
        description: "Client transportation — Nov",
        category: "Transportation",
        vendor: "Metro/TANK",
      },
      {
        orgId,
        grantId: grantPASSPORT!.id,
        fundId: fundCaregiving!.id,
        amountCents: cents(7_300),
        date: daysAgo(30),
        description: "Personal care aide hours — Dec",
        category: "Personnel",
        vendor: null,
      },
      {
        orgId,
        grantId: grantPASSPORT!.id,
        fundId: fundCaregiving!.id,
        amountCents: cents(7_150),
        date: daysAgo(10),
        description: "Personal care aide hours — Jan",
        category: "Personnel",
        vendor: null,
      },

      // GCF Capacity
      {
        orgId,
        grantId: grantGCF!.id,
        fundId: fundCapacity!.id,
        amountCents: cents(4_200),
        date: daysAgo(90),
        description: "Staff data training — cohort 1",
        category: "Training",
        vendor: "Cincinnati State CE",
      },
      {
        orgId,
        grantId: grantGCF!.id,
        fundId: fundCapacity!.id,
        amountCents: cents(2_800),
        date: daysAgo(45),
        description: "Software licenses Q1",
        category: "Technology",
        vendor: "Microsoft 365",
      },

      // P&G — fully expended
      {
        orgId,
        grantId: grantPG!.id,
        fundId: fundGeneral!.id,
        amountCents: cents(5_000),
        date: daysAgo(280),
        description: "Wellness event supplies & facilitator",
        category: "Program Supplies",
        vendor: "Various",
      },
      {
        orgId,
        grantId: grantPG!.id,
        fundId: fundGeneral!.id,
        amountCents: cents(5_000),
        date: daysAgo(150),
        description: "Social engagement programming — Fall",
        category: "Program Expenses",
        vendor: "Various",
      },
      {
        orgId,
        grantId: grantPG!.id,
        fundId: fundGeneral!.id,
        amountCents: cents(5_000),
        date: daysAgo(30),
        description: "Winter isolation prevention campaign",
        category: "Program Expenses",
        vendor: "Various",
      },
    ].map((row) => ({ ...row, entityId: demoEntityId })),
  );

  // 8. Reporting requirements
  console.log("Creating reporting requirements...");
  await db.insert(schema.grantReportingRequirements).values(
    [
      // Title III-C quarterly
      {
        orgId,
        grantId: grantTitleIII!.id,
        reportType: "Quarterly Financial Report",
        dueDate: new Date("2026-01-15"),
        status: "submitted",
        submittedAt: new Date("2026-01-13"),
        notes: "Q1 FY26 submitted on time.",
      },
      {
        orgId,
        grantId: grantTitleIII!.id,
        reportType: "Quarterly Narrative Report",
        dueDate: new Date("2026-01-15"),
        status: "submitted",
        submittedAt: new Date("2026-01-13"),
        notes: "Q1 FY26 narrative submitted.",
      },
      {
        orgId,
        grantId: grantTitleIII!.id,
        reportType: "Quarterly Financial Report",
        dueDate: new Date("2026-04-15"),
        status: "in_progress",
        notes: "Q2 — pulling meal counts and expenditure summary.",
      },
      {
        orgId,
        grantId: grantTitleIII!.id,
        reportType: "Quarterly Narrative Report",
        dueDate: new Date("2026-04-15"),
        status: "upcoming",
        notes: null,
      },
      {
        orgId,
        grantId: grantTitleIII!.id,
        reportType: "Quarterly Financial Report",
        dueDate: new Date("2026-07-15"),
        status: "upcoming",
        notes: null,
      },
      {
        orgId,
        grantId: grantTitleIII!.id,
        reportType: "Annual Performance Report",
        dueDate: new Date("2026-10-31"),
        status: "upcoming",
        notes: null,
      },

      // PASSPORT monthly billing
      {
        orgId,
        grantId: grantPASSPORT!.id,
        reportType: "Monthly Billing Report",
        dueDate: daysAgo(75),
        status: "submitted",
        submittedAt: daysAgo(77),
        notes: "Oct billing — 312 units of service.",
      },
      {
        orgId,
        grantId: grantPASSPORT!.id,
        reportType: "Monthly Billing Report",
        dueDate: daysAgo(45),
        status: "submitted",
        submittedAt: daysAgo(46),
        notes: "Nov billing — 298 units.",
      },
      {
        orgId,
        grantId: grantPASSPORT!.id,
        reportType: "Monthly Billing Report",
        dueDate: daysAgo(15),
        status: "submitted",
        submittedAt: daysAgo(14),
        notes: "Dec billing — 321 units.",
      },
      {
        orgId,
        grantId: grantPASSPORT!.id,
        reportType: "Monthly Billing Report",
        dueDate: daysFromNow(15),
        status: "in_progress",
        notes: "Jan billing — compiling service logs.",
      },
      {
        orgId,
        grantId: grantPASSPORT!.id,
        reportType: "Final Programmatic Report",
        dueDate: new Date("2026-07-31"),
        status: "upcoming",
        notes: null,
      },

      // GCF
      {
        orgId,
        grantId: grantGCF!.id,
        reportType: "Mid-Year Progress Report",
        dueDate: new Date("2026-06-30"),
        status: "upcoming",
        notes: "Narrative + budget vs actuals. Training completion data needed.",
      },
      {
        orgId,
        grantId: grantGCF!.id,
        reportType: "Final Report",
        dueDate: new Date("2027-01-31"),
        status: "upcoming",
        notes: null,
      },

      // P&G final
      {
        orgId,
        grantId: grantPG!.id,
        reportType: "Final Narrative & Financial Report",
        dueDate: new Date("2026-04-30"),
        status: "in_progress",
        notes: "All funds expended. Drafting impact summary.",
      },
    ].map((row) => ({ ...row, entityId: demoEntityId })),
  );

  // 9. Impact metrics
  console.log("Creating impact metrics...");
  const [metricMeals] = await db
    .insert(schema.grantImpactMetrics)
    .values({
      orgId,
      entityId: demoEntityId,
      grantId: grantTitleIII!.id,
      name: "Meals Served",
      targetValue: "12000",
      unit: "meals",
    })
    .returning();

  const [metricClients] = await db
    .insert(schema.grantImpactMetrics)
    .values({
      orgId,
      entityId: demoEntityId,
      grantId: grantTitleIII!.id,
      name: "Unique Clients Served",
      targetValue: "340",
      unit: "clients",
    })
    .returning();

  const [metricHours] = await db
    .insert(schema.grantImpactMetrics)
    .values({
      orgId,
      entityId: demoEntityId,
      grantId: grantPASSPORT!.id,
      name: "Home Care Hours Delivered",
      targetValue: "4800",
      unit: "hours",
    })
    .returning();

  await db.insert(schema.impactMetricEntries).values(
    [
      {
        metricId: metricMeals!.id,
        value: "1940",
        periodStart: new Date("2025-10-01"),
        periodEnd: new Date("2025-10-31"),
      },
      {
        metricId: metricMeals!.id,
        value: "2010",
        periodStart: new Date("2025-11-01"),
        periodEnd: new Date("2025-11-30"),
      },
      {
        metricId: metricMeals!.id,
        value: "1880",
        periodStart: new Date("2025-12-01"),
        periodEnd: new Date("2025-12-31"),
      },
      {
        metricId: metricMeals!.id,
        value: "2050",
        periodStart: new Date("2026-01-01"),
        periodEnd: new Date("2026-01-31"),
      },
      {
        metricId: metricMeals!.id,
        value: "1920",
        periodStart: new Date("2026-02-01"),
        periodEnd: new Date("2026-02-28"),
      },
      {
        metricId: metricClients!.id,
        value: "312",
        periodStart: new Date("2025-10-01"),
        periodEnd: new Date("2026-02-28"),
      },
      {
        metricId: metricHours!.id,
        value: "312",
        periodStart: new Date("2025-07-01"),
        periodEnd: new Date("2025-07-31"),
      },
      {
        metricId: metricHours!.id,
        value: "298",
        periodStart: new Date("2025-08-01"),
        periodEnd: new Date("2025-08-31"),
      },
      {
        metricId: metricHours!.id,
        value: "321",
        periodStart: new Date("2025-09-01"),
        periodEnd: new Date("2025-09-30"),
      },
      {
        metricId: metricHours!.id,
        value: "308",
        periodStart: new Date("2025-10-01"),
        periodEnd: new Date("2025-10-31"),
      },
    ].map((row) => ({ ...row, entityId: demoEntityId })),
  );

  // 10. Closeout checklist for P&G grant
  console.log("Creating closeout checklist...");
  await db.insert(schema.grantCloseoutItems).values(
    [
      {
        orgId,
        grantId: grantPG!.id,
        label: "Confirm all expenses coded to correct budget lines",
        completed: true,
        completedAt: daysAgo(20),
        completedBy: userId,
      },
      {
        orgId,
        grantId: grantPG!.id,
        label: "Draft final narrative report",
        completed: true,
        completedAt: daysAgo(10),
        completedBy: userId,
      },
      { orgId, grantId: grantPG!.id, label: "Final financial reconciliation", completed: false },
      {
        orgId,
        grantId: grantPG!.id,
        label: "Submit final report to P&G Fund portal",
        completed: false,
        dueDate: new Date("2026-04-30"),
      },
      {
        orgId,
        grantId: grantPG!.id,
        label: "Archive grant records (3-year retention)",
        completed: false,
      },
    ].map((row) => ({ ...row, entityId: demoEntityId })),
  );

  // 11. Contacts
  console.log("Creating contacts...");

  const [cDorothy] = await db
    .insert(schema.contacts)
    .values({
      orgId,
      type: "individual",
      firstName: "Dorothy",
      lastName: "Harmon",
      email: "d.harmon@sample.example",
      phone: "513-555-0192",
      pipelineStage: "donor",
      notes: "Board member, consistent annual gift",
    })
    .returning();

  const [cRobert] = await db
    .insert(schema.contacts)
    .values({
      orgId,
      type: "individual",
      firstName: "Robert",
      lastName: "Chen",
      email: "rchen@sample.example",
      phone: "513-555-0448",
      pipelineStage: "donor",
    })
    .returning();

  const [cMargaret] = await db
    .insert(schema.contacts)
    .values({
      orgId,
      type: "individual",
      firstName: "Margaret",
      lastName: "Ellison",
      email: "mellison@sample.example",
      phone: "513-555-0371",
      pipelineStage: "donor",
      notes: "New donor this fiscal year — event attendee",
    })
    .returning();

  const [cRiversideFoundation] = await db
    .insert(schema.contacts)
    .values({
      orgId,
      type: "organization",
      organizationName: "Riverside Community Foundation",
      email: "grants@riverside-foundation.example",
      pipelineStage: "donor",
    })
    .returning();

  const [cJames] = await db
    .insert(schema.contacts)
    .values({
      orgId,
      type: "individual",
      firstName: "James",
      lastName: "Okafor",
      email: "jokafor@sample.example",
      phone: "513-555-0284",
      pipelineStage: "lapsed",
      notes: "Lapsed — gave last FY only, not yet renewed",
    })
    .returning();

  const [cPat] = await db
    .insert(schema.contacts)
    .values({
      orgId,
      type: "individual",
      firstName: "Patricia",
      lastName: "Nguyen",
      email: "pnguyen@sample.example",
      phone: "513-555-0617",
      pipelineStage: "donor",
      notes: "Multi-year donor, prefers check",
    })
    .returning();

  const [cFirm] = await db
    .insert(schema.contacts)
    .values({
      orgId,
      type: "organization",
      organizationName: "Brightwater Legal LLC",
      email: "community@sample.example",
      pipelineStage: "donor",
      notes: "Corporate sponsor — annual table at gala",
    })
    .returning();

  // 12. Donations
  // Retention = donors who gave in both last FY AND this FY / donors who gave in last FY
  // Last FY donors: Dorothy, Robert, Riverside, James, Patricia, Brightwater Legal = 6
  // This FY donors: Dorothy, Robert, Riverside, Margaret, Patricia, Brightwater Legal = 6
  // Retained = Dorothy, Robert, Riverside, Patricia, Brightwater Legal = 5 → 5/6 = ~83%
  console.log("Creating donations...");

  await db.insert(schema.donations).values([
    // Dorothy Harmon — retained, annual gift
    {
      orgId,
      contactId: cDorothy!.id,
      amountCents: cents(2_500),
      date: new Date("2024-11-12"),
      type: "one_time",
      restriction: "unrestricted",
      fundId: fundGeneral!.id,
      receiptSent: true,
    },
    {
      orgId,
      contactId: cDorothy!.id,
      amountCents: cents(2_500),
      date: new Date("2025-11-08"),
      type: "one_time",
      restriction: "unrestricted",
      fundId: fundGeneral!.id,
      receiptSent: true,
    },

    // Robert Chen — retained, growing gift
    {
      orgId,
      contactId: cRobert!.id,
      amountCents: cents(1_000),
      date: new Date("2024-09-20"),
      type: "one_time",
      restriction: "unrestricted",
      fundId: fundGeneral!.id,
      receiptSent: true,
    },
    {
      orgId,
      contactId: cRobert!.id,
      amountCents: cents(1_200),
      date: new Date("2025-09-15"),
      type: "one_time",
      restriction: "unrestricted",
      fundId: fundGeneral!.id,
      receiptSent: true,
    },

    // Margaret Ellison — new this FY only
    {
      orgId,
      contactId: cMargaret!.id,
      amountCents: cents(250),
      date: new Date("2026-02-14"),
      type: "one_time",
      restriction: "unrestricted",
      fundId: fundGeneral!.id,
      receiptSent: true,
    },

    // Riverside Community Foundation — retained, large gift
    {
      orgId,
      contactId: cRiversideFoundation!.id,
      amountCents: cents(10_000),
      date: new Date("2024-08-01"),
      type: "one_time",
      restriction: "temporarily_restricted",
      fundId: fundNutrition!.id,
      receiptSent: true,
    },
    {
      orgId,
      contactId: cRiversideFoundation!.id,
      amountCents: cents(10_000),
      date: new Date("2025-08-05"),
      type: "one_time",
      restriction: "temporarily_restricted",
      fundId: fundNutrition!.id,
      receiptSent: true,
    },

    // James Okafor — lapsed, last FY only
    {
      orgId,
      contactId: cJames!.id,
      amountCents: cents(500),
      date: new Date("2025-03-10"),
      type: "one_time",
      restriction: "unrestricted",
      fundId: fundGeneral!.id,
      receiptSent: true,
    },

    // Patricia Nguyen — retained, recurring-style
    {
      orgId,
      contactId: cPat!.id,
      amountCents: cents(750),
      date: new Date("2024-12-01"),
      type: "recurring",
      restriction: "unrestricted",
      fundId: fundGeneral!.id,
      receiptSent: true,
    },
    {
      orgId,
      contactId: cPat!.id,
      amountCents: cents(750),
      date: new Date("2025-03-01"),
      type: "recurring",
      restriction: "unrestricted",
      fundId: fundGeneral!.id,
      receiptSent: true,
    },
    {
      orgId,
      contactId: cPat!.id,
      amountCents: cents(750),
      date: new Date("2025-06-01"),
      type: "recurring",
      restriction: "unrestricted",
      fundId: fundGeneral!.id,
      receiptSent: true,
    },
    {
      orgId,
      contactId: cPat!.id,
      amountCents: cents(750),
      date: new Date("2025-09-01"),
      type: "recurring",
      restriction: "unrestricted",
      fundId: fundGeneral!.id,
      receiptSent: true,
    },
    {
      orgId,
      contactId: cPat!.id,
      amountCents: cents(750),
      date: new Date("2025-12-01"),
      type: "recurring",
      restriction: "unrestricted",
      fundId: fundGeneral!.id,
      receiptSent: true,
    },
    {
      orgId,
      contactId: cPat!.id,
      amountCents: cents(750),
      date: new Date("2026-03-01"),
      type: "recurring",
      restriction: "unrestricted",
      fundId: fundGeneral!.id,
      receiptSent: true,
    },

    // Brightwater Legal — retained, corporate gala sponsor
    {
      orgId,
      contactId: cFirm!.id,
      amountCents: cents(5_000),
      date: new Date("2024-10-05"),
      type: "one_time",
      restriction: "unrestricted",
      fundId: fundGeneral!.id,
      receiptSent: true,
    },
    {
      orgId,
      contactId: cFirm!.id,
      amountCents: cents(5_000),
      date: new Date("2025-10-10"),
      type: "one_time",
      restriction: "unrestricted",
      fundId: fundGeneral!.id,
      receiptSent: true,
    },
  ]);

  // 13. Restriction lifecycle — terms, balances, releases, and evidence
  console.log("Creating restriction lifecycle records...");
  await seedRestrictions({
    orgId,
    userId,
    fundNutritionId: fundNutrition!.id,
    grantTitleIIIId: grantTitleIII!.id,
    grantPASSPORTId: grantPASSPORT!.id,
    grantGCFId: grantGCF!.id,
    grantPGId: grantPG!.id,
  });

  console.log(`
✓ Demo seed complete.
──────────────────────────────
  Email:    ${DEMO_EMAIL}
  Password: ${DEMO_PASSWORD}
  Org:      ${DEMO_ORG_NAME}
──────────────────────────────
  URL: http://localhost:3050
`);

  if (closeDb) {
    await closeDb();
    closeDb = null;
  }
  process.exit(0);
}

seed().catch(async (err) => {
  console.error(err);
  if (closeDb) {
    try {
      await closeDb();
    } catch (closeErr) {
      console.error("Failed to close db handle:", closeErr);
    }
  }
  process.exit(1);
});
