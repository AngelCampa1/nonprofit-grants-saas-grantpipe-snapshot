/**
 * seed-content.ts
 *
 * Pure function that builds all rows needed to seed a realistic "explore"
 * dataset into a caller-specified org. No DB I/O — the caller inserts the
 * returned arrays inside a DB transaction.
 *
 * FK-safe insert order (reflected in SampleContent property order):
 *   1. funders
 *   2. funds
 *   3. grants          (→ funders)
 *   4. allocations     (→ grants, funds)
 *   5. expenses        (→ grants, funds)
 *   6. reportingRequirements (→ grants)
 *   7. impactMetrics   (→ grants)
 *   8. metricEntries   (→ impactMetrics)
 *   9. closeoutItems   (→ grants)
 *  10. contacts
 *  11. donations       (→ contacts, funds)
 *  12. restrictionTerms        (→ funds, grants)
 *  13. restrictionAllowedCategories (→ restrictionTerms)
 *  14. restrictionAdditions    (→ restrictionTerms, grants)
 *  15. restrictionReleases     (→ restrictionTerms)
 *  16. restrictionEvidenceLinks (→ restrictionReleases) [no documentId — evidence type only]
 */

import type {
  funders,
  funds,
  grants,
  grantFundAllocations,
  expenses,
  grantReportingRequirements,
  grantImpactMetrics,
  impactMetricEntries,
  grantCloseoutItems,
  contacts,
  donations,
  restrictionTerms,
  restrictionAllowedCategories,
  restrictionAdditions,
  restrictionReleases,
  restrictionEvidenceLinks,
} from "@grantpipe/db";

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type NewFunder = typeof funders.$inferInsert;
export type NewFund = typeof funds.$inferInsert;
export type NewGrant = typeof grants.$inferInsert;
export type NewGrantFundAllocation = typeof grantFundAllocations.$inferInsert;
export type NewExpense = typeof expenses.$inferInsert;
export type NewReportingRequirement = typeof grantReportingRequirements.$inferInsert;
export type NewImpactMetric = typeof grantImpactMetrics.$inferInsert;
export type NewMetricEntry = typeof impactMetricEntries.$inferInsert;
export type NewCloseoutItem = typeof grantCloseoutItems.$inferInsert;
export type NewContact = typeof contacts.$inferInsert;
export type NewDonation = typeof donations.$inferInsert;
export type NewRestrictionTerm = typeof restrictionTerms.$inferInsert;
export type NewRestrictionAllowedCategory = typeof restrictionAllowedCategories.$inferInsert;
export type NewRestrictionAddition = typeof restrictionAdditions.$inferInsert;
export type NewRestrictionRelease = typeof restrictionReleases.$inferInsert;
export type NewRestrictionEvidenceLink = typeof restrictionEvidenceLinks.$inferInsert;

type WithoutEntityId<T extends { entityId: string }> = Omit<T, "entityId">;

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export const SAMPLE_MARKER = "[Sample]";

