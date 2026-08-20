import { describe, expect, it } from "vitest";
import {
  buildImportTemplateCsv,
  IMPORT_ENTITY_TYPES,
  IMPORT_PRESET_IDS,
  IMPORT_PRESET_LABELS,
  IMPORT_PRESETS,
  IMPORT_TEMPLATES,
  type ImportPresetId,
} from "./import-presets";

describe("IMPORT_PRESET_IDS", () => {
  it("exports the platform preset identifiers", () => {
    expect(IMPORT_PRESET_IDS).toEqual([
      "bloomerang",
      "donorperfect",
      "quickbooks",
      "salesforce_npsp",
    ]);
  });

  it("is a readonly const tuple", () => {
    expect(Array.isArray(IMPORT_PRESET_IDS)).toBe(true);
    expect(IMPORT_PRESET_IDS).toHaveLength(4);
  });
});

describe("IMPORT_PRESET_LABELS", () => {
  it("has a label for every preset ID", () => {
    expect(Object.keys(IMPORT_PRESET_LABELS).sort()).toEqual([...IMPORT_PRESET_IDS].sort());
  });

  it("maps bloomerang to the correct display label", () => {
    expect(IMPORT_PRESET_LABELS.bloomerang).toBe("Bloomerang");
  });

  it("maps donorperfect to the correct display label", () => {
    expect(IMPORT_PRESET_LABELS.donorperfect).toBe("DonorPerfect");
  });

  it("maps quickbooks to the correct display label", () => {
    expect(IMPORT_PRESET_LABELS.quickbooks).toBe("QuickBooks");
  });

  it("maps salesforce_npsp to the correct display label", () => {
    expect(IMPORT_PRESET_LABELS.salesforce_npsp).toBe("Salesforce NPSP");
  });

  it("all labels are non-empty strings", () => {
    for (const id of IMPORT_PRESET_IDS) {
      expect(typeof IMPORT_PRESET_LABELS[id]).toBe("string");
      expect(IMPORT_PRESET_LABELS[id].length).toBeGreaterThan(0);
    }
  });
});

