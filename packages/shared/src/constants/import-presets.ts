// Inlined to avoid circular import with index.ts which re-exports this file.
export const IMPORT_ENTITY_TYPES = [
  "contacts",
  "donations",
  "grants",
  "grant_opportunities",
  "funds",
  "opening_balances",
  "pledges",
] as const;
type ImportEntityType = (typeof IMPORT_ENTITY_TYPES)[number];

export const IMPORT_PRESET_IDS = [
  "bloomerang",
  "donorperfect",
  "quickbooks",
  "salesforce_npsp",
] as const;
export type ImportPresetId = (typeof IMPORT_PRESET_IDS)[number];

export const IMPORT_PRESET_LABELS: Record<ImportPresetId, string> = {
  bloomerang: "Bloomerang",
  donorperfect: "DonorPerfect",
  quickbooks: "QuickBooks",
  salesforce_npsp: "Salesforce NPSP",
};

/**
 * Platform-specific CSV column maps.
 *
 * Keys are the semantic target field names used in IMPORT_FIELD_ALIASES.
 * Values are arrays of normalized header candidates (lowercase, alphanumeric only)
 * as produced by `normalizeHeaderToken`.
 */
export const IMPORT_PRESETS: Record<
  ImportPresetId,
  Record<ImportEntityType, Record<string, string[]>>
> = {
  bloomerang: {
    contacts: {
      firstName: ["firstname"],
      lastName: ["lastname"],
      email: ["primaryemail"],
      phone: ["primaryphonenumber"],
      address: ["primaryaddressline1"],
      organizationName: ["householdname"],
      type: ["accounttype"],
    },
    donations: {
      amountCents: ["amount"],
      date: ["transactiondate"],
      restriction: ["fund"],
      notes: ["campaign"],
      paymentMethod: ["paymentmethod"],
    },
    grants: {
      name: ["grantname", "name"],
      amountCents: ["amount", "awardamount"],
      status: ["status"],
    },
    grant_opportunities: {},
    funds: {
      externalId: ["fundid", "id"],
      name: ["fund", "fundname"],
      type: ["fundtype", "restrictiontype"],
      description: ["description", "funddescription"],
      restrictionPurpose: ["restrictionpurpose", "purpose"],
      restrictionSource: ["restrictionsource", "source"],
      startDate: ["startdate"],
      endDate: ["enddate"],
      status: ["status"],
    },
    opening_balances: {},
    pledges: {
      externalPledgeId: ["pledgeid", "pledge"],
      contactEmail: ["primaryemail", "email"],
      pledgeDate: ["pledgedate"],
      dueDate: ["installmentduedate", "duedate"],
      amountCents: ["amount", "installmentamount"],
    },
  },

  donorperfect: {
    contacts: {
      firstName: ["firstname"],
      lastName: ["lastname"],
      organizationName: ["orgname"],
      email: ["email"],
      phone: ["homephone"],
      address: ["address"],
    },
    donations: {
      amountCents: ["amount"],
      date: ["giftdate"],
      notes: ["glcode", "campaign"],
      paymentMethod: ["solicitation"],
    },
    grants: {
      name: ["grantname", "name"],
      amountCents: ["amount"],
      status: ["status"],
    },
    grant_opportunities: {},
    funds: {
      externalId: ["fundid", "id"],
      name: ["fund", "fundname"],
      type: ["fundtype", "restrictiontype"],
      description: ["description", "funddescription"],
      restrictionPurpose: ["restrictionpurpose", "purpose"],
      restrictionSource: ["restrictionsource", "source"],
      startDate: ["startdate"],
      endDate: ["enddate"],
      status: ["status"],
    },
    opening_balances: {},
    pledges: {
      externalPledgeId: ["pledgeid", "pledge"],
      contactEmail: ["email"],
      pledgeDate: ["pledgedate"],
      dueDate: ["duedate"],
      amountCents: ["amount"],
    },
  },

  quickbooks: {
    contacts: {
      organizationName: ["customer", "customername", "name"],
      email: ["email", "emailaddress"],
      phone: ["phone", "phonenumber"],
      address: ["billingaddress", "address"],
      type: ["type"],
    },
    donations: {
      amountCents: ["amount", "received", "payment", "deposit"],
      date: ["date", "transactiondate"],
      paymentMethod: ["paymentmethod", "method"],
      notes: ["memo", "description"],
      contactOrganizationName: ["customer", "customername", "name"],
    },
    grants: {
      name: ["class", "customer", "project", "grant", "name"],
      amountCents: ["amount", "budget", "awardamount"],
      status: ["status"],
      description: ["description", "memo"],
    },
    grant_opportunities: {},
    funds: {
      externalId: ["id", "classid"],
      name: ["class", "customer", "fund", "fundname", "name"],
      type: ["restrictiontype", "fundtype", "type"],
      description: ["description", "memo"],
      restrictionPurpose: ["purpose", "restrictionpurpose"],
      restrictionSource: ["source", "restrictionsource"],
      startDate: ["startdate", "date"],
      endDate: ["enddate"],
      status: ["status"],
    },
    opening_balances: {
      accountCode: ["accountnumber", "accountno", "number"],
      accountId: ["accountid"],
      debitCents: ["debit", "debitamount"],
      creditCents: ["credit", "creditamount"],
      fundName: ["class", "fund", "fundname"],
      grantName: ["project", "grant", "grantname"],
      date: ["date", "asofdate", "transactiondate"],
      memo: ["memo", "description"],
    },
    pledges: {},
  },

  salesforce_npsp: {
    contacts: {
      firstName: ["firstname"],
      lastName: ["lastname"],
      email: ["email"],
      phone: ["phone"],
      address: ["mailingstreet"],
      organizationName: ["accountname"],
    },
    donations: {
      amountCents: ["amount"],
      date: ["closedate"],
      status: ["stagename"],
      notes: ["recordtypename"],
    },
    grants: {
      name: ["name", "grantname"],
      amountCents: ["amount"],
      status: ["stagename"],
    },
    grant_opportunities: {},
    funds: {
      externalId: ["id", "fundid"],
      name: ["fund", "fundname"],
      type: ["fundtype", "restrictiontype"],
      description: ["description", "funddescription"],
      restrictionPurpose: ["restrictionpurpose", "purpose"],
      restrictionSource: ["restrictionsource", "source"],
      startDate: ["startdate"],
      endDate: ["enddate"],
      status: ["status"],
    },
    opening_balances: {},
    pledges: {
      externalPledgeId: ["id", "pledgeid"],
      contactEmail: ["email"],
      pledgeDate: ["closedate", "pledgedate"],
      dueDate: ["duedate"],
      amountCents: ["amount"],
    },
  },
};

