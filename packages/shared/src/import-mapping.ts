import {
  IMPORT_ENTITY_TYPES,
  IMPORT_PRESETS,
  type ImportPresetId,
} from "./constants/import-presets";

type ImportEntityType = (typeof IMPORT_ENTITY_TYPES)[number];

function normalizeHeaderToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const SHARED_CONTACT_ALIASES: Record<string, string[]> = {
  contactFirstName: ["firstname", "givenname", "contactfirstname"],
  contactLastName: ["lastname", "surname", "familyname", "contactlastname"],
  contactEmail: ["email", "emailaddress", "contactemail"],
  contactPhone: ["phone", "phonenumber", "contactphone"],
  contactAddress: ["address", "contactaddress"],
  contactOrganizationName: [
    "organization",
    "organizationname",
    "organisation",
    "company",
    "contactorganization",
    "contactorganizationname",
  ],
  contactType: ["contacttype"],
  contactPipelineStage: ["pipelinestage", "stage", "contactpipelinestage"],
  contactNotes: ["contactnotes"],
  contactIsVolunteer: ["isvolunteer", "volunteer", "contactisvolunteer"],
  contactAffiliatedOrgId: ["affiliatedorgid", "contactaffiliatedorgid"],
  contactId: ["contactid", "id"],
};

const IMPORT_FIELD_ALIASES: Record<ImportEntityType, Record<string, string[]>> = {
  contacts: {
    firstName: ["firstname", "givenname"],
    lastName: ["lastname", "surname", "familyname"],
    email: ["email", "emailaddress"],
    phone: ["phone", "phonenumber"],
    address: ["address"],
    organizationName: ["organization", "organizationname", "organisation", "company"],
    type: ["type", "contacttype"],
    pipelineStage: ["pipelinestage", "stage"],
    notes: ["notes"],
    isVolunteer: ["isvolunteer", "volunteer"],
    affiliatedOrgId: ["affiliatedorgid"],
  },
  donations: {
    ...SHARED_CONTACT_ALIASES,
    amountCents: ["amountcents", "amount", "gift", "donation", "value"],
    date: ["date", "donationdate", "giftdate"],
    type: ["donationtype", "type"],
    currency: ["currency"],
    restriction: ["restriction", "restrictiontype"],
    fundId: ["fundid"],
    grantId: ["grantid"],
    paymentMethod: ["paymentmethod", "method"],
    notes: ["notes", "donationnotes"],
    receiptSent: ["receiptsent"],
    funderId: ["funderid"],
    funderName: ["fundername", "funder"],
    funderType: ["fundertype"],
    funderWebsite: ["funderwebsite", "website"],
    funderPriorities: ["funderpriorities"],
    funderNotes: ["fundernotes"],
  },
  grants: {
    name: ["name", "grantname", "title"],
    funderName: ["fundername", "funder"],
    funderType: ["fundertype"],
    funderWebsite: ["funderwebsite", "website"],
    status: ["status"],
    amountCents: ["amountcents", "amount", "awardamount"],
    startDate: ["startdate", "start"],
    endDate: ["enddate", "end"],
    applicationDeadline: ["applicationdeadline", "deadline"],
    description: ["description"],
    notes: ["notes"],
  },
  grant_opportunities: {
    title: ["title", "opportunitytitle", "name"],
    sourceName: ["sourcename", "funder", "fundername"],
    sourceType: ["sourcetype", "grantsource", "granttype"],
    deadline: ["deadline", "closedate", "duedate", "applicationdeadline"],
    sourceUrl: ["sourceurl", "url", "website", "applicationurl"],
    amountFloor: ["amountfloor", "awardfloor", "minimumaward", "minamount"],
    amountCeiling: ["amountceiling", "awardceiling", "maximumaward", "maxamount", "amount"],
    funderType: ["fundertype"],
    eligibilityNotes: ["eligibilitynotes", "eligibility", "eligibleapplicants"],
    internalNotes: ["internalnotes", "notes"],
    externalId: ["externalid", "sourceid", "opportunityid"],
  },
  funds: {
    externalId: ["externalid", "fundid", "sourceid"],
    name: ["name", "fund", "fundname"],
    type: ["type", "fundtype", "restrictiontype"],
    description: ["description", "funddescription", "notes"],
    restrictionPurpose: ["restrictionpurpose", "purpose", "restriction"],
    restrictionSource: ["restrictionsource", "source"],
    startDate: ["startdate", "start"],
    endDate: ["enddate", "end"],
    status: ["status"],
  },
  opening_balances: {
    accountCode: ["accountcode", "accountnumber", "account", "glaccount"],
    accountId: ["accountid"],
    debitCents: ["debitcents", "debit", "debitamount"],
    creditCents: ["creditcents", "credit", "creditamount"],
    fundId: ["fundid"],
    fundName: ["fundname", "fund"],
    grantId: ["grantid"],
    grantName: ["grantname", "grant"],
    fiscalPeriodId: ["fiscalperiodid", "periodid"],
    date: ["date", "entrydate", "journaldate"],
    memo: ["memo", "notes", "description"],
  },
  pledges: {
    ...SHARED_CONTACT_ALIASES,
    externalPledgeId: ["externalpledgeid", "pledgeid", "pledge"],
    pledgeDate: ["pledgedate", "date"],
    dueDate: ["duedate", "installmentduedate", "paymentduedate"],
    amountCents: ["amountcents", "amount", "installmentamount"],
    discountRateBasisPoints: ["discountratebasispoints", "discountbps", "discountrate"],
    netAssetClass: ["netassetclass", "restriction", "restrictiontype"],
    fundId: ["fundid"],
    fundName: ["fundname", "fund"],
    grantId: ["grantid"],
    grantName: ["grantname", "grant"],
    hasBarrier: ["hasbarrier", "barrier"],
    hasRightOfReturn: ["hasrightofreturn", "rightofreturn"],
    conditionNote: ["conditionnote", "condition"],
    notes: ["notes"],
  },
};

export function buildResolvedImportMapping(
  headers: string[],
  mapping: Record<string, string>,
  entityType: ImportEntityType = "contacts",
  presetId?: ImportPresetId | "generic",
): Record<string, string> {
  if (Object.keys(mapping).length > 0) {
    return mapping;
  }

  const baseAliases = IMPORT_FIELD_ALIASES[entityType];
  const presetColumnMap =
    presetId && presetId !== "generic" ? IMPORT_PRESETS[presetId][entityType] : null;
  const mergedAliases: Record<string, string[]> = {};
  const allKeys = new Set([
    ...Object.keys(baseAliases),
    ...(presetColumnMap ? Object.keys(presetColumnMap) : []),
  ]);

  for (const key of allKeys) {
    const presetList = presetColumnMap?.[key] ?? [];
    const baseList = baseAliases[key] ?? [];
    mergedAliases[key] = [
      ...presetList,
      ...baseList.filter((alias) => !presetList.includes(alias)),
    ];
  }

  const resolved: Record<string, string> = {};
  const taken = new Set<string>();

  for (const [semanticKey, aliasList] of Object.entries(mergedAliases)) {
    const match = headers.find((header) => {
      if (taken.has(header)) return false;
      const normalized = normalizeHeaderToken(header);
      return aliasList.includes(normalized) || normalized === semanticKey.toLowerCase();
    });
    if (match) {
      resolved[semanticKey] = match;
      taken.add(match);
    }
  }

  return resolved;
}
