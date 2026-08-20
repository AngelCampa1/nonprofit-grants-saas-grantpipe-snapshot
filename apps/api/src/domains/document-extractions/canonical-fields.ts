/**
 * Canonicalizes AI-extracted award-document fields into the stable destination
 * vocabulary the commit pipeline consumes.
 *
 * The extraction model is prompted to emit canonical destination fields, but
 * model output drifts: it tends to invent descriptive snake_case keys
 * (`total_award_amount`, `project_start_date`, `report_due_date`) and to report
 * monetary values in dollars rather than the integer cents the schema expects.
 * Without normalization those fields never match the commit consumers in
 * `service.ts`, so the reviewed award silently fails to create grant records.
 *
 * This module is a deterministic safety net applied at persistence time. It maps
 * known aliases to canonical fields and coerces dollar-denominated money values
 * to integer cents. It is intentionally conservative: anything it does not
 * recognize is passed through untouched.
 */

import { parseCentsFromString } from "../../lib/parse-cents";

export type CanonicalizableField = {
  destinationEntityType: string;
  destinationField: string;
  value: unknown;
  normalizedValue?: unknown;
};

/** Canonical money fields whose values must be stored as integer cents. */
const MONEY_FIELDS = new Set(["amountCents", "approvedAmountCents", "allocatedAmountCents"]);

/**
 * Per-entity alias tables. Keys are normalized destination-field forms
 * (lowercased, non-alphanumeric stripped); values are the canonical field name.
 */
const FIELD_ALIASES: Record<string, Record<string, string>> = {
  funder: {
    name: "name",
    fundername: "name",
    funder: "name",
    funderorganization: "name",
    fundingagency: "name",
    agency: "name",
    grantor: "name",
    grantorname: "name",
    sponsor: "name",
    sponsorname: "name",
    foundation: "name",
    foundationname: "name",
  },
  funder_contact: {
    name: "name",
    contactname: "name",
    fullname: "name",
    title: "title",
    role: "title",
    jobtitle: "title",
    email: "email",
    emailaddress: "email",
    phone: "phone",
    phonenumber: "phone",
    telephone: "phone",
    notes: "notes",
  },
  grant: {
    name: "name",
    grantname: "name",
    granttitle: "name",
    title: "name",
    projecttitle: "name",
    projectname: "name",
    awardname: "name",
    awardtitle: "name",
    amountcents: "amountCents",
    amount: "amountCents",
    awardamount: "amountCents",
    awardedamount: "amountCents",
    totalaward: "amountCents",
    totalawardamount: "amountCents",
    grantamount: "amountCents",
    fundingamount: "amountCents",
    totalamount: "amountCents",
    startdate: "startDate",
    projectstartdate: "startDate",
    periodstart: "startDate",
    periodstartdate: "startDate",
    performancestart: "startDate",
    awardstartdate: "startDate",
    budgetstartdate: "startDate",
    enddate: "endDate",
    projectenddate: "endDate",
    periodend: "endDate",
    periodenddate: "endDate",
    performanceend: "endDate",
    awardenddate: "endDate",
    budgetenddate: "endDate",
  },
  reporting_requirement: {
    duedate: "dueDate",
    reportduedate: "dueDate",
    deadline: "dueDate",
    reportdeadline: "dueDate",
    reporttype: "reportType",
    type: "reportType",
    reportname: "reportType",
    notes: "notes",
  },
  restriction_term: {
    title: "title",
    name: "title",
    label: "title",
    purposestatement: "purposeStatement",
    purpose: "purposeStatement",
    description: "purposeStatement",
    restrictiontype: "restrictionType",
    releaserule: "releaseRule",
    startdate: "startDate",
    enddate: "endDate",
    evidencerequirement: "evidenceRequirement",
  },
  closeout_item: {
    label: "label",
    title: "label",
    name: "label",
    duedate: "dueDate",
    deadline: "dueDate",
  },
  budget_line: {
    category: "category",
    name: "category",
    linename: "category",
    approvedamountcents: "approvedAmountCents",
    approvedamount: "approvedAmountCents",
    amountcents: "approvedAmountCents",
    amount: "approvedAmountCents",
    budgetamount: "approvedAmountCents",
    description: "description",
    allowable: "allowable",
    costtype: "costType",
    notes: "notes",
  },
  allocation: {
    fundname: "fundName",
    fund: "fundName",
    allocatedamountcents: "allocatedAmountCents",
    allocatedamount: "allocatedAmountCents",
    amountcents: "allocatedAmountCents",
    amount: "allocatedAmountCents",
    fundtype: "fundType",
    description: "description",
  },
};

