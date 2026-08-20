import { describe, expect, it } from "vitest";
import { requireProductionUrl } from "./prod-e2e-targets";

describe("requireProductionUrl", () => {
  it("allows the expected production host", () => {
    expect(requireProductionUrl("https://app.grantpipe.com", "app.grantpipe.com", "app", {})).toBe(
      "https://app.grantpipe.com",
    );
  });

  it("rejects non-production hosts by default", () => {
    expect(() =>
      requireProductionUrl("http://localhost:5173", "app.grantpipe.com", "app", {}),
    ).toThrow("app must target app.grantpipe.com");
  });

  it("allows explicit non-production rehearsals", () => {
    expect(
      requireProductionUrl("http://localhost:5173", "app.grantpipe.com", "app", {
        ALLOW_NON_PROD_E2E_TARGET: "1",
      }),
    ).toBe("http://localhost:5173");
  });
});