describe("IMPORT_PRESETS", () => {
  it("has an entry for every preset ID", () => {
    for (const id of IMPORT_PRESET_IDS) {
      expect(IMPORT_PRESETS).toHaveProperty(id);
    }
  });

  it("has every entity type for every preset", () => {
    for (const id of IMPORT_PRESET_IDS) {
      for (const entityType of IMPORT_ENTITY_TYPES) {
        expect(IMPORT_PRESETS[id]).toHaveProperty(entityType);
      }
    }
  });

  describe("Bloomerang contacts", () => {
    const map = IMPORT_PRESETS.bloomerang.contacts;

    it("maps firstName to the normalized Bloomerang column", () => {
      expect(map.firstName).toContain("firstname");
    });

    it("maps email to primaryemail", () => {
      expect(map.email).toContain("primaryemail");
    });

    it("maps phone to primaryphonenumber", () => {
      expect(map.phone).toContain("primaryphonenumber");
    });

    it("maps address to primaryaddressline1", () => {
      expect(map.address).toContain("primaryaddressline1");
    });

    it("maps organizationName to householdname", () => {
      expect(map.organizationName).toContain("householdname");
    });

    it("maps type to accounttype", () => {
      expect(map.type).toContain("accounttype");
    });
  });

  describe("Bloomerang donations", () => {
    const map = IMPORT_PRESETS.bloomerang.donations;

    it("maps amountCents to amount", () => {
      expect(map.amountCents).toContain("amount");
    });

    it("maps date to transactiondate", () => {
      expect(map.date).toContain("transactiondate");
    });

    it("maps restriction to fund", () => {
      expect(map.restriction).toContain("fund");
    });

    it("maps notes to campaign", () => {
      expect(map.notes).toContain("campaign");
    });

    it("maps paymentMethod to paymentmethod", () => {
      expect(map.paymentMethod).toContain("paymentmethod");
    });
  });

  describe("Bloomerang grants", () => {
    const map = IMPORT_PRESETS.bloomerang.grants;

    it("maps name to grantname and name", () => {
      expect(map.name).toContain("grantname");
      expect(map.name).toContain("name");
    });

    it("maps amountCents to amount and awardamount", () => {
      expect(map.amountCents).toContain("amount");
      expect(map.amountCents).toContain("awardamount");
    });

    it("maps status to status", () => {
      expect(map.status).toContain("status");
    });
  });

  describe("DonorPerfect contacts", () => {
    const map = IMPORT_PRESETS.donorperfect.contacts;

    it("maps firstName to firstname", () => {
      expect(map.firstName).toContain("firstname");
    });

    it("maps organizationName to orgname", () => {
      expect(map.organizationName).toContain("orgname");
    });

    it("maps phone to homephone", () => {
      expect(map.phone).toContain("homephone");
    });
  });

  describe("DonorPerfect donations", () => {
    const map = IMPORT_PRESETS.donorperfect.donations;

    it("maps date to giftdate", () => {
      expect(map.date).toContain("giftdate");
    });

    it("maps notes to glcode and campaign", () => {
      expect(map.notes).toContain("glcode");
      expect(map.notes).toContain("campaign");
    });

    it("maps paymentMethod to solicitation", () => {
      expect(map.paymentMethod).toContain("solicitation");
    });
  });

  describe("DonorPerfect grants", () => {
    const map = IMPORT_PRESETS.donorperfect.grants;

    it("maps name to grantname", () => {
      expect(map.name).toContain("grantname");
    });

    it("maps amountCents to amount", () => {
      expect(map.amountCents).toContain("amount");
    });
  });

  describe("Salesforce NPSP contacts", () => {
    const map = IMPORT_PRESETS.salesforce_npsp.contacts;

    it("maps address to mailingstreet", () => {
      expect(map.address).toContain("mailingstreet");
    });

    it("maps organizationName to accountname", () => {
      expect(map.organizationName).toContain("accountname");
    });
  });

  describe("Salesforce NPSP donations", () => {
    const map = IMPORT_PRESETS.salesforce_npsp.donations;

    it("maps date to closedate", () => {
      expect(map.date).toContain("closedate");
    });

    it("maps status to stagename", () => {
      expect(map.status).toContain("stagename");
    });

    it("maps notes to recordtypename", () => {
      expect(map.notes).toContain("recordtypename");
    });
  });

  describe("Salesforce NPSP grants", () => {
    const map = IMPORT_PRESETS.salesforce_npsp.grants;

    it("maps name to name and grantname", () => {
      expect(map.name).toContain("name");
      expect(map.name).toContain("grantname");
    });

    it("maps status to stagename", () => {
      expect(map.status).toContain("stagename");
    });
  });

  describe("all values are arrays of normalized strings", () => {
    it("every column map value is a non-empty string array with lowercase alphanumeric tokens", () => {
      const normalizedPattern = /^[a-z0-9]+$/;

      for (const presetId of IMPORT_PRESET_IDS) {
        for (const entityType of IMPORT_ENTITY_TYPES) {
          const columnMap = IMPORT_PRESETS[presetId][entityType];
          for (const [semanticKey, aliases] of Object.entries(columnMap)) {
            expect(
              Array.isArray(aliases),
              `${presetId}.${entityType}.${semanticKey} should be an array`,
            ).toBe(true);
            expect(
              aliases.length,
              `${presetId}.${entityType}.${semanticKey} should be non-empty`,
            ).toBeGreaterThan(0);
            for (const alias of aliases) {
              expect(
                normalizedPattern.test(alias),
                `alias "${alias}" in ${presetId}.${entityType}.${semanticKey} should be normalized (lowercase alphanumeric)`,
              ).toBe(true);
            }
          }
        }
      }
    });
  });
});

describe("ImportPresetId type", () => {
  it("accepts valid preset IDs at runtime", () => {
    const validIds: ImportPresetId[] = [...IMPORT_PRESET_IDS];
    expect(validIds).toHaveLength(IMPORT_PRESET_IDS.length);
    expect(validIds).toContain("quickbooks");
  });
});

