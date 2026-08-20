import { and, asc, count as drizzleCount, desc, eq, isNull, sql } from "drizzle-orm";
import {
  chartOfAccounts,
  contacts,
  donations,
  entities,
  fiscalPeriods,
  funds,
  funders,
  grantFundAllocations,
  grantOpportunities,
  grants,
  importHistory,
  journalLines,
  organizations,
  pledgeInstallments,
  pledges,
  type Database,
  type TransactionDatabase,
} from "@grantpipe/db";
import {
  CONTACT_TYPES,
  DONATION_TYPES,
  DONOR_PIPELINE_STAGES,
  FUNDER_TYPES,
  GRANT_OPPORTUNITY_DEADLINE_SOURCES,
  GRANT_SOURCE_TYPES,
  GRANT_CAP_OVERAGE_COPY,
  GRANT_CAP_SOFT_HEADROOM,
  getActiveGrantCap,
  getGrantCapWithSoftHeadroom,
  GRANT_STATUSES,
  FUND_TYPES,
  FUND_STATUSES,
  buildResolvedImportMapping,
  getMigrationSourcePlan,
  isBillingCapGrantStatus,
  isPledgeConditional,
  presentValuePledge,
  RESTRICTION_TYPES,
  type MigrationSourceId,
} from "@grantpipe/shared";
import type {
  ImportCommitInput,
  ImportHistoryListParams,
  ImportPreviewInput,
  ImportEntityType,
  ImportHistoryStatus,
} from "@grantpipe/shared";
import { parseCsvText } from "./csv";
import { recordActivityLog } from "../../lib/activity-log";
import { postDonation, postPledgeRecognition } from "../accounting/postingEngine";
import { insertJournalEntryWithNextNumber } from "../accounting/journalEntryNumber";
import { countBillingCapGrants, resolvePlanTier } from "../grants/grant.service";
import { buildManualGrantOpportunitySourceId } from "../grants/opportunity.service";
import { HTTPException } from "hono/http-exception";

type JsonScalar = string | number | boolean | null;

type CommitCounts = {
  contacts: number;
  donations: number;
  grants: number;
  funders: number;
  grantOpportunities: number;
  funds: number;
  openingBalanceLines: number;
  pledges: number;
  pledgeInstallments: number;
};

type ImportResult = {
  history: typeof importHistory.$inferSelect;
  totalRows: number;
  insertedRows: number;
  duplicateRows: number;
  failedRows: number;
  createdCounts: CommitCounts;
};

type MigrationPlanProgressStatus = "completed" | "has_errors" | "not_started";

type MigrationPlanProgress = {
  entityType: ImportEntityType;
  status: MigrationPlanProgressStatus;
  latestImportAt: Date | null;
  insertedRows: number;
  failedRows: number;
};

type RowOutcome = {
  inserted: boolean;
  duplicate: boolean;
  failed: boolean;
  errors: RowFailure[];
  createdCounts: CommitCounts;
};

type ActiveGrantLimitState = {
  planTier: Awaited<ReturnType<typeof resolvePlanTier>>;
  limit: number;
  softLimit: number;
  currentActiveGrants: number;
  importedActiveGrants: number;
};

type OpeningBalancePreviewReconciliation = {
  debitTotalCents: number;
  creditTotalCents: number;
  balanced: boolean;
  commitBlocked: boolean;
  fiscalPeriod: {
    id: string | null;
    status: string | null;
    open: boolean;
    dateInRange: boolean | null;
  };
  unresolvedAccounts: Array<{
    rowNumber: number;
    accountId?: string;
    accountCode?: string;
  }>;
  unresolvedFunds: Array<{
    rowNumber: number;
    fundId?: string;
    fundName?: string;
  }>;
  unresolvedGrants: Array<{
    rowNumber: number;
    grantId?: string;
    grantName?: string;
  }>;
  errors: RowErrorDetail[];
};

async function resolveDefaultEntityId(db: Database | TransactionDatabase, orgId: string) {
  if (!db.query?.organizations?.findFirst) return "entity-1";
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: { defaultEntityId: true },
  });
  if (org && !("defaultEntityId" in org)) return "entity-1";
  if (!org?.defaultEntityId) {
    throw new HTTPException(400, { message: "Organization default entity is required." });
  }
  return org.defaultEntityId;
}

async function resolveImportEntityId(
  db: Database | TransactionDatabase,
  orgId: string,
  entityId?: string | null,
) {
  if (!entityId) {
    return resolveDefaultEntityId(db, orgId);
  }

  if (db.query?.entities?.findFirst) {
    const entity = await db.query.entities.findFirst({
      where: and(eq(entities.id, entityId), eq(entities.orgId, orgId), isNull(entities.deletedAt)),
      columns: { id: true },
    });
    if (!entity) {
      throw new HTTPException(400, { message: "Active entity must belong to this organization." });
    }
  }

  return entityId;
}

type RowFailure = {
  field?: string;
  code: string;
  message: string;
};

type RowErrorDetail = RowFailure & {
  rowIndex: number;
  rowNumber: number;
};

type AmountParseResult = { value: number } | { error: RowFailure };

class RowValidationError extends Error {
  readonly failure: RowFailure;

  constructor(failure: RowFailure) {
    super(failure.message);
    this.name = "RowValidationError";
    this.failure = failure;
  }
}

const EMPTY_COUNTS: CommitCounts = {
  contacts: 0,
  donations: 0,
  grants: 0,
  funders: 0,
  grantOpportunities: 0,
  funds: 0,
  openingBalanceLines: 0,
  pledges: 0,
  pledgeInstallments: 0,
};

function failedRow(field: string, code: string, message: string): RowOutcome {
  return {
    inserted: false,
    duplicate: false,
    failed: true,
    errors: [{ field, code, message }],
    createdCounts: cloneCounts(EMPTY_COUNTS),
  };
}

function duplicateRow(): RowOutcome {
  return {
    inserted: false,
    duplicate: true,
    failed: false,
    errors: [],
    createdCounts: cloneCounts(EMPTY_COUNTS),
  };
}

function cloneCounts(counts: CommitCounts): CommitCounts {
  return {
    contacts: counts.contacts,
    donations: counts.donations,
    grants: counts.grants,
    funders: counts.funders,
    grantOpportunities: counts.grantOpportunities,
    funds: counts.funds,
    openingBalanceLines: counts.openingBalanceLines,
    pledges: counts.pledges,
    pledgeInstallments: counts.pledgeInstallments,
  };
}

function addCounts(target: CommitCounts, source: CommitCounts) {
  target.contacts += source.contacts;
  target.donations += source.donations;
  target.grants += source.grants;
  target.funders += source.funders;
  target.grantOpportunities += source.grantOpportunities;
  target.funds += source.funds;
  target.openingBalanceLines += source.openingBalanceLines;
  target.pledges += source.pledges;
  target.pledgeInstallments += source.pledgeInstallments;
}

function normalizeText(value: JsonScalar | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeHttpUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeHeaderToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function hasValidGroupedDigits(value: string): boolean {
  return /^\d+$/.test(value) || /^\d{1,3}(?:,\d{3})+$/.test(value);
}

function hasValidGroupedDollarAmount(value: string): boolean {
  const parts = value.split(".");
  if (parts.length > 2) return false;

  const [dollarsPart, centsPart] = parts;
  if (!dollarsPart) return false;
  if (centsPart !== undefined && !/^\d{1,2}$/.test(centsPart)) {
    return false;
  }

  return hasValidGroupedDigits(dollarsPart);
}

function normalizeAmountCents(value: JsonScalar | undefined, sourceKey: string): AmountParseResult {
  const text = normalizeText(value);
  if (!text) {
    return {
      error: {
        field: "amount",
        code: "missing_amount",
        message: "Add a positive amount for this row.",
      },
    };
  }

  const normalizedSourceKey = normalizeHeaderToken(sourceKey);
  const isExplicitCents = ["amountcents", "amountcent", "cents"].includes(normalizedSourceKey);

  if (isExplicitCents) {
    const centsText = text.replace(/\s/g, "");
    if (hasValidGroupedDigits(centsText)) {
      const cleanedCents = centsText.replace(/,/g, "");
      const parsed = Number(cleanedCents);
      if (Number.isSafeInteger(parsed) && parsed > 0) {
        return { value: parsed };
      }
    }
    return {
      error: {
        field: "amount",
        code: "invalid_amount_cents",
        message: "Use a positive whole-number cent amount, such as 2500.",
      },
    };
  }

  const dollarText = text.replace(/[$\s]/g, "");
  if (!hasValidGroupedDollarAmount(dollarText)) {
    return {
      error: {
        field: "amount",
        code: "invalid_amount",
        message: "Use a positive dollar amount with up to 2 decimals, such as 25.00.",
      },
    };
  }

  const cleaned = dollarText.replace(/,/g, "");
  const [dollarsPart, centsPart = ""] = cleaned.split(".");
  const dollars = Number(dollarsPart);
  const cents = Number(centsPart.padEnd(2, "0"));
  const amountCents = dollars * 100 + cents;

  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    return {
      error: {
        field: "amount",
        code: "invalid_amount",
        message: "Use a positive dollar amount with up to 2 decimals, such as 25.00.",
      },
    };
  }

  return { value: amountCents };
}

function optionalMappedAmountCents(
  row: Record<string, unknown>,
  mapping: Record<string, string>,
  fieldName: string,
): AmountParseResult | undefined {
  return mapping[fieldName] && normalizeText(readMappedValue(row, mapping, fieldName))
    ? readMappedAmountCents(row, mapping, fieldName)
    : undefined;
}

function normalizeBoolean(value: JsonScalar | undefined): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return undefined;
}

