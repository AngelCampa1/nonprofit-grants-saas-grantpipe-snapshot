import { describe, expect, it } from "vitest";
import { isMissingColumnError } from "./db-errors";

describe("isMissingColumnError", () => {
  it("detects undefined-column errors with top-level postgres metadata", () => {
    const error = Object.assign(new Error('column "plan_selected_at" does not exist'), {
      code: "42703",
    });

    expect(isMissingColumnError(error, "plan_selected_at")).toBe(true);
  });

  it("detects undefined-column errors with wrapped cause metadata", () => {
    const error = Object.assign(new Error("Failed query: select plan_selected_at"), {
      cause: { code: "42703", message: 'column "plan_selected_at" does not exist' },
    });

    expect(isMissingColumnError(error, "plan_selected_at")).toBe(true);
  });

  it("rejects unrelated database errors", () => {
    const error = Object.assign(new Error("database unavailable"), {
      code: "08006",
    });

    expect(isMissingColumnError(error, "plan_selected_at")).toBe(false);
  });

  it("rejects undefined-column errors for other columns even when SQL includes the expected column", () => {
    const error = Object.assign(new Error("Failed query: select plan_selected_at, other_column"), {
      code: "42703",
      cause: { code: "42703", message: 'column "other_column" does not exist' },
    });

    expect(isMissingColumnError(error, "plan_selected_at")).toBe(false);
  });
});