describe("IMPORT_TEMPLATES", () => {
  it("provides template metadata for every supported import entity type", () => {
    expect(Object.keys(IMPORT_TEMPLATES).sort()).toEqual([...IMPORT_ENTITY_TYPES].sort());
  });

  it("keeps each template internally consistent", () => {
    for (const entityType of IMPORT_ENTITY_TYPES) {
      const template = IMPORT_TEMPLATES[entityType];
      const uniqueHeaders = new Set(template.headers);

      expect(template.filename).toMatch(/^grantpipe-[a-z-]+-template\.csv$/);
      expect(uniqueHeaders.size).toBe(template.headers.length);
      expect(template.headers.length).toBeGreaterThan(0);
      expect(Object.keys(template.sampleRow).sort()).toEqual([...template.headers].sort());

      for (const requiredHeader of template.requiredHeaders) {
        expect(template.headers).toContain(requiredHeader);
      }
    }
  });

  it("serializes template CSV with headers and a sample row", () => {
    const csv = buildImportTemplateCsv("contacts");

    expect(csv.split("\n")[0]).toBe(
      "type,firstName,lastName,organizationName,email,phone,address,pipelineStage,notes,isVolunteer,affiliatedOrgId",
    );
    expect(csv).toContain("individual,Jane,Doe,,jane@example.org");
  });

  it("quotes template CSV values that contain commas or quotes", () => {
    const csv = buildImportTemplateCsv("grants");

    expect(csv).toContain('"General operating support, FY26"');
    expect(csv).toContain('"Sample Foundation ""West"""');
  });

  it("includes a non-federal grant opportunity template", () => {
    const template = IMPORT_TEMPLATES.grant_opportunities;

    expect(template.filename).toBe("grantpipe-grant-opportunities-template.csv");
    expect(template.requiredHeaders).toEqual(["title", "sourceName", "sourceType"]);
    expect(template.headers).toEqual(
      expect.arrayContaining([
        "title",
        "sourceName",
        "sourceType",
        "deadline",
        "sourceUrl",
        "amountCeiling",
        "eligibilityNotes",
        "internalNotes",
      ]),
    );
    expect(buildImportTemplateCsv("grant_opportunities")).toContain("Neighborhood Resilience Fund");
  });

  it("uses user-facing dollar amount columns in downloadable templates", () => {
    expect(IMPORT_TEMPLATES.donations.headers).toContain("amount");
    expect(IMPORT_TEMPLATES.donations.headers).not.toContain("amountCents");
    expect(IMPORT_TEMPLATES.donations.requiredHeaders).toContain("amount");
    expect(IMPORT_TEMPLATES.donations.requiredHeaders).not.toContain("amountCents");
    expect(IMPORT_TEMPLATES.donations.sampleRow.amount).toBe("250.00");

    expect(IMPORT_TEMPLATES.grants.headers).toContain("amount");
    expect(IMPORT_TEMPLATES.grants.headers).not.toContain("amountCents");
    expect(IMPORT_TEMPLATES.grants.sampleRow.amount).toBe("50000.00");
  });

  it("includes Import fund setup metadata in the funds template", () => {
    expect(IMPORT_TEMPLATES.funds.headers).toEqual(
      expect.arrayContaining([
        "externalId",
        "name",
        "type",
        "restrictionPurpose",
        "restrictionSource",
        "startDate",
        "endDate",
        "status",
      ]),
    );
    expect(IMPORT_TEMPLATES.funds.requiredHeaders).toEqual(["name", "type"]);
    expect(IMPORT_TEMPLATES.funds.headers).not.toContain("openingBalance");
  });

  it("includes name-based references and clear fiscal period requirements in finance templates", () => {
    expect(IMPORT_TEMPLATES.opening_balances.headers).toEqual(
      expect.arrayContaining(["fundName", "grantName", "fiscalPeriodId"]),
    );
    expect(IMPORT_TEMPLATES.opening_balances.requiredHeaders).toEqual([
      "accountCode",
      "debit",
      "credit",
      "fiscalPeriodId",
      "date",
    ]);

    expect(IMPORT_TEMPLATES.pledges.headers).toEqual(
      expect.arrayContaining(["fundName", "grantName"]),
    );
  });
});