export interface SampleContent {
  // 1. funders — no FK dependencies
  funders: NewFunder[];
  // 2. funds — no FK dependencies (beyond org)
  funds: NewFund[];
  // 3. grants — FK: funders
  grants: NewGrant[];
  // 4. allocations — FK: grants, funds
  allocations: NewGrantFundAllocation[];
  // 5. expenses — FK: grants, funds
  expenses: NewExpense[];
  // 6. reportingRequirements — FK: grants
  reportingRequirements: NewReportingRequirement[];
  // 7. impactMetrics — FK: grants
  impactMetrics: NewImpactMetric[];
  // 8. metricEntries — FK: impactMetrics
  metricEntries: NewMetricEntry[];
  // 9. closeoutItems — FK: grants
  closeoutItems: NewCloseoutItem[];
  // 10. contacts — no FK dependencies (beyond org)
  contacts: NewContact[];
  // 11. donations — FK: contacts, funds
  donations: NewDonation[];
  // 12. restrictionTerms — FK: funds, grants
  restrictionTerms: NewRestrictionTerm[];
  // 13. restrictionAllowedCategories — FK: restrictionTerms
  restrictionAllowedCategories: NewRestrictionAllowedCategory[];
  // 14. restrictionAdditions — FK: restrictionTerms, grants
  restrictionAdditions: NewRestrictionAddition[];
  // 15. restrictionReleases — FK: restrictionTerms
  restrictionReleases: NewRestrictionRelease[];
  // 16. restrictionEvidenceLinks — FK: restrictionReleases (no documentId needed)
  restrictionEvidenceLinks: NewRestrictionEvidenceLink[];
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function buildSampleContent(params: {
  orgId: string;
  entityId?: string;
  now?: Date;
}): SampleContent {
  const { orgId } = params;
  const entityId = params.entityId ?? "sample-entity";
  const now = params.now ?? new Date();

  /** Returns a Date offset from `now` by `days` into the past */
  function daysAgo(days: number): Date {
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  /** Returns a Date offset from `now` by `days` into the future */
  function daysFromNow(days: number): Date {
    return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  }

  /** Convert dollars to integer cents */
  function cents(dollars: number): number {
    return Math.round(dollars * 100);
  }

  // ---------------------------------------------------------------------------
  // 1. Funders
  // ---------------------------------------------------------------------------

  const funderHHSId = crypto.randomUUID();
  const funderODAId = crypto.randomUUID();
  const funderGCFId = crypto.randomUUID();
  const funderPGId = crypto.randomUUID();

  const sampleFunders: WithoutEntityId<NewFunder>[] = [
    {
      id: funderHHSId,
      orgId,
      name: `${SAMPLE_MARKER} U.S. Dept. of Health & Human Services`,
      type: "government",
      website: "https://www.hhs.gov",
      priorities: "Aging services, nutrition programs, caregiver support, Title III",
    },
    {
      id: funderODAId,
      orgId,
      name: `${SAMPLE_MARKER} Ohio Department of Aging`,
      type: "government",
      website: "https://aging.ohio.gov",
      priorities: "Home and community-based services, PASSPORT program, senior centers",
    },
    {
      id: funderGCFId,
      orgId,
      name: `${SAMPLE_MARKER} Greater Cincinnati Foundation`,
      type: "foundation",
      website: "https://www.gcfdn.org",
      priorities: "Economic mobility, health equity, aging in place",
    },
    {
      id: funderPGId,
      orgId,
      name: `${SAMPLE_MARKER} Procter & Gamble Fund`,
      type: "corporate",
      website: "https://us.pg.com/pg-fund",
      priorities: "Community development, senior wellbeing",
    },
  ];

  // ---------------------------------------------------------------------------
  // 2. Funds
  // ---------------------------------------------------------------------------

  const fundNutritionId = crypto.randomUUID();
  const fundCaregivingId = crypto.randomUUID();
  const fundCapacityId = crypto.randomUUID();
  const fundGeneralId = crypto.randomUUID();

  const sampleFunds: WithoutEntityId<NewFund>[] = [
    {
      id: fundNutritionId,
      orgId,
      name: `${SAMPLE_MARKER} Title III-C Nutrition Fund`,
      type: "temporarily_restricted",
      description: "HHS Title III-C funds restricted to congregate and home-delivered meals only.",
    },
    {
      id: fundCaregivingId,
      orgId,
      name: `${SAMPLE_MARKER} Caregiver Support Fund`,
      type: "temporarily_restricted",
      description: "Restricted to home care, respite, and caregiver support services.",
    },
    {
      id: fundCapacityId,
      orgId,
      name: `${SAMPLE_MARKER} Capacity Building Fund`,
      type: "temporarily_restricted",
      description:
        "GCF grant restricted to staff training, technology, and program infrastructure.",
    },
    {
      id: fundGeneralId,
      orgId,
      name: `${SAMPLE_MARKER} General Operating Fund`,
      type: "unrestricted",
      description: "Unrestricted revenue for general operations.",
    },
  ];

  // ---------------------------------------------------------------------------
  // 3. Grants
  // ---------------------------------------------------------------------------

  const grantTitleIIIId = crypto.randomUUID();
  const grantPASSPORTId = crypto.randomUUID();
  const grantGCFId = crypto.randomUUID();
  const grantPGId = crypto.randomUUID();
  const grantTitleIIIBId = crypto.randomUUID();

  const sampleGrants: WithoutEntityId<NewGrant>[] = [
    {
      id: grantTitleIIIId,
      orgId,
      funderId: funderHHSId,
      name: `${SAMPLE_MARKER} Title III-C Nutrition Services Grant`,
      // valid: discovery | application | submitted | awarded | active | reporting | closeout | renewal | declined
      status: "active",
      amountCents: cents(185_000),
      startDate: new Date("2025-10-01"),
      endDate: new Date("2026-09-30"),
      description:
        "Federal nutrition services funding under the Older Americans Act Title III-C. Supports congregate dining and home-delivered meals for adults 60+ in Hamilton County.",
      notes: "Quarterly narrative + financial reports required. Indirect cost rate capped at 8%.",
    },
    {
      id: grantPASSPORTId,
      orgId,
      funderId: funderODAId,
      name: `${SAMPLE_MARKER} PASSPORT Home Care Services`,
      status: "reporting",
      amountCents: cents(94_000),
      startDate: new Date("2025-07-01"),
      endDate: new Date("2026-06-30"),
      description:
        "State-funded home and community-based services for Medicaid-eligible older adults. Covers personal care, homemaker, and transportation.",
      notes: "Monthly billing reports required. Performance metric: units of service delivered.",
    },
    {
      id: grantGCFId,
      orgId,
      funderId: funderGCFId,
      name: `${SAMPLE_MARKER} Aging in Place Capacity Grant`,
      status: "active",
      amountCents: cents(35_000),
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      description:
        "Capacity-building grant to implement a client data management system and train staff on outcome tracking.",
      notes: "Mid-year and final narrative reports. Budget modifications require prior approval.",
    },
    {
      id: grantPGId,
      orgId,
      funderId: funderPGId,
      name: `${SAMPLE_MARKER} Senior Wellbeing Initiative`,
      status: "closeout",
      amountCents: cents(15_000),
      startDate: new Date("2025-04-01"),
      endDate: new Date("2026-03-31"),
      description: "Wellness programming and social engagement activities for homebound seniors.",
      notes: "Final report due April 30, 2026. All funds expended.",
    },
    {
      id: grantTitleIIIBId,
      orgId,
      funderId: funderHHSId,
      name: `${SAMPLE_MARKER} Title III-B Supportive Services`,
      status: "application",
      amountCents: cents(62_000),
      applicationDeadline: daysFromNow(18),
      description:
        "Older Americans Act Title III-B funding for transportation, legal assistance, and information & referral services.",
      notes: "Application in progress. Budget narrative and work plan required.",
    },
  ];

  // ---------------------------------------------------------------------------
  // 4. Allocations
  // ---------------------------------------------------------------------------

  const sampleAllocations: WithoutEntityId<NewGrantFundAllocation>[] = [
    {
      id: crypto.randomUUID(),
      grantId: grantTitleIIIId,
      fundId: fundNutritionId,
      allocatedAmountCents: cents(185_000),
    },
    {
      id: crypto.randomUUID(),
      grantId: grantPASSPORTId,
      fundId: fundCaregivingId,
      allocatedAmountCents: cents(94_000),
    },
    {
      id: crypto.randomUUID(),
      grantId: grantGCFId,
      fundId: fundCapacityId,
      allocatedAmountCents: cents(35_000),
    },
    {
      id: crypto.randomUUID(),
      grantId: grantPGId,
      fundId: fundGeneralId,
      allocatedAmountCents: cents(15_000),
    },
  ];

  // ---------------------------------------------------------------------------
  // 5. Expenses
  // ---------------------------------------------------------------------------

  // We'll capture the first few expense IDs for use in restriction releases
  const expenseNutrition0Id = crypto.randomUUID();
  const expenseNutrition1Id = crypto.randomUUID();
  const expensePassport0Id = crypto.randomUUID();
  const expensePassport1Id = crypto.randomUUID();

  const sampleExpenses: WithoutEntityId<NewExpense>[] = [
    // Title III-C — 6 months of meal program spend
    {
      id: expenseNutrition0Id,
      orgId,
      grantId: grantTitleIIIId,
      fundId: fundNutritionId,
      amountCents: cents(9_420),
      date: daysAgo(155),
      description: "Congregate meal ingredients & supplies — Oct",
      category: "Program Supplies",
      vendor: "Sysco Cincinnati",
    },
    {
      id: expenseNutrition1Id,
      orgId,
      grantId: grantTitleIIIId,
      fundId: fundNutritionId,
      amountCents: cents(4_800),
      date: daysAgo(155),
      description: "Nutrition coordinator — Oct salary allocation",
      category: "Personnel",
      vendor: null,
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantTitleIIIId,
      fundId: fundNutritionId,
      amountCents: cents(9_610),
      date: daysAgo(124),
      description: "Congregate meal ingredients & supplies — Nov",
      category: "Program Supplies",
      vendor: "Sysco Cincinnati",
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantTitleIIIId,
      fundId: fundNutritionId,
      amountCents: cents(4_800),
      date: daysAgo(124),
      description: "Nutrition coordinator — Nov salary allocation",
      category: "Personnel",
      vendor: null,
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantTitleIIIId,
      fundId: fundNutritionId,
      amountCents: cents(9_200),
      date: daysAgo(93),
      description: "Home-delivered meal packaging & delivery — Dec",
      category: "Program Supplies",
      vendor: "Sysco Cincinnati",
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantTitleIIIId,
      fundId: fundNutritionId,
      amountCents: cents(4_800),
      date: daysAgo(93),
      description: "Nutrition coordinator — Dec salary allocation",
      category: "Personnel",
      vendor: null,
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantTitleIIIId,
      fundId: fundNutritionId,
      amountCents: cents(9_750),
      date: daysAgo(62),
      description: "Meal program supplies — Jan",
      category: "Program Supplies",
      vendor: "Sysco Cincinnati",
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantTitleIIIId,
      fundId: fundNutritionId,
      amountCents: cents(4_800),
      date: daysAgo(62),
      description: "Nutrition coordinator — Jan salary allocation",
      category: "Personnel",
      vendor: null,
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantTitleIIIId,
      fundId: fundNutritionId,
      amountCents: cents(9_380),
      date: daysAgo(31),
      description: "Meal program supplies — Feb",
      category: "Program Supplies",
      vendor: "Sysco Cincinnati",
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantTitleIIIId,
      fundId: fundNutritionId,
      amountCents: cents(4_800),
      date: daysAgo(31),
      description: "Nutrition coordinator — Feb salary allocation",
      category: "Personnel",
      vendor: null,
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantTitleIIIId,
      fundId: fundNutritionId,
      amountCents: cents(9_100),
      date: daysAgo(3),
      description: "Meal program supplies — Mar",
      category: "Program Supplies",
      vendor: "Sysco Cincinnati",
    },
    // PASSPORT — home care spend
    {
      id: expensePassport0Id,
      orgId,
      grantId: grantPASSPORTId,
      fundId: fundCaregivingId,
      amountCents: cents(7_200),
      date: daysAgo(180),
      description: "Personal care aide hours — Jul",
      category: "Personnel",
      vendor: null,
    },
    {
      id: expensePassport1Id,
      orgId,
      grantId: grantPASSPORTId,
      fundId: fundCaregivingId,
      amountCents: cents(7_400),
      date: daysAgo(150),
      description: "Personal care aide hours — Aug",
      category: "Personnel",
      vendor: null,
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantPASSPORTId,
      fundId: fundCaregivingId,
      amountCents: cents(1_800),
      date: daysAgo(150),
      description: "Client transportation — Aug",
      category: "Transportation",
      vendor: "Metro/TANK",
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantPASSPORTId,
      fundId: fundCaregivingId,
      amountCents: cents(7_100),
      date: daysAgo(120),
      description: "Personal care aide hours — Sep",
      category: "Personnel",
      vendor: null,
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantPASSPORTId,
      fundId: fundCaregivingId,
      amountCents: cents(7_500),
      date: daysAgo(90),
      description: "Personal care aide hours — Oct",
      category: "Personnel",
      vendor: null,
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantPASSPORTId,
      fundId: fundCaregivingId,
      amountCents: cents(7_250),
      date: daysAgo(60),
      description: "Personal care aide hours — Nov",
      category: "Personnel",
      vendor: null,
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantPASSPORTId,
      fundId: fundCaregivingId,
      amountCents: cents(1_600),
      date: daysAgo(60),
      description: "Client transportation — Nov",
      category: "Transportation",
      vendor: "Metro/TANK",
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantPASSPORTId,
      fundId: fundCaregivingId,
      amountCents: cents(7_300),
      date: daysAgo(30),
      description: "Personal care aide hours — Dec",
      category: "Personnel",
      vendor: null,
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantPASSPORTId,
      fundId: fundCaregivingId,
      amountCents: cents(7_150),
      date: daysAgo(10),
      description: "Personal care aide hours — Jan",
      category: "Personnel",
      vendor: null,
    },
    // GCF Capacity
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantGCFId,
      fundId: fundCapacityId,
      amountCents: cents(4_200),
      date: daysAgo(90),
      description: "Staff data training — cohort 1",
      category: "Training",
      vendor: "Cincinnati State CE",
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantGCFId,
      fundId: fundCapacityId,
      amountCents: cents(2_800),
      date: daysAgo(45),
      description: "Software licenses Q1",
      category: "Technology",
      vendor: "Microsoft 365",
    },
    // P&G — fully expended
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantPGId,
      fundId: fundGeneralId,
      amountCents: cents(5_000),
      date: daysAgo(280),
      description: "Wellness event supplies & facilitator",
      category: "Program Supplies",
      vendor: "Various",
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantPGId,
      fundId: fundGeneralId,
      amountCents: cents(5_000),
      date: daysAgo(150),
      description: "Social engagement programming — Fall",
      category: "Program Expenses",
      vendor: "Various",
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantPGId,
      fundId: fundGeneralId,
      amountCents: cents(5_000),
      date: daysAgo(30),
      description: "Winter isolation prevention campaign",
      category: "Program Expenses",
      vendor: "Various",
    },
  ];

