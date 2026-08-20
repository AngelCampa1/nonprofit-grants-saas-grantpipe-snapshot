import { renderHook } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before the module under test is imported.
// ---------------------------------------------------------------------------

const hoisted = vi.hoisted(() => ({
  mockCaptureEvent: vi.fn(),
}));

vi.mock("../lib/analytics", () => ({
  captureEvent: hoisted.mockCaptureEvent,
}));

// We import after mocks so the module sees the mock.
import { useActivationAha } from "./use-activation-aha";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderAha(orgId: string | null | undefined) {
  return renderHook(() => useActivationAha(orgId));
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("useActivationAha", () => {
  // Use the concrete overload signatures so TypeScript accepts the spy results.
  let getItemSpy: ReturnType<typeof vi.spyOn<Storage, "getItem">>;
  let setItemSpy: ReturnType<typeof vi.spyOn<Storage, "setItem">>;

  beforeEach(() => {
    // Clear mocks between tests.
    hoisted.mockCaptureEvent.mockClear();
    // Reset localStorage to empty.
    localStorage.clear();
    // Set up spies (default behaviour: real localStorage).
    getItemSpy = vi.spyOn(window.localStorage, "getItem");
    setItemSpy = vi.spyOn(window.localStorage, "setItem");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Fires and writes localStorage when key is absent
  // -------------------------------------------------------------------------
  it("fires captureEvent and writes localStorage when the key is absent", async () => {
    // Fresh module state: we need the in-memory Set to NOT contain this org.
    // Use a unique orgId per test to avoid cross-test pollution from the Set.
    const orgId = "org-new-absent";

    renderAha(orgId);

    expect(hoisted.mockCaptureEvent).toHaveBeenCalledTimes(1);
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.activationFirstValueViewed,
      {},
    );
    expect(setItemSpy).toHaveBeenCalledWith(`gp:activation:${orgId}`, "1");
  });

  // -------------------------------------------------------------------------
  // 2. Does NOT fire when localStorage key is already set
  // -------------------------------------------------------------------------
  it("does not fire when the localStorage key is already present", () => {
    const orgId = "org-already-set";
    localStorage.setItem(`gp:activation:${orgId}`, "1");

    renderAha(orgId);

    expect(hoisted.mockCaptureEvent).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 3. Does nothing when orgId is null
  // -------------------------------------------------------------------------
  it("does nothing when orgId is null", () => {
    renderAha(null);

    expect(hoisted.mockCaptureEvent).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 4. Does nothing when orgId is undefined
  // -------------------------------------------------------------------------
  it("does nothing when orgId is undefined", () => {
    renderAha(undefined);

    expect(hoisted.mockCaptureEvent).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 5. Double-render in the same session fires only once (in-memory guard)
  //    We mount TWO separate hook instances with the same orgId.  The first
  //    fires and adds to firedOrgIds; the second hits the in-memory guard.
  // -------------------------------------------------------------------------
  it("fires only once across two hook instances with the same orgId (in-memory guard)", () => {
    const orgId = "org-in-memory-guard";

    // First instance fires and populates the module-level Set.
    renderAha(orgId);
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledTimes(1);

    hoisted.mockCaptureEvent.mockClear();

    // Second instance for the same org: Set already contains it → no-op.
    renderAha(orgId);
    expect(hoisted.mockCaptureEvent).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 6. localStorage.getItem throwing is handled — still fires once, no crash
  // -------------------------------------------------------------------------
  it("still fires once and does not crash when localStorage.getItem throws", () => {
    const orgId = "org-get-throws";
    getItemSpy.mockImplementation(() => {
      throw new Error("Storage unavailable");
    });

    expect(() => renderAha(orgId)).not.toThrow();

    // Should have fired despite the getItem error.
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledTimes(1);
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.activationFirstValueViewed,
      {},
    );
  });

  // -------------------------------------------------------------------------
  // 7. localStorage.setItem throwing is handled — no crash, event still fired
  // -------------------------------------------------------------------------
  it("does not crash when localStorage.setItem throws, and still fires the event", () => {
    const orgId = "org-set-throws";
    setItemSpy.mockImplementation(() => {
      throw new Error("Storage full");
    });

    expect(() => renderAha(orgId)).not.toThrow();

    expect(hoisted.mockCaptureEvent).toHaveBeenCalledTimes(1);
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.activationFirstValueViewed,
      {},
    );
  });
});