function normalizeKey(field: string): string {
  return field.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function removeEntityPrefix(entityType: string, destinationField: string): string {
  const trimmed = destinationField.trim();
  const dottedPrefix = `${entityType}.`;
  const snakePrefix = `${entityType}_`;
  if (trimmed.startsWith(dottedPrefix)) {
    return trimmed.slice(dottedPrefix.length);
  }
  if (trimmed.startsWith(snakePrefix)) {
    return trimmed.slice(snakePrefix.length);
  }
  return trimmed;
}

/**
 * Coerces a raw money value to integer cents.
 *
 * Conservative by design: a plain integer is assumed to already be cents (the
 * model is prompted to emit cents). Only values that clearly denote dollars — a
 * string containing a currency symbol or decimal point, or a non-integer number
 * — are converted by multiplying by 100. Returns `undefined` when the value
 * cannot be interpreted as money so the caller leaves it untouched.
 */
function coerceToCents(raw: unknown): number | undefined {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return undefined;
    const cents = Number.isInteger(raw) ? raw : Math.round(raw * 100);
    return Number.isSafeInteger(cents) ? cents : undefined;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return undefined;

    // Detect a negative amount written either with a leading minus or in
    // accounting parentheses, e.g. "(500)". The sign must survive parsing — a
    // dropped minus silently flips a credit/correction into a positive charge.
    let negative = false;
    let body = trimmed;
    const parenthesized = /^\((.*)\)$/.exec(body);
    if (parenthesized) {
      negative = true;
      body = (parenthesized[1] ?? "").trim();
    }

    const looksLikeDollars = body.includes("$") || body.includes(".");

    // Strip only the currency symbol, grouping commas, and whitespace. We
    // deliberately do NOT strip letters or other symbols: junk like "1e3" or
    // "50%" must be rejected, not mangled into a wrong cents value.
    let core = body.replace(/[$,\s]/g, "");
    if (core.startsWith("-")) {
      negative = !negative;
      core = core.slice(1);
    } else if (core.startsWith("+")) {
      core = core.slice(1);
    }

    if (!/^\d+(\.\d+)?$/.test(core)) return undefined;

    // A string with no "$" and no "." holds whole cents already; only currency
    // strings (which always set looksLikeDollars) are scaled from dollars.
    const magnitude = looksLikeDollars ? parseCentsFromString(core) : Number(core);
    if (!Number.isFinite(magnitude)) return undefined;
    const result = negative ? -magnitude : magnitude;
    return Number.isSafeInteger(result) ? result : undefined;
  }
  return undefined;
}

export function canonicalizeExtractionField<T extends CanonicalizableField>(
  field: T,
): T & { normalizedValue?: unknown } {
  const aliases = FIELD_ALIASES[field.destinationEntityType];
  if (!aliases) return field;

  const canonicalField =
    aliases[normalizeKey(removeEntityPrefix(field.destinationEntityType, field.destinationField))];
  if (!canonicalField) return field;

  const next: T & { normalizedValue?: unknown } = {
    ...field,
    destinationField: canonicalField,
  };

  if (MONEY_FIELDS.has(canonicalField)) {
    const source = next.normalizedValue ?? next.value;
    const cents = coerceToCents(source);
    if (cents !== undefined) {
      next.normalizedValue = cents;
    }
  }

  return next;
}