  // ---------------------------------------------------------------------------
  // 6. Reporting requirements
  // ---------------------------------------------------------------------------

  const sampleReportingRequirements: WithoutEntityId<NewReportingRequirement>[] = [
    // Title III-C quarterly
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantTitleIIIId,
      reportType: "Quarterly Financial Report",
      dueDate: new Date("2026-01-15"),
      // valid: upcoming | in_progress | submitted | overdue
      status: "submitted",
      submittedAt: new Date("2026-01-13"),
      notes: "Q1 FY26 submitted on time.",
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantTitleIIIId,
      reportType: "Quarterly Narrative Report",
      dueDate: new Date("2026-01-15"),
      status: "submitted",
      submittedAt: new Date("2026-01-13"),
      notes: "Q1 FY26 narrative submitted.",
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantTitleIIIId,
      reportType: "Quarterly Financial Report",
      dueDate: new Date("2026-04-15"),
      status: "in_progress",
      notes: "Q2 — pulling meal counts and expenditure summary.",
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantTitleIIIId,
      reportType: "Quarterly Narrative Report",
      dueDate: new Date("2026-04-15"),
      status: "upcoming",
      notes: null,
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantTitleIIIId,
      reportType: "Quarterly Financial Report",
      dueDate: new Date("2026-07-15"),
      status: "upcoming",
      notes: null,
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantTitleIIIId,
      reportType: "Annual Performance Report",
      dueDate: new Date("2026-10-31"),
      status: "upcoming",
      notes: null,
    },
    // PASSPORT monthly billing
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantPASSPORTId,
      reportType: "Monthly Billing Report",
      dueDate: daysAgo(75),
      status: "submitted",
      submittedAt: daysAgo(77),
      notes: "Oct billing — 312 units of service.",
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantPASSPORTId,
      reportType: "Monthly Billing Report",
      dueDate: daysAgo(45),
      status: "submitted",
      submittedAt: daysAgo(46),
      notes: "Nov billing — 298 units.",
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantPASSPORTId,
      reportType: "Monthly Billing Report",
      dueDate: daysAgo(15),
      status: "submitted",
      submittedAt: daysAgo(14),
      notes: "Dec billing — 321 units.",
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantPASSPORTId,
      reportType: "Monthly Billing Report",
      dueDate: daysFromNow(15),
      status: "in_progress",
      notes: "Jan billing — compiling service logs.",
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantPASSPORTId,
      reportType: "Final Programmatic Report",
      dueDate: new Date("2026-07-31"),
      status: "upcoming",
      notes: null,
    },
    // GCF
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantGCFId,
      reportType: "Mid-Year Progress Report",
      dueDate: new Date("2026-06-30"),
      status: "upcoming",
      notes: "Narrative + budget vs actuals. Training completion data needed.",
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantGCFId,
      reportType: "Final Report",
      dueDate: new Date("2027-01-31"),
      status: "upcoming",
      notes: null,
    },
    // P&G final
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantPGId,
      reportType: "Final Narrative & Financial Report",
      dueDate: new Date("2026-04-30"),
      status: "in_progress",
      notes: "All funds expended. Drafting impact summary.",
    },
  ];

  // ---------------------------------------------------------------------------
  // 7. Impact metrics
  // ---------------------------------------------------------------------------

  const metricMealsId = crypto.randomUUID();
  const metricClientsId = crypto.randomUUID();
  const metricHoursId = crypto.randomUUID();

  const sampleImpactMetrics: WithoutEntityId<NewImpactMetric>[] = [
    {
      id: metricMealsId,
      orgId,
      grantId: grantTitleIIIId,
      name: "Meals Served",
      targetValue: "12000",
      unit: "meals",
    },
    {
      id: metricClientsId,
      orgId,
      grantId: grantTitleIIIId,
      name: "Unique Clients Served",
      targetValue: "340",
      unit: "clients",
    },
    {
      id: metricHoursId,
      orgId,
      grantId: grantPASSPORTId,
      name: "Home Care Hours Delivered",
      targetValue: "4800",
      unit: "hours",
    },
  ];

  // ---------------------------------------------------------------------------
  // 8. Metric entries
  // ---------------------------------------------------------------------------

  const sampleMetricEntries: WithoutEntityId<NewMetricEntry>[] = [
    {
      id: crypto.randomUUID(),
      metricId: metricMealsId,
      value: "1940",
      periodStart: new Date("2025-10-01"),
      periodEnd: new Date("2025-10-31"),
    },
    {
      id: crypto.randomUUID(),
      metricId: metricMealsId,
      value: "2010",
      periodStart: new Date("2025-11-01"),
      periodEnd: new Date("2025-11-30"),
    },
    {
      id: crypto.randomUUID(),
      metricId: metricMealsId,
      value: "1880",
      periodStart: new Date("2025-12-01"),
      periodEnd: new Date("2025-12-31"),
    },
    {
      id: crypto.randomUUID(),
      metricId: metricMealsId,
      value: "2050",
      periodStart: new Date("2026-01-01"),
      periodEnd: new Date("2026-01-31"),
    },
    {
      id: crypto.randomUUID(),
      metricId: metricMealsId,
      value: "1920",
      periodStart: new Date("2026-02-01"),
      periodEnd: new Date("2026-02-28"),
    },
    {
      id: crypto.randomUUID(),
      metricId: metricClientsId,
      value: "312",
      periodStart: new Date("2025-10-01"),
      periodEnd: new Date("2026-02-28"),
    },
    {
      id: crypto.randomUUID(),
      metricId: metricHoursId,
      value: "312",
      periodStart: new Date("2025-07-01"),
      periodEnd: new Date("2025-07-31"),
    },
    {
      id: crypto.randomUUID(),
      metricId: metricHoursId,
      value: "298",
      periodStart: new Date("2025-08-01"),
      periodEnd: new Date("2025-08-31"),
    },
    {
      id: crypto.randomUUID(),
      metricId: metricHoursId,
      value: "321",
      periodStart: new Date("2025-09-01"),
      periodEnd: new Date("2025-09-30"),
    },
    {
      id: crypto.randomUUID(),
      metricId: metricHoursId,
      value: "308",
      periodStart: new Date("2025-10-01"),
      periodEnd: new Date("2025-10-31"),
    },
  ];

  // ---------------------------------------------------------------------------
  // 9. Closeout items (P&G grant)
  // ---------------------------------------------------------------------------

  const sampleCloseoutItems: WithoutEntityId<NewCloseoutItem>[] = [
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantPGId,
      label: "Confirm all expenses coded to correct budget lines",
      completed: true,
      completedAt: daysAgo(20),
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantPGId,
      label: "Draft final narrative report",
      completed: true,
      completedAt: daysAgo(10),
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantPGId,
      label: "Final financial reconciliation",
      completed: false,
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantPGId,
      label: "Submit final report to P&G Fund portal",
      completed: false,
      dueDate: new Date("2026-04-30"),
    },
    {
      id: crypto.randomUUID(),
      orgId,
      grantId: grantPGId,
      label: "Archive grant records (3-year retention)",
      completed: false,
    },
  ];

  // ---------------------------------------------------------------------------
  // 10. Contacts
  // ---------------------------------------------------------------------------

  const contactDorothyId = crypto.randomUUID();
  const contactRobertId = crypto.randomUUID();
  const contactMargaretId = crypto.randomUUID();
  const contactRiversideId = crypto.randomUUID();
  const contactJamesId = crypto.randomUUID();
  const contactPatriciaId = crypto.randomUUID();
  const contactFirmId = crypto.randomUUID();

  const sampleContacts: NewContact[] = [
    {
      id: contactDorothyId,
      orgId,
      type: "individual",
      firstName: `${SAMPLE_MARKER} Dorothy`,
      lastName: "Harmon",
      email: "d.harmon@sample.example",
      phone: "513-555-0192",
      // valid pipeline stages: prospect | donor | lapsed (from seed-demo)
      pipelineStage: "donor",
      notes: "Board member, consistent annual gift",
    },
    {
      id: contactRobertId,
      orgId,
      type: "individual",
      firstName: `${SAMPLE_MARKER} Robert`,
      lastName: "Chen",
      email: "rchen@sample.example",
      phone: "513-555-0448",
      pipelineStage: "donor",
    },
    {
      id: contactMargaretId,
      orgId,
      type: "individual",
      firstName: `${SAMPLE_MARKER} Margaret`,
      lastName: "Ellison",
      email: "mellison@sample.example",
      phone: "513-555-0371",
      pipelineStage: "donor",
      notes: "New donor this fiscal year — event attendee",
    },
    {
      id: contactRiversideId,
      orgId,
      type: "organization",
      organizationName: `${SAMPLE_MARKER} Riverside Community Foundation`,
      email: "grants@sample.example",
      pipelineStage: "donor",
    },
    {
      id: contactJamesId,
      orgId,
      type: "individual",
      firstName: `${SAMPLE_MARKER} James`,
      lastName: "Okafor",
      email: "jokafor@sample.example",
      phone: "513-555-0284",
      pipelineStage: "lapsed",
      notes: "Lapsed — gave last FY only, not yet renewed",
    },
    {
      id: contactPatriciaId,
      orgId,
      type: "individual",
      firstName: `${SAMPLE_MARKER} Patricia`,
      lastName: "Nguyen",
      email: "pnguyen@sample.example",
      phone: "513-555-0617",
      pipelineStage: "donor",
      notes: "Multi-year donor, prefers check",
    },
    {
      id: contactFirmId,
      orgId,
      type: "organization",
      organizationName: `${SAMPLE_MARKER} Brightwater Legal LLC`,
      email: "community@sample.example",
      pipelineStage: "donor",
      notes: "Corporate sponsor — annual table at gala",
    },
  ];

  // ---------------------------------------------------------------------------
  // 11. Donations
  // ---------------------------------------------------------------------------

  const sampleDonations: NewDonation[] = [
    // Dorothy Harmon — retained, annual gift
    {
      id: crypto.randomUUID(),
      orgId,
      contactId: contactDorothyId,
      amountCents: cents(2_500),
      date: new Date("2024-11-12"),
      type: "one_time",
      restriction: "unrestricted",
      fundId: fundGeneralId,
      receiptSent: true,
    },
    {
      id: crypto.randomUUID(),
      orgId,
      contactId: contactDorothyId,
      amountCents: cents(2_500),
      date: new Date("2025-11-08"),
      type: "one_time",
      restriction: "unrestricted",
      fundId: fundGeneralId,
      receiptSent: true,
    },
    // Robert Chen — retained, growing gift
    {
      id: crypto.randomUUID(),
      orgId,
      contactId: contactRobertId,
      amountCents: cents(1_000),
      date: new Date("2024-09-20"),
      type: "one_time",
      restriction: "unrestricted",
      fundId: fundGeneralId,
      receiptSent: true,
    },
    {
      id: crypto.randomUUID(),
      orgId,
      contactId: contactRobertId,
      amountCents: cents(1_200),
      date: new Date("2025-09-15"),
      type: "one_time",
      restriction: "unrestricted",
      fundId: fundGeneralId,
      receiptSent: true,
    },
    // Margaret Ellison — new this FY
    {
      id: crypto.randomUUID(),
      orgId,
      contactId: contactMargaretId,
      amountCents: cents(250),
      date: new Date("2026-02-14"),
      type: "one_time",
      restriction: "unrestricted",
      fundId: fundGeneralId,
      receiptSent: true,
    },
    // Riverside Community Foundation — retained, large gift
    {
      id: crypto.randomUUID(),
      orgId,
      contactId: contactRiversideId,
      amountCents: cents(10_000),
      date: new Date("2024-08-01"),
      type: "one_time",
      restriction: "temporarily_restricted",
      fundId: fundNutritionId,
      receiptSent: true,
    },
    {
      id: crypto.randomUUID(),
      orgId,
      contactId: contactRiversideId,
      amountCents: cents(10_000),
      date: new Date("2025-08-05"),
      type: "one_time",
      restriction: "temporarily_restricted",
      fundId: fundNutritionId,
      receiptSent: true,
    },
    // James Okafor — lapsed, last FY only
    {
      id: crypto.randomUUID(),
      orgId,
      contactId: contactJamesId,
      amountCents: cents(500),
      date: new Date("2025-03-10"),
      type: "one_time",
      restriction: "unrestricted",
      fundId: fundGeneralId,
      receiptSent: true,
    },
    // Patricia Nguyen — retained, recurring
    {
      id: crypto.randomUUID(),
      orgId,
      contactId: contactPatriciaId,
      amountCents: cents(750),
      date: new Date("2024-12-01"),
      type: "recurring",
      restriction: "unrestricted",
      fundId: fundGeneralId,
      receiptSent: true,
    },
    {
      id: crypto.randomUUID(),
      orgId,
      contactId: contactPatriciaId,
      amountCents: cents(750),
      date: new Date("2025-03-01"),
      type: "recurring",
      restriction: "unrestricted",
      fundId: fundGeneralId,
      receiptSent: true,
    },
    {
      id: crypto.randomUUID(),
      orgId,
      contactId: contactPatriciaId,
      amountCents: cents(750),
      date: new Date("2025-06-01"),
      type: "recurring",
      restriction: "unrestricted",
      fundId: fundGeneralId,
      receiptSent: true,
    },
    {
      id: crypto.randomUUID(),
      orgId,
      contactId: contactPatriciaId,
      amountCents: cents(750),
      date: new Date("2025-09-01"),
      type: "recurring",
      restriction: "unrestricted",
      fundId: fundGeneralId,
      receiptSent: true,
    },
    {
      id: crypto.randomUUID(),
      orgId,
      contactId: contactPatriciaId,
      amountCents: cents(750),
      date: new Date("2025-12-01"),
      type: "recurring",
      restriction: "unrestricted",
      fundId: fundGeneralId,
      receiptSent: true,
    },
    {
      id: crypto.randomUUID(),
      orgId,
      contactId: contactPatriciaId,
      amountCents: cents(750),
      date: new Date("2026-03-01"),
      type: "recurring",
      restriction: "unrestricted",
      fundId: fundGeneralId,
      receiptSent: true,
    },
    // Brightwater Legal — retained, corporate gala sponsor
    {
      id: crypto.randomUUID(),
      orgId,
      contactId: contactFirmId,
      amountCents: cents(5_000),
      date: new Date("2024-10-05"),
      type: "one_time",
      restriction: "unrestricted",
      fundId: fundGeneralId,
      receiptSent: true,
    },
    {
      id: crypto.randomUUID(),
      orgId,
      contactId: contactFirmId,
      amountCents: cents(5_000),
      date: new Date("2025-10-10"),
      type: "one_time",
      restriction: "unrestricted",
      fundId: fundGeneralId,
      receiptSent: true,
    },
  ];

  // ---------------------------------------------------------------------------
  // 12. Restriction terms (5 terms mirroring seed-demo terms A–E)
  // ---------------------------------------------------------------------------

  const termNutritionId = crypto.randomUUID();
  const termPassportId = crypto.randomUUID();
  const termPGId = crypto.randomUUID();
  const termGCFId = crypto.randomUUID();
  const termTitleIIIBId = crypto.randomUUID();

  const sampleRestrictionTerms: NewRestrictionTerm[] = [
    // Term A — purpose-restricted nutrition program (healthy)
    {
      id: termNutritionId,
      orgId,
      fundId: fundNutritionId,
      // valid restriction types: purpose | time | purpose_and_time (from seed-demo)
      restrictionType: "purpose",
      source: "funder",
      title: `${SAMPLE_MARKER} Title III-C senior meal program`,
      purposeStatement: "Funds may only be spent on congregate and home-delivered meal programs.",
      releaseRule: "Release as program expenses are incurred each month.",
      startDate: new Date("2025-10-01"),
      beginningBalanceCents: 0,
      currency: "USD",
      evidenceRequirement: "Quarterly progress report + invoice copies",
    },
    // Term B — time-bound PASSPORT grant (healthy)
    {
      id: termPassportId,
      orgId,
      grantId: grantPASSPORTId,
      restrictionType: "purpose_and_time",
      source: "funder",
      title: `${SAMPLE_MARKER} PASSPORT home care services`,
      purposeStatement: "Restricted to PASSPORT-eligible home and community services.",
      releaseRule: "Bill monthly against units of service delivered.",
      startDate: new Date("2025-07-01"),
      endDate: new Date("2026-06-30"),
      beginningBalanceCents: 0,
      currency: "USD",
      evidenceRequirement: "Monthly billing report + signed timesheet",
    },
    // Term C — time-bound, EXPIRED with leftover (triggers expired_time_restriction alert)
    {
      id: termPGId,
      orgId,
      grantId: grantPGId,
      restrictionType: "time",
      source: "funder",
      title: `${SAMPLE_MARKER} Senior Wellbeing Initiative — closeout`,
      releaseRule: "Spend down before final report April 30, 2026.",
      startDate: new Date("2025-04-01"),
      endDate: daysAgo(15),
      beginningBalanceCents: 0,
      currency: "USD",
    },
    // Term D — intentionally overdrawn (triggers negative_restricted_balance alert)
    {
      id: termGCFId,
      orgId,
      grantId: grantGCFId,
      restrictionType: "purpose",
      source: "funder",
      title: `${SAMPLE_MARKER} Aging in Place Capacity Grant`,
      purposeStatement: "Restricted to data system implementation and staff training.",
      beginningBalanceCents: 0,
      currency: "USD",
    },
    // Term E — recently funded, evidence requirement not yet met (triggers missing_evidence alert)
    {
      id: termTitleIIIBId,
      orgId,
      grantId: grantTitleIIIId,
      restrictionType: "purpose",
      source: "funder",
      title: `${SAMPLE_MARKER} Title III-B supportive services — pending documentation`,
      purposeStatement:
        "Funds may only be spent on transportation, legal assistance, and information & referral services.",
      releaseRule: "Release as program expenses are incurred.",
      startDate: daysAgo(20),
      beginningBalanceCents: 0,
      currency: "USD",
      evidenceRequirement: "Signed grant agreement on file before first release",
    },
  ];

  // ---------------------------------------------------------------------------
  // 13. Restriction allowed categories (Term A only)
  // ---------------------------------------------------------------------------

  const sampleRestrictionAllowedCategories: NewRestrictionAllowedCategory[] = [
    {
      id: crypto.randomUUID(),
      orgId,
      restrictionTermId: termNutritionId,
      category: "Program Supplies",
    },
    {
      id: crypto.randomUUID(),
      orgId,
      restrictionTermId: termNutritionId,
      category: "Personnel",
    },
  ];

  // ---------------------------------------------------------------------------
  // 14. Restriction additions
  // ---------------------------------------------------------------------------

  const sampleRestrictionAdditions: NewRestrictionAddition[] = [
    {
      id: crypto.randomUUID(),
      orgId,
      restrictionTermId: termNutritionId,
      grantId: grantTitleIIIId,
      amountCents: cents(185_000),
      date: new Date("2025-10-01"),
      description: "Title III-C award funded",
    },
    {
      id: crypto.randomUUID(),
      orgId,
      restrictionTermId: termPassportId,
      grantId: grantPASSPORTId,
      amountCents: cents(94_000),
      date: new Date("2025-07-01"),
      description: "PASSPORT award funded",
    },
    {
      id: crypto.randomUUID(),
      orgId,
      restrictionTermId: termPGId,
      grantId: grantPGId,
      amountCents: cents(15_000),
      date: new Date("2025-04-01"),
      description: "P&G award funded",
    },
    {
      id: crypto.randomUUID(),
      orgId,
      restrictionTermId: termGCFId,
      grantId: grantGCFId,
      amountCents: cents(35_000),
      date: new Date("2026-01-01"),
      description: "GCF capacity award funded",
    },
    {
      id: crypto.randomUUID(),
      orgId,
      restrictionTermId: termTitleIIIBId,
      grantId: grantTitleIIIId,
      amountCents: cents(62_000),
      date: daysAgo(20),
      description: "Title III-B supplemental award funded",
    },
  ];

  // ---------------------------------------------------------------------------
  // 15. Restriction releases
  // ---------------------------------------------------------------------------

  const releaseNutrition0Id = crypto.randomUUID();
  const releasePassportId = crypto.randomUUID();

  const sampleRestrictionReleases: NewRestrictionRelease[] = [
    // Term A — two releases; first will have evidence, second intentionally unsupported
    {
      id: releaseNutrition0Id,
      orgId,
      restrictionTermId: termNutritionId,
      expenseId: expenseNutrition0Id,
      amountCents: cents(9_420),
      date: daysAgo(155),
      reason: "October meal program supplies",
      source: "manual",
    },
    {
      id: crypto.randomUUID(),
      orgId,
      restrictionTermId: termNutritionId,
      expenseId: expenseNutrition1Id,
      amountCents: cents(4_800),
      date: daysAgo(155),
      reason: "October nutrition coordinator allocation",
      source: "manual",
    },
    // Term B — evidenced release
    {
      id: releasePassportId,
      orgId,
      restrictionTermId: termPassportId,
      expenseId: expensePassport0Id,
      amountCents: cents(7_800),
      date: daysAgo(40),
      reason: "PASSPORT March billing",
      source: "manual",
    },
    // Term C — release without evidence (triggers release_without_support)
    {
      id: crypto.randomUUID(),
      orgId,
      restrictionTermId: termPGId,
      amountCents: cents(14_500),
      date: daysAgo(60),
      reason: "Wellness programming expenses",
      source: "manual",
    },
    // Term D — two releases totaling more than addition (overdrawn: 36,000 > 35,000)
    {
      id: crypto.randomUUID(),
      orgId,
      restrictionTermId: termGCFId,
      amountCents: cents(20_000),
      date: daysAgo(45),
      reason: "Client data platform license",
      source: "manual",
    },
    {
      id: crypto.randomUUID(),
      orgId,
      restrictionTermId: termGCFId,
      amountCents: cents(16_000),
      date: daysAgo(10),
      reason: "Staff training onsite delivery",
      source: "manual",
    },
    // Term E — intentionally no releases (missing_evidence alert)
  ];

  // ---------------------------------------------------------------------------
  // 16. Restriction evidence links
  // evidenceType values observed in seed-demo: "grant_agreement" | "award_letter"
  // No documentId — the pure builder has no DB-resident document rows to reference.
  // ---------------------------------------------------------------------------

  const sampleRestrictionEvidenceLinks: NewRestrictionEvidenceLink[] = [
    {
      id: crypto.randomUUID(),
      orgId,
      restrictionReleaseId: releaseNutrition0Id,
      label: "Title III-C grant agreement",
      evidenceType: "grant_agreement",
    },
    {
      id: crypto.randomUUID(),
      orgId,
      restrictionReleaseId: releasePassportId,
      label: "PASSPORT award letter",
      evidenceType: "award_letter",
    },
  ];

  // ---------------------------------------------------------------------------
  // Return assembled content in FK-safe order
  // ---------------------------------------------------------------------------

  return {
    funders: sampleFunders.map((row) => ({ ...row, entityId })),
    funds: sampleFunds.map((row) => ({ ...row, entityId })),
    grants: sampleGrants.map((row) => ({ ...row, entityId })),
    allocations: sampleAllocations.map((row) => ({ ...row, entityId })),
    expenses: sampleExpenses.map((row) => ({ ...row, entityId })),
    reportingRequirements: sampleReportingRequirements.map((row) => ({ ...row, entityId })),
    impactMetrics: sampleImpactMetrics.map((row) => ({ ...row, entityId })),
    metricEntries: sampleMetricEntries.map((row) => ({ ...row, entityId })),
    closeoutItems: sampleCloseoutItems.map((row) => ({ ...row, entityId })),
    contacts: sampleContacts,
    donations: sampleDonations,
    restrictionTerms: sampleRestrictionTerms,
    restrictionAllowedCategories: sampleRestrictionAllowedCategories,
    restrictionAdditions: sampleRestrictionAdditions,
    restrictionReleases: sampleRestrictionReleases,
    restrictionEvidenceLinks: sampleRestrictionEvidenceLinks,
  };
}