export type ImportTemplate = {
  filename: string;
  headers: string[];
  requiredHeaders: string[];
  sampleRow: Record<string, string>;
};

export const IMPORT_TEMPLATES: Record<ImportEntityType, ImportTemplate> = {
  contacts: {
    filename: "grantpipe-contacts-template.csv",
    headers: [
      "type",
      "firstName",
      "lastName",
      "organizationName",
      "email",
      "phone",
      "address",
      "pipelineStage",
      "notes",
      "isVolunteer",
      "affiliatedOrgId",
    ],
    requiredHeaders: ["type"],
    sampleRow: {
      type: "individual",
      firstName: "Jane",
      lastName: "Doe",
      organizationName: "",
      email: "jane@example.org",
      phone: "555-0100",
      address: "123 Main St",
      pipelineStage: "prospect",
      notes: "Met at spring gala",
      isVolunteer: "false",
      affiliatedOrgId: "",
    },
  },
  donations: {
    filename: "grantpipe-donations-template.csv",
    headers: [
      "amount",
      "date",
      "type",
      "currency",
      "restriction",
      "fundId",
      "grantId",
      "paymentMethod",
      "notes",
      "receiptSent",
      "contactEmail",
      "contactFirstName",
      "contactLastName",
      "contactOrganizationName",
      "contactType",
    ],
    requiredHeaders: ["amount", "date", "type"],
    sampleRow: {
      amount: "250.00",
      date: "2026-04-15",
      type: "one_time",
      currency: "USD",
      restriction: "unrestricted",
      fundId: "",
      grantId: "",
      paymentMethod: "check",
      notes: "Spring appeal",
      receiptSent: "false",
      contactEmail: "jane@example.org",
      contactFirstName: "Jane",
      contactLastName: "Doe",
      contactOrganizationName: "",
      contactType: "individual",
    },
  },
  grants: {
    filename: "grantpipe-grants-template.csv",
    headers: [
      "name",
      "funderName",
      "funderType",
      "funderWebsite",
      "status",
      "amount",
      "startDate",
      "endDate",
      "applicationDeadline",
      "description",
      "notes",
    ],
    requiredHeaders: ["name", "funderName"],
    sampleRow: {
      name: "General operating support, FY26",
      funderName: 'Sample Foundation "West"',
      funderType: "foundation",
      funderWebsite: "https://example.org",
      status: "awarded",
      amount: "50000.00",
      startDate: "2026-07-01",
      endDate: "2027-06-30",
      applicationDeadline: "2026-05-15",
      description: "Operating support for community programs",
      notes: "Submit interim report in January",
    },
  },
  grant_opportunities: {
    filename: "grantpipe-grant-opportunities-template.csv",
    headers: [
      "title",
      "sourceName",
      "sourceType",
      "deadline",
      "sourceUrl",
      "amountFloor",
      "amountCeiling",
      "funderType",
      "eligibilityNotes",
      "internalNotes",
      "externalId",
    ],
    requiredHeaders: ["title", "sourceName", "sourceType"],
    sampleRow: {
      title: "Neighborhood Resilience Fund",
      sourceName: "Sample Community Foundation",
      sourceType: "community_foundation",
      deadline: "2026-06-30",
      sourceUrl: "https://example.org/grants/resilience",
      amountFloor: "10000.00",
      amountCeiling: "50000.00",
      funderType: "foundation",
      eligibilityNotes: "501(c)(3) organizations serving county residents",
      internalNotes: "Confirm board match requirement before applying",
      externalId: "SCF-RES-2026",
    },
  },
  funds: {
    filename: "grantpipe-funds-template.csv",
    headers: [
      "externalId",
      "name",
      "type",
      "description",
      "restrictionPurpose",
      "restrictionSource",
      "startDate",
      "endDate",
      "status",
    ],
    requiredHeaders: ["name", "type"],
    sampleRow: {
      externalId: "FUND-100",
      name: "Youth Program Restricted Fund",
      type: "temporarily_restricted",
      description: "Restricted support for youth program expenses",
      restrictionPurpose: "Youth program costs",
      restrictionSource: "Donor restriction",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      status: "active",
    },
  },
  opening_balances: {
    filename: "grantpipe-opening-balances-template.csv",
    headers: [
      "accountCode",
      "accountId",
      "debit",
      "credit",
      "fundId",
      "fundName",
      "grantId",
      "grantName",
      "fiscalPeriodId",
      "date",
      "memo",
    ],
    requiredHeaders: ["accountCode", "debit", "credit", "fiscalPeriodId", "date"],
    sampleRow: {
      accountCode: "1000",
      accountId: "",
      debit: "5000.00",
      credit: "",
      fundId: "",
      fundName: "Youth Program Restricted Fund",
      grantId: "",
      grantName: "",
      fiscalPeriodId: "period_id_from_accounting_settings",
      date: "2026-01-01",
      memo: "Opening cash balance",
    },
  },
  pledges: {
    filename: "grantpipe-pledge-schedules-template.csv",
    headers: [
      "externalPledgeId",
      "contactEmail",
      "contactFirstName",
      "contactLastName",
      "pledgeDate",
      "dueDate",
      "amount",
      "discountRateBasisPoints",
      "netAssetClass",
      "fundId",
      "fundName",
      "grantId",
      "grantName",
      "hasBarrier",
      "hasRightOfReturn",
      "conditionNote",
      "notes",
    ],
    requiredHeaders: [
      "externalPledgeId",
      "contactEmail",
      "pledgeDate",
      "dueDate",
      "amount",
      "netAssetClass",
    ],
    sampleRow: {
      externalPledgeId: "P-100",
      contactEmail: "jane@example.org",
      contactFirstName: "Jane",
      contactLastName: "Doe",
      pledgeDate: "2026-01-15",
      dueDate: "2026-06-30",
      amount: "500.00",
      discountRateBasisPoints: "0",
      netAssetClass: "temporarily_restricted",
      fundId: "",
      fundName: "Youth Program Restricted Fund",
      grantId: "",
      grantName: "",
      hasBarrier: "false",
      hasRightOfReturn: "false",
      conditionNote: "",
      notes: "Imported pledge schedule",
    },
  },
};

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildImportTemplateCsv(entityType: ImportEntityType): string {
  const template = IMPORT_TEMPLATES[entityType];
  const headerRow = template.headers.map(csvCell).join(",");
  const sampleRow = template.headers.map((header) => csvCell(template.sampleRow[header]!));

  return `${headerRow}\n${sampleRow.join(",")}\n`;
}
