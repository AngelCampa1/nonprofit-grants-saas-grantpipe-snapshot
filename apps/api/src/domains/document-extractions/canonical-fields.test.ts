import { describe, expect, it } from "vitest";

import { canonicalizeExtractionField } from "./canonical-fields";

describe("canonicalizeExtractionField", () => {
  it("renames descriptive grant amount keys to the canonical amountCents field", () => {
    const result = canonicalizeExtractionField({
      destinationEntityType: "grant",
      destinationField: "total_award_amount",
      value: 25_000_000,
    });
    expect(result.destinationEntityType).toBe("grant");
    expect(result.destinationField).toBe("amountCents");
  });

  it("normalizes provider fields that include the destination entity prefix", () => {
    const amount = canonicalizeExtractionField({
      destinationEntityType: "grant",
      destinationField: "grant.amountCents",
      value: 25_000_000,
    });
    const startDate = canonicalizeExtractionField({
      destinationEntityType: "grant",
      destinationField: "grant.startDate",
      value: "2026-07-01",
    });
    const endDate = canonicalizeExtractionField({
      destinationEntityType: "grant",
      destinationField: "grant.endDate",
      value: "2027-06-30",
    });

    expect(amount.destinationField).toBe("amountCents");
    expect(amount.normalizedValue ?? amount.value).toBe(25_000_000);
    expect(startDate.destinationField).toBe("startDate");
    expect(endDate.destinationField).toBe("endDate");
  });

  it("maps snake_case grant date keys to camelCase canonical fields", () => {
    expect(
      canonicalizeExtractionField({
        destinationEntityType: "grant",
        destinationField: "start_date",
        value: "2026-01-01",
      }).destinationField,
    ).toBe("startDate");
    expect(
      canonicalizeExtractionField({
        destinationEntityType: "grant",
        destinationField: "project_end_date",
        value: "2026-12-31",
      }).destinationField,
    ).toBe("endDate");
  });

  it("maps descriptive grant name keys to the canonical name field", () => {
    expect(
      canonicalizeExtractionField({
        destinationEntityType: "grant",
        destinationField: "project_title",
        value: "Youth Literacy Initiative",
      }).destinationField,
    ).toBe("name");
  });

  it("maps descriptive funder name keys to funder.name", () => {
    expect(
      canonicalizeExtractionField({
        destinationEntityType: "funder",
        destinationField: "funding_agency",
        value: "The Riverstone Foundation",
      }).destinationField,
    ).toBe("name");
  });

  it("converts a dollar-denominated currency string to integer cents for money fields", () => {
    const result = canonicalizeExtractionField({
      destinationEntityType: "grant",
      destinationField: "grant_amount",
      value: "$250,000.00",
    });
    expect(result.destinationField).toBe("amountCents");
    expect(result.normalizedValue).toBe(25_000_000);
  });

  it("treats a plain integer money value as already-cents and leaves it untouched", () => {
    const result = canonicalizeExtractionField({
      destinationEntityType: "grant",
      destinationField: "amountCents",
      value: 25_000_000,
    });
    expect(result.value).toBe(25_000_000);
    expect(result.normalizedValue ?? result.value).toBe(25_000_000);
  });

  it("coerces a decimal dollar number to cents for money fields", () => {
    const result = canonicalizeExtractionField({
      destinationEntityType: "budget_line",
      destinationField: "approved_amount",
      value: 1234.5,
    });
    expect(result.destinationField).toBe("approvedAmountCents");
    expect(result.normalizedValue).toBe(123_450);
  });

  it("maps reporting requirement keys to canonical dueDate and reportType", () => {
    expect(
      canonicalizeExtractionField({
        destinationEntityType: "reporting_requirement",
        destinationField: "report_due_date",
        value: "2027-03-31",
      }).destinationField,
    ).toBe("dueDate");
    expect(
      canonicalizeExtractionField({
        destinationEntityType: "reporting_requirement",
        destinationField: "report_type",
        value: "final",
      }).destinationField,
    ).toBe("reportType");
  });

  it("leaves a non-finite money number untouched", () => {
    const result = canonicalizeExtractionField({
      destinationEntityType: "grant",
      destinationField: "amount",
      value: Number.NaN,
    });
    expect(result.destinationField).toBe("amountCents");
    expect(result.normalizedValue).toBeUndefined();
  });

  it("leaves an empty or non-numeric money string untouched", () => {
    const empty = canonicalizeExtractionField({
      destinationEntityType: "grant",
      destinationField: "amount",
      value: "   ",
    });
    expect(empty.normalizedValue).toBeUndefined();

    const nonNumeric = canonicalizeExtractionField({
      destinationEntityType: "grant",
      destinationField: "amount",
      value: "to be determined",
    });
    expect(nonNumeric.normalizedValue).toBeUndefined();

    const malformed = canonicalizeExtractionField({
      destinationEntityType: "grant",
      destinationField: "amount",
      value: "$1.2.3",
    });
    expect(malformed.normalizedValue).toBeUndefined();
  });

  it("leaves a non-string non-number money value untouched", () => {
    const result = canonicalizeExtractionField({
      destinationEntityType: "grant",
      destinationField: "amount",
      value: { dollars: 5 },
    });
    expect(result.destinationField).toBe("amountCents");
    expect(result.normalizedValue).toBeUndefined();
  });

  it("converts a decimal dollar string without a currency symbol to cents", () => {
    const result = canonicalizeExtractionField({
      destinationEntityType: "grant",
      destinationField: "amount",
      value: "1234.50",
    });
    expect(result.normalizedValue).toBe(123_450);
  });

  it("treats a plain integer money string as already-cents", () => {
    const result = canonicalizeExtractionField({
      destinationEntityType: "grant",
      destinationField: "amount",
      value: "25000000",
    });
    expect(result.normalizedValue).toBe(25_000_000);
  });

  it("prefers an existing normalizedValue as the money source", () => {
    const result = canonicalizeExtractionField({
      destinationEntityType: "grant",
      destinationField: "amount",
      value: "ignored",
      normalizedValue: "$10.00",
    });
    expect(result.normalizedValue).toBe(1_000);
  });

  it("preserves a negative sign on a leading-minus money string", () => {
    const result = canonicalizeExtractionField({
      destinationEntityType: "grant",
      destinationField: "amount",
      value: "-500",
    });
    expect(result.normalizedValue).toBe(-500);
  });

  it("preserves a negative sign written in accounting parentheses", () => {
    const result = canonicalizeExtractionField({
      destinationEntityType: "grant",
      destinationField: "amount",
      value: "($500.00)",
    });
    expect(result.normalizedValue).toBe(-50_000);
  });

  it("preserves a negative sign when the dollar sign precedes the minus", () => {
    const result = canonicalizeExtractionField({
      destinationEntityType: "grant",
      destinationField: "amount",
      value: "$-500",
    });
    expect(result.normalizedValue).toBe(-50_000);
  });

  it("rejects scientific-notation strings instead of mangling them", () => {
    const result = canonicalizeExtractionField({
      destinationEntityType: "grant",
      destinationField: "amount",
      value: "1e3",
    });
    expect(result.normalizedValue).toBeUndefined();
  });

  it("rejects percentage strings instead of treating them as cents", () => {
    const result = canonicalizeExtractionField({
      destinationEntityType: "grant",
      destinationField: "amount",
      value: "50%",
    });
    expect(result.normalizedValue).toBeUndefined();
  });

  it("rejects money values that overflow safe-integer precision", () => {
    const result = canonicalizeExtractionField({
      destinationEntityType: "grant",
      destinationField: "amount",
      value: "$90071992547410.00",
    });
    expect(result.normalizedValue).toBeUndefined();
  });

  it("parses a dollar string with a space after the currency symbol", () => {
    const result = canonicalizeExtractionField({
      destinationEntityType: "grant",
      destinationField: "amount",
      value: "$ 1,000.00",
    });
    expect(result.normalizedValue).toBe(100_000);
  });

  it("ignores a leading plus sign on a money string", () => {
    const result = canonicalizeExtractionField({
      destinationEntityType: "grant",
      destinationField: "amount",
      value: "+500",
    });
    expect(result.normalizedValue).toBe(500);
  });

  it("rejects a huge integer number that overflows safe-integer precision", () => {
    const result = canonicalizeExtractionField({
      destinationEntityType: "grant",
      destinationField: "amount",
      value: 10_000_000_000_000_000,
    });
    expect(result.normalizedValue).toBeUndefined();
  });

  it("rejects a decimal number whose cents conversion overflows precision", () => {
    const result = canonicalizeExtractionField({
      destinationEntityType: "grant",
      destinationField: "amount",
      value: 90_071_992_547_410.5,
    });
    expect(result.normalizedValue).toBeUndefined();
  });

  it("rejects a digit string so long it parses to a non-finite number", () => {
    const result = canonicalizeExtractionField({
      destinationEntityType: "grant",
      destinationField: "amount",
      value: "9".repeat(400),
    });
    expect(result.normalizedValue).toBeUndefined();
  });

  it("leaves unknown fields and entity types unchanged", () => {
    const result = canonicalizeExtractionField({
      destinationEntityType: "document",
      destinationField: "some_freeform_note",
      value: "hello",
    });
    expect(result.destinationEntityType).toBe("document");
    expect(result.destinationField).toBe("some_freeform_note");
    expect(result.value).toBe("hello");
  });

  it("preserves an already-canonical field without altering its value", () => {
    const result = canonicalizeExtractionField({
      destinationEntityType: "grant",
      destinationField: "startDate",
      value: "2026-01-01",
    });
    expect(result.destinationField).toBe("startDate");
    expect(result.value).toBe("2026-01-01");
  });
});