function normalizeDate(value: JsonScalar | undefined): Date | undefined {
  const text = normalizeText(value);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function normalizeEnumValue<T extends readonly string[]>(
  value: JsonScalar | undefined,
  allowed: T,
): T[number] | undefined {
  const text = normalizeText(value);
  if (!text) return undefined;
  const token = normalizeHeaderToken(text);
  const aliases: Record<string, string> = {
    majordonor: "donor",
    lapsedonor: "lapsed",
    onetime: "one_time",
    oneoff: "one_time",
    recurringgift: "recurring",
    foundationgrant: "foundation",
    corporation: "corporate",
    govt: "government",
  };
  const aliased = normalizeHeaderToken(aliases[token] ?? token);
  return allowed.find((option) => normalizeHeaderToken(option) === aliased) as
    | T[number]
    | undefined;
}

function invalidEnumRow(field: string, allowed: readonly string[]): RowOutcome {
  return failedRow(field, "invalid_enum", `Use one of: ${allowed.join(", ")}.`);
}

function readMappedEnum<T extends readonly string[]>(
  row: Record<string, unknown>,
  mapping: Record<string, string>,
  fieldName: string,
  allowed: T,
): { value: T[number] | undefined } | { error: RowFailure } {
  const rawValue = readMappedValue(row, mapping, fieldName);
  if (normalizeText(rawValue) === undefined) return { value: undefined };
  const normalized = normalizeEnumValue(rawValue, allowed);
  if (!normalized) {
    return {
      error: {
        field: fieldName,
        code: "invalid_enum",
        message: `Use one of: ${allowed.join(", ")}.`,
      },
    };
  }
  return { value: normalized };
}

function isJsonScalar(value: unknown): value is JsonScalar {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function readMappedValue(
  row: Record<string, unknown>,
  mapping: Record<string, string>,
  fieldName: string,
) {
  const sourceKey = mapping[fieldName];
  if (!sourceKey) return undefined;
  const value = row[sourceKey];
  return isJsonScalar(value) ? value : undefined;
}

function readMappedText(
  row: Record<string, unknown>,
  mapping: Record<string, string>,
  fieldName: string,
) {
  return normalizeText(readMappedValue(row, mapping, fieldName));
}

function readMappedAmountCents(
  row: Record<string, unknown>,
  mapping: Record<string, string>,
  fieldName: string,
) {
  const sourceKey = mapping[fieldName];
  if (!sourceKey) {
    return {
      error: {
        field: "amount",
        code: "missing_amount",
        message: "Add a positive amount for this row.",
      },
    };
  }
  return normalizeAmountCents(readMappedValue(row, mapping, fieldName), sourceKey);
}

function readMappedBoolean(
  row: Record<string, unknown>,
  mapping: Record<string, string>,
  fieldName: string,
) {
  return normalizeBoolean(readMappedValue(row, mapping, fieldName));
}

function readMappedDate(
  row: Record<string, unknown>,
  mapping: Record<string, string>,
  fieldName: string,
) {
  return normalizeDate(readMappedValue(row, mapping, fieldName));
}

function contactLookupKey(params: {
  email?: string;
  firstName?: string;
  lastName?: string;
  organizationName?: string;
  type: "individual" | "organization";
}) {
  if (params.email) return `email:${params.email.toLowerCase()}`;
  if (params.type === "organization" && params.organizationName) {
    return `organization:${params.organizationName.toLowerCase()}`;
  }

  const name = [params.firstName, params.lastName].filter(Boolean).join(" ").trim();
  return name ? `${params.type}:${name.toLowerCase()}` : undefined;
}

async function findExistingContact(
  db: TransactionDatabase,
  params: {
    orgId: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    organizationName?: string;
    type: "individual" | "organization";
  },
): Promise<typeof contacts.$inferSelect | undefined> {
  if (params.email) {
    return db.query.contacts.findFirst({
      where: and(
        eq(contacts.orgId, params.orgId),
        eq(sql`lower(${contacts.email})`, params.email.toLowerCase()),
        isNull(contacts.deletedAt),
      ),
    });
  }

  if (params.type === "organization" && params.organizationName) {
    return db.query.contacts.findFirst({
      where: and(
        eq(contacts.orgId, params.orgId),
        eq(contacts.type, "organization"),
        eq(sql`lower(${contacts.organizationName})`, params.organizationName.toLowerCase()),
        isNull(contacts.deletedAt),
      ),
    });
  }

  if (params.firstName || params.lastName) {
    const conditions = [eq(contacts.orgId, params.orgId), eq(contacts.type, "individual")];
    if (params.firstName) {
      conditions.push(eq(sql`lower(${contacts.firstName})`, params.firstName.toLowerCase()));
    }
    if (params.lastName) {
      conditions.push(eq(sql`lower(${contacts.lastName})`, params.lastName.toLowerCase()));
    }
    conditions.push(isNull(contacts.deletedAt));

    return db.query.contacts.findFirst({
      where: and(...conditions),
    });
  }

  return undefined;
}

async function createContactRow(
  db: TransactionDatabase,
  params: {
    orgId: string;
    actorId?: string;
    type: "individual" | "organization";
    firstName?: string;
    lastName?: string;
    organizationName?: string;
    email?: string;
    phone?: string;
    address?: string;
    pipelineStage?: string;
    notes?: string;
    isVolunteer?: boolean;
    affiliatedOrgId?: string;
  },
): Promise<typeof contacts.$inferSelect> {
  const [contact] = await db.insert(contacts).values(params).returning();
  if (!contact) {
    throw new Error("Failed to create contact");
  }

  if (params.actorId) {
    await recordActivityLog(db, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "created",
      entityType: "contact",
      entityId: contact.id,
      changes: {
        type: params.type,
        firstName: params.firstName ?? null,
        lastName: params.lastName ?? null,
        organizationName: params.organizationName ?? null,
        email: params.email ?? null,
      },
    });
  }

  return contact;
}

async function assertImportAffiliatedOrgInTenant(
  db: TransactionDatabase,
  params: { orgId: string; affiliatedOrgId?: string; field: string },
): Promise<void> {
  if (!params.affiliatedOrgId) return;

  const affiliatedOrg = await db.query.contacts.findFirst({
    where: and(
      eq(contacts.id, params.affiliatedOrgId),
      eq(contacts.orgId, params.orgId),
      isNull(contacts.deletedAt),
    ),
  });

  if (!affiliatedOrg) {
    throw new RowValidationError({
      field: params.field,
      code: "invalid_affiliated_org",
      message: "Affiliated organization must belong to this organization.",
    });
  }
}

async function resolveContactForDonation(
  db: TransactionDatabase,
  params: {
    orgId: string;
    actorId?: string;
    row: Record<string, unknown>;
    mapping: Record<string, string>;
    seenKeys: Set<string>;
    createdCounts: CommitCounts;
  },
): Promise<typeof contacts.$inferSelect> {
  const contactId = readMappedText(params.row, params.mapping, "contactId");
  if (contactId) {
    const existingById = await db.query.contacts.findFirst({
      where: and(
        eq(contacts.id, contactId),
        eq(contacts.orgId, params.orgId),
        isNull(contacts.deletedAt),
      ),
    });
    if (existingById) return existingById;
  }

  const email = readMappedText(params.row, params.mapping, "contactEmail");
  const firstName = readMappedText(params.row, params.mapping, "contactFirstName");
  const lastName = readMappedText(params.row, params.mapping, "contactLastName");
  const organizationName = readMappedText(params.row, params.mapping, "contactOrganizationName");
  const typeResult = readMappedEnum(params.row, params.mapping, "contactType", CONTACT_TYPES);
  if ("error" in typeResult) {
    throw new RowValidationError(typeResult.error);
  }
  const type = typeResult.value ?? (organizationName ? "organization" : "individual");

  const existing = await findExistingContact(db, {
    orgId: params.orgId,
    email,
    firstName,
    lastName,
    organizationName,
    type,
  });

  if (existing) return existing;

  const contactLookup = contactLookupKey({
    email,
    firstName,
    lastName,
    organizationName,
    type,
  });

  if (!contactLookup) {
    throw new RowValidationError({
      field: "contact",
      code: "missing_contact_lookup",
      message: "Add contact details GrantPipe can match or create before importing this donation.",
    });
  }

  if (params.seenKeys.has(contactLookup)) {
    throw new RowValidationError({
      field: "contact",
      code: "duplicate_contact_lookup",
      message: "This donation row repeats contact details already used earlier in the import.",
    });
  }

  const affiliatedOrgId = readMappedText(params.row, params.mapping, "contactAffiliatedOrgId");
  await assertImportAffiliatedOrgInTenant(db, {
    orgId: params.orgId,
    affiliatedOrgId,
    field: "contactAffiliatedOrgId",
  });

  params.seenKeys.add(contactLookup);

  const created = await createContactRow(db, {
    orgId: params.orgId,
    actorId: params.actorId,
    type,
    firstName,
    lastName,
    organizationName,
    email,
    phone: readMappedText(params.row, params.mapping, "contactPhone"),
    address: readMappedText(params.row, params.mapping, "contactAddress"),
    pipelineStage: readMappedText(params.row, params.mapping, "contactPipelineStage"),
    notes: readMappedText(params.row, params.mapping, "contactNotes"),
    isVolunteer: readMappedBoolean(params.row, params.mapping, "contactIsVolunteer"),
    affiliatedOrgId,
  });

  addCounts(params.createdCounts, { ...EMPTY_COUNTS, contacts: 1 });
  return created;
}

async function processContactRow(
  db: TransactionDatabase,
  params: {
    orgId: string;
    entityId: string;
    actorId?: string;
    row: Record<string, unknown>;
    mapping: Record<string, string>;
    seenKeys: Set<string>;
    createdCounts: CommitCounts;
  },
): Promise<RowOutcome> {
  const typeResult = readMappedEnum(params.row, params.mapping, "type", CONTACT_TYPES);
  if ("error" in typeResult) {
    return invalidEnumRow("type", CONTACT_TYPES);
  }
  const type = typeResult.value ?? "individual";
  const pipelineStageResult = readMappedEnum(
    params.row,
    params.mapping,
    "pipelineStage",
    DONOR_PIPELINE_STAGES,
  );
  if ("error" in pipelineStageResult) {
    return invalidEnumRow("pipelineStage", DONOR_PIPELINE_STAGES);
  }
  const firstName = readMappedText(params.row, params.mapping, "firstName");
  const lastName = readMappedText(params.row, params.mapping, "lastName");
  const organizationName = readMappedText(params.row, params.mapping, "organizationName");
  const email = readMappedText(params.row, params.mapping, "email");
  const lookupKey = contactLookupKey({ email, firstName, lastName, organizationName, type });

  if (!lookupKey) {
    return failedRow(
      "contact",
      "missing_contact_lookup",
      "Add an email, organization name, or first/last name so GrantPipe can identify this contact.",
    );
  }

  if (params.seenKeys.has(lookupKey)) {
    return duplicateRow();
  }

  const existing = await findExistingContact(db, {
    orgId: params.orgId,
    email,
    firstName,
    lastName,
    organizationName,
    type,
  });

  if (existing) {
    params.seenKeys.add(lookupKey);
    return duplicateRow();
  }

  const affiliatedOrgId = readMappedText(params.row, params.mapping, "affiliatedOrgId");
  try {
    await assertImportAffiliatedOrgInTenant(db, {
      orgId: params.orgId,
      affiliatedOrgId,
      field: "affiliatedOrgId",
    });
  } catch (error) {
    if (!(error instanceof RowValidationError)) {
      throw error;
    }
    return failedRow(error.failure.field ?? "affiliatedOrgId", error.failure.code, error.message);
  }

  params.seenKeys.add(lookupKey);

  const contact = await createContactRow(db, {
    orgId: params.orgId,
    actorId: params.actorId,
    type,
    firstName,
    lastName,
    organizationName,
    email,
    phone: readMappedText(params.row, params.mapping, "phone"),
    address: readMappedText(params.row, params.mapping, "address"),
    pipelineStage: pipelineStageResult.value,
    notes: readMappedText(params.row, params.mapping, "notes"),
    isVolunteer: readMappedBoolean(params.row, params.mapping, "isVolunteer"),
    affiliatedOrgId,
  });

  const createdCounts = cloneCounts(EMPTY_COUNTS);
  if (contact) {
    createdCounts.contacts = 1;
  }

  addCounts(params.createdCounts, createdCounts);
  return { inserted: true, duplicate: false, failed: false, errors: [], createdCounts };
}

async function processDonationRow(
  db: TransactionDatabase,
  params: {
    orgId: string;
    actorId?: string;
    row: Record<string, unknown>;
    mapping: Record<string, string>;
    seenKeys: Set<string>;
    createdCounts: CommitCounts;
  },
): Promise<RowOutcome> {
  const amountResult = readMappedAmountCents(params.row, params.mapping, "amountCents");
  const date = readMappedDate(params.row, params.mapping, "date");
  const typeResult = readMappedEnum(params.row, params.mapping, "type", DONATION_TYPES);
  const restrictionResult = readMappedEnum(
    params.row,
    params.mapping,
    "restriction",
    RESTRICTION_TYPES,
  );
  if ("error" in amountResult) {
    return failedRow(
      amountResult.error.field ?? "amount",
      amountResult.error.code,
      amountResult.error.message,
    );
  }
  const amountCents = amountResult.value;
  if (!date) {
    return failedRow("date", "missing_or_invalid_date", "Add a valid donation date for this row.");
  }
  if ("error" in typeResult) {
    return invalidEnumRow("type", DONATION_TYPES);
  }
  if ("error" in restrictionResult) {
    return invalidEnumRow("restriction", RESTRICTION_TYPES);
  }
  const type = typeResult.value;
  if (!type) {
    return failedRow("type", "missing_type", "Add a donation type for this row.");
  }

  const fundId = readMappedText(params.row, params.mapping, "fundId");
  if (fundId) {
    const fund = await db.query.funds.findFirst({
      where: and(eq(funds.id, fundId), eq(funds.orgId, params.orgId), isNull(funds.deletedAt)),
    });
    if (!fund) {
      return failedRow("fundId", "invalid_fund", "Choose a fund from this organization.");
    }
  }

  const grantId = readMappedText(params.row, params.mapping, "grantId");
  if (grantId) {
    const grant = await db.query.grants.findFirst({
      where: and(eq(grants.id, grantId), eq(grants.orgId, params.orgId), isNull(grants.deletedAt)),
    });
    if (!grant) {
      return failedRow("grantId", "invalid_grant", "Choose a grant from this organization.");
    }
  }

  if (fundId && grantId) {
    const allocation = await db.query.grantFundAllocations.findFirst({
      where: and(
        eq(grantFundAllocations.fundId, fundId),
        eq(grantFundAllocations.grantId, grantId),
        isNull(grantFundAllocations.deletedAt),
      ),
    });
    if (!allocation) {
      return failedRow(
        "fundId",
        "fund_not_allocated_to_grant",
        "Choose a fund allocated to this grant.",
      );
    }
  }

  let contact: typeof contacts.$inferSelect;
  try {
    contact = await resolveContactForDonation(db, {
      orgId: params.orgId,
      actorId: params.actorId,
      row: params.row,
      mapping: params.mapping,
      seenKeys: params.seenKeys,
      createdCounts: params.createdCounts,
    });
  } catch (error) {
    if (!(error instanceof RowValidationError)) {
      throw error;
    }
    return failedRow(error.failure.field ?? "contact", error.failure.code, error.failure.message);
  }

  const currency = readMappedText(params.row, params.mapping, "currency") ?? "USD";
  const restriction = restrictionResult.value ?? "unrestricted";
  const duplicateKey = [
    contact.id,
    amountCents,
    date.toISOString(),
    type,
    currency,
    restriction,
    fundId ?? "",
    grantId ?? "",
  ].join(":");
  if (params.seenKeys.has(duplicateKey)) {
    return duplicateRow();
  }
  params.seenKeys.add(duplicateKey);

  const existingDonation = await db.query.donations.findFirst({
    where: and(
      eq(donations.orgId, params.orgId),
      eq(donations.contactId, contact.id),
      eq(donations.amountCents, amountCents),
      eq(donations.currency, currency),
      eq(donations.date, date),
      eq(donations.type, type),
      eq(donations.restriction, restriction),
      fundId ? eq(donations.fundId, fundId) : isNull(donations.fundId),
      grantId ? eq(donations.grantId, grantId) : isNull(donations.grantId),
      isNull(donations.deletedAt),
    ),
  });

  if (existingDonation) {
    return duplicateRow();
  }

  const [donation] = await db
    .insert(donations)
    .values({
      orgId: params.orgId,
      contactId: contact.id,
      amountCents,
      currency,
      date,
      type,
      restriction,
      fundId,
      grantId,
      paymentMethod: readMappedText(params.row, params.mapping, "paymentMethod"),
      notes: readMappedText(params.row, params.mapping, "notes"),
      receiptSent: readMappedBoolean(params.row, params.mapping, "receiptSent") ?? false,
    })
    .returning();

  if (!donation) {
    return failedRow("donation", "insert_failed", "GrantPipe could not save this donation row.");
  }

  if (params.actorId) {
    const paymentMethod = readMappedText(params.row, params.mapping, "paymentMethod");
    const notes = readMappedText(params.row, params.mapping, "notes");
    const receiptSent = readMappedBoolean(params.row, params.mapping, "receiptSent") ?? false;
    await recordActivityLog(db, {
      orgId: params.orgId,
      actorId: params.actorId,
      action: "created",
      entityType: "donation",
      entityId: donation.id,
      changes: {
        contactId: contact.id,
        amountCents,
        currency,
        date: date.toISOString(),
        type,
        restriction,
        fundId: fundId ?? null,
        grantId: grantId ?? null,
        paymentMethod: paymentMethod ?? null,
        notes: notes ?? null,
        receiptSent,
      },
    });
    await postDonation(db, {
      orgId: params.orgId,
      actorId: params.actorId,
      donationId: donation.id,
      action: "create",
    });
  }

  const createdCounts = cloneCounts(EMPTY_COUNTS);
  createdCounts.donations = 1;
  addCounts(params.createdCounts, createdCounts);
  return { inserted: true, duplicate: false, failed: false, errors: [], createdCounts };
}

async function findOrCreateFunder(
  db: TransactionDatabase,
  params: {
    orgId: string;
    entityId: string;
    actorId?: string;
    row: Record<string, unknown>;
    mapping: Record<string, string>;
  },
): Promise<{ funder: typeof funders.$inferSelect; created: boolean } | undefined> {
  const funderId = readMappedText(params.row, params.mapping, "funderId");
  if (funderId) {
    const existing = await db.query.funders.findFirst({
      where: and(
        eq(funders.id, funderId),
        eq(funders.orgId, params.orgId),
        eq(funders.entityId, params.entityId),
        isNull(funders.deletedAt),
      ),
    });
    if (existing) return { funder: existing, created: false };
  }

  const funderName = readMappedText(params.row, params.mapping, "funderName");
  if (!funderName) {
    return undefined;
  }

  const existingByName = await db.query.funders.findFirst({
    where: and(
      eq(funders.orgId, params.orgId),
      eq(funders.entityId, params.entityId),
      eq(funders.name, funderName),
      isNull(funders.deletedAt),
    ),
  });

  if (existingByName) return { funder: existingByName, created: false };

  const [created] = await db
    .insert(funders)
    .values({
      orgId: params.orgId,
      entityId: params.entityId,
      name: funderName,
      type:
        normalizeEnumValue(
          readMappedValue(params.row, params.mapping, "funderType"),
          FUNDER_TYPES,
        ) ?? "other",
      website: readMappedText(params.row, params.mapping, "funderWebsite"),
      priorities: readMappedText(params.row, params.mapping, "funderPriorities"),
      notes: readMappedText(params.row, params.mapping, "funderNotes"),
    })
    .returning();

  if (!created) return undefined;
  if (params.actorId) {
    const funderType =
      normalizeEnumValue(readMappedValue(params.row, params.mapping, "funderType"), FUNDER_TYPES) ??
      "other";
    const website = readMappedText(params.row, params.mapping, "funderWebsite");
    const priorities = readMappedText(params.row, params.mapping, "funderPriorities");
    const notes = readMappedText(params.row, params.mapping, "funderNotes");
    await recordActivityLog(db, {
      orgId: params.orgId,
      activeEntityId: params.entityId,
      actorId: params.actorId,
      action: "created",
      entityType: "funder",
      entityId: created.id,
      changes: {
        name: funderName,
        type: funderType,
        website: website ?? null,
        priorities: priorities ?? null,
        notes: notes ?? null,
      },
    });
  }

  return { funder: created, created: true };
}

async function processGrantRow(
  db: TransactionDatabase,
  params: {
    orgId: string;
    entityId: string;
    actorId?: string;
    row: Record<string, unknown>;
    mapping: Record<string, string>;
    seenKeys: Set<string>;
    createdCounts: CommitCounts;
    activeGrantLimit?: ActiveGrantLimitState;
  },
): Promise<RowOutcome> {
  const name = readMappedText(params.row, params.mapping, "name");
  if (!name) {
    return failedRow("name", "missing_name", "Add a grant name for this row.");
  }

  const funderTypeResult = readMappedEnum(params.row, params.mapping, "funderType", FUNDER_TYPES);
  if ("error" in funderTypeResult) {
    return invalidEnumRow("funderType", FUNDER_TYPES);
  }

  const amountResult =
    params.mapping.amountCents &&
    normalizeText(readMappedValue(params.row, params.mapping, "amountCents"))
      ? readMappedAmountCents(params.row, params.mapping, "amountCents")
      : undefined;
  if (amountResult && "error" in amountResult) {
    return failedRow(
      amountResult.error.field ?? "amount",
      amountResult.error.code,
      amountResult.error.message,
    );
  }
  const amountCents = amountResult && "value" in amountResult ? amountResult.value : undefined;

  const statusResult = readMappedEnum(params.row, params.mapping, "status", GRANT_STATUSES);
  if ("error" in statusResult) {
    return invalidEnumRow("status", GRANT_STATUSES);
  }
  const status = statusResult.value ?? "discovery";

  const funder = await findOrCreateFunder(db, {
    orgId: params.orgId,
    entityId: params.entityId,
    actorId: params.actorId,
    row: params.row,
    mapping: params.mapping,
  });

  if (!funder) {
    return failedRow("funder", "missing_funder", "Add a funder name or funder ID for this row.");
  }

  const duplicateKey = `${funder.funder.id}:${name.toLowerCase()}`;
  if (params.seenKeys.has(duplicateKey)) {
    return duplicateRow();
  }
  params.seenKeys.add(duplicateKey);

  const existingGrant = await db.query.grants.findFirst({
    where: and(
      eq(grants.orgId, params.orgId),
      eq(grants.entityId, params.entityId),
      eq(grants.funderId, funder.funder.id),
      eq(grants.name, name),
      isNull(grants.deletedAt),
    ),
  });

  if (existingGrant) {
    return duplicateRow();
  }

  if (params.activeGrantLimit && isBillingCapGrantStatus(status)) {
    const nextActiveGrantCount =
      params.activeGrantLimit.currentActiveGrants +
      params.activeGrantLimit.importedActiveGrants +
      1;
    if (nextActiveGrantCount > params.activeGrantLimit.softLimit) {
      throw new HTTPException(402, {
        message: `Your ${params.activeGrantLimit.planTier} plan includes ${params.activeGrantLimit.limit} active grants plus ${GRANT_CAP_SOFT_HEADROOM} grant headroom. Additional active grants are pending ${GRANT_CAP_OVERAGE_COPY} overage, but this import would exceed the ${params.activeGrantLimit.softLimit} active grant hard cap.`,
      });
    }
  }

  const [grant] = await db
    .insert(grants)
    .values({
      orgId: params.orgId,
      entityId: params.entityId,
      funderId: funder.funder.id,
      name,
      status,
      amountCents,
      startDate: readMappedDate(params.row, params.mapping, "startDate"),
      endDate: readMappedDate(params.row, params.mapping, "endDate"),
      applicationDeadline: readMappedDate(params.row, params.mapping, "applicationDeadline"),
      description: readMappedText(params.row, params.mapping, "description"),
      notes: readMappedText(params.row, params.mapping, "notes"),
    })
    .returning();

  if (!grant) {
    return failedRow("grant", "insert_failed", "GrantPipe could not save this grant row.");
  }

  if (params.activeGrantLimit && isBillingCapGrantStatus(status)) {
    params.activeGrantLimit.importedActiveGrants += 1;
  }

  if (params.actorId) {
    const startDate = readMappedDate(params.row, params.mapping, "startDate");
    const endDate = readMappedDate(params.row, params.mapping, "endDate");
    const applicationDeadline = readMappedDate(params.row, params.mapping, "applicationDeadline");
    const description = readMappedText(params.row, params.mapping, "description");
    const notes = readMappedText(params.row, params.mapping, "notes");
    await recordActivityLog(db, {
      orgId: params.orgId,
      activeEntityId: params.entityId,
      actorId: params.actorId,
      action: "created",
      entityType: "grant",
      entityId: grant.id,
      changes: {
        funderId: funder.funder.id,
        name,
        status,
        amountCents: amountCents ?? null,
        startDate: startDate?.toISOString() ?? null,
        endDate: endDate?.toISOString() ?? null,
        applicationDeadline: applicationDeadline?.toISOString() ?? null,
        description: description ?? null,
        notes: notes ?? null,
      },
    });
  }

  const createdCounts = cloneCounts(EMPTY_COUNTS);
  createdCounts.funders = funder.created ? 1 : 0;
  createdCounts.grants = 1;
  addCounts(params.createdCounts, createdCounts);
  return { inserted: true, duplicate: false, failed: false, errors: [], createdCounts };
}

async function processGrantOpportunityRow(
  db: TransactionDatabase,
  params: {
    orgId: string;
    entityId: string;
    actorId?: string;
    row: Record<string, unknown>;
    mapping: Record<string, string>;
    seenKeys: Set<string>;
    createdCounts: CommitCounts;
  },
): Promise<RowOutcome> {
  const title = readMappedText(params.row, params.mapping, "title");
  if (!title) {
    return failedRow("title", "missing_title", "Add an opportunity title for this row.");
  }

  const sourceName = readMappedText(params.row, params.mapping, "sourceName");
  if (!sourceName) {
    return failedRow("sourceName", "missing_source_name", "Add a source or funder name.");
  }

  const sourceTypeResult = readMappedEnum(
    params.row,
    params.mapping,
    "sourceType",
    GRANT_SOURCE_TYPES,
  );
  if ("error" in sourceTypeResult) {
    return invalidEnumRow("sourceType", GRANT_SOURCE_TYPES);
  }
  const sourceType = sourceTypeResult.value;
  if (!sourceType) {
    return failedRow("sourceType", "missing_source_type", "Add a source type for this row.");
  }
  if (sourceType === "federal") {
    return failedRow(
      "sourceType",
      "federal_import_not_supported",
      "Use Grants.gov search for federal opportunities.",
    );
  }

  const funderTypeResult = readMappedEnum(params.row, params.mapping, "funderType", FUNDER_TYPES);
  if ("error" in funderTypeResult) {
    return invalidEnumRow("funderType", FUNDER_TYPES);
  }
  const funderType =
    funderTypeResult.value ??
    (sourceType === "corporate"
      ? "corporate"
      : sourceType === "state_local"
        ? "government"
        : sourceType === "association" || sourceType === "other"
          ? "other"
          : "foundation");

  const awardFloorResult = optionalMappedAmountCents(params.row, params.mapping, "amountFloor");
  if (awardFloorResult && "error" in awardFloorResult) {
    return failedRow("amountFloor", awardFloorResult.error.code, awardFloorResult.error.message);
  }
  const awardCeilingResult = optionalMappedAmountCents(params.row, params.mapping, "amountCeiling");
  if (awardCeilingResult && "error" in awardCeilingResult) {
    return failedRow(
      "amountCeiling",
      awardCeilingResult.error.code,
      awardCeilingResult.error.message,
    );
  }

  const closeDate = readMappedDate(params.row, params.mapping, "deadline");
  const sourceUrlValue = readMappedText(params.row, params.mapping, "sourceUrl");
  const sourceUrl = normalizeHttpUrl(sourceUrlValue);
  if (sourceUrl === null) {
    return failedRow(
      "sourceUrl",
      "invalid_source_url",
      "Use a valid http or https URL for the opportunity source.",
    );
  }
  const externalId = readMappedText(params.row, params.mapping, "externalId");
  const duplicateKey = externalId
    ? `opportunity-external:${sourceType}:${sourceName.toLowerCase()}:${externalId.toLowerCase()}`
    : `opportunity-title:${sourceType}:${sourceName.toLowerCase()}:${title.toLowerCase()}`;

  if (params.seenKeys.has(duplicateKey)) {
    return duplicateRow();
  }
  params.seenKeys.add(duplicateKey);

  const sourceOpportunityId = buildManualGrantOpportunitySourceId({
    sourceType,
    sourceName,
    externalId,
    title,
  });
  const existingOpportunity = await db.query.grantOpportunities.findFirst({
    where: and(
      eq(grantOpportunities.orgId, params.orgId),
      eq(grantOpportunities.entityId, params.entityId),
      eq(grantOpportunities.source, "manual"),
      eq(grantOpportunities.sourceOpportunityId, sourceOpportunityId),
      isNull(grantOpportunities.deletedAt),
    ),
  });

  if (existingOpportunity) {
    return duplicateRow();
  }

  const notes = readMappedText(params.row, params.mapping, "internalNotes");
  const eligibilityNotes = readMappedText(params.row, params.mapping, "eligibilityNotes");
  const deadlineSource = normalizeEnumValue("import", GRANT_OPPORTUNITY_DEADLINE_SOURCES);
  const [opportunity] = await db
    .insert(grantOpportunities)
    .values({
      orgId: params.orgId,
      entityId: params.entityId,
      source: "manual",
      sourceType,
      sourceName,
      sourceUrl,
      funderType,
      deadlineSource,
      externalId,
      sourceOpportunityId,
      title,
      agencyName: sourceName,
      status: "posted",
      closeDate,
      awardFloorCents:
        awardFloorResult && "value" in awardFloorResult ? awardFloorResult.value : undefined,
      awardCeilingCents:
        awardCeilingResult && "value" in awardCeilingResult ? awardCeilingResult.value : undefined,
      eligibleApplicants: eligibilityNotes ? [eligibilityNotes] : undefined,
      officialUrl: sourceUrl,
      rawPayload: {
        source: "csv_import",
        eligibilityNotes: eligibilityNotes ?? null,
        notes: notes ?? null,
      },
      lastFetchedAt: new Date(),
    })
    .returning();

  if (!opportunity) {
    return failedRow(
      "grantOpportunity",
      "insert_failed",
      "GrantPipe could not save this opportunity row.",
    );
  }

  if (params.actorId) {
    await recordActivityLog(db, {
      orgId: params.orgId,
      activeEntityId: params.entityId,
      actorId: params.actorId,
      action: "created",
      entityType: "grant_opportunity",
      entityId: opportunity.id,
      changes: {
        title,
        sourceType,
        sourceName,
        funderType,
        deadlineSource,
        closeDate: closeDate?.toISOString() ?? null,
      },
    });
  }

  const createdCounts = cloneCounts(EMPTY_COUNTS);
  createdCounts.grantOpportunities = 1;
  addCounts(params.createdCounts, createdCounts);

  return {
    inserted: true,
    duplicate: false,
    failed: false,
    errors: [],
    createdCounts,
  };
}

async function processFundRow(
  db: TransactionDatabase,
  params: {
    orgId: string;
    entityId: string;
    actorId?: string;
    row: Record<string, unknown>;
    mapping: Record<string, string>;
    seenKeys: Set<string>;
    createdCounts: CommitCounts;
  },
): Promise<RowOutcome> {
  const name = readMappedText(params.row, params.mapping, "name");
  if (!name) {
    return failedRow("name", "missing_name", "Add a fund name for this row.");
  }

  const typeResult = readMappedEnum(params.row, params.mapping, "type", FUND_TYPES);
  if ("error" in typeResult) {
    return invalidEnumRow("type", FUND_TYPES);
  }
  const type = typeResult.value ?? "temporarily_restricted";
  const statusResult = readMappedEnum(params.row, params.mapping, "status", FUND_STATUSES);
  if ("error" in statusResult) {
    return invalidEnumRow("status", FUND_STATUSES);
  }
  const status = statusResult.value ?? "active";
  const startDate = readMappedDate(params.row, params.mapping, "startDate");
  const endDate = readMappedDate(params.row, params.mapping, "endDate");
  const lookupKey = `fund:${name.toLowerCase()}`;

  if (params.seenKeys.has(lookupKey)) {
    return duplicateRow();
  }
  params.seenKeys.add(lookupKey);

  const existing = await db.query.funds.findFirst({
    where: and(
      eq(funds.orgId, params.orgId),
      eq(funds.entityId, params.entityId),
      eq(sql`lower(${funds.name})`, name.toLowerCase()),
      isNull(funds.deletedAt),
    ),
  });
  if (existing) {
    return duplicateRow();
  }

  const [fund] = await db
    .insert(funds)
    .values({
      orgId: params.orgId,
      entityId: params.entityId,
      externalId: readMappedText(params.row, params.mapping, "externalId"),
      name,
      type,
      description: readMappedText(params.row, params.mapping, "description"),
      restrictionPurpose: readMappedText(params.row, params.mapping, "restrictionPurpose"),
      restrictionSource: readMappedText(params.row, params.mapping, "restrictionSource"),
      startDate,
      endDate,
      status,
    })
    .returning();

  if (!fund) {
    return failedRow("fund", "insert_failed", "GrantPipe could not save this fund row.");
  }

  if (params.actorId) {
    await recordActivityLog(db, {
      orgId: params.orgId,
      activeEntityId: params.entityId,
      actorId: params.actorId,
      action: "created",
      entityType: "fund",
      entityId: fund.id,
      changes: {
        externalId: fund.externalId ?? null,
        name: fund.name,
        type: fund.type,
        restrictionPurpose: fund.restrictionPurpose ?? null,
        restrictionSource: fund.restrictionSource ?? null,
        startDate: fund.startDate?.toISOString() ?? null,
        endDate: fund.endDate?.toISOString() ?? null,
        status: fund.status,
      },
    });
  }

  const createdCounts = cloneCounts(EMPTY_COUNTS);
  createdCounts.funds = 1;
  addCounts(params.createdCounts, createdCounts);
  return { inserted: true, duplicate: false, failed: false, errors: [], createdCounts };
}

async function resolveImportAccount(
  db: Database | TransactionDatabase,
  params: {
    orgId: string;
    accountId?: string;
    accountCode?: string;
  },
): Promise<typeof chartOfAccounts.$inferSelect | undefined> {
  if (params.accountId) {
    return db.query.chartOfAccounts.findFirst({
      where: and(
        eq(chartOfAccounts.id, params.accountId),
        eq(chartOfAccounts.orgId, params.orgId),
        isNull(chartOfAccounts.deletedAt),
      ),
    });
  }

  if (params.accountCode) {
    return db.query.chartOfAccounts.findFirst({
      where: and(
        eq(chartOfAccounts.orgId, params.orgId),
        eq(chartOfAccounts.code, params.accountCode),
        isNull(chartOfAccounts.deletedAt),
      ),
    });
  }

  return undefined;
}

async function resolveOptionalFundReference(
  db: Database | TransactionDatabase,
  params: { orgId: string; entityId: string; fundId?: string; fundName?: string },
): Promise<{ value?: string } | { error: RowFailure }> {
  if (!params.fundId && !params.fundName) return { value: undefined };
  const fund = await db.query.funds.findFirst({
    where: and(
      eq(params.fundId ? funds.id : funds.name, params.fundId ?? params.fundName!),
      eq(funds.orgId, params.orgId),
      eq(funds.entityId, params.entityId),
      isNull(funds.deletedAt),
    ),
  });
  if (fund) return { value: fund.id };
  return {
    error: {
      field: params.fundId ? "fundId" : "fundName",
      code: "invalid_fund",
      message: "Fund must belong to this active entity.",
    },
  };
}

async function resolveOptionalGrantReference(
  db: Database | TransactionDatabase,
  params: { orgId: string; entityId: string; grantId?: string; grantName?: string },
): Promise<{ value?: string } | { error: RowFailure }> {
  if (!params.grantId && !params.grantName) return { value: undefined };
  const grant = await db.query.grants.findFirst({
    where: and(
      eq(params.grantId ? grants.id : grants.name, params.grantId ?? params.grantName!),
      eq(grants.orgId, params.orgId),
      eq(grants.entityId, params.entityId),
      isNull(grants.deletedAt),
    ),
  });
  if (grant) return { value: grant.id };
  return {
    error: {
      field: params.grantId ? "grantId" : "grantName",
      code: "invalid_grant",
      message: "Grant must belong to this active entity.",
    },
  };
}

async function processOpeningBalanceImport(
  db: TransactionDatabase,
  input: ImportCommitInput & { orgId: string; userId: string; entityId: string },
): Promise<{
  insertedRows: number;
  duplicateRows: number;
  failedRows: number;
  createdCounts: CommitCounts;
  rowErrors: RowErrorDetail[];
}> {
  const createdCounts = cloneCounts(EMPTY_COUNTS);
  const rowErrors: RowErrorDetail[] = [];
  const lines: Array<{
    accountId: string;
    fundId?: string;
    grantId?: string;
    debitCents: number;
    creditCents: number;
    memo?: string;
  }> = [];
  let fiscalPeriodId: string | undefined;
  let entryDate: Date | undefined;
  let insertedRows = 0;

  for (let rowIndex = 0; rowIndex < input.rows.length; rowIndex += 1) {
    const row = input.rows[rowIndex] as Record<string, unknown>;
    const rowNumber = rowIndex + 2;
    const rowFailures: RowFailure[] = [];
    const accountId = readMappedText(row, input.mapping, "accountId");
    const accountCode = readMappedText(row, input.mapping, "accountCode");
    const account = await resolveImportAccount(db, { orgId: input.orgId, accountId, accountCode });
    if (!account) {
      rowFailures.push({
        field: "account",
        code: "missing_account",
        message: "Add an account ID or account code that belongs to this organization.",
      });
    }

    const debitResult =
      normalizeText(readMappedValue(row, input.mapping, "debitCents")) !== undefined
        ? readMappedAmountCents(row, input.mapping, "debitCents")
        : { value: 0 };
    const creditResult =
      normalizeText(readMappedValue(row, input.mapping, "creditCents")) !== undefined
        ? readMappedAmountCents(row, input.mapping, "creditCents")
        : { value: 0 };

    if ("error" in debitResult) rowFailures.push({ ...debitResult.error, field: "debitCents" });
    if ("error" in creditResult) rowFailures.push({ ...creditResult.error, field: "creditCents" });

    const debitCents = "value" in debitResult ? debitResult.value : 0;
    const creditCents = "value" in creditResult ? creditResult.value : 0;
    if ((debitCents === 0 && creditCents === 0) || (debitCents > 0 && creditCents > 0)) {
      rowFailures.push({
        field: "amount",
        code: "invalid_debit_credit",
        message: "Each opening balance row needs either a debit or a credit amount.",
      });
    }

    const rowFiscalPeriodId = readMappedText(row, input.mapping, "fiscalPeriodId");
    if (!rowFiscalPeriodId) {
      rowFailures.push({
        field: "fiscalPeriodId",
        code: "missing_fiscal_period",
        message: "Add the fiscal period ID for this opening balance import.",
      });
    } else if (fiscalPeriodId && fiscalPeriodId !== rowFiscalPeriodId) {
      rowFailures.push({
        field: "fiscalPeriodId",
        code: "mixed_fiscal_periods",
        message: "Use one fiscal period per opening balance import file.",
      });
    } else {
      fiscalPeriodId = rowFiscalPeriodId;
    }

    const rowDate = readMappedDate(row, input.mapping, "date");
    if (!rowDate) {
      rowFailures.push({
        field: "date",
        code: "missing_date",
        message: "Add a valid journal date for this opening balance row.",
      });
    } else if (entryDate && entryDate.toISOString() !== rowDate.toISOString()) {
      rowFailures.push({
        field: "date",
        code: "mixed_dates",
        message: "Use one journal date per opening balance import file.",
      });
    } else {
      entryDate = rowDate;
    }

    const fundReference = await resolveOptionalFundReference(db, {
      orgId: input.orgId,
      entityId: input.entityId,
      fundId: readMappedText(row, input.mapping, "fundId"),
      fundName: readMappedText(row, input.mapping, "fundName"),
    });
    const grantReference = await resolveOptionalGrantReference(db, {
      orgId: input.orgId,
      entityId: input.entityId,
      grantId: readMappedText(row, input.mapping, "grantId"),
      grantName: readMappedText(row, input.mapping, "grantName"),
    });
    if ("error" in fundReference) rowFailures.push(fundReference.error);
    if ("error" in grantReference) rowFailures.push(grantReference.error);

    if (rowFailures.length > 0 || !account) {
      rowErrors.push(...rowFailures.map((failure) => ({ rowIndex, rowNumber, ...failure })));
      continue;
    }

    lines.push({
      accountId: account.id,
      fundId: "value" in fundReference ? fundReference.value : undefined,
      grantId: "value" in grantReference ? grantReference.value : undefined,
      debitCents,
      creditCents,
      memo: readMappedText(row, input.mapping, "memo"),
    });
    insertedRows += 1;
  }

  const totalDebit = lines.reduce((sum, line) => sum + line.debitCents, 0);
  const totalCredit = lines.reduce((sum, line) => sum + line.creditCents, 0);
  if (lines.length > 0 && totalDebit !== totalCredit) {
    rowErrors.push({
      rowIndex: 0,
      rowNumber: 2,
      field: "amount",
      code: "opening_balance_unbalanced",
      message: "Opening balance debits must equal credits before anything is posted.",
    });
    insertedRows = 0;
  }

  if (rowErrors.length === 0 && lines.length > 0 && fiscalPeriodId && entryDate) {
    const period = await db.query.fiscalPeriods.findFirst({
      where: and(eq(fiscalPeriods.id, fiscalPeriodId), eq(fiscalPeriods.orgId, input.orgId)),
    });
    if (!period || period.status === "closed" || period.status === "locked") {
      rowErrors.push({
        rowIndex: 0,
        rowNumber: 2,
        field: "fiscalPeriodId",
        code: "invalid_fiscal_period",
        message: "Opening balances must post to an open fiscal period in this organization.",
      });
      insertedRows = 0;
    } else if (entryDate < period.startDate || entryDate > period.endDate) {
      rowErrors.push({
        rowIndex: 0,
        rowNumber: 2,
        field: "date",
        code: "date_outside_period",
        message: "Opening balance date must fall inside the selected fiscal period.",
      });
      insertedRows = 0;
    } else {
      const entry = await insertJournalEntryWithNextNumber(db, {
        orgId: input.orgId,
        values: {
          date: entryDate,
          fiscalPeriodId,
          memo: `Imported opening balances from ${input.filename}`,
          source: "opening_balance",
          postedBy: input.userId,
          isAdjusting: true,
        },
      });

      await db.insert(journalLines).values(
        lines.map((line, index) => ({
          orgId: input.orgId,
          journalEntryId: entry.id,
          lineNumber: index + 1,
          accountId: line.accountId,
          fundId: line.fundId,
          grantId: line.grantId,
          debitCents: line.debitCents,
          creditCents: line.creditCents,
          memo: line.memo,
        })),
      );

      await recordActivityLog(db, {
        orgId: input.orgId,
        activeEntityId: input.entityId,
        actorId: input.userId,
        action: "posted",
        entityType: "journal_entry",
        entityId: entry.id,
        changes: {
          source: "opening_balance",
          lineCount: lines.length,
          totalDebitCents: totalDebit,
        },
      });

      createdCounts.openingBalanceLines = lines.length;
    }
  }

  const failedRows =
    rowErrors.length > 0 ? Math.max(input.rows.length - insertedRows, rowErrors.length) : 0;

  return {
    insertedRows,
    duplicateRows: 0,
    failedRows,
    createdCounts,
    rowErrors,
  };
}

function readMappedNonNegativeInteger(
  row: Record<string, unknown>,
  mapping: Record<string, string>,
  fieldName: string,
  fallback: number,
): { value: number } | { error: RowFailure } {
  const value = readMappedValue(row, mapping, fieldName);
  if (normalizeText(value) === undefined) return { value: fallback };
  const parsed = Number(normalizeText(value));
  if (Number.isSafeInteger(parsed) && parsed >= 0) return { value: parsed };
  return {
    error: {
      field: fieldName,
      code: "invalid_integer",
      message: "Use a non-negative whole number.",
    },
  };
}

async function processPledgeImport(
  db: TransactionDatabase,
  input: ImportCommitInput & { orgId: string; userId: string; entityId: string },
): Promise<{
  insertedRows: number;
  duplicateRows: number;
  failedRows: number;
  createdCounts: CommitCounts;
  rowErrors: RowErrorDetail[];
}> {
  const createdCounts = cloneCounts(EMPTY_COUNTS);
  const rowErrors: RowErrorDetail[] = [];
  const groups = new Map<string, Array<{ rowIndex: number; row: Record<string, unknown> }>>();

  for (let rowIndex = 0; rowIndex < input.rows.length; rowIndex += 1) {
    const row = input.rows[rowIndex] as Record<string, unknown>;
    const externalId = readMappedText(row, input.mapping, "externalPledgeId");
    const fallbackKey = [
      readMappedText(row, input.mapping, "contactEmail"),
      readMappedText(row, input.mapping, "contactFirstName"),
      readMappedText(row, input.mapping, "contactLastName"),
      readMappedText(row, input.mapping, "pledgeDate"),
    ]
      .filter(Boolean)
      .join(":");
    const key = externalId ?? fallbackKey;
    if (!key) {
      rowErrors.push({
        rowIndex,
        rowNumber: rowIndex + 2,
        field: "externalPledgeId",
        code: "missing_pledge_lookup",
        message: "Add an external pledge ID or donor and pledge date fields.",
      });
      continue;
    }
    const current = groups.get(key) ?? [];
    current.push({ rowIndex, row });
    groups.set(key, current);
  }

  let insertedRows = 0;
  const seenContactKeys = new Set<string>();

  for (const [groupKey, rows] of groups.entries()) {
    const first = rows[0]!;
    const groupFailures: RowErrorDetail[] = [];
    const contactCreatedCounts = cloneCounts(EMPTY_COUNTS);
    let contact: typeof contacts.$inferSelect | undefined;
    try {
      contact = await resolveContactForDonation(db, {
        orgId: input.orgId,
        actorId: input.userId,
        row: first.row,
        mapping: input.mapping,
        seenKeys: seenContactKeys,
        createdCounts: contactCreatedCounts,
      });
    } catch (error) {
      if (error instanceof RowValidationError) {
        groupFailures.push({
          rowIndex: first.rowIndex,
          rowNumber: first.rowIndex + 2,
          ...error.failure,
        });
      } else {
        throw error;
      }
    }

    const pledgeDate = readMappedDate(first.row, input.mapping, "pledgeDate");
    if (!pledgeDate) {
      groupFailures.push({
        rowIndex: first.rowIndex,
        rowNumber: first.rowIndex + 2,
        field: "pledgeDate",
        code: "missing_pledge_date",
        message: "Add a valid pledge date.",
      });
    }

    const discountRate = readMappedNonNegativeInteger(
      first.row,
      input.mapping,
      "discountRateBasisPoints",
      0,
    );
    if ("error" in discountRate) {
      groupFailures.push({
        rowIndex: first.rowIndex,
        rowNumber: first.rowIndex + 2,
        ...discountRate.error,
      });
    }

    const netAssetResult = readMappedEnum(first.row, input.mapping, "netAssetClass", [
      "unrestricted",
      "temporarily_restricted",
      "permanently_restricted",
    ] as const);
    if ("error" in netAssetResult) {
      groupFailures.push({
        rowIndex: first.rowIndex,
        rowNumber: first.rowIndex + 2,
        ...netAssetResult.error,
      });
    }
    const netAssetClass = "value" in netAssetResult ? netAssetResult.value : undefined;

    const fundReference = await resolveOptionalFundReference(db, {
      orgId: input.orgId,
      entityId: input.entityId,
      fundId: readMappedText(first.row, input.mapping, "fundId"),
      fundName: readMappedText(first.row, input.mapping, "fundName"),
    });
    const grantReference = await resolveOptionalGrantReference(db, {
      orgId: input.orgId,
      entityId: input.entityId,
      grantId: readMappedText(first.row, input.mapping, "grantId"),
      grantName: readMappedText(first.row, input.mapping, "grantName"),
    });
    if ("error" in fundReference)
      groupFailures.push({
        rowIndex: first.rowIndex,
        rowNumber: first.rowIndex + 2,
        ...fundReference.error,
      });
    if ("error" in grantReference)
      groupFailures.push({
        rowIndex: first.rowIndex,
        rowNumber: first.rowIndex + 2,
        ...grantReference.error,
      });

    const installments: Array<{ dueDate: Date; amountCents: number }> = [];
    for (const item of rows) {
      const dueDate = readMappedDate(item.row, input.mapping, "dueDate");
      if (!dueDate) {
        groupFailures.push({
          rowIndex: item.rowIndex,
          rowNumber: item.rowIndex + 2,
          field: "dueDate",
          code: "missing_due_date",
          message: "Add a valid installment due date.",
        });
      }
      const amountResult = readMappedAmountCents(item.row, input.mapping, "amountCents");
      if ("error" in amountResult) {
        groupFailures.push({
          rowIndex: item.rowIndex,
          rowNumber: item.rowIndex + 2,
          ...amountResult.error,
        });
      }
      if (dueDate && "value" in amountResult) {
        installments.push({ dueDate, amountCents: amountResult.value });
      }
    }

    if (
      groupFailures.length > 0 ||
      !contact ||
      !pledgeDate ||
      !("value" in discountRate) ||
      !netAssetClass
    ) {
      rowErrors.push(...groupFailures);
      continue;
    }

    const existing = await db.query.pledges.findFirst({
      where: and(
        eq(pledges.orgId, input.orgId),
        eq(pledges.contactId, contact.id),
        eq(pledges.pledgeDate, pledgeDate),
        isNull(pledges.deletedAt),
      ),
    });
    if (existing) {
      continue;
    }

    const hasBarrier = readMappedBoolean(first.row, input.mapping, "hasBarrier") ?? false;
    const hasRightOfReturn =
      readMappedBoolean(first.row, input.mapping, "hasRightOfReturn") ?? false;
    const isConditional = isPledgeConditional(hasBarrier, hasRightOfReturn);
    const { pvCents, discountCents, faceCents } = presentValuePledge(
      installments,
      discountRate.value,
      pledgeDate,
    );

    const [pledge] = await db
      .insert(pledges)
      .values({
        orgId: input.orgId,
        contactId: contact.id,
        fundId: "value" in fundReference ? fundReference.value : undefined,
        grantId: "value" in grantReference ? grantReference.value : undefined,
        status: isConditional ? "conditional" : "active",
        isConditional,
        hasBarrier,
        hasRightOfReturn,
        conditionNote: readMappedText(first.row, input.mapping, "conditionNote") ?? null,
        faceAmountCents: faceCents,
        pledgeDate,
        discountRateBasisPoints: discountRate.value,
        presentValueCents: pvCents,
        discountCents,
        netAssetClass,
        notes: readMappedText(first.row, input.mapping, "notes") ?? null,
      })
      .returning();

    if (!pledge) {
      throw new Error(`Failed to create pledge for import group ${groupKey}`);
    }

    const installmentRows = await db
      .insert(pledgeInstallments)
      .values(
        installments.map((installment) => ({
          orgId: input.orgId,
          pledgeId: pledge.id,
          dueDate: installment.dueDate,
          amountCents: installment.amountCents,
          status: "scheduled" as const,
          paidCents: 0,
        })),
      )
      .returning();

    if (!isConditional) {
      await postPledgeRecognition(db, {
        orgId: input.orgId,
        actorId: input.userId,
        pledgeId: pledge.id,
        action: "create",
      });
    }

    await recordActivityLog(db, {
      orgId: input.orgId,
      activeEntityId: input.entityId,
      actorId: input.userId,
      action: "created",
      entityType: "pledge",
      entityId: pledge.id,
      changes: { after: { ...pledge, installments: installmentRows } },
    });

    insertedRows += rows.length;
    addCounts(createdCounts, contactCreatedCounts);
    createdCounts.pledges += 1;
    createdCounts.pledgeInstallments += installmentRows.length;
  }

  const failedRows = rowErrors.length > 0 ? input.rows.length - insertedRows : 0;

  return {
    insertedRows,
    duplicateRows: 0,
    failedRows,
    createdCounts,
    rowErrors,
  };
}

function deriveImportStatus(
  insertedRows: number,
  duplicateRows: number,
  failedRows: number,
): ImportHistoryStatus {
  if (insertedRows === 0 && failedRows > 0) return "failed";
  if (duplicateRows > 0 || failedRows > 0) return "completed_with_duplicates";
  return "completed";
}

async function buildActiveGrantLimitState(
  db: Database,
  input: ImportCommitInput & { orgId: string },
): Promise<ActiveGrantLimitState | undefined> {
  if (input.entityType !== "grants") return undefined;
  if (typeof db.select !== "function") return undefined;

  const planTier = await resolvePlanTier(db, input.orgId);
  const limit = getActiveGrantCap(planTier);
  if (!isFinite(limit)) return undefined;

  return {
    planTier,
    limit,
    softLimit: getGrantCapWithSoftHeadroom(limit),
    currentActiveGrants: await countBillingCapGrants(db, input.orgId),
    importedActiveGrants: 0,
  };
}

async function buildOpeningBalancePreviewReconciliation(
  db: Database,
  input: ImportPreviewInput & { orgId: string; entityId?: string | null },
  parsed: { headers: string[]; rows: Array<Record<string, string>> },
): Promise<OpeningBalancePreviewReconciliation> {
  const mapping = buildResolvedImportMapping(parsed.headers, {}, "opening_balances");
  const entityId = input.entityId ?? (await resolveDefaultEntityId(db, input.orgId));
  const unresolvedAccounts: OpeningBalancePreviewReconciliation["unresolvedAccounts"] = [];
  const unresolvedFunds: OpeningBalancePreviewReconciliation["unresolvedFunds"] = [];
  const unresolvedGrants: OpeningBalancePreviewReconciliation["unresolvedGrants"] = [];
  const errors: RowErrorDetail[] = [];
  const fiscalPeriodIds = new Set<string>();
  const entryDates = new Set<string>();
  let debitTotalCents = 0;
  let creditTotalCents = 0;
  let firstDate: Date | undefined;

  for (let rowIndex = 0; rowIndex < parsed.rows.length; rowIndex += 1) {
    const row = parsed.rows[rowIndex] as Record<string, unknown>;
    const rowNumber = rowIndex + 2;
    const accountId = readMappedText(row, mapping, "accountId");
    const accountCode = readMappedText(row, mapping, "accountCode");
    const account = await resolveImportAccount(db, { orgId: input.orgId, accountId, accountCode });
    if (!account) {
      unresolvedAccounts.push({ rowNumber, accountId, accountCode });
      errors.push({
        rowIndex,
        rowNumber,
        field: "account",
        code: "missing_account",
        message: "Add an account ID or account code that belongs to this organization.",
      });
    }

    const debitResult =
      normalizeText(readMappedValue(row, mapping, "debitCents")) !== undefined
        ? readMappedAmountCents(row, mapping, "debitCents")
        : { value: 0 };
    const creditResult =
      normalizeText(readMappedValue(row, mapping, "creditCents")) !== undefined
        ? readMappedAmountCents(row, mapping, "creditCents")
        : { value: 0 };
    if ("error" in debitResult) {
      errors.push({ rowIndex, rowNumber, ...debitResult.error, field: "debitCents" });
    } else {
      debitTotalCents += debitResult.value;
    }
    if ("error" in creditResult) {
      errors.push({ rowIndex, rowNumber, ...creditResult.error, field: "creditCents" });
    } else {
      creditTotalCents += creditResult.value;
    }

    const rowFiscalPeriodId = readMappedText(row, mapping, "fiscalPeriodId");
    if (rowFiscalPeriodId) fiscalPeriodIds.add(rowFiscalPeriodId);
    const rowDate = readMappedDate(row, mapping, "date");
    if (rowDate) {
      firstDate ??= rowDate;
      entryDates.add(rowDate.toISOString());
    }

    const fundId = readMappedText(row, mapping, "fundId");
    const fundName = readMappedText(row, mapping, "fundName");
    const fundReference = await resolveOptionalFundReference(db, {
      orgId: input.orgId,
      entityId,
      fundId,
      fundName,
    });
    if ("error" in fundReference) {
      unresolvedFunds.push({ rowNumber, fundId, fundName });
      errors.push({
        rowIndex,
        rowNumber,
        ...fundReference.error,
      });
    }

    const grantId = readMappedText(row, mapping, "grantId");
    const grantName = readMappedText(row, mapping, "grantName");
    const grantReference = await resolveOptionalGrantReference(db, {
      orgId: input.orgId,
      entityId,
      grantId,
      grantName,
    });
    if ("error" in grantReference) {
      unresolvedGrants.push({ rowNumber, grantId, grantName });
      errors.push({
        rowIndex,
        rowNumber,
        ...grantReference.error,
      });
    }
  }

  const fiscalPeriodId =
    fiscalPeriodIds.size === 1 ? (Array.from(fiscalPeriodIds)[0] ?? null) : null;
  const period = fiscalPeriodId
    ? await db.query.fiscalPeriods.findFirst({
        where: and(eq(fiscalPeriods.id, fiscalPeriodId), eq(fiscalPeriods.orgId, input.orgId)),
      })
    : undefined;
  const dateInRange =
    period && firstDate ? firstDate >= period.startDate && firstDate <= period.endDate : null;
  const fiscalPeriod = {
    id: fiscalPeriodId,
    status: period?.status ?? null,
    open: period?.status === "open",
    dateInRange,
  };

  if (fiscalPeriodIds.size !== 1) {
    errors.push({
      rowIndex: 0,
      rowNumber: 2,
      field: "fiscalPeriodId",
      code: fiscalPeriodIds.size === 0 ? "missing_fiscal_period" : "mixed_fiscal_periods",
      message: "Use one open fiscal period per opening balance import file.",
    });
  } else if (!period || period.status === "closed" || period.status === "locked") {
    errors.push({
      rowIndex: 0,
      rowNumber: 2,
      field: "fiscalPeriodId",
      code: "invalid_fiscal_period",
      message: "Opening balances must post to an open fiscal period in this organization.",
    });
  }

  if (entryDates.size !== 1) {
    errors.push({
      rowIndex: 0,
      rowNumber: 2,
      field: "date",
      code: entryDates.size === 0 ? "missing_date" : "mixed_dates",
      message: "Use one journal date per opening balance import file.",
    });
  } else if (dateInRange === false) {
    errors.push({
      rowIndex: 0,
      rowNumber: 2,
      field: "date",
      code: "date_outside_period",
      message: "Opening balance date must fall inside the selected fiscal period.",
    });
  }

  const balanced = debitTotalCents === creditTotalCents;
  if (!balanced) {
    errors.push({
      rowIndex: 0,
      rowNumber: 2,
      field: "amount",
      code: "opening_balance_unbalanced",
      message: "Opening balance debits must equal credits before anything is posted.",
    });
  }

  return {
    debitTotalCents,
    creditTotalCents,
    balanced,
    commitBlocked: errors.length > 0,
    fiscalPeriod,
    unresolvedAccounts,
    unresolvedFunds,
    unresolvedGrants,
    errors,
  };
}

// ---------------------------------------------------------------------------
// previewImport
// ---------------------------------------------------------------------------

export async function previewImport(
  _db: Database,
  input: ImportPreviewInput & { orgId: string; entityId?: string | null },
): Promise<{
  orgId: string;
  entityId?: string | null;
  entityType: ImportEntityType;
  filename: string;
  headers: string[];
  rows: Array<Record<string, string>>;
  totalRows: number;
  reconciliation?: OpeningBalancePreviewReconciliation;
}> {
  if (!input.orgId) {
    throw new Error("previewImport requires an orgId");
  }
  const parsed = parseCsvText(input.csvText);
  const preview = {
    orgId: input.orgId,
    entityType: input.entityType,
    filename: input.filename,
    headers: parsed.headers,
    rows: parsed.rows,
    totalRows: parsed.totalRows,
  };
  const withEntity = input.entityId ? { ...preview, entityId: input.entityId } : preview;
  if (input.entityType !== "opening_balances") return withEntity;
  return {
    ...withEntity,
    reconciliation: await buildOpeningBalancePreviewReconciliation(_db, input, parsed),
  };
}

// ---------------------------------------------------------------------------
// commitImport
// ---------------------------------------------------------------------------

export async function commitImport(
  db: Database,
  input: ImportCommitInput & { orgId: string; userId: string; entityId?: string | null },
): Promise<ImportResult> {
  const activeGrantLimit = await buildActiveGrantLimitState(db, input);

  return db.transaction(async (tx) => {
    const entityId = await resolveImportEntityId(tx, input.orgId, input.entityId);
    const importInput = { ...input, entityId };

    if (importInput.entityType === "opening_balances" || importInput.entityType === "pledges") {
      const processed =
        importInput.entityType === "opening_balances"
          ? await processOpeningBalanceImport(tx, importInput)
          : await processPledgeImport(tx, importInput);
      const status = deriveImportStatus(
        processed.insertedRows,
        processed.duplicateRows,
        processed.failedRows,
      );
      const [history] = await tx
        .insert(importHistory)
        .values({
          orgId: importInput.orgId,
          entityId: importInput.entityId,
          userId: importInput.userId,
          entityType: importInput.entityType,
          filename: importInput.filename,
          mapping: importInput.mapping,
          status,
          totalRows: importInput.rows.length,
          insertedRows: processed.insertedRows,
          duplicateRows: processed.duplicateRows,
          failedRows: processed.failedRows,
          summary: {
            createdCounts: processed.createdCounts,
            errorDetails: processed.rowErrors,
          },
          errorMessage:
            processed.failedRows > 0 && processed.insertedRows === 0 ? "Import failed" : null,
        })
        .returning();

      if (!history) {
        throw new Error("Failed to create import history");
      }

      await recordActivityLog(tx, {
        orgId: importInput.orgId,
        activeEntityId: importInput.entityId,
        actorId: importInput.userId,
        action: "created",
        entityType: "import_history",
        entityId: history.id,
        changes: {
          entityType: history.entityType,
          filename: history.filename,
          insertedRows: processed.insertedRows,
          duplicateRows: processed.duplicateRows,
          failedRows: processed.failedRows,
        },
      });

      return {
        history,
        totalRows: importInput.rows.length,
        insertedRows: processed.insertedRows,
        duplicateRows: processed.duplicateRows,
        failedRows: processed.failedRows,
        createdCounts: processed.createdCounts,
      };
    }

    const createdCounts = cloneCounts(EMPTY_COUNTS);
    const seenKeys = new Set<string>();
    const rowErrors: RowErrorDetail[] = [];
    let insertedRows = 0;
    let duplicateRows = 0;
    let failedRows = 0;

    for (let rowIndex = 0; rowIndex < importInput.rows.length; rowIndex += 1) {
      const row = importInput.rows[rowIndex];
      const typedRow = row as Record<string, unknown>;
      const rowContext = {
        orgId: importInput.orgId,
        entityId: importInput.entityId,
        actorId: importInput.userId,
        row: typedRow,
        mapping: importInput.mapping,
        seenKeys,
        createdCounts,
        activeGrantLimit,
      };

      let outcome: RowOutcome;
      switch (importInput.entityType) {
        case "contacts":
          outcome = await processContactRow(tx, rowContext);
          break;
        case "donations":
          outcome = await processDonationRow(tx, rowContext);
          break;
        case "grants":
          outcome = await processGrantRow(tx, rowContext);
          break;
        case "grant_opportunities":
          outcome = await processGrantOpportunityRow(tx, rowContext);
          break;
        case "funds":
          outcome = await processFundRow(tx, rowContext);
          break;
      }

      if (outcome.inserted) insertedRows += 1;
      if (outcome.duplicate) duplicateRows += 1;
      if (outcome.failed) {
        failedRows += 1;
        rowErrors.push(
          ...outcome.errors.map((rowError) => ({
            rowIndex,
            rowNumber: rowIndex + 2,
            ...rowError,
          })),
        );
      }
    }

    const status = deriveImportStatus(insertedRows, duplicateRows, failedRows);
    const [history] = await tx
      .insert(importHistory)
      .values({
        orgId: input.orgId,
        entityId: importInput.entityId,
        userId: importInput.userId,
        entityType: importInput.entityType,
        filename: importInput.filename,
        mapping: importInput.mapping,
        status,
        totalRows: importInput.rows.length,
        insertedRows,
        duplicateRows,
        failedRows,
        summary: {
          createdCounts,
          errorDetails: rowErrors,
        },
        errorMessage: failedRows > 0 && insertedRows === 0 ? "Import failed" : null,
      })
      .returning();

    if (!history) {
      throw new Error("Failed to create import history");
    }

    await recordActivityLog(tx, {
      orgId: input.orgId,
      activeEntityId: importInput.entityId,
      actorId: importInput.userId,
      action: "created",
      entityType: "import_history",
      entityId: history.id,
      changes: {
        entityType: history.entityType,
        filename: history.filename,
        insertedRows,
        duplicateRows,
        failedRows,
      },
    });

    return {
      history,
      totalRows: importInput.rows.length,
      insertedRows,
      duplicateRows,
      failedRows,
      createdCounts,
    };
  });
}

// ---------------------------------------------------------------------------
// listImportHistory
// ---------------------------------------------------------------------------

export async function listImportHistory(
  db: Database,
  params: { orgId: string; entityId?: string | null } & ImportHistoryListParams,
) {
  const conditions = [eq(importHistory.orgId, params.orgId)];

  if (params.entityId) {
    conditions.push(eq(importHistory.entityId, params.entityId));
  }

  if (params.entityType) {
    conditions.push(eq(importHistory.entityType, params.entityType));
  }

  if (params.status) {
    conditions.push(eq(importHistory.status, params.status));
  }

  const where = and(...conditions);
  const sortFn = params.sortOrder === "asc" ? asc : desc;

  const data = await db
    .select()
    .from(importHistory)
    .where(where)
    .orderBy(sortFn(importHistory.createdAt))
    .limit(params.pageSize)
    .offset((params.page - 1) * params.pageSize);

  const [countResult] = await db.select({ count: drizzleCount() }).from(importHistory).where(where);

  return {
    data,
    total: countResult?.count ?? 0,
    page: params.page,
    pageSize: params.pageSize,
  };
}

function toMigrationPlanProgress(
  entityType: ImportEntityType,
  rows: Array<{
    entityType: string;
    insertedRows: number;
    failedRows: number;
    createdAt: Date;
  }>,
): MigrationPlanProgress {
  const matchingRows = rows.filter((row) => row.entityType === entityType);
  const insertedRows = matchingRows.reduce((sum, row) => sum + row.insertedRows, 0);
  const failedRows = matchingRows.reduce((sum, row) => sum + row.failedRows, 0);
  const latestRow =
    matchingRows.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ??
    null;
  const latestImportAt = latestRow?.createdAt ?? null;
  const latestInsertedRows = latestRow?.insertedRows ?? 0;
  const latestFailedRows = latestRow?.failedRows ?? 0;

  return {
    entityType,
    status:
      latestFailedRows > 0 ? "has_errors" : latestInsertedRows > 0 ? "completed" : "not_started",
    latestImportAt,
    insertedRows,
    failedRows,
  };
}

export async function getImportMigrationPlan(
  db: Database,
  params: { orgId: string; entityId?: string | null; source: MigrationSourceId },
) {
  const plan = getMigrationSourcePlan(params.source);
  const conditions = [eq(importHistory.orgId, params.orgId)];
  if (params.entityId) {
    conditions.push(eq(importHistory.entityId, params.entityId));
  }
  const rows = await db
    .select({
      entityType: importHistory.entityType,
      insertedRows: importHistory.insertedRows,
      failedRows: importHistory.failedRows,
      createdAt: importHistory.createdAt,
    })
    .from(importHistory)
    .where(and(...conditions));
  const progress = plan.recommendedOrder.map((step) =>
    toMigrationPlanProgress(step.entityType, rows),
  );
  const nextStep = plan.recommendedOrder.find((step) => {
    const stepProgress = progress.find((item) => item.entityType === step.entityType);
    return step.status !== "not_supported" && stepProgress?.status !== "completed";
  });

  return {
    ...plan,
    progress,
    nextEntityType: nextStep?.entityType ?? null,
  };
}
